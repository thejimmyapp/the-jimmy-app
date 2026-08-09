from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from backend.chesscom_matchups import (
    ChessComMatchupService,
    MatchExcludedError,
    MatchProxyDisabledError,
)
from backend.config import Settings


def callback_board(
    game_id: int,
    uuid: str,
    partner_uuid: str,
    *,
    white: tuple[str, int],
    black: tuple[str, int],
    winner: str,
    reason: str,
    plies: int = 40,
    result_message: str = "ignored free-form text",
) -> dict[str, Any]:
    return {
        "game": {
            "id": game_id,
            "uuid": uuid,
            "partnerGameId": partner_uuid,
            "plyCount": plies,
            "gameEndReason": reason,
            "colorOfWinner": winner,
            "moveList": "aa" * plies,
            "moveTimestamps": ",".join("100" for _ in range(plies + 1)),
            "resultMessage": result_message,
        },
        "players": {
            "top": {"color": "black", "username": black[0], "rating": black[1]},
            "bottom": {"color": "white", "username": white[0], "rating": white[1]},
        },
    }


def test_match_proxy_fetches_partner_sequentially_normalizes_and_caches_raw_pair() -> None:
    primary_uuid = "ed14d828-9293-11f1-b6b5-6cfe54652c60"
    partner_uuid = "ed14d829-9293-11f1-b6b5-6cfe54652c60"
    requests: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path.endswith("/180443871315"):
            payload = callback_board(
                180443871315,
                primary_uuid,
                partner_uuid,
                white=("vjbaker", 2799),
                black=("larso", 2677),
                winner="black",
                reason="bughousepartnerlose",
                plies=71,
            )
        else:
            payload = callback_board(
                180443871317,
                partner_uuid,
                primary_uuid,
                white=("littleplotkin", 2608),
                black=("chickencrossroad", 2408),
                winner="white",
                reason="checkmated",
                plies=81,
            )
        return httpx.Response(200, json=payload, request=request)

    service = ChessComMatchupService(Settings(), transport=httpx.MockTransport(handler))
    match = asyncio.run(service.normalized_match(180443871315))
    partner_lookup = asyncio.run(service.normalized_match(180443871317))

    assert requests == [
        "/callback/live/game/180443871315",
        f"/callback/live/game/{partner_uuid}",
    ]
    assert partner_lookup == match
    assert match == {
        "game_ids": {"A": 180443871315, "B": 180443871317},
        "seats": {
            "A-white": {"name": "vjbaker", "rating": 2799},
            "A-black": {"name": "larso", "rating": 2677},
            "B-white": {"name": "littleplotkin", "rating": 2608},
            "B-black": {"name": "chickencrossroad", "rating": 2408},
        },
        "ply_counts": {"A": 71, "B": 81},
        "decisive_board": "B",
        "loser_seat": "B-black",
        "action": "checkmated",
        "highest_rated": {"name": "vjbaker", "rating": 2799, "seat": "A-white", "outcome": "LOST"},
        "loser_relative_to_highest": "partner",
    }
    assert "resultMessage" not in match
    assert service._match_cache[180443871315].raw_board_a["game"]["resultMessage"] == "ignored free-form text"


