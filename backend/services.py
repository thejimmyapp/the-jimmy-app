from __future__ import annotations

import asyncio
import json
import re
from dataclasses import asdict
from pathlib import Path
from typing import Any
from collections import OrderedDict, defaultdict

import chess.variant

from backend.config import Settings
from backend.job_control import BoundedJobRegistry
from thejimmyapp.board_renderer import build_bughouse_pair_positions, build_global_replay_frames, build_replay_positions
from thejimmyapp.db import Database
from thejimmyapp.engine import EngineConfig, FairyStockfishEngine
from thejimmyapp.game_completion import is_completed_chesscom_game, is_completed_stored_game
from thejimmyapp.pgn_parser import parse_game_data, parse_partner_game_data


class GuestReplayIngestError(ValueError):
    pass


class MomentPersistenceError(ValueError):
    pass


_MOMENT_TOKEN_RE = re.compile(r"(?P<move_number>[1-9]\d*)(?P<board>[AaBb])")
_MOMENT_GLYPHS = {"!", "?", "!!", "??", "!?", "?!"}


class GameService:
    def __init__(self, database_path: Path) -> None:
        self.db = Database(database_path)
        self.db.initialize()

    def list_games(self, username: str, limit: int = 500) -> list[dict[str, object]]:
        return self.db.list_games(username=username, limit=limit)

    def is_completed_game(self, game_id: int) -> bool:
        game = self.db.get_game(game_id)
        return bool(game and is_completed_stored_game(game))

    def create_guest_identity(self) -> tuple[int, str]:
        return self.db.create_guest_identity()

    def guest_number_for_token(self, token: str) -> int | None:
        return self.db.guest_number_for_token(token)

    def guest_identity_count(self) -> int:
        return self.db.guest_identity_count()

    def create_moment(
        self,
        game_id: int,
        move_token: str,
        glyph: str,
        alternative_move: str,
        written_answer: str,
        author_guest_number: int,
    ) -> tuple[dict[str, object], dict[str, object]]:
        _validate_moment_annotation(
            game_id=game_id,
            move_token=move_token,
            glyph=glyph,
            alternative_move=alternative_move,
            written_answer=written_answer,
            author_guest_number=author_guest_number,
        )
        global_ply = self._moment_global_ply(game_id, move_token)
        snapshot = self.snapshot(game_id, global_ply)
        if snapshot is None or snapshot.get("global_ply") != global_ply:
            raise MomentPersistenceError("the exact coupled replay frame is unavailable")
        coupled_state = _capture_coupled_state(snapshot)
        return self.db.create_moment_copies(
            {
                "game_id": game_id,
                "move_token": move_token,
                "glyph": glyph,
                "alternative_move": alternative_move,
                "written_answer": written_answer,
                "author_guest_number": author_guest_number,
                **coupled_state,
            }
        )

    def list_private_moments(self, author_guest_number: int) -> list[dict[str, object]]:
        if isinstance(author_guest_number, bool) or author_guest_number <= 0:
            raise MomentPersistenceError("guest number must be a positive integer")
        return self.db.list_private_moments(author_guest_number)

    def list_public_moments(self) -> list[dict[str, object]]:
        return self.db.list_public_moments()

    def update_private_moment(
        self,
        moment_id: int,
        author_guest_number: int,
        glyph: str,
        alternative_move: str,
        written_answer: str,
    ) -> bool:
        _validate_moment_annotation(
            game_id=1,
            move_token="1A",
            glyph=glyph,
            alternative_move=alternative_move,
            written_answer=written_answer,
            author_guest_number=author_guest_number,
        )
        if isinstance(moment_id, bool) or not isinstance(moment_id, int) or moment_id <= 0:
            raise MomentPersistenceError("moment id must be a positive integer")
        return self.db.update_private_moment(
            moment_id,
            author_guest_number,
            glyph,
            alternative_move,
            written_answer,
        )

    def delete_private_moment(self, moment_id: int, author_guest_number: int) -> bool:
        if (
            isinstance(moment_id, bool)
            or not isinstance(moment_id, int)
            or moment_id <= 0
            or isinstance(author_guest_number, bool)
            or not isinstance(author_guest_number, int)
            or author_guest_number <= 0
        ):
            raise MomentPersistenceError("moment and guest numbers must be positive integers")
        return self.db.delete_private_moment(moment_id, author_guest_number)

    def _moment_global_ply(self, game_id: int, move_token: str) -> int:
        match = _MOMENT_TOKEN_RE.fullmatch(move_token)
        if match is None:
            raise MomentPersistenceError("move token is invalid")
        payload = self.get_game_payload(game_id)
        timeline = payload.get("timeline") if payload else None
        if not isinstance(timeline, list) or not timeline:
            raise MomentPersistenceError("a complete coupled replay is required")

        board_token = match.group("board")
        board = board_token.upper()
        move_number = int(match.group("move_number"))
        local_ply = move_number * 2 - (1 if board_token.isupper() else 0)
        matches = [
            frame
            for frame in timeline
            if isinstance(frame, dict)
            and frame.get("board") == board
            and frame.get("local_ply") == local_ply
        ]
        if len(matches) != 1 or not isinstance(matches[0].get("global_ply"), int):
            raise MomentPersistenceError("move token does not identify exactly one replay frame")
        return int(matches[0]["global_ply"])

    def ingest_guest_replay(self, replay_source: dict[str, Any], guest_number: int) -> int:
        if isinstance(guest_number, bool) or not isinstance(guest_number, int) or guest_number <= 0:
            raise GuestReplayIngestError("guest number must be a positive integer")

        archive_game, ply_count_a, ply_count_b = _flatten_guest_replay(replay_source)
        raw_json = json.dumps(archive_game, ensure_ascii=False)
        try:
            parsed = parse_game_data("", raw_json)
            partner = parse_partner_game_data(raw_json)
            if partner is None:
                raise GuestReplayIngestError("partner board could not be parsed")
            warnings = [*parsed.parse_warnings, *partner.parse_warnings]
            if any(
                warning.startswith(
                    ("Could not validate decoded move", "Initial setup could not be initialized")
                )
                for warning in warnings
            ):
                raise GuestReplayIngestError("the replay payload could not be reconstructed safely")
            if len(parsed.moves) != ply_count_a or len(partner.moves) != ply_count_b:
                raise GuestReplayIngestError("decoded move count does not match the replay payload")
            if any(not move.uci for move in [*parsed.moves, *partner.moves]):
                raise GuestReplayIngestError("a decoded move is missing its coordinate form")
            timeline = build_global_replay_frames(parsed.moves, partner.moves)
        except GuestReplayIngestError:
            raise
        except Exception as exc:
            raise GuestReplayIngestError("the replay payload could not be parsed") from exc

        if len(timeline) != ply_count_a + ply_count_b + 1:
            raise GuestReplayIngestError("the coupled replay timeline is incomplete")
        for frame in (timeline[0], timeline[-1]):
            if not frame.board_a.variant_fen or not frame.board_b.variant_fen:
                raise GuestReplayIngestError("the replay payload did not produce both board positions")
        initial_positions = (
            ("A", archive_game["initialFen"], timeline[0].board_a.variant_fen),
            ("B", archive_game["bughousePartnerInitialFen"], timeline[0].board_b.variant_fen),
        )
        for label, initial_fen, timeline_fen in initial_positions:
            if _guest_initial_variant_fen(initial_fen) != timeline_fen:
                raise GuestReplayIngestError(
                    f"boards.{label}.initialFen cannot be preserved by the coupled replay timeline"
                )
        if not is_completed_chesscom_game(archive_game):
            raise GuestReplayIngestError("the replay payload does not contain a terminal result")

        username = f"guest_{guest_number}"
        self.db.upsert_game(username, archive_game)
        stored = self.db.get_game_by_username_url(username, str(archive_game["url"]))
        if stored is None:
            raise RuntimeError("guest replay was not stored")
        return int(stored["id"])

    def resolve_stored_game(self, urls: tuple[str, ...], username: str | None = None) -> dict[str, object] | None:
        completed = [game for game in self.db.find_games_by_urls(urls) if is_completed_stored_game(game)]
        if not completed:
            return None

        normalized_username = username.lower() if username else None
        candidates = [
            (game, payload)
            for game in completed
            if (payload := self.get_game_payload(int(game["id"]))) is not None
        ]
        if not candidates:
            return None

        def priority(candidate: tuple[dict[str, object], dict[str, object]]) -> tuple[bool, bool, int, int]:
            game, payload = candidate
            return (
                bool(payload.get("second_board_available")),
                bool(normalized_username and game.get("username") == normalized_username),
                int(game.get("end_time") or 0),
                int(game.get("id") or 0),
            )

        return max(candidates, key=priority)[1]

    def get_game_payload(self, game_id: int) -> dict[str, object] | None:
        game = self.db.get_game(game_id)
        if not game or not is_completed_stored_game(game):
            return None
        parsed = parse_game_data(str(game.get("pgn") or ""), str(game.get("raw_json") or ""))
        partner = parse_partner_game_data(str(game.get("raw_json") or ""))
        try:
            raw = json.loads(str(game.get("raw_json") or "{}"))
        except json.JSONDecodeError:
            raw = {}
        players = {
            "board_a_white": str(game.get("white_username") or raw.get("bughousePlayer1Name") or "White"),
            "board_a_black": str(game.get("black_username") or raw.get("bughousePlayer2Name") or "Black"),
            "board_b_white": str(
                raw.get("bughousePartnerPlayer1Name")
                or (partner.headers.get("White") if partner else None)
                or "White"
            ),
            "board_b_black": str(
                raw.get("bughousePartnerPlayer2Name")
                or (partner.headers.get("Black") if partner else None)
                or "Black"
            ),
        }
        if partner:
            main_positions, partner_positions = build_bughouse_pair_positions(parsed.moves, partner.moves)
            timeline = build_global_replay_frames(parsed.moves, partner.moves)
        else:
            main_positions = build_replay_positions(parsed.moves)
            partner_positions = []
            timeline = []
        limitations = list(parsed.parse_warnings)
        if partner:
            limitations.extend(partner.parse_warnings)
            if timeline and any(
                "Cross-board move order is approximate" in frame.board_a.warning
                for frame in timeline[1:]
            ):
                limitations.append(
                    "Cross-board move order is approximate because complete clock timestamps are unavailable."
                )
        else:
            limitations.append("Second board unavailable")
        limitations = list(dict.fromkeys(item for item in limitations if item))
        timeline_payload = [asdict(frame) for frame in timeline]
        return {
            "game": game,
            "players": players,
            "moves_a": [{**asdict(move), "display_move": move.display_move} for move in parsed.moves],
            "moves_b": [{**asdict(move), "display_move": move.display_move} for move in partner.moves] if partner else [],
            "positions_a": [asdict(position) for position in main_positions],
            "positions_b": [asdict(position) for position in partner_positions],
            "timeline": timeline_payload,
            "second_board_available": bool(partner_positions),
            "limitations": limitations,
            "outcome": _game_outcome(game, raw, players, parsed.moves, partner.moves if partner else []),
            "lesson": _review_lesson(
                self.db.get_primary_mistake_for_game(game_id),
                timeline_payload,
                len(main_positions),
                bool(partner_positions),
            ),
        }

    def snapshot(self, game_id: int, global_ply: int) -> dict[str, object] | None:
        payload = self.get_game_payload(game_id)
        if not payload:
            return None
        timeline = payload["timeline"]
        if timeline:
            index = max(0, min(global_ply, len(timeline) - 1))
            frame = timeline[index]
            return {"global_ply": index, "board_a": frame["board_a"], "board_b": frame["board_b"]}
        positions_a = payload["positions_a"]
        index = max(0, min(global_ply, len(positions_a) - 1))
        position_a = positions_a[index]
        partner_index = position_a.get("partner_index") if isinstance(position_a, dict) else None
        positions_b = payload["positions_b"]
        position_b = positions_b[partner_index] if positions_b and partner_index is not None else None
        return {"global_ply": index, "board_a": position_a, "board_b": position_b}

    def player_stats(self, username: str) -> dict[str, object]:
        games = self.db.list_games(username=username, limit=100_000)
        dashboard = self.db.get_dashboard_stats(username)
        colors = self.db.get_color_stats(username)
        partners = self.db.get_partner_stats(username)
        opponents = self.db.get_opponent_stats(username, min_games=3)
        mistake_summary = self.db.get_mistake_summary(username)
        categories = _aggregate_categories(self.db.get_mistake_category_stats(username))
        coverage = self.db.get_analysis_coverage(username, 10)
        return {
            "username": username,
            "summary": {
                **dashboard,
                **mistake_summary,
                "wins": sum(1 for game in games if game.get("result") == "win"),
                "losses": sum(1 for game in games if game.get("result") == "loss"),
                "draws": sum(1 for game in games if game.get("result") == "draw"),
            },
            "colors": colors,
            "monthly": _monthly_stats(games),
            "rating_bands": _rating_band_stats(games),
            "partners": partners[:12],
            "opponents": opponents[:12],
            "mistake_categories": categories[:10],
            "data_quality": {
                "two_board_games": dashboard.get("partner_boards", 0),
                "total_games": dashboard.get("total_games", 0),
                "analysis_positions": mistake_summary.get("mistakes", 0),
                "analyzed_games": coverage.get("analyzed_at_depth", 0),
            },
        }


