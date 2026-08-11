from __future__ import annotations

import asyncio
from pathlib import Path
import logging
import re
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.chesscom import ChessComService
from backend.chesscom_matchups import (
    ChessComMatchupService,
    MatchExcludedError,
    MatchProxyDisabledError,
    MatchUpstreamError,
)
from backend.coach import prepare_coach_context
from backend.coach_jobs import CoachJobs
from backend.config import get_settings
from backend.leak_map_jobs import LeakMapJobs
from backend.job_control import JobCapacityError
from backend.database import Base, SessionLocal, engine, get_session
from backend.models import ChatMessage, ReviewRoom, SharedNote
from backend.exploration import apply_exploration_move, apply_exploration_san_move
from backend.rooms import room_hub
from backend.puzzles import check_move, get_puzzle, next_move, solution
from backend.qwen_runtime import QwenRuntime
from backend.schemas import (
    AnalysisRequest,
    ChessComConnectRequest,
    ChessComEnrichRequest,
    ChessComGameResolveRequest,
    CoachPrepareRequest,
    ExplorationMoveRequest,
    ExplorationSanMoveRequest,
    LeakMapAnalysisRequest,
    MomentCreateRequest,
    NoteCreateRequest,
    PgnImportRequest,
    PuzzleHistoryRequest,
    RoomCreateRequest,
    RoomJoinRequest,
    SocketEvent,
)
from backend.game_resolution import canonical_chesscom_game_urls, normalize_chesscom_game_url
from thejimmyapp.chesscom_api import parse_pgn_headers
from thejimmyapp.chesscom_pgn_info import PgnInfoClient, merge_pgn_info, parse_curl_auth
from thejimmyapp.game_completion import is_completed_pgn, pgn_result, player_results
from backend.services import AnalysisJobs, GameService, GuestReplayIngestError, MomentPersistenceError
from thejimmyapp.db import DailyMomentCapReached


settings = get_settings()
logger = logging.getLogger(__name__)
Base.metadata.create_all(bind=engine)
games = GameService(settings.legacy_database_path)
analysis_jobs = AnalysisJobs(settings, games)
qwen_runtime = QwenRuntime(settings)
coach_jobs = CoachJobs(settings, games, qwen_runtime)
leak_map_jobs = LeakMapJobs(settings, games)
chesscom_matchups = ChessComMatchupService(settings)
GUEST_IDENTITY_COOKIE = "jimmy_guest_identity"
app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_host_list)


def _set_guest_identity_cookie(response: Response, identity_token: str) -> None:
    response.set_cookie(
        GUEST_IDENTITY_COOKIE,
        identity_token,
        httponly=True,
        max_age=31_536_000,
        samesite="lax",
    )


async def _guest_session_payload(guest_number: int) -> dict[str, int]:
    return {
        "guest_number": guest_number,
        "total_guests": await asyncio.to_thread(games.guest_identity_count),
        "completions_to_date": 0,
    }


def _is_disk_full_error(exc: Exception) -> bool:
    return "disk is full" in str(exc).lower() or "database or disk is full" in str(exc).lower()


def _rollback_quietly(session: Session) -> None:
    try:
        session.rollback()
    except SQLAlchemyError as exc:
        logger.warning("Database rollback failed after room storage error: %s", exc)


@app.get("/health")
def health() -> dict[str, object]:
    database_available = True
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
    except SQLAlchemyError:
        database_available = False
    engine_available = settings.fairy_stockfish_path.is_file()
    return {
        "status": "ok" if database_available else "degraded",
        "service": "thejimmyapp",
        "database": "available" if database_available else "unavailable",
        "fairy_stockfish": "available" if engine_available else "unavailable",
        "ai_coach": qwen_runtime.status(),
    }


@app.get("/api/oauth/chesscom/callback")
def chesscom_oauth_callback() -> dict[str, str]:
    return {
        "status": "pending_authorization",
        "detail": "Chess.com OAuth is not enabled. This callback is reserved for the requested integration.",
    }


@app.post("/api/chesscom/connect")
async def connect_chesscom(request: ChessComConnectRequest) -> dict[str, object]:
    service = ChessComService(settings)
    try:
        profile, imported = await service.connect(request.username)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    stored = await asyncio.to_thread(_store_imported_games, request.username, imported)
    return {
        "username": request.username,
        "profile": {"avatar": profile.get("avatar"), "url": profile.get("url")},
        "public_profile_connected": True,
        "bughouse_games_found": len(imported),
        "new_games_stored": stored,
    }


