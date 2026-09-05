from __future__ import annotations

import asyncio
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
import json
import logging
import os
from pathlib import Path
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
_GUEST_ASSEMBLY_BUDGET_SECONDS = 20.0


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
    pool: list[_QualifiedGuestMatch] = field(default_factory=list)


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
        self._candidate_cache: dict[str, tuple[float, list[_GuestCandidate]]] = {}
        self._player_last_active: dict[str, int] = {}
        self._client: httpx.AsyncClient | None = None
        self._client_loop: asyncio.AbstractEventLoop | None = None
        self._refresh_task: asyncio.Task[None] | None = None
        self._refresh_loop_task: asyncio.Task[None] | None = None
        self._upstream_requests = 0
        self.cache_path: Path | None = None

    def clear_caches(self) -> None:
        self._match_cache.clear()
        self._candidate_cache.clear()
        self._guest_cache = None

    # ---- shared upstream client -------------------------------------------------

    def _client_for_loop(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        if self._client is None or self._client_loop is not loop:
            timeout = httpx.Timeout(
                self.settings.chesscom_match_timeout_seconds,
                connect=min(8.0, self.settings.chesscom_match_timeout_seconds),
            )
            headers = {"User-Agent": self.settings.chesscom_user_agent, "Accept": "application/json"}
            self._client = httpx.AsyncClient(
                headers=headers,
                timeout=timeout,
                follow_redirects=False,
                transport=self._transport,
            )
            self._client_loop = loop
        return self._client

    async def aclose(self) -> None:
        for task in (self._refresh_loop_task, self._refresh_task):
            if task and not task.done():
                task.cancel()
        self._refresh_loop_task = None
        self._refresh_task = None
        client, self._client, self._client_loop = self._client, None, None
        if client is not None:
            try:
                await client.aclose()
            except Exception:  # pragma: no cover - best effort on shutdown
                logger.debug("Chess.com client close failed", exc_info=True)

    # ---- background warm-up and refresh -----------------------------------------

    def start_background_refresh(self) -> None:
        """Load any persisted list, then keep the cache warm ahead of visitors."""
        if self._refresh_loop_task and not self._refresh_loop_task.done():
            return
        self._load_persisted()
        self._refresh_loop_task = asyncio.get_running_loop().create_task(self._refresh_loop())

    async def _refresh_loop(self) -> None:
        ttl = self.settings.chesscom_match_cache_ttl_seconds
        margin = self.settings.chesscom_guest_refresh_margin_seconds
        while True:
            entry = self._guest_cache
            age = time.monotonic() - entry.stored_at if entry else None
            if age is not None and age < ttl - margin:
                await asyncio.sleep(ttl - margin - age)
                continue
            await self._background_rebuild()
            await asyncio.sleep(max(60.0, float(ttl - margin)))

    def _schedule_refresh(self) -> None:
        if self._refresh_task and not self._refresh_task.done():
            return
        self._refresh_task = asyncio.get_running_loop().create_task(self._background_rebuild())

    async def _background_rebuild(self) -> None:
        try:
            async with self._guest_build_lock:
                payload, pool = await self._build_guest_matchups(set(), background=True)
                self._store_entry(payload, pool)
        except MatchProxyDisabledError:
            return
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Background guest matchup rebuild failed; keeping the last good list", exc_info=True)

    def _store_entry(self, payload: dict[str, Any], pool: list[_QualifiedGuestMatch]) -> None:
        self._guest_cache = _GuestListCacheEntry(time.monotonic(), deepcopy(payload), list(pool))
        self._persist()

    # ---- on-disk persistence so a restart serves the last good list ------------

    def _persist(self) -> None:
        entry = self._guest_cache
        path = self.cache_path
        if entry is None or path is None:
            return
        record = {
            "version": 1,
            "saved_at": time.time(),
            "payload": entry.payload,
            "pool": [{"match": item.match, "seed_username": item.seed_username} for item in entry.pool],
            "player_last_active": self._player_last_active,
        }
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(json.dumps(record), encoding="utf-8")
            os.replace(tmp, path)
        except OSError:
            logger.warning("Could not persist guest matchup cache to %s", path, exc_info=True)

    def _load_persisted(self) -> bool:
        path = self.cache_path
        if path is None or not path.is_file():
            return False
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            age = time.time() - float(record["saved_at"])
            if age < 0 or age > self.settings.chesscom_guest_stale_max_seconds:
                return False
            payload = record["payload"]
            pool = [
                _QualifiedGuestMatch(match=item["match"], seed_username=str(item["seed_username"]), was_currently_shown=False)
                for item in record.get("pool", [])
                if isinstance(item, dict) and isinstance(item.get("match"), dict)
            ]
            if not isinstance(payload, dict) or not isinstance(payload.get("matches"), list):
                return False
        except (OSError, ValueError, KeyError, TypeError):
            logger.warning("Ignoring unreadable guest matchup cache at %s", path, exc_info=True)
            return False
        activity = record.get("player_last_active")
        if isinstance(activity, dict):
            self._player_last_active.update(
                {str(name).lower(): int(value) for name, value in activity.items() if isinstance(value, (int, float))}
            )
        self._guest_cache = _GuestListCacheEntry(time.monotonic() - age, payload, pool)
        return True

    def _order_by_recent_activity(self, usernames: list[str]) -> list[str]:
        """Recently active seeds first; unknown players keep their configured order."""
        if not self._player_last_active:
            return list(usernames)
        return sorted(usernames, key=lambda name: -self._player_last_active.get(name.lower(), 0))

    # ---- regenerate without touching Chess.com ----------------------------------

    def _rotate_from_pool(self, excluded_ids: set[int]) -> dict[str, Any] | None:
        entry = self._guest_cache
        if entry is None or not entry.pool:
            return None
        selected: list[_QualifiedGuestMatch] = []
        per_player: dict[str, int] = {}
        for item in entry.pool:
            if excluded_ids & set(item.match["game_ids"].values()):
                continue
            player_key = item.seed_username.lower()
            if per_player.get(player_key, 0) >= _MAX_MATCHES_PER_SEED_PLAYER:
                continue
            per_player[player_key] = per_player.get(player_key, 0) + 1
            selected.append(item)
            if len(selected) == _GUEST_MATCH_TARGET:
                break
        if len(selected) < _GUEST_MATCH_TARGET or len(per_player) < _MIN_REPRESENTED_SEED_PLAYERS:
            return None
        payload = deepcopy(entry.payload)
        payload["matches"] = [deepcopy(item.match) for item in selected]
        payload["players_represented"] = list(dict.fromkeys(item.seed_username for item in selected))
        payload["partial"] = False
        payload["cached"] = True
        payload["regenerated_from_pool"] = True
        payload["upstream_requests"] = 0
        return payload

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
        ttl = self.settings.chesscom_match_cache_ttl_seconds
        if refresh:
            rotated = self._rotate_from_pool(excluded_ids)
            if rotated is not None:
                return rotated
        else:
            cached = self._guest_cache
            if cached:
                age = time.monotonic() - cached.stored_at
                if age < ttl:
                    payload = deepcopy(cached.payload)
                    payload["cached"] = True
                    return payload
                if age < self.settings.chesscom_guest_stale_max_seconds:
                    # Serve the last good list right away; rebuild behind the visitor.
                    self._schedule_refresh()
                    payload = deepcopy(cached.payload)
                    payload["cached"] = True
                    payload["stale"] = True
                    return payload

        async with self._guest_build_lock:
            self._ensure_enabled()
            cached = self._guest_cache
            if not refresh and cached and time.monotonic() - cached.stored_at < ttl:
                payload = deepcopy(cached.payload)
                payload["cached"] = True
                return payload
            payload, pool = await self._build_guest_matchups(excluded_ids)
            self._store_entry(payload, pool)
            return payload

    def _fresh_match_cache(self, numeric_id: int) -> _MatchCacheEntry | None:
        cached = self._match_cache.get(numeric_id)
        if not cached:
            return None
        if time.monotonic() - cached.stored_at >= self.settings.chesscom_match_cache_ttl_seconds:
            self._match_cache.pop(numeric_id, None)
            return None
        return cached

    async def _build_guest_matchups(
        self,
        currently_shown_ids: set[int] | None = None,
        *,
        background: bool = False,
    ) -> tuple[dict[str, Any], list[_QualifiedGuestMatch]]:
        currently_shown_ids = currently_shown_ids or set()
        now = int(time.time())
        started = time.monotonic()
        requests_before = self._upstream_requests
        usernames = self._order_by_recent_activity(self._configured_seed_usernames())
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
            remembered = self._candidate_cache.get(username.lower())
            if remembered and time.monotonic() - remembered[0] < self.settings.chesscom_match_cache_ttl_seconds:
                for candidate in remembered[1]:
                    if candidate.numeric_id not in seen_public_ids:
                        seen_public_ids.add(candidate.numeric_id)
                        candidates.append(candidate)
                return
            player_candidates: list[_GuestCandidate] = []
            # Monthly archive URLs are deterministic, so skip the archive-index round-trip and
            # only fetch months that can still hold games inside the freshness window.
            recent_urls = _archive_urls_for_window(
                username,
                now,
                _GUEST_FRESHNESS_WINDOWS_HOURS[-1],
                self.settings.chesscom_guest_max_archives_per_player,
            )
            latest_end_time = 0
            for archive_url in recent_urls:
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
                    candidate = _GuestCandidate(numeric_id, end_time, username)
                    candidates.append(candidate)
                    player_candidates.append(candidate)
                    latest_end_time = max(latest_end_time, end_time)
            self._candidate_cache[username.lower()] = (time.monotonic(), player_candidates)
            if latest_end_time:
                self._player_last_active[username.lower()] = latest_end_time

        async def process_window(window_hours: int, *, include_known_current: bool = False) -> None:
            nonlocal examined
            for candidate in candidates:
                if examined >= self.settings.chesscom_guest_max_matches_examined:
                    break
                if sum(
                    item.seed_username.lower() == candidate.seed_username.lower()
                    for item in qualified
                ) >= _MAX_MATCHES_PER_SEED_PLAYER:
                    continue
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
        assembly_budget_exhausted = False

        async def ladder(names: list[str]) -> bool:
            # Collect each seed and stop as soon as the freshest window fills the list,
            # then widen the window over everything collected so far before asking for
            # more players. Widening is free; every extra player costs upstream requests.
            nonlocal selected, selection_window_hours
            selection_window_hours = _GUEST_FRESHNESS_WINDOWS_HOURS[0]
            for username in names:
                await collect_candidates(username)
                await process_window(selection_window_hours)
                selected = select_matches()
                if selected:
                    return True
            for selection_window_hours in _GUEST_FRESHNESS_WINDOWS_HOURS:
                await process_window(selection_window_hours)
                selected = select_matches()
                logger.info(
                    "Guest matchup freshness window: hours=%d qualifying=%d selected=%d",
                    selection_window_hours,
                    len(qualified),
                    len(selected or []),
                )
                if selected:
                    return True
            return False

        async def assemble() -> None:
            nonlocal seed_source, selected, selection_window_hours
            if await ladder(usernames):
                return

            leaderboard_usernames = await self._leaderboard_seed_usernames()
            known = {username.lower() for username in usernames}
            fallback_usernames = [username for username in leaderboard_usernames if username.lower() not in known]
            usernames.extend(fallback_usernames)
            seed_source = "players_of_interest_then_leaderboard_top_50" if configured_count else "leaderboard_top_50"
            if await ladder(fallback_usernames):
                return

            if currently_shown_ids:
                selection_window_hours = _GUEST_FRESHNESS_WINDOWS_HOURS[-1]
                await process_window(selection_window_hours, include_known_current=True)
                selected = select_matches(include_current=True)

        async def top_up() -> None:
            # Background builds keep sampling inside the chosen window so "Regenerate"
            # can rotate from this pool without new upstream requests.
            target = self.settings.chesscom_guest_pool_target
            limit = self.settings.chesscom_guest_max_matches_examined
            sampled = {name.lower() for name in players_sampled}
            for username in list(usernames):
                if len(qualified) >= target or examined >= limit:
                    return
                if username.lower() not in sampled:
                    sampled.add(username.lower())
                    await collect_candidates(username)
                await process_window(selection_window_hours)
            # The displayed selection keeps its window; the spare pool may reach further back.
            for hours in _GUEST_FRESHNESS_WINDOWS_HOURS:
                if hours <= selection_window_hours:
                    continue
                if len(qualified) >= target or examined >= limit:
                    return
                await process_window(hours)

        budget = self.settings.chesscom_guest_background_budget_seconds if background else _GUEST_ASSEMBLY_BUDGET_SECONDS
        try:
            async with asyncio.timeout(budget):
                await assemble()
        except TimeoutError:
            assembly_budget_exhausted = True
            logger.warning(
                "Guest matchup assembly reached the %.1fs budget with %d validated matches",
                budget,
                len(qualified),
            )
        if background and selected and not assembly_budget_exhausted:
            remaining = budget - (time.monotonic() - started)
            if remaining > 0:
                try:
                    async with asyncio.timeout(remaining):
                        await top_up()
                except TimeoutError:
                    logger.info("Guest matchup pool top-up stopped at the budget with %d validated matches", len(qualified))

        if selected is None and qualified:
            partial_selection: list[_QualifiedGuestMatch] = []
            per_player: dict[str, int] = {}
            for item in qualified:
                if item.was_currently_shown:
                    continue
                player_key = item.seed_username.lower()
                if per_player.get(player_key, 0) >= _MAX_MATCHES_PER_SEED_PLAYER:
                    continue
                per_player[player_key] = per_player.get(player_key, 0) + 1
                partial_selection.append(item)
                if len(partial_selection) == _GUEST_MATCH_TARGET:
                    break
            selected = partial_selection or None

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
        payload = {
            "matches": [item.match for item in selected],
            "examined": examined,
            "excluded": excluded_total,
            "exclusion_counts": excluded,
            "players_sampled": players_sampled,
            "players_represented": players_represented,
            "seed_source": seed_source,
            "selection_window_hours": selection_window_hours,
            "partial": len(selected) < _GUEST_MATCH_TARGET,
            "assembly_budget_exhausted": assembly_budget_exhausted,
            "cached": False,
            "regenerated_from_pool": False,
            "pool_size": len(qualified),
            "upstream_requests": self._upstream_requests - requests_before,
            "build_seconds": round(time.monotonic() - started, 3),
        }
        return payload, list(qualified)

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
        client = self._client_for_loop()
        try:
            async with self._upstream_lock:
                self._upstream_requests += 1
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


def _archive_urls_for_window(username: str, now: int, window_hours: int, limit: int) -> list[str]:
    """Newest month first: the month containing `now`, then earlier months whose end is still inside the window."""
    urls: list[str] = []
    year, month = datetime.fromtimestamp(now, UTC).year, datetime.fromtimestamp(now, UTC).month
    while len(urls) < limit:
        urls.append(f"https://api.chess.com/pub/player/{username.lower()}/games/{year:04d}/{month:02d}")
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
        if not _archive_may_hold_recent_games(urls[-1].rsplit("/", 2)[0] + f"/{year:04d}/{month:02d}", now, window_hours):
            break
    return urls


def _archive_may_hold_recent_games(archive_url: str, now: int, window_hours: int) -> bool:
    """A monthly archive can only hold games inside the window if the month ended recently."""
    match = re.search(r"/games/(\d{4})/(\d{2})$", urlsplit(archive_url).path, re.I)
    if not match:
        return True
    year, month = int(match.group(1)), int(match.group(2))
    if not 1 <= month <= 12:
        return True
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    month_end = int(datetime(next_year, next_month, 1, tzinfo=UTC).timestamp())
    return now - month_end <= window_hours * 3600


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