def _validate_moment_annotation(
    *,
    game_id: int,
    move_token: str,
    glyph: str,
    alternative_move: str,
    written_answer: str,
    author_guest_number: int,
) -> None:
    if isinstance(game_id, bool) or not isinstance(game_id, int) or game_id <= 0:
        raise MomentPersistenceError("game id must be a positive integer")
    if not isinstance(move_token, str) or _MOMENT_TOKEN_RE.fullmatch(move_token) is None:
        raise MomentPersistenceError("move token is invalid")
    if not isinstance(glyph, str) or glyph not in _MOMENT_GLYPHS:
        raise MomentPersistenceError("glyph is invalid")
    if not isinstance(alternative_move, str) or not alternative_move.strip():
        raise MomentPersistenceError("alternative move is required")
    if not isinstance(written_answer, str):
        raise MomentPersistenceError("written answer is required")
    if (
        isinstance(author_guest_number, bool)
        or not isinstance(author_guest_number, int)
        or author_guest_number <= 0
    ):
        raise MomentPersistenceError("guest number must be a positive integer")


def _capture_coupled_state(snapshot: dict[str, object]) -> dict[str, str]:
    captured: dict[str, str] = {}
    for board_key in ("board_a", "board_b"):
        board = snapshot.get(board_key)
        if not isinstance(board, dict):
            raise MomentPersistenceError("both boards are required in the coupled replay frame")
        prefix = board_key
        for field in ("white_pocket", "black_pocket", "white_clock", "black_clock"):
            value = board.get(field)
            if not isinstance(value, str) or not value:
                raise MomentPersistenceError(f"coupled replay frame is missing {board_key}.{field}")
            captured[f"{prefix}_{field}"] = value
    return captured


