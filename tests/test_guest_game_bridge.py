from __future__ import annotations

from copy import deepcopy
import asyncio
import time

import pytest
from fastapi.testclient import TestClient

import backend.main as main_module
from backend.services import GameService, GuestReplayIngestError


STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


def guest_replay() -> dict[str, object]:
    return {
        "match": {
            "game_ids": {"A": 180731271553, "B": 180731271555},
            "end_time": 1786417841,
            "seats": {
                "A-white": {"name": "sassystacks30", "rating": 1882},
                "A-black": {"name": "123al321", "rating": 1660},
                "B-white": {"name": "yookgo", "rating": 1583},
                "B-black": {"name": "Glortyy", "rating": 1535},
            },
            "ply_counts": {"A": 51, "B": 39},
            "decisive_board": "A",
            "loser_seat": "A-black",
            "action": "checkmated",
        },
        "boards": {
            "A": {
                "id": 180731271553,
                "uuid": "e9a02a3c-9531-11f1-b6b5-6cfe54652c60",
                "partnerGameId": "e9a02a3d-9531-11f1-b6b5-6cfe54652c60",
                "moveList": "lBZJgv!TcMTCmuCnen-Cnm3VMF2MFwCwpw92bs6EmlEvov5Q+t-AtAJAfA8!-L2BLV!2VL2TsJ7JAJ=sjsBslm+H+tHtdt-KhV&U-3",
                "moveTimestamps": "1800,1798,1799,1784,1798,1769,1797,1725,1791,1718,1786,1695,1766,1678,1761,1658,1750,1650,1726,1634,1685,1623,1684,1604,1668,1540,1658,1538,1652,1521,1636,1455,1596,1433,1577,1417,1543,1401,1542,1375,1510,1362,1505,1222,1482,1206,1481,1102,1259,1000,1258,1000",
                "plyCount": 51,
                "initialFen": STANDARD_FEN,
            },
            "B": {
                "id": 180731271555,
                "uuid": "e9a02a3d-9531-11f1-b6b5-6cfe54652c60",
                "partnerGameId": "e9a02a3c-9531-11f1-b6b5-6cfe54652c60",
                "moveList": "mC0SlBZJCK5QfH6ZHQ90gvZQbs-ChfCsjs+C-N09+M=TKT!TMT2T=292N28Z-KTKvKZ6K1Co17-vdv",
                "moveTimestamps": "1800,1799,1791,1797,1780,1787,1760,1784,1759,1780,1753,1769,1732,1762,1634,1635,1613,1610,1562,1575,1496,1552,1475,1548,1445,1537,1412,1427,1401,1418,1361,1388,1352,1375,1340,1167,1320,1155,1164,1094",
                "plyCount": 39,
                "initialFen": STANDARD_FEN,
            },
        },
    }


def test_ingest_guest_replay_stores_completed_game_with_two_board_snapshots(tmp_path) -> None:
    service = GameService(tmp_path / "legacy.sqlite")

    game_id = service.ingest_guest_replay(guest_replay(), guest_number=7)

    assert service.is_completed_game(game_id)
    stored = service.db.get_game(game_id)
    assert stored is not None
    assert stored["username"] == "guest_7"
    snapshot = service.snapshot(game_id, 10_000)
    assert snapshot is not None
    assert snapshot["board_a"]["variant_fen"]
    assert snapshot["board_b"]["variant_fen"]


def test_ingest_guest_replay_refuses_missing_required_field_without_writing(tmp_path) -> None:
    service = GameService(tmp_path / "legacy.sqlite")
    replay = guest_replay()
    del replay["boards"]["B"]["moveList"]

    with pytest.raises(GuestReplayIngestError, match="moveList"):
        service.ingest_guest_replay(replay, guest_number=8)

    assert service.list_games("guest_8") == []


@pytest.mark.parametrize("board_label", ["A", "B"])
def test_ingest_guest_replay_refuses_unparseable_nonstandard_setup_without_writing(
    tmp_path, board_label: str
) -> None:
    service = GameService(tmp_path / "legacy.sqlite")
    replay = guest_replay()
    replay["boards"][board_label]["initialFen"] = "not a valid FEN"

    with pytest.raises(GuestReplayIngestError, match="reconstructed safely"):
        service.ingest_guest_replay(replay, guest_number=9)

    assert service.list_games("guest_9") == []


def test_ingest_guest_replay_refuses_setup_the_coupled_timeline_cannot_preserve(tmp_path) -> None:
    service = GameService(tmp_path / "legacy.sqlite")
    replay = guest_replay()
    replay["boards"]["A"]["initialFen"] = (
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[P] w KQkq - 0 1"
    )

    with pytest.raises(GuestReplayIngestError, match="cannot be preserved"):
        service.ingest_guest_replay(replay, guest_number=10)

    assert service.list_games("guest_10") == []


