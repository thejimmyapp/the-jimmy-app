from __future__ import annotations

import asyncio
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
import logging
import math
import re
import time
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlsplit

import httpx

from backend.config import Settings


logger = logging.getLogger(__name__)

CALLBACK_URL = "https://www.chess.com/callback/live/game/{identifier}"
LEADERBOARD_URL = "https://api.chess.com/pub/leaderboards"
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_LIVE_GAME_RE = re.compile(r"^/game/live/([1-9][0-9]*)/?$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{2,25}$")
_ACTION_BY_LOSER_CODE = {
    "checkmated": "checkmated",
    "resigned": "resigned",
    "timeout": "flagged",
    "abandoned": "abandoned",
}
_DRAW_CODES = {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}
_SEAT_ORDER = ("A-white", "A-black", "B-white", "B-black")
_LEADERBOARD_FALLBACK_SIZE = 50
_MAX_MATCHES_PER_SEED_PLAYER = 2
_MIN_REPRESENTED_SEED_PLAYERS = 3
_GUEST_MATCH_TARGET = 5
_GUEST_FRESHNESS_WINDOWS_HOURS = (1, 3, 12, 48)


class MatchProxyDisabledError(RuntimeError):
    pass


class MatchUpstreamError(RuntimeError):
    pass


class MatchExcludedError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass
class _MatchCacheEntry:
    stored_at: float
    normalized: dict[str, Any]
    raw_board_a: dict[str, Any]
    raw_board_b: dict[str, Any]


@dataclass
class _GuestListCacheEntry:
    stored_at: float
    payload: dict[str, Any]


@dataclass(frozen=True)
class _GuestCandidate:
    numeric_id: int
    end_time: int
    seed_username: str


@dataclass(frozen=True)
class _QualifiedGuestMatch:
    match: dict[str, Any]
    seed_username: str
    was_currently_shown: bool