def _flatten_guest_replay(replay_source: dict[str, Any]) -> tuple[dict[str, Any], int, int]:
    if not isinstance(replay_source, dict):
        raise GuestReplayIngestError("replay source must be an object")
    match = _required_dict(replay_source, "match", "replay source")
    boards = _required_dict(replay_source, "boards", "replay source")
    board_a = _validated_guest_board(_required_dict(boards, "A", "boards"), "A")
    board_b = _validated_guest_board(_required_dict(boards, "B", "boards"), "B")

    game_ids = _required_dict(match, "game_ids", "match")
    ply_counts = _required_dict(match, "ply_counts", "match")
    if _required_positive_int(game_ids, "A", "match.game_ids") != board_a["id"]:
        raise GuestReplayIngestError("match.game_ids.A does not match boards.A.id")
    if _required_positive_int(game_ids, "B", "match.game_ids") != board_b["id"]:
        raise GuestReplayIngestError("match.game_ids.B does not match boards.B.id")
    if _required_positive_int(ply_counts, "A", "match.ply_counts") != board_a["ply_count"]:
        raise GuestReplayIngestError("match.ply_counts.A does not match boards.A.plyCount")
    if _required_positive_int(ply_counts, "B", "match.ply_counts") != board_b["ply_count"]:
        raise GuestReplayIngestError("match.ply_counts.B does not match boards.B.plyCount")
    if board_a["partner_uuid"] != board_b["uuid"] or board_b["partner_uuid"] != board_a["uuid"]:
        raise GuestReplayIngestError("board partner identifiers do not agree")

    seats = _required_dict(match, "seats", "match")
    seat_players = {
        seat: _validated_guest_seat(_required_dict(seats, seat, "match.seats"), seat)
        for seat in ("A-white", "A-black", "B-white", "B-black")
    }
    end_time = _required_positive_int(match, "end_time", "match")
    decisive_board = _required_string(match, "decisive_board", "match")
    if decisive_board not in {"A", "B"}:
        raise GuestReplayIngestError("match.decisive_board must be A or B")
    loser_seat = _required_string(match, "loser_seat", "match")
    if loser_seat not in seat_players or not loser_seat.startswith(f"{decisive_board}-"):
        raise GuestReplayIngestError("match.loser_seat does not agree with match.decisive_board")
    action = _required_string(match, "action", "match")
    loss_results = {
        "checkmated": "checkmated",
        "resigned": "resigned",
        "flagged": "timeout",
        "abandoned": "abandoned",
    }
    if action not in loss_results:
        raise GuestReplayIngestError("match.action is not a supported terminal action")

    decisive_loser_color = loser_seat.split("-", 1)[1]
    losing_a_color = (
        decisive_loser_color
        if decisive_board == "A"
        else "black" if decisive_loser_color == "white" else "white"
    )
    a_loss_result = loss_results[action] if decisive_board == "A" else "lose"
    white_result = a_loss_result if losing_a_color == "white" else "win"
    black_result = a_loss_result if losing_a_color == "black" else "win"

    return (
        {
            "url": f"https://www.chess.com/game/live/{board_a['id']}",
            "uuid": board_a["uuid"],
            "rules": "bughouse",
            "end_time": end_time,
            "tcn": board_a["move_list"],
            "moveTimestamps": board_a["move_timestamps"],
            "bughousePartnerTcnMoves": board_b["move_list"],
            "bughousePartnerMoveTimestamps": board_b["move_timestamps"],
            "initialFen": board_a["initial_fen"],
            "bughousePartnerInitialFen": board_b["initial_fen"],
            "bughousePlayer1Name": seat_players["A-white"]["name"],
            "bughousePlayer2Name": seat_players["A-black"]["name"],
            "bughousePartnerPlayer1Name": seat_players["B-white"]["name"],
            "bughousePartnerPlayer2Name": seat_players["B-black"]["name"],
            "white": {
                "username": seat_players["A-white"]["name"],
                "rating": seat_players["A-white"]["rating"],
                "result": white_result,
            },
            "black": {
                "username": seat_players["A-black"]["name"],
                "rating": seat_players["A-black"]["rating"],
                "result": black_result,
            },
        },
        int(board_a["ply_count"]),
        int(board_b["ply_count"]),
    )