def test_ingest_guest_replay_maps_partner_board_loss_to_board_a_team_results(tmp_path) -> None:
    service = GameService(tmp_path / "legacy.sqlite")
    replay = guest_replay()
    replay["match"].update(
        {"decisive_board": "B", "loser_seat": "B-black", "action": "flagged"}
    )

    game_id = service.ingest_guest_replay(replay, guest_number=10)

    game = service.db.get_game(game_id)
    assert game is not None
    assert game["white_result"] == "lose"
    assert game["black_result"] == "win"


def test_guest_numbers_are_monotonic_and_persisted(tmp_path) -> None:
    database_path = tmp_path / "legacy.sqlite"
    first_service = GameService(database_path)

    first_number, first_token = first_service.create_guest_identity()
    second_number, second_token = first_service.create_guest_identity()
    reloaded_service = GameService(database_path)
    third_number, third_token = reloaded_service.create_guest_identity()

    assert (first_number, second_number, third_number) == (1, 2, 3)
    assert len({first_token, second_token, third_token}) == 3
    assert reloaded_service.guest_number_for_token(first_token) == 1


def test_guest_identity_write_does_not_block_the_event_loop(monkeypatch) -> None:
    class FakeMatchups:
        async def guest_matchups(self, **_kwargs):
            return {"matches": []}

    class SlowIdentityService:
        def create_guest_identity(self):
            time.sleep(0.2)
            return 1, "identity-token"

    monkeypatch.setattr(main_module, "chesscom_matchups", FakeMatchups())
    monkeypatch.setattr(main_module, "games", SlowIdentityService())

    async def exercise() -> tuple[float, dict[str, object]]:
        from starlette.requests import Request
        from starlette.responses import Response

        request = Request({"type": "http", "method": "GET", "path": "/api/chesscom/guest-matchups", "headers": []})
        started = time.perf_counter()
        endpoint = asyncio.create_task(main_module.chesscom_guest_matchups(request, Response()))
        await asyncio.sleep(0.02)
        loop_delay = time.perf_counter() - started
        return loop_delay, await endpoint

    loop_delay, payload = asyncio.run(exercise())

    assert loop_delay < 0.1
    assert payload == {"matches": []}


def test_guest_session_reports_real_arrival_counts_and_rotates_identity(tmp_path, monkeypatch) -> None:
    service = GameService(tmp_path / "legacy.sqlite")
    monkeypatch.setattr(main_module, "games", service)

    with TestClient(main_module.app) as client:
        first = client.post("/api/guests")
        repeated = client.post("/api/guests")
        rotated = client.post("/api/guests/reset")

    assert first.json() == {
        "guest_number": 1,
        "total_guests": 1,
        "completions_to_date": 0,
        "saved_moment_count": 0,
        "analysis_unlocked": False,
        "completed": False,
        "completion_ordinal": None,
    }
    assert repeated.json() == first.json()
    assert rotated.json() == {
        "guest_number": 2,
        "total_guests": 2,
        "completions_to_date": 0,
        "saved_moment_count": 0,
        "analysis_unlocked": False,
        "completed": False,
        "completion_ordinal": None,
    }
    assert service.guest_identity_count() == 2


def test_guest_store_route_uses_landing_identity_and_returns_internal_id(tmp_path, monkeypatch) -> None:
    service = GameService(tmp_path / "legacy.sqlite")
    replay = guest_replay()

    class FakeMatchups:
        async def guest_matchups(self, **_kwargs):
            return {"matches": []}

        async def replay_source(self, game_id: int):
            assert game_id == 180731271553
            return deepcopy(replay)

    monkeypatch.setattr(main_module, "games", service)
    monkeypatch.setattr(main_module, "chesscom_matchups", FakeMatchups())

    with TestClient(main_module.app) as client:
        assert client.post("/api/chesscom/matches/180731271553/store").status_code == 409
        client.cookies.set(
            main_module.GUEST_IDENTITY_COOKIE,
            "forged",
            domain="testserver.local",
            path="/",
        )
        assert client.post("/api/chesscom/matches/180731271553/store").status_code == 409
        landing = client.get("/api/chesscom/guest-matchups")
        guest_cookie = client.cookies.get(main_module.GUEST_IDENTITY_COOKIE)
        repeated_landing = client.get("/api/chesscom/guest-matchups")
        repeated_cookie = client.cookies.get(main_module.GUEST_IDENTITY_COOKIE)
        stored = client.post("/api/chesscom/matches/180731271553/store")

    assert landing.status_code == 200
    assert repeated_landing.status_code == 200
    assert guest_cookie and guest_cookie != "forged"
    assert repeated_cookie == guest_cookie
    assert stored.status_code == 200
    game_id = stored.json()["game_id"]
    game = service.db.get_game(game_id)
    assert game is not None
    assert game["username"] == "guest_1"
    assert service.create_guest_identity()[0] == 2