@app.post("/api/chesscom/enrich")
async def enrich_chesscom(request: ChessComEnrichRequest) -> dict[str, object]:
    try:
        return await asyncio.to_thread(_enrich_from_curl, request.username, request.curl_text, request.limit)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _enrich_from_curl(username: str, curl_text: str, limit: int) -> dict[str, object]:
    client = PgnInfoClient(auth=parse_curl_auth(curl_text))
    candidates = games.db.list_games_for_pgn_info_enrichment(username, limit=limit)
    enriched_count = 0
    checked_count = 0
    for start in range(0, len(candidates), 100):
        batch = candidates[start : start + 100]
        payloads = client.fetch_for_games(batch)
        checked_count += len(batch)
        for raw_game in batch:
            game_id = _raw_chesscom_game_id(raw_game)
            enriched = payloads.get(game_id) if game_id else None
            if enriched:
                games.db.upsert_game(username, merge_pgn_info(raw_game, enriched))
                enriched_count += 1
    return {
        "checked": checked_count,
        "enriched": enriched_count,
        "remaining_without_second_board": max(0, len(candidates) - enriched_count),
        "credentials_stored": False,
    }


def _raw_chesscom_game_id(game: dict[str, object]) -> str | None:
    for key in ("game_id", "gameId", "id"):
        if game.get(key) is not None:
            return str(game[key])
    match = re.search(r"/(?:live|daily)/(\d+)", str(game.get("url") or ""))
    return match.group(1) if match else None


def _store_imported_games(username: str, imported: list[dict[str, object]]) -> int:
    return sum(games.db.upsert_game(username, game) for game in imported)


@app.get("/api/chesscom/{username}/bughouse-games")
def list_bughouse_games(username: str, limit: int = Query(default=500, ge=1, le=5000)) -> dict[str, object]:
    return {"username": username, "games": games.list_games(username, limit)}


def _matchup_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, MatchProxyDisabledError):
        return HTTPException(
            status_code=503,
            detail={"code": "chesscom_match_proxy_disabled", "message": "Guest matchups are disabled."},
        )
    if isinstance(exc, MatchExcludedError):
        return HTTPException(
            status_code=422,
            detail={"code": "match_not_eligible", "message": "This match cannot be normalized safely."},
        )
    return HTTPException(
        status_code=502,
        detail={"code": "chesscom_match_upstream_unavailable", "message": "Guest matchups are temporarily unavailable."},
    )


@app.get("/api/chesscom/matches/{game_id}")
async def chesscom_match(game_id: int) -> dict[str, object]:
    try:
        return await chesscom_matchups.normalized_match(game_id)
    except (MatchProxyDisabledError, MatchExcludedError, MatchUpstreamError) as exc:
        raise _matchup_http_error(exc) from exc


@app.get("/api/chesscom/matches/{game_id}/replay")
async def chesscom_match_replay(game_id: int) -> dict[str, object]:
    try:
        return await chesscom_matchups.replay_source(game_id)
    except (MatchProxyDisabledError, MatchExcludedError, MatchUpstreamError) as exc:
        raise _matchup_http_error(exc) from exc


@app.post("/api/guests")
async def guest_session(request: Request, response: Response) -> dict[str, int]:
    guest_number = await _guest_number_from_request(request)
    if guest_number is None:
        guest_number, identity_token = await asyncio.to_thread(games.create_guest_identity)
        _set_guest_identity_cookie(response, identity_token)
    return await _guest_session_payload(guest_number)


@app.post("/api/guests/reset")
async def reset_guest_session(response: Response) -> dict[str, int]:
    guest_number, identity_token = await asyncio.to_thread(games.create_guest_identity)
    _set_guest_identity_cookie(response, identity_token)
    return await _guest_session_payload(guest_number)


@app.post("/api/chesscom/matches/{game_id}/store")
async def store_chesscom_guest_match(game_id: int, request: Request) -> dict[str, int]:
    guest_number = await _guest_number_from_request(request)
    if guest_number is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "guest_identity_missing", "message": "Open the guest landing page first."},
        )
    try:
        replay = await chesscom_matchups.replay_source(game_id)
    except (MatchProxyDisabledError, MatchExcludedError, MatchUpstreamError) as exc:
        raise _matchup_http_error(exc) from exc
    try:
        internal_game_id = await asyncio.to_thread(games.ingest_guest_replay, replay, guest_number)
    except GuestReplayIngestError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "guest_replay_refused", "message": str(exc)},
        ) from exc
    return {"game_id": internal_game_id}