def _validated_guest_board(board: dict[str, Any], label: str) -> dict[str, Any]:
    board_id = _required_positive_int(board, "id", f"boards.{label}")
    uuid = _required_string(board, "uuid", f"boards.{label}")
    partner_uuid = _required_string(board, "partnerGameId", f"boards.{label}")
    move_list = _required_string(board, "moveList", f"boards.{label}")
    move_timestamps = _required_string(board, "moveTimestamps", f"boards.{label}")
    ply_count = _required_positive_int(board, "plyCount", f"boards.{label}")
    initial_fen = _required_string(board, "initialFen", f"boards.{label}")
    if len(move_list) != ply_count * 2:
        raise GuestReplayIngestError(f"boards.{label}.moveList length does not match plyCount")
    timestamps = move_timestamps.split(",")
    if len(timestamps) not in {ply_count, ply_count + 1} or any(not value.isdigit() for value in timestamps):
        raise GuestReplayIngestError(f"boards.{label}.moveTimestamps has an unexpected shape")
    return {
        "id": board_id,
        "uuid": uuid,
        "partner_uuid": partner_uuid,
        "move_list": move_list,
        "move_timestamps": move_timestamps,
        "ply_count": ply_count,
        "initial_fen": initial_fen,
    }


def _validated_guest_seat(player: dict[str, Any], seat: str) -> dict[str, Any]:
    return {
        "name": _required_string(player, "name", f"match.seats.{seat}"),
        "rating": _required_int(player, "rating", f"match.seats.{seat}"),
    }