def test_match_proxy_fails_closed_for_unknown_terminal_code_even_if_message_looks_valid() -> None:
    first_uuid = "00000001-0000-4000-8000-000000000001"
    second_uuid = "00000002-0000-4000-8000-000000000002"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/42"):
            payload = callback_board(42, first_uuid, second_uuid, white=("A", 2000), black=("B", 1900), winner="white", reason="mystery", result_message="A won by checkmate")
        else:
            payload = callback_board(43, second_uuid, first_uuid, white=("C", 1800), black=("D", 1700), winner="black", reason="bughousepartnerlose")
        return httpx.Response(200, json=payload, request=request)

    service = ChessComMatchupService(Settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(MatchExcludedError, match="unknown_terminal_code"):
        asyncio.run(service.normalized_match(42))


def test_guest_list_filters_short_match_logs_counts_and_reuses_assembled_cache() -> None:
    requests: list[str] = []
    callback_payloads: dict[str, dict[str, Any]] = {}
    games_by_player = {
        "alpha": [101, 102],
        "beta": [103, 104],
        "gamma": [105, 106],
    }
    for offset, game_id in enumerate(range(101, 107)):
        primary_uuid = f"{game_id:08x}-0000-4000-8000-{game_id:012x}"
        partner_id = game_id + 1000
        partner_uuid = f"{partner_id:08x}-0000-4000-8000-{partner_id:012x}"
        plies = 12 if game_id == 106 else 30 + offset
        callback_payloads[str(game_id)] = callback_board(
            game_id,
            primary_uuid,
            partner_uuid,
            white=(f"High{game_id}", 2500),
            black=(f"Low{game_id}", 2100),
            winner="white",
            reason="checkmated",
            plies=plies,
        )
        callback_payloads[partner_uuid] = callback_board(
            partner_id,
            partner_uuid,
            primary_uuid,
            white=(f"PartnerOpponent{game_id}", 2000),
            black=(f"Partner{game_id}", 2200),
            winner="black",
            reason="bughousepartnerlose",
            plies=plies,
        )

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        path = request.url.path
        if path == "/pub/leaderboards":
            payload = {"live_bughouse": [{"username": "Alpha"}, {"username": "Beta"}, {"username": "Gamma"}]}
        elif path.endswith("/games/archives"):
            username = path.split("/")[3]
            if username == "missing":
                return httpx.Response(404, json={"code": 0, "message": "User not found"}, request=request)
            payload = {"archives": [] if username == "nogames" else [f"https://api.chess.com/pub/player/{username}/games/2026/08"]}
        elif path.endswith("/games/2026/08"):
            username = path.split("/")[3]
            payload = {"games": [
                {"rules": "bughouse", "url": f"https://www.chess.com/game/live/{game_id}"}
                for game_id in games_by_player[username]
            ]}
        else:
            payload = callback_payloads[path.rsplit("/", 1)[-1]]
        return httpx.Response(200, json=payload, request=request)

    settings = Settings(
        chesscom_players_of_interest="Missing, NoGames, Alpha, Beta",
        chesscom_guest_max_archives_per_player=1,
        chesscom_guest_max_matches_examined=10,
    )
    service = ChessComMatchupService(settings, transport=httpx.MockTransport(handler))
    first = asyncio.run(service.guest_matchups())
    request_count = len(requests)
    second = asyncio.run(service.guest_matchups())

    assert len(first["matches"]) == 5
    assert first["examined"] == 6
    assert first["excluded"] == 1
    assert first["exclusion_counts"] == {"under_20_plies": 1}
    assert first["players_sampled"] == ["Missing", "NoGames", "Alpha", "Beta", "Gamma"]
    assert first["players_represented"] == ["Alpha", "Beta", "Gamma"]
    assert first["seed_source"] == "players_of_interest_then_leaderboard_top_50"
    assert sum(1 for match in first["matches"] if match["game_ids"]["A"] in games_by_player["alpha"]) == 2
    assert sum(1 for match in first["matches"] if match["game_ids"]["A"] in games_by_player["beta"]) == 2
    assert sum(1 for match in first["matches"] if match["game_ids"]["A"] in games_by_player["gamma"]) == 1
    assert first["cached"] is False
    assert second["cached"] is True
    assert len(requests) == request_count


def test_configured_players_of_interest_preserve_priority_order() -> None:
    service = ChessComMatchupService(
        Settings(chesscom_players_of_interest="Gamma, Alpha, Beta"),
    )

    assert service._configured_seed_usernames() == ["Gamma", "Alpha", "Beta"]


def test_kill_switch_disables_match_and_guest_routes_before_network_access() -> None:
    service = ChessComMatchupService(Settings(chesscom_match_proxy_enabled=False))
    with pytest.raises(MatchProxyDisabledError):
        asyncio.run(service.normalized_match(42))
    with pytest.raises(MatchProxyDisabledError):
        asyncio.run(service.guest_matchups())