class ChessComMatchupService:
    """Server-only access to Chess.com's callback and public archive endpoints."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.settings = settings
        self._transport = transport
        self._upstream_lock = asyncio.Lock()
        self._guest_build_lock = asyncio.Lock()
        self._match_cache: dict[int, _MatchCacheEntry] = {}
        self._guest_cache: _GuestListCacheEntry | None = None

    def clear_caches(self) -> None:
        self._match_cache.clear()
        self._guest_cache = None

    def _ensure_enabled(self) -> None:
        if not self.settings.chesscom_match_proxy_enabled:
            raise MatchProxyDisabledError("Chess.com match proxy is disabled")

    async def normalized_match(self, numeric_id: int, *, end_time: int | None = None) -> dict[str, Any]:
        self._ensure_enabled()
        if isinstance(numeric_id, bool) or numeric_id <= 0:
            raise MatchExcludedError("invalid_game_id")
        if end_time is not None and (isinstance(end_time, bool) or end_time <= 0):
            raise MatchExcludedError("invalid_end_time")
        cached = self._fresh_match_cache(numeric_id)
        if cached is not None:
            if end_time is not None:
                cached.normalized["end_time"] = end_time
            return deepcopy(cached.normalized)

        raw_board_a = await self._callback(str(numeric_id))
        board_a = _validated_board(raw_board_a)
        if board_a["id"] != numeric_id:
            raise MatchExcludedError("callback_id_mismatch")
        partner_uuid = board_a["partner_uuid"]
        raw_board_b = await self._callback(partner_uuid)
        board_b = _validated_board(raw_board_b)
        if board_b["uuid"] != partner_uuid or board_b["partner_uuid"] != board_a["uuid"]:
            raise MatchExcludedError("partner_link_mismatch")
        if board_b["id"] == board_a["id"]:
            raise MatchExcludedError("duplicate_board_id")

        normalized = _normalize_boards(board_a, board_b, end_time=end_time)
        entry = _MatchCacheEntry(
            stored_at=time.monotonic(),
            normalized=deepcopy(normalized),
            raw_board_a=deepcopy(raw_board_a),
            raw_board_b=deepcopy(raw_board_b),
        )
        # Either board ID should reuse the same retained raw pair instead of refetching it.
        self._match_cache[board_a["id"]] = entry
        self._match_cache[board_b["id"]] = entry
        return deepcopy(normalized)

    async def replay_source(self, numeric_id: int) -> dict[str, Any]:
        """Return the minimal validated callback fields needed by the client decoder."""
        normalized = await self.normalized_match(numeric_id)
        cached = self._fresh_match_cache(numeric_id)
        if cached is None:  # Defensive: normalized_match always stores a fresh pair.
            raise MatchUpstreamError("Chess.com match replay cache was unavailable")
        return {
            "match": normalized,
            "boards": {
                "A": _replay_board_payload(cached.raw_board_a),
                "B": _replay_board_payload(cached.raw_board_b),
            },
        }

    async def guest_matchups(
        self,
        *,
        refresh: bool = False,
        exclude_game_ids: Iterable[int] = (),
    ) -> dict[str, Any]:
        self._ensure_enabled()
        excluded_ids = {
            value for value in exclude_game_ids
            if isinstance(value, int) and not isinstance(value, bool) and value > 0
        }
        cached = self._guest_cache
        if not refresh and cached and time.monotonic() - cached.stored_at < self.settings.chesscom_match_cache_ttl_seconds:
            payload = deepcopy(cached.payload)
            payload["cached"] = True
            return payload

        async with self._guest_build_lock:
            self._ensure_enabled()
            cached = self._guest_cache
            if not refresh and cached and time.monotonic() - cached.stored_at < self.settings.chesscom_match_cache_ttl_seconds:
                payload = deepcopy(cached.payload)
                payload["cached"] = True
                return payload
            payload = await self._build_guest_matchups(excluded_ids)
            self._guest_cache = _GuestListCacheEntry(time.monotonic(), deepcopy(payload))
            return payload

    def _fresh_match_cache(self, numeric_id: int) -> _MatchCacheEntry | None:
        cached = self._match_cache.get(numeric_id)
        if not cached:
            return None
        if time.monotonic() - cached.stored_at >= self.settings.chesscom_match_cache_ttl_seconds:
            self._match_cache.pop(numeric_id, None)
            return None
        return cached

    async def _build_guest_matchups(self, currently_shown_ids: set[int] | None = None) -> dict[str, Any]:
        currently_shown_ids = currently_shown_ids or set()
        now = int(time.time())
        usernames = self._configured_seed_usernames()
        configured_count = len(usernames)
        seed_source = "players_of_interest" if usernames else "leaderboard_top_50"

        candidates: list[_GuestCandidate] = []
        qualified: list[_QualifiedGuestMatch] = []
        examined = 0
        excluded: dict[str, int] = {}
        seen_public_ids: set[int] = set()
        seen_pairs: set[frozenset[int]] = set()
        processed_public_ids: set[int] = set()
        players_sampled: list[str] = []

        async def collect_candidates(username: str) -> None:
            players_sampled.append(username)
            try:
                archive_index = await self._get_json(
                    f"https://api.chess.com/pub/player/{username.lower()}/games/archives"
                )
            except MatchUpstreamError:
                return
            archive_urls = archive_index.get("archives")
            if not isinstance(archive_urls, list):
                _count(excluded, "archive_shape")
                return
            recent_urls = _recent_archive_urls(
                archive_urls,
                username,
                self.settings.chesscom_guest_max_archives_per_player,
            )
            for archive_url in recent_urls:
                if not _official_archive_url(archive_url, username):
                    _count(excluded, "archive_url")
                    continue
                try:
                    archive = await self._get_json(archive_url)
                except MatchUpstreamError:
                    continue
                games = archive.get("games")
                if not isinstance(games, list):
                    _count(excluded, "archive_shape")
                    continue
                for game in reversed(games):
                    if not isinstance(game, dict) or game.get("rules") != "bughouse":
                        continue
                    numeric_id = _public_live_game_id(game.get("url"))
                    if numeric_id is None or numeric_id in seen_public_ids:
                        continue
                    seen_public_ids.add(numeric_id)
                    end_time = _strict_int(game.get("end_time"))
                    if end_time is None or end_time <= 0:
                        _count(excluded, "missing_end_time")
                        continue
                    age_seconds = now - end_time
                    if age_seconds < -300:
                        _count(excluded, "future_end_time")
                        continue
                    if age_seconds > _GUEST_FRESHNESS_WINDOWS_HOURS[-1] * 3600:
                        _count(excluded, "outside_48h")
                        continue
                    candidates.append(_GuestCandidate(numeric_id, end_time, username))

        async def process_window(window_hours: int, *, include_known_current: bool = False) -> None:
            nonlocal examined
            for candidate in candidates:
                if examined >= self.settings.chesscom_guest_max_matches_examined:
                    break
                if candidate.numeric_id in processed_public_ids:
                    continue
                if now - candidate.end_time > window_hours * 3600:
                    continue
                if candidate.numeric_id in currently_shown_ids and not include_known_current:
                    continue
                processed_public_ids.add(candidate.numeric_id)
                examined += 1
                try:
                    match = await self.normalized_match(candidate.numeric_id, end_time=candidate.end_time)
                except MatchExcludedError as exc:
                    _count(excluded, exc.reason)
                    continue
                except MatchUpstreamError:
                    _count(excluded, "callback_unavailable")
                    continue
                pair = frozenset(match["game_ids"].values())
                if pair in seen_pairs:
                    _count(excluded, "duplicate_match")
                    continue
                seen_pairs.add(pair)
                if min(match["ply_counts"].values()) < 20:
                    _count(excluded, "under_20_plies")
                    continue
                qualified.append(_QualifiedGuestMatch(
                    match=match,
                    seed_username=candidate.seed_username,
                    was_currently_shown=bool(pair & currently_shown_ids),
                ))

        def select_matches(*, include_current: bool = False) -> list[_QualifiedGuestMatch] | None:
            eligible = [item for item in qualified if not item.was_currently_shown]
            if include_current:
                eligible.extend(item for item in qualified if item.was_currently_shown)
            selected: list[_QualifiedGuestMatch] = []
            per_player: dict[str, int] = {}
            for item in eligible:
                player_key = item.seed_username.lower()
                if per_player.get(player_key, 0) >= _MAX_MATCHES_PER_SEED_PLAYER:
                    continue
                per_player[player_key] = per_player.get(player_key, 0) + 1
                selected.append(item)
                if len(selected) == _GUEST_MATCH_TARGET:
                    break
            represented = {item.seed_username.lower() for item in selected}
            return selected if len(selected) == _GUEST_MATCH_TARGET and len(represented) >= _MIN_REPRESENTED_SEED_PLAYERS else None

        selected: list[_QualifiedGuestMatch] | None = None
        selection_window_hours = _GUEST_FRESHNESS_WINDOWS_HOURS[0]

        for username in usernames:
            await collect_candidates(username)
            await process_window(selection_window_hours)
            selected = select_matches()
            if selected:
                break

        if selected is None:
            leaderboard_usernames = await self._leaderboard_seed_usernames()
            known = {username.lower() for username in usernames}
            fallback_usernames = [username for username in leaderboard_usernames if username.lower() not in known]
            usernames.extend(fallback_usernames)
            seed_source = "players_of_interest_then_leaderboard_top_50" if configured_count else "leaderboard_top_50"
            for username in fallback_usernames:
                await collect_candidates(username)
                await process_window(selection_window_hours)
                selected = select_matches()
                if selected:
                    break

        logger.info(
            "Guest matchup freshness window: hours=%d qualifying=%d selected=%d",
            selection_window_hours,
            len(qualified),
            len(selected or []),
        )
        if selected is None:
            for selection_window_hours in _GUEST_FRESHNESS_WINDOWS_HOURS[1:]:
                await process_window(selection_window_hours)
                selected = select_matches()
                logger.info(
                    "Guest matchup freshness window: hours=%d qualifying=%d selected=%d",
                    selection_window_hours,
                    len(qualified),
                    len(selected or []),
                )
                if selected:
                    break

        if selected is None and currently_shown_ids:
            selection_window_hours = _GUEST_FRESHNESS_WINDOWS_HOURS[-1]
            await process_window(selection_window_hours, include_known_current=True)
            selected = select_matches(include_current=True)

        excluded_total = sum(excluded.values())
        logger.info(
            "Guest matchup list assembled: examined=%d excluded=%d qualifying=%d window_hours=%d exclusions=%s",
            examined,
            excluded_total,
            len(qualified),
            selection_window_hours,
            excluded,
        )
        if selected is None:
            raise MatchUpstreamError(
                "Guest matchup diversity target was unavailable "
                f"(qualifying={len(qualified)}, examined={examined}, window_hours={selection_window_hours})"
            )
        players_represented = list(dict.fromkeys(item.seed_username for item in selected))
        return {
            "matches": [item.match for item in selected],
            "examined": examined,
            "excluded": excluded_total,
            "exclusion_counts": excluded,
            "players_sampled": players_sampled,
            "players_represented": players_represented,
            "seed_source": seed_source,
            "selection_window_hours": selection_window_hours,
            "cached": False,
        }

    def _configured_seed_usernames(self) -> list[str]:
        configured = self.settings.chesscom_players_of_interest_list
        usernames = _unique_valid_usernames(configured)
        if len(usernames) != len(configured):
            raise MatchUpstreamError("Configured Chess.com players of interest are invalid or duplicated")
        return usernames

    async def _leaderboard_seed_usernames(self) -> list[str]:
        leaderboard = await self._get_json(LEADERBOARD_URL)
        entries = leaderboard.get("live_bughouse")
        if not isinstance(entries, list):
            raise MatchUpstreamError("Chess.com live bughouse leaderboard shape is unavailable")
        usernames = _unique_valid_usernames(
            entry.get("username")
            for entry in entries[:_LEADERBOARD_FALLBACK_SIZE]
            if isinstance(entry, dict)
        )
        if len(usernames) < _MIN_REPRESENTED_SEED_PLAYERS:
            raise MatchUpstreamError("Chess.com live bughouse leaderboard did not provide enough players")
        return usernames

    async def _callback(self, identifier: str) -> dict[str, Any]:
        if not (identifier.isdigit() or _UUID_RE.fullmatch(identifier)):
            raise MatchExcludedError("invalid_callback_identifier")
        return await self._get_json(CALLBACK_URL.format(identifier=identifier))

    async def _get_json(self, url: str) -> dict[str, Any]:
        self._ensure_enabled()
        timeout = httpx.Timeout(self.settings.chesscom_match_timeout_seconds, connect=min(8.0, self.settings.chesscom_match_timeout_seconds))
        headers = {"User-Agent": self.settings.chesscom_user_agent, "Accept": "application/json"}
        try:
            async with self._upstream_lock:
                async with httpx.AsyncClient(
                    headers=headers,
                    timeout=timeout,
                    follow_redirects=False,
                    transport=self._transport,
                ) as client:
                    response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MatchUpstreamError("Chess.com match data is temporarily unavailable") from exc
        if not isinstance(payload, dict):
            raise MatchUpstreamError("Chess.com returned an unexpected response shape")
        return payload


def _validated_board(raw: dict[str, Any]) -> dict[str, Any]:
    game = raw.get("game")
    players = raw.get("players")
    if not isinstance(game, dict) or not isinstance(players, dict):
        raise MatchExcludedError("callback_shape")
    game_id = _strict_int(game.get("id"))
    uuid = game.get("uuid")
    partner_uuid = game.get("partnerGameId")
    ply_count = _strict_int(game.get("plyCount"))
    reason = game.get("gameEndReason")
    winner_color = game.get("colorOfWinner")
    end_time = _callback_end_time(game)
    if game_id is None or game_id <= 0 or ply_count is None or ply_count < 0:
        raise MatchExcludedError("callback_shape")
    if end_time is None:
        raise MatchExcludedError("callback_shape")
    if not isinstance(uuid, str) or not _UUID_RE.fullmatch(uuid):
        raise MatchExcludedError("callback_shape")
    if not isinstance(partner_uuid, str) or not _UUID_RE.fullmatch(partner_uuid):
        raise MatchExcludedError("callback_shape")
    if not isinstance(reason, str):
        raise MatchExcludedError("callback_shape")
    if winner_color not in {"white", "black"}:
        if reason in _DRAW_CODES:
            raise MatchExcludedError("draw")
        raise MatchExcludedError("callback_shape")
    if not isinstance(game.get("moveList"), str) or not isinstance(game.get("moveTimestamps"), str):
        raise MatchExcludedError("callback_shape")

    by_color: dict[str, dict[str, Any]] = {}
    for raw_player in players.values():
        if not isinstance(raw_player, dict):
            raise MatchExcludedError("callback_shape")
        color = raw_player.get("color")
        username = raw_player.get("username")
        rating = _strict_int(raw_player.get("rating"))
        if color not in {"white", "black"} or not isinstance(username, str) or not username.strip() or rating is None:
            raise MatchExcludedError("callback_shape")
        if color in by_color:
            raise MatchExcludedError("callback_shape")
        by_color[color] = {"name": username, "rating": rating}
    if set(by_color) != {"white", "black"}:
        raise MatchExcludedError("callback_shape")
    return {
        "id": game_id,
        "uuid": uuid,
        "partner_uuid": partner_uuid,
        "ply_count": ply_count,
        "reason": reason,
        "winner_color": winner_color,
        "end_time": end_time,
        "players": by_color,
    }


def _replay_board_payload(raw: dict[str, Any]) -> dict[str, Any]:
    validated = _validated_board(raw)
    game = raw["game"]
    headers = game.get("pgnHeaders")
    base_time = _strict_number(game.get("baseTime1"))
    increment = _strict_number(game.get("timeIncrement1"))
    initial_fen = headers.get("FEN") if isinstance(headers, dict) else None
    move_list = game["moveList"]
    move_timestamps = game["moveTimestamps"]
    if (
        base_time is None
        or base_time < 0
        or increment is None
        or increment < 0
        or not isinstance(initial_fen, str)
        or not initial_fen.strip()
        or len(move_list) != validated["ply_count"] * 2
    ):
        raise MatchExcludedError("callback_replay_shape")
    timestamps = move_timestamps.split(",") if move_timestamps else []
    if len(timestamps) not in {validated["ply_count"], validated["ply_count"] + 1} or any(
        not value.isdigit() for value in timestamps
    ):
        raise MatchExcludedError("callback_replay_shape")
    safe_headers = {
        key: headers.get(key)
        for key in ("White", "Black", "WhiteElo", "BlackElo", "Date", "EndTime", "Result", "TimeControl")
        if isinstance(headers.get(key), (str, int))
    }
    return {
        "id": validated["id"],
        "uuid": validated["uuid"],
        "partnerGameId": validated["partner_uuid"],
        "moveList": move_list,
        "moveTimestamps": move_timestamps,
        "plyCount": validated["ply_count"],
        "baseTime1": base_time,
        "timeIncrement1": increment,
        "initialFen": initial_fen,
        "headers": safe_headers,
    }


def _normalize_boards(
    board_a: dict[str, Any],
    board_b: dict[str, Any],
    *,
    end_time: int | None = None,
) -> dict[str, Any]:
    reason_a = board_a["reason"]
    reason_b = board_b["reason"]
    if reason_a in _DRAW_CODES or reason_b in _DRAW_CODES:
        raise MatchExcludedError("draw")
    if reason_a in _ACTION_BY_LOSER_CODE and reason_b == "bughousepartnerlose":
        decisive_board, decisive = "A", board_a
    elif reason_b in _ACTION_BY_LOSER_CODE and reason_a == "bughousepartnerlose":
        decisive_board, decisive = "B", board_b
    else:
        raise MatchExcludedError("unknown_terminal_code")

    expected_partner_winner = "black" if decisive["winner_color"] == "white" else "white"
    other = board_b if decisive_board == "A" else board_a
    if other["winner_color"] != expected_partner_winner:
        raise MatchExcludedError("team_result_mismatch")

    seats = {
        "A-white": deepcopy(board_a["players"]["white"]),
        "A-black": deepcopy(board_a["players"]["black"]),
        "B-white": deepcopy(board_b["players"]["white"]),
        "B-black": deepcopy(board_b["players"]["black"]),
    }
    loser_color = "black" if decisive["winner_color"] == "white" else "white"
    loser_seat = f"{decisive_board}-{loser_color}"
    winning_seats = _winning_team_seats(decisive_board, decisive["winner_color"])
    max_rating = max(seat["rating"] for seat in seats.values())
    tied = [seat_key for seat_key in _SEAT_ORDER if seats[seat_key]["rating"] == max_rating]
    highest_seat = min(tied, key=lambda key: (key not in winning_seats, _SEAT_ORDER.index(key)))
    highest = seats[highest_seat]
    relative_loser = _relative_seat(highest_seat, loser_seat)
    return {
        "game_ids": {"A": board_a["id"], "B": board_b["id"]},
        "end_time": end_time if end_time is not None else max(board_a["end_time"], board_b["end_time"]),
        "seats": seats,
        "ply_counts": {"A": board_a["ply_count"], "B": board_b["ply_count"]},
        "decisive_board": decisive_board,
        "loser_seat": loser_seat,
        "action": _ACTION_BY_LOSER_CODE[decisive["reason"]],
        "highest_rated": {
            "name": highest["name"],
            "rating": highest["rating"],
            "seat": highest_seat,
            "outcome": "WON" if highest_seat in winning_seats else "LOST",
        },
        "loser_relative_to_highest": relative_loser,
    }


def _winning_team_seats(board: str, winner_color: str) -> set[str]:
    winner = f"{board}-{winner_color}"
    partner_board = "B" if board == "A" else "A"
    partner_color = "black" if winner_color == "white" else "white"
    return {winner, f"{partner_board}-{partner_color}"}


def _relative_seat(origin: str, target: str) -> str | None:
    if origin == target:
        return None
    origin_board, origin_color = origin.split("-")
    target_board, target_color = target.split("-")
    if origin_board == target_board:
        return "oppo"
    if origin_color != target_color:
        return "partner"
    return "diag oppo"


def _strict_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _strict_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return value


def _callback_end_time(game: dict[str, Any]) -> int | None:
    numeric = _strict_int(game.get("endTime"))
    if numeric is not None and numeric > 0:
        return numeric
    headers = game.get("pgnHeaders")
    if not isinstance(headers, dict):
        return None
    date = headers.get("Date")
    end_time = headers.get("EndTime")
    if not isinstance(date, str) or not isinstance(end_time, str):
        return None
    match = re.fullmatch(r"(\d{1,2}:\d{2}:\d{2})(?: GMT([+-]\d{4}))?", end_time.strip())
    if not re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", date.strip()) or not match:
        return None
    offset = match.group(2) or "+0000"
    try:
        parsed = datetime.strptime(
            f"{date.strip()} {match.group(1)} {offset}",
            "%Y.%m.%d %H:%M:%S %z",
        )
    except ValueError:
        return None
    timestamp = int(parsed.timestamp())
    return timestamp if timestamp > 0 else None


def _unique_valid_usernames(values: Iterable[Any]) -> list[str]:
    usernames: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str):
            continue
        username = value.strip()
        normalized = username.lower()
        if not _USERNAME_RE.fullmatch(username) or normalized in seen:
            continue
        seen.add(normalized)
        usernames.append(username)
    return usernames


def _public_live_game_id(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.netloc != "www.chess.com" or parsed.query or parsed.fragment:
        return None
    match = _LIVE_GAME_RE.fullmatch(parsed.path)
    return int(match.group(1)) if match else None


def _official_archive_url(value: Any, username: str) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlsplit(value)
    expected_prefix = f"/pub/player/{username.lower()}/games/"
    return (
        parsed.scheme == "https"
        and parsed.netloc == "api.chess.com"
        and parsed.path.lower().startswith(expected_prefix)
        and not parsed.query
        and not parsed.fragment
    )


def _recent_archive_urls(values: list[Any], username: str, limit: int) -> list[str]:
    dated: list[tuple[int, str]] = []
    for value in values:
        if not _official_archive_url(value, username):
            continue
        parsed = urlsplit(value)
        match = re.search(r"/games/(\d{4})/(\d{2})$", parsed.path, re.I)
        if not match:
            continue
        year, month = int(match.group(1)), int(match.group(2))
        if not 1 <= month <= 12:
            continue
        dated.append((year * 12 + month, value))
    if not dated:
        return []
    dated.sort(reverse=True)
    newest = dated[0][0]
    return [value for ordinal, value in dated if newest - ordinal <= 1][:limit]


def _count(counts: dict[str, int], reason: str) -> None:
    counts[reason] = counts.get(reason, 0) + 1