def _guest_initial_variant_fen(value: object) -> str:
    if not isinstance(value, str):
        raise GuestReplayIngestError("initialFen must be a string")
    if value.strip().lower() in {"startpos", "standard"}:
        return chess.variant.CrazyhouseBoard().fen()
    try:
        return chess.variant.CrazyhouseBoard(value.strip()).fen()
    except (TypeError, ValueError) as exc:
        raise GuestReplayIngestError("initialFen is invalid") from exc


def _required_dict(container: dict[str, Any], key: str, path: str) -> dict[str, Any]:
    value = container.get(key)
    if not isinstance(value, dict):
        raise GuestReplayIngestError(f"{path}.{key} must be an object")
    return value


def _required_string(container: dict[str, Any], key: str, path: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or not value.strip():
        raise GuestReplayIngestError(f"{path}.{key} must be a non-empty string")
    return value


def _required_int(container: dict[str, Any], key: str, path: str) -> int:
    value = container.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise GuestReplayIngestError(f"{path}.{key} must be an integer")
    return value


def _required_positive_int(container: dict[str, Any], key: str, path: str) -> int:
    value = _required_int(container, key, path)
    if value <= 0:
        raise GuestReplayIngestError(f"{path}.{key} must be positive")
    return value


class AnalysisJobs:
    def __init__(self, settings: Settings, games: GameService) -> None:
        self.settings = settings
        self.games = games
        self.registry = BoundedJobRegistry(
            max_active=settings.analysis_max_active_jobs,
            max_records=settings.analysis_max_job_records,
            ttl_seconds=settings.compute_job_ttl_seconds,
        )
        self.cache: OrderedDict[str, dict[str, object]] = OrderedDict()
        self.semaphore = asyncio.Semaphore(2)

    async def submit(
        self,
        game_id: int,
        global_ply: int,
        board: str,
        depth: int,
    ) -> str:
        job_id = self.registry.reserve({
            "status": "queued",
            "engine": "Fairy-Stockfish",
            "board": board,
            "global_ply": global_ply,
            "depth": depth,
        })
        asyncio.create_task(
            self._run(job_id, game_id, global_ply, board, depth)
        )
        return job_id

    async def _run(
        self,
        job_id: str,
        game_id: int,
        global_ply: int,
        board: str,
        depth: int,
    ) -> None:
        async with self.semaphore:
            metadata = self.registry.get(job_id) or {}
            self.registry.update(job_id, status="running")
            snapshot = await asyncio.to_thread(self.games.snapshot, game_id, global_ply)
            position = snapshot.get("board_a" if board == "A" else "board_b") if snapshot else None
            fen = str(position.get("variant_fen") or "") if isinstance(position, dict) else ""
            if not fen:
                self.registry.replace(
                    job_id,
                    {**metadata, "status": "failed", "error": "Board position unavailable"},
                )
                return
            board_a = snapshot.get("board_a") if snapshot else None
            board_b = snapshot.get("board_b") if snapshot else None
            cache_key = "|".join(
                [
                    str(board_a.get("variant_fen") if isinstance(board_a, dict) else ""),
                    str(board_b.get("variant_fen") if isinstance(board_b, dict) else ""),
                    board,
                    str(depth),
                ]
            )
            if cache_key in self.cache:
                cached = self.cache.pop(cache_key)
                self.cache[cache_key] = cached
                self.registry.replace(job_id, {
                    **metadata,
                    "status": "completed",
                    "result": cached,
                    "cached": True,
                })
                return
            config = EngineConfig(path=self.settings.fairy_stockfish_path, depth=depth)
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(self._analyze, fen, config),
                    timeout=self.settings.engine_timeout_seconds,
                )
                self.cache[cache_key] = result
                while len(self.cache) > self.settings.analysis_cache_records:
                    self.cache.popitem(last=False)
                self.registry.replace(
                    job_id,
                    {**metadata, "status": "completed", "result": result},
                )
            except Exception as exc:
                self.registry.replace(
                    job_id,
                    {**metadata, "status": "failed", "error": str(exc)},
                )

    def get(self, job_id: str) -> dict[str, object] | None:
        return self.registry.get(job_id)

    def queue_position(self, job_id: str) -> int | None:
        return self.registry.queued_position(job_id)

    @staticmethod
    def _analyze(fen: str, config: EngineConfig) -> dict[str, object]:
        with FairyStockfishEngine(config) as engine:
            return asdict(engine.analyze_fen(fen))