@app.post("/api/moments", status_code=status.HTTP_201_CREATED)
async def create_moment(payload: MomentCreateRequest, request: Request) -> dict[str, object]:
    guest_number = await _guest_number_from_request(request)
    if guest_number is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "guest_identity_missing", "message": "Open the guest landing page first."},
        )
    try:
        private_moment, public_moment = await asyncio.to_thread(
            games.create_moment,
            payload.game_id,
            payload.move_token,
            payload.glyph,
            payload.alternative_move,
            payload.written_answer,
            guest_number,
        )
    except DailyMomentCapReached as exc:
        raise HTTPException(
            status_code=429,
            detail={"code": "daily_moment_cap_reached", "message": str(exc)},
        ) from exc
    except MomentPersistenceError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "moment_refused", "message": str(exc)},
        ) from exc
    return {"private_moment": private_moment, "public_moment": public_moment}


@app.get("/api/moments/mine")
async def list_my_moments(request: Request) -> dict[str, object]:
    guest_number = await _guest_number_from_request(request)
    if guest_number is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "guest_identity_missing", "message": "Open the guest landing page first."},
        )
    moments = await asyncio.to_thread(games.list_private_moments, guest_number)
    return {"moments": moments}


@app.get("/api/moments/public")
async def list_public_moments() -> dict[str, object]:
    moments = await asyncio.to_thread(games.list_public_moments)
    return {"moments": moments}


@app.delete("/api/moments/{moment_id}")
async def delete_moment(moment_id: int, request: Request) -> dict[str, bool]:
    guest_number = await _guest_number_from_request(request)
    if guest_number is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "guest_identity_missing", "message": "Open the guest landing page first."},
        )
    try:
        deleted = await asyncio.to_thread(games.delete_private_moment, moment_id, guest_number)
    except MomentPersistenceError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "moment_refused", "message": str(exc)},
        ) from exc
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": "moment_not_found", "message": "Moment not found."},
        )
    return {"deleted": True}


@app.get("/api/chesscom/guest-matchups")
async def chesscom_guest_matchups(
    request: Request,
    response: Response,
    refresh: bool = False,
    exclude_game_id: list[int] | None = Query(default=None),
) -> dict[str, object]:
    try:
        payload = await chesscom_matchups.guest_matchups(
            refresh=refresh,
            exclude_game_ids=exclude_game_id or (),
        )
    except (MatchProxyDisabledError, MatchExcludedError, MatchUpstreamError) as exc:
        raise _matchup_http_error(exc) from exc
    if await _guest_number_from_request(request) is None:
        _guest_number, identity_token = await asyncio.to_thread(games.create_guest_identity)
        _set_guest_identity_cookie(response, identity_token)
    return payload


async def _guest_number_from_request(request: Request) -> int | None:
    identity_token = request.cookies.get(GUEST_IDENTITY_COOKIE)
    if not identity_token:
        return None
    return await asyncio.to_thread(games.guest_number_for_token, identity_token)


@app.post("/api/games/resolve")
async def resolve_chesscom_game(request: ChessComGameResolveRequest) -> dict[str, object]:
    try:
        external_game_id = normalize_chesscom_game_url(request.url)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "unsupported_game_url", "message": str(exc)},
        ) from exc

    canonical_urls = canonical_chesscom_game_urls(external_game_id)
    payload = await asyncio.to_thread(games.resolve_stored_game, canonical_urls, request.username)
    source = "stored"
    if payload is None and request.username:
        service = ChessComService(settings)
        try:
            imported = await service.find_exact_game(request.username, external_game_id)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=429,
                detail={"code": "chesscom_rate_limited", "message": str(exc)},
            ) from exc
        except ValueError:
            imported = None
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "chesscom_archive_unavailable",
                    "message": "Chess.com public archives are temporarily unavailable",
                },
            ) from exc
        if imported is not None:
            await asyncio.to_thread(games.db.upsert_game, request.username, imported)
            payload = await asyncio.to_thread(games.resolve_stored_game, canonical_urls, request.username)
            source = "chesscom_public_archive"

    if payload is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "game_not_found",
                "message": "That exact completed Bughouse game was not found in the available data.",
                "external_game_id": external_game_id,
            },
        )

    game = payload.get("game")
    if not isinstance(game, dict) or not isinstance(game.get("id"), int):
        raise HTTPException(status_code=500, detail="Resolved game is unavailable")
    return {
        "status": "resolved",
        "source": source,
        "external_game_id": external_game_id,
        "game_id": game["id"],
        "game": payload,
    }