def _monthly_stats(games: list[dict[str, object]]) -> list[dict[str, object]]:
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"games": 0, "wins": 0, "losses": 0})
    for game in games:
        month = str(game.get("played_at") or "")[:7]
        if len(month) != 7:
            continue
        buckets[month]["games"] += 1
        result = str(game.get("result") or "")
        if result == "win":
            buckets[month]["wins"] += 1
        elif result == "loss":
            buckets[month]["losses"] += 1
    rows = []
    for month in sorted(buckets)[-12:]:
        item = buckets[month]
        rows.append({
            "month": month,
            **item,
            "winrate": None if item["games"] == 0 else round(item["wins"] / item["games"] * 100, 1),
        })
    return rows


def _rating_band_stats(games: list[dict[str, object]]) -> list[dict[str, object]]:
    bands = [
        ("Under 1600", 0, 1599),
        ("1600-1799", 1600, 1799),
        ("1800-1999", 1800, 1999),
        ("2000-2199", 2000, 2199),
        ("2200+", 2200, 9999),
    ]
    rows = []
    for label, low, high in bands:
        selected = [game for game in games if isinstance(game.get("opponent_rating"), int) and low <= int(game["opponent_rating"]) <= high]
        wins = sum(1 for game in selected if game.get("result") == "win")
        rows.append({
            "label": label,
            "games": len(selected),
            "wins": wins,
            "winrate": None if not selected else round(wins / len(selected) * 100, 1),
        })
    return rows


def _aggregate_categories(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "weighted_loss": 0, "max_loss": 0})
    for row in rows:
        category = str(row.get("category") or "unknown")
        count = int(row.get("count") or 0)
        avg_loss = float(row.get("avg_loss") or 0)
        target = grouped[category]
        target["count"] += count
        target["weighted_loss"] += avg_loss * count
        target["max_loss"] = max(target["max_loss"], float(row.get("max_loss") or 0))
    result = [
        {
            "category": category,
            "count": int(values["count"]),
            "avg_loss": round(values["weighted_loss"] / values["count"], 1) if values["count"] else 0,
            "max_loss": int(values["max_loss"]),
        }
        for category, values in grouped.items()
    ]
    return sorted(result, key=lambda item: (int(item["count"]), float(item["avg_loss"])), reverse=True)


_LOSS_RESULTS = {"checkmated", "resigned", "timeout", "abandoned", "lose", "kingofthehill", "threecheck"}


def _review_lesson(
    mistake: dict[str, object] | None,
    timeline: list[dict[str, object]],
    main_position_count: int,
    partner_available: bool,
) -> dict[str, object] | None:
    """Expose stored engine evidence without generating unsupported coaching prose."""
    if not mistake:
        return None
    local_ply = max(0, int(mistake["ply"]))
    global_ply = _global_ply_for_main_move(timeline, local_ply)
    if global_ply is None:
        global_ply = min(local_ply, max(0, main_position_count - 1))
    motif = str(mistake.get("tactical_motif") or "").strip()
    category = str(mistake.get("category") or "tactical miss").strip()
    partner_context = str(mistake.get("partner_danger") or "").strip()
    return {
        "id": str(mistake["id"]),
        "board": "A",
        "local_ply": local_ply,
        "global_ply": global_ply,
        "played_move": str(mistake["move"]),
        "best_move": str(mistake["bestmove"]),
        "severity": str(mistake["severity"]),
        "estimated_loss_cp": int(mistake["estimated_loss_cp"]),
        "category": category,
        "pattern": motif if motif and motif.lower() != "unknown" else category,
        "confidence": str(mistake["confidence"]),
        "depth": int(mistake["depth"]) if mistake.get("depth") is not None else None,
        "partner_context": partner_context if partner_available and partner_context else None,
    }


def _global_ply_for_main_move(timeline: list[dict[str, object]], local_ply: int) -> int | None:
    for frame in timeline:
        if frame.get("board") == "A" and int(frame.get("local_ply") or 0) == local_ply:
            return int(frame.get("global_ply") or 0)
    return None