@app.get("/api/games/{game_id}")
def get_game(game_id: int) -> dict[str, object]:
    if games.db.get_game(game_id) and not games.is_completed_game(game_id):
        raise HTTPException(status_code=409, detail="Only completed games can be reviewed")
    payload = games.get_game_payload(game_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Game not found")
    return payload


@app.post("/api/games/import-pgn")
def import_pgn(request: PgnImportRequest) -> dict[str, object]:
    if not is_completed_pgn(request.pgn):
        raise HTTPException(
            status_code=422,
            detail='Board A PGN must be completed and contain Result "1-0", "0-1", or "1/2-1/2"',
        )
    if request.second_board_pgn and not is_completed_pgn(request.second_board_pgn):
        raise HTTPException(
            status_code=422,
            detail='Board B PGN must be completed and contain Result "1-0", "0-1", or "1/2-1/2"',
        )
    headers = parse_pgn_headers(request.pgn)
    result = pgn_result(request.pgn)
    if result is None:
        raise HTTPException(status_code=422, detail="Board A PGN does not contain a terminal result")
    white_result, black_result = player_results(result)
    white_name = headers.get("White") or "White"
    black_name = headers.get("Black") or "Black"
    if request.username.lower() not in {white_name.lower(), black_name.lower()}:
        raise HTTPException(status_code=422, detail="The importing username must be a player on Board A")
    game_key = uuid4()
    manual_url = f"manual://{game_key}"
    raw_game = {
        "url": manual_url,
        "uuid": str(game_key),
        "pgn": request.pgn,
        "rules": "bughouse",
        "time_control": headers.get("TimeControl"),
        "white": {"username": white_name, "result": white_result},
        "black": {"username": black_name, "result": black_result},
    }
    if request.second_board_pgn:
        partner_headers = parse_pgn_headers(request.second_board_pgn)
        raw_game["bughousePartnerPgn"] = request.second_board_pgn
        raw_game["bughousePlayer1Name"] = white_name
        raw_game["bughousePlayer2Name"] = black_name
        raw_game["bughousePartnerPlayer1Name"] = partner_headers.get("White") or "White"
        raw_game["bughousePartnerPlayer2Name"] = partner_headers.get("Black") or "Black"
    created = games.db.upsert_game(request.username, raw_game)
    stored = games.db.get_game_by_username_url(request.username, manual_url)
    if not stored:
        raise HTTPException(status_code=500, detail="Imported game could not be opened")
    return {
        "created": created,
        "source": "manual",
        "second_board_supplied": bool(request.second_board_pgn),
        "game_id": stored["id"],
    }


@app.get("/api/games/{game_id}/snapshot/{global_ply}")
def get_snapshot(game_id: int, global_ply: int) -> dict[str, object]:
    if not games.is_completed_game(game_id):
        raise HTTPException(status_code=409, detail="Only completed games can be reviewed")
    snapshot = games.snapshot(game_id, global_ply)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Game not found")
    return snapshot


@app.post("/api/exploration/move")
def exploration_move(request: ExplorationMoveRequest) -> dict[str, object]:
    if not request.from_square and not request.drop_piece:
        raise HTTPException(status_code=422, detail="A source square or drop piece is required")
    try:
        return apply_exploration_move(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/exploration/san")
def exploration_san_move(request: ExplorationSanMoveRequest) -> dict[str, object]:
    try:
        return apply_exploration_san_move(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/puzzles/{puzzle_id}")
def puzzle_detail(puzzle_id: str) -> dict[str, object]:
    puzzle = get_puzzle(puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=404, detail="Puzzle not found")
    return puzzle.public_payload()


@app.post("/puzzle-move/{puzzle_id}")
def puzzle_move(puzzle_id: str, request: PuzzleHistoryRequest) -> dict[str, object]:
    puzzle = get_puzzle(puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=404, detail="Puzzle not found")
    return check_move(puzzle, request.moves)


@app.post("/puzzle-next-move/{puzzle_id}")
def puzzle_next_move(puzzle_id: str, request: PuzzleHistoryRequest) -> dict[str, object]:
    puzzle = get_puzzle(puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=404, detail="Puzzle not found")
    return next_move(puzzle, request.moves)


@app.post("/puzzle-solution/{puzzle_id}")
def puzzle_solution(puzzle_id: str, request: PuzzleHistoryRequest) -> dict[str, object]:
    puzzle = get_puzzle(puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=404, detail="Puzzle not found")
    return solution(puzzle, request.moves)


@app.post("/api/analysis", status_code=status.HTTP_202_ACCEPTED)
async def start_analysis(request: AnalysisRequest) -> dict[str, str]:
    if not await asyncio.to_thread(games.is_completed_game, request.game_id):
        raise HTTPException(status_code=409, detail="Engine analysis is available only for stored completed games")
    try:
        job_id = await analysis_jobs.submit(
            request.game_id,
            request.global_ply,
            request.board,
            request.depth,
        )
    except JobCapacityError as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    return {"job_id": job_id, "status": "queued", "engine": "Fairy-Stockfish"}


@app.get("/api/analysis/{job_id}")
def get_analysis(job_id: str) -> dict[str, object]:
    job = analysis_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    response = dict(job)
    if response.get("status") == "queued":
        response["queue_position"] = analysis_jobs.queue_position(job_id) or 1
    return response


@app.post("/api/coach/prepare")
def prepare_coach(request: CoachPrepareRequest) -> dict[str, object]:
    if not games.is_completed_game(request.game_id):
        raise HTTPException(status_code=409, detail="Coach analysis is available only for stored completed games")
    try:
        return prepare_coach_context(request, games)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/coach/status")
def coach_status() -> dict[str, object]:
    return qwen_runtime.status()


@app.post("/api/coach/analyze")
async def analyze_with_coach(request: CoachPrepareRequest) -> dict[str, object]:
    if not await asyncio.to_thread(games.is_completed_game, request.game_id):
        raise HTTPException(status_code=409, detail="Coach analysis is available only for stored completed games")
    try:
        job_id = await coach_jobs.submit(request)
    except JobCapacityError as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/coach/jobs/{job_id}")
def get_coach_job(job_id: str) -> dict[str, object]:
    job = coach_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Coach job not found")
    return job


@app.get("/api/stats/{username}")
def player_stats(username: str) -> dict[str, object]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{2,25}", username):
        raise HTTPException(status_code=400, detail="Invalid Chess.com username")
    return games.player_stats(username)


@app.post("/api/leak-map/analyze", status_code=status.HTTP_202_ACCEPTED)
async def analyze_leak_map(request: LeakMapAnalysisRequest) -> dict[str, object]:
    try:
        job_id = await leak_map_jobs.submit(request)
    except JobCapacityError as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/leak-map/jobs/{job_id}")
def get_leak_map_job(job_id: str) -> dict[str, object]:
    job = leak_map_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Leak-map job not found")
    return job


@app.post("/api/rooms")
def create_room(request: RoomCreateRequest, session: Session = Depends(get_session)) -> dict[str, object]:
    room_id = str(uuid4())
    room = ReviewRoom(id=room_id, game_id=request.game_id)
    try:
        session.add(room)
        session.commit()
    except SQLAlchemyError as exc:
        _rollback_quietly(session)
        logger.warning("Falling back to in-memory review room after database error: %s", exc)
    room_hub.set_room_game(room_id, request.game_id)
    return {"id": room_id, "game_id": request.game_id, "share_path": f"/?room={room_id}"}


@app.get("/api/rooms/{room_id}")
def get_room(room_id: str, session: Session = Depends(get_session)) -> dict[str, object]:
    room = session.get(ReviewRoom, room_id)
    if not room and not room_hub.has_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    snapshot = room_hub.snapshot(room_id)
    fallback_game_id = snapshot.get("room", {}).get("game_id") if isinstance(snapshot.get("room"), dict) else None
    return {"id": room_id, "game_id": room.game_id if room else fallback_game_id, "snapshot": snapshot}


@app.post("/api/rooms/{room_id}/join")
def join_room(room_id: str, request: RoomJoinRequest, session: Session = Depends(get_session)) -> dict[str, object]:
    if not session.get(ReviewRoom, room_id) and not room_hub.has_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room_id, "client_id": str(uuid4()), "display_name": request.display_name}


@app.get("/api/rooms/{room_id}/notes")
def list_notes(room_id: str, session: Session = Depends(get_session)) -> list[dict[str, object]]:
    if not session.get(ReviewRoom, room_id) and room_hub.has_room(room_id):
        return []
    rows = session.scalars(
        select(SharedNote)
        .where(SharedNote.room_id == room_id)
        .order_by(SharedNote.created_at, SharedNote.id)
    ).all()
    return [
        {
            "id": row.id,
            "author": row.author,
            "content": row.content,
            "board": row.board,
            "global_ply": row.global_ply,
            "variation_id": row.variation_id,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@app.post("/api/rooms/{room_id}/notes")
def create_note(room_id: str, request: NoteCreateRequest, session: Session = Depends(get_session)) -> dict[str, object]:
    if not session.get(ReviewRoom, room_id) and not room_hub.has_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    note = SharedNote(room_id=room_id, **request.model_dump(mode="json"))
    try:
        session.add(note)
        session.commit()
        return {"id": note.id, "created_at": note.created_at}
    except SQLAlchemyError as exc:
        _rollback_quietly(session)
        if not _is_disk_full_error(exc):
            raise
        return {"id": str(uuid4()), "created_at": None}


def _persist_room_game_selection(room_id: str, game_id: int) -> None:
    try:
        with SessionLocal() as session:
            room = session.get(ReviewRoom, room_id)
            if room:
                room.game_id = game_id
                session.commit()
    except SQLAlchemyError as exc:
        if not _is_disk_full_error(exc):
            raise


def _persist_room_chat_message(room_id: str, payload: dict[str, object], content: str) -> None:
    try:
        with SessionLocal() as session:
            session.add(ChatMessage(room_id=room_id, author=str(payload.get("author") or "Guest")[:64], content=content, board=payload.get("board"), global_ply=payload.get("ply")))
            session.commit()
    except SQLAlchemyError as exc:
        if not _is_disk_full_error(exc):
            raise


def _persist_room_note(room_id: str, payload: dict[str, object], content: str) -> None:
    try:
        with SessionLocal() as session:
            session.add(SharedNote(room_id=room_id, author=str(payload.get("author") or "Guest")[:64], content=content, board=payload.get("board"), global_ply=payload.get("ply")))
            session.commit()
    except SQLAlchemyError as exc:
        if not _is_disk_full_error(exc):
            raise


@app.websocket("/ws/rooms/{room_id}")
async def room_socket(
    websocket: WebSocket,
    room_id: str,
    client_id: str = Query(min_length=1, max_length=80),
    display_name: str = Query(default="Guest", min_length=1, max_length=40),
) -> None:
    if not settings.is_allowed_websocket_origin(websocket.headers.get("origin")):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    clean_display_name = " ".join(display_name.split()) or "Guest"
    await room_hub.connect(room_id, client_id, websocket, clean_display_name)
    try:
        await websocket.send_json({"type": "room.snapshot", "payload": room_hub.snapshot(room_id)})
        await room_hub.broadcast_presence(room_id, exclude_client_id=client_id)
        while True:
            raw = await websocket.receive_json()
            event = SocketEvent.model_validate(raw)
            if str(event.room_id) != room_id:
                await websocket.send_json({"type": "error", "payload": {"message": "Room ID mismatch"}})
                continue
            payload = event.payload
            event_payload = event.model_dump(mode="json")
            if event.type == "game.select":
                selected_game_id = payload.get("game_id")
                if isinstance(selected_game_id, int):
                    await asyncio.to_thread(_persist_room_game_selection, room_id, selected_game_id)
                    room_hub.set_room_game(room_id, selected_game_id)
            if event.type == "chat.message":
                content = str(payload.get("content") or "").strip()[:5000]
                event_payload = room_hub.sequence_chat_message(room_id, event_payload)
                await room_hub.publish(room_id, event_payload)
                if content:
                    await asyncio.to_thread(
                        _persist_room_chat_message,
                        room_id,
                        event_payload["payload"],
                        content,
                    )
                continue
            elif event.type == "note.create":
                content = str(payload.get("content") or "").strip()[:5000]
                if content:
                    await asyncio.to_thread(_persist_room_note, room_id, payload, content)
            await room_hub.publish(room_id, event_payload)
    except WebSocketDisconnect:
        await room_hub.disconnect(room_id, client_id)
        await room_hub.broadcast_presence(room_id)


frontend_dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        candidate = frontend_dist / full_path
        return FileResponse(candidate if candidate.is_file() else frontend_dist / "index.html")