def _game_outcome(
    game: dict[str, object],
    raw: dict[str, Any],
    players: dict[str, str],
    main_moves: list[Any],
    partner_moves: list[Any],
) -> dict[str, object]:
    """Build a truthful result sentence without inventing partner-board facts."""
    result = str(game.get("result") or "unknown").lower()
    if result == "draw":
        return {
            "summary": "The game was drawn.",
            "detail": "No player lost this game.",
            "loser_username": None,
            "termination": "draw",
            "board": None,
            "board_role": None,
            "move_number": None,
        }

    white = raw.get("white") if isinstance(raw.get("white"), dict) else {}
    black = raw.get("black") if isinstance(raw.get("black"), dict) else {}
    white_result = str(white.get("result") or game.get("white_result") or "").lower()
    black_result = str(black.get("result") or game.get("black_result") or "").lower()

    loser: str | None = None
    termination: str | None = None
    deciding_board: str | None = None
    move_number: int | None = None
    if white_result in _LOSS_RESULTS:
        loser = str(players["board_a_white"])
        termination = white_result
        deciding_board = "A"
        move_number = _last_move_number(main_moves)
    elif black_result in _LOSS_RESULTS:
        loser = str(players["board_a_black"])
        termination = black_result
        deciding_board = "A"
        move_number = _last_move_number(main_moves)
    else:
        terminal = _terminal_mate(main_moves, "A", players) or _terminal_mate(partner_moves, "B", players)
        if terminal:
            loser, deciding_board, move_number = terminal
            termination = "checkmated"

    if not loser:
        username = str(game.get("username") or "Unknown player")
        opponent = str(game.get("opponent") or "Unknown opponent")
        loser = username if result == "loss" else opponent if result == "win" else None
        summary = f"{loser}'s team lost." if loser else "The game result is unavailable."
        return {
            "summary": summary,
            "detail": "The deciding player, board, and finish are not present in the imported game data.",
            "loser_username": loser,
            "termination": None,
            "board": None,
            "board_role": None,
            "move_number": None,
        }

    board_role, role_detail = _board_role(deciding_board, raw, bool(partner_moves))
    board_label = f"the {board_role} board" if board_role else f"Board {deciding_board}"
    move_label = f" on move {move_number}" if move_number is not None else ""
    summary = f"{loser} {_termination_phrase(termination)} on {board_label}{move_label}."
    return {
        "summary": summary,
        "detail": role_detail,
        "loser_username": loser,
        "termination": termination,
        "board": deciding_board,
        "board_role": board_role,
        "move_number": move_number,
    }


def _terminal_mate(moves: list[Any], board: str, players: dict[str, str]) -> tuple[str, str, int] | None:
    if not moves or not bool(getattr(moves[-1], "is_mate", False)):
        return None
    winning_color = str(getattr(moves[-1], "color", "white"))
    losing_color = "black" if winning_color == "white" else "white"
    return players[f"board_{board.lower()}_{losing_color}"], board, int(getattr(moves[-1], "move_number", 0))


def _last_move_number(moves: list[Any]) -> int | None:
    if not moves:
        return None
    value = getattr(moves[-1], "move_number", None)
    return int(value) if value is not None else None


def _termination_phrase(termination: str | None) -> str:
    return {
        "checkmated": "was checkmated",
        "resigned": "resigned",
        "timeout": "lost on time",
        "abandoned": "abandoned the game",
        "kingofthehill": "lost by king of the hill",
        "threecheck": "lost by three-check",
        "lose": "lost",
    }.get(str(termination), "lost")


def _board_role(board: str | None, raw: dict[str, Any], partner_available: bool) -> tuple[str | None, str]:
    if not board:
        return None, "The deciding board is unavailable."
    info = raw.get("chesscom_pgn_info") if isinstance(raw.get("chesscom_pgn_info"), dict) else {}
    a_white = _first_int(_nested(raw, "white", "rating"), info.get("whiteRating"))
    a_black = _first_int(_nested(raw, "black", "rating"), info.get("blackRating"))
    b_white = _first_int(
        raw.get("bughousePartnerPlayer1Rating"), raw.get("bughousePartnerWhiteRating"),
        info.get("bughousePartnerPlayer1Rating"), info.get("bughousePartnerWhiteRating"),
    )
    b_black = _first_int(
        raw.get("bughousePartnerPlayer2Rating"), raw.get("bughousePartnerBlackRating"),
        info.get("bughousePartnerPlayer2Rating"), info.get("bughousePartnerBlackRating"),
    )
    if None in {a_white, a_black, b_white, b_black}:
        if not partner_available:
            return None, "High/low board unknown — second-board data is unavailable."
        return None, "High/low board unknown — second-board ratings are unavailable."
    # Bughouse partners play opposite colors: A-white pairs with B-black,
    # and A-black pairs with B-white. The high board has the stronger player
    # from each team, not merely the larger average rating.
    a_is_high = bool(a_white >= b_black and a_black >= b_white)
    b_is_high = bool(b_black >= a_white and b_white >= a_black)
    if not a_is_high and not b_is_high:
        return None, "High/low board is ambiguous because the higher-rated players are split across the boards."
    high_board = "A" if a_is_high else "B"
    return ("high" if board == high_board else "low"), "Board role is based on both teams' player ratings."


def _nested(value: dict[str, Any], key: str, child: str) -> object:
    nested = value.get(key)
    return nested.get(child) if isinstance(nested, dict) else None


def _first_int(*values: object) -> int | None:
    for value in values:
        try:
            if value is not None:
                return int(value)
        except (TypeError, ValueError):
            continue
    return None
