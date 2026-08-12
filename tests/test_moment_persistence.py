from __future__ import annotations

import json
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient
import pytest

import backend.main as main_module
from backend.services import GameService


BOARD_A_PGN = """\
[Variant "Bughouse"]
[White "guest_1"]
[Black "Opponent"]
[TimeControl "180"]
[Result "1-0"]

1. e4 {[%clk 0:02:59]} e5 {[%clk 0:02:58]} 1-0
"""

BOARD_B_PGN = """\
[Variant "Bughouse"]
[White "DiagonalOpponent"]
[Black "Partner"]
[TimeControl "180"]
[Result "0-1"]

1. d4 {[%clk 0:02:57]} d5 {[%clk 0:02:56]} 0-1
"""

BASE_MOMENT = {
    "move_token": "1A",
    "glyph": "!",
    "alternative_move": "N@h6",
    "written_answer": "The drop keeps both kings covered.",
}

COUPLED_FIELDS = (
    "board_a_white_pocket",
    "board_a_black_pocket",
    "board_b_white_pocket",
    "board_b_black_pocket",
    "board_a_white_clock",
    "board_a_black_clock",
    "board_b_white_clock",
    "board_b_black_clock",
)


def _stored_game(service: GameService) -> int:
    raw_game = {
        "url": "manual://moment-persistence",
        "uuid": "moment-persistence",
        "pgn": BOARD_A_PGN,
        "bughousePartnerPgn": BOARD_B_PGN,
        "bughousePlayer1Name": "guest_1",
        "bughousePlayer2Name": "Opponent",
        "bughousePartnerPlayer1Name": "DiagonalOpponent",
        "bughousePartnerPlayer2Name": "Partner",
        "rules": "bughouse",
        "white": {"username": "guest_1", "result": "win"},
        "black": {"username": "Opponent", "result": "resigned"},
    }
    assert service.db.upsert_game("guest_1", raw_game) is True
    return int(service.list_games("guest_1")[0]["id"])


def _client_with_game(tmp_path: Path, monkeypatch) -> tuple[GameService, TestClient, int]:
    service = GameService(tmp_path / "moments.sqlite")
    monkeypatch.setattr(main_module, "games", service)
    client = TestClient(main_module.app)
    landing = client.post("/api/guests")
    assert landing.status_code == 200
    assert landing.json()["guest_number"] == 1
    return service, client, _stored_game(service)


def _create(client: TestClient, game_id: int, **changes: object):
    payload = {"game_id": game_id, **BASE_MOMENT, **changes}
    return client.post("/api/moments", json=payload)


def _expected_coupled_state(service: GameService, game_id: int) -> dict[str, str]:
    payload = service.get_game_payload(game_id)
    assert payload is not None
    frame = next(
        item
        for item in payload["timeline"]
        if item["board"] == "A" and item["local_ply"] == 1
    )
    expected: dict[str, str] = {}
    for board_key in ("board_a", "board_b"):
        for field in ("white_pocket", "black_pocket", "white_clock", "black_clock"):
            expected[f"{board_key}_{field}"] = frame[board_key][field]
    return expected


def test_saved_moment_round_trips_authoritative_pockets_and_all_four_clocks(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    expected_state = _expected_coupled_state(service, game_id)

    with client:
        created = _create(client, game_id)
        mine = client.get("/api/moments/mine")
        public = client.get("/api/moments/public")

    assert created.status_code == 201
    assert mine.status_code == 200
    assert public.status_code == 200
    private_moment = mine.json()["moments"][0]
    public_moment = public.json()["moments"][0]
    for field in COUPLED_FIELDS:
        assert private_moment[field] == expected_state[field]
        assert public_moment[field] == expected_state[field]
    assert private_moment["author"] == "guest_1"
    assert private_moment["created_at"]
    assert private_moment["written_answer"] == BASE_MOMENT["written_answer"]
    assert private_moment["engine_identity"] is None
    assert private_moment["engine_depth"] is None
    assert public_moment["engine_identity"] is None
    assert public_moment["engine_depth"] is None


def test_engine_provenance_round_trips_into_both_frozen_copies(tmp_path, monkeypatch) -> None:
    _service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        created = _create(
            client,
            game_id,
            engine_identity="Fairy-Stockfish 14",
            engine_depth=10,
        )
        mine = client.get("/api/moments/mine").json()["moments"]
        public = client.get("/api/moments/public").json()["moments"]

    assert created.status_code == 201
    assert mine[0]["engine_identity"] == "Fairy-Stockfish 14"
    assert mine[0]["engine_depth"] == 10
    assert public[0]["engine_identity"] == "Fairy-Stockfish 14"
    assert public[0]["engine_depth"] == 10


def test_moment_refuses_each_incomplete_wizard_step_without_writing(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        for missing_field in ("move_token", "glyph", "alternative_move", "written_answer"):
            payload = {"game_id": game_id, **BASE_MOMENT}
            del payload[missing_field]
            assert client.post("/api/moments", json=payload).status_code == 422
        for invalid_answer in ("", "   ", "Because", "Because   "):
            refused = _create(client, game_id, written_answer=invalid_answer)
            assert refused.status_code == 422
            assert refused.json()["detail"]["code"] == "moment_refused"
        refused_with_provenance = _create(
            client,
            game_id,
            move_token="99A",
            engine_identity="Fairy-Stockfish 14",
            engine_depth=10,
        )
        assert refused_with_provenance.status_code == 422
        assert refused_with_provenance.json()["detail"]["code"] == "moment_refused"

    assert service.list_private_moments(1) == []
    assert service.list_public_moments() == []


def test_one_word_written_answer_saves_and_increments_server_count(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        created = _create(client, game_id, written_answer="Because Timing")
        identity = client.post("/api/guests")

    assert created.status_code == 201
    assert identity.json()["saved_moment_count"] == 1
    assert len(service.list_private_moments(1)) == 1
    assert len(service.list_public_moments()) == 1


def test_reaching_three_stamps_one_completion_and_fourth_preserves_ordinal(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        for index in range(2):
            assert _create(client, game_id, written_answer=f"moment {index + 1}").status_code == 201
        below = client.post("/api/guests")
        third = _create(client, game_id, written_answer="moment 3")
        completed = client.post("/api/guests")
        with service.db.connect() as conn:
            first_completion = dict(
                conn.execute(
                    "SELECT * FROM guest_completions WHERE guest_number = 1"
                ).fetchone()
            )
        fourth = _create(client, game_id, written_answer="moment 4")
        after_fourth = client.post("/api/guests")
        with service.db.connect() as conn:
            completion_rows = [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM guest_completions ORDER BY completion_ordinal"
                ).fetchall()
            ]
            sequence_sql = conn.execute(
                """
                SELECT sql
                FROM sqlite_master
                WHERE type = 'table' AND name = 'guest_completion_sequence'
                """
            ).fetchone()["sql"]
            sequence_count = conn.execute(
                "SELECT COUNT(*) AS total FROM guest_completion_sequence"
            ).fetchone()["total"]
            completion_foreign_keys = conn.execute(
                "PRAGMA foreign_key_list(guest_completions)"
            ).fetchall()

    assert below.json()["completions_to_date"] == 0
    assert below.json()["completed"] is False
    assert below.json()["completion_ordinal"] is None
    assert third.status_code == 201
    assert completed.json()["completions_to_date"] == 1
    assert completed.json()["completed"] is True
    assert completed.json()["completion_ordinal"] == 1
    assert first_completion["completed_at"]
    assert first_completion["completion_ordinal"] == 1
    assert fourth.status_code == 201
    assert after_fourth.json()["completion_ordinal"] == 1
    assert completion_rows == [first_completion]
    assert "INTEGER PRIMARY KEY AUTOINCREMENT" in sequence_sql
    assert sequence_count == 1
    assert [(row["table"], row["from"], row["to"]) for row in completion_foreign_keys] == [
        ("guest_identities", "guest_number", "guest_number")
    ]


def test_two_guests_receive_distinct_increasing_completion_ordinals(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        for index in range(3):
            assert _create(client, game_id, written_answer=f"guest 1 moment {index + 1}").status_code == 201
        first_status = client.post("/api/guests")
        reset = client.post("/api/guests/reset")
        for index in range(3):
            assert _create(client, game_id, written_answer=f"guest 2 moment {index + 1}").status_code == 201
        second_status = client.post("/api/guests")
        with service.db.connect() as conn:
            rows = conn.execute(
                """
                SELECT guest_number, completion_ordinal
                FROM guest_completions
                ORDER BY completion_ordinal
                """
            ).fetchall()

    assert first_status.json()["completions_to_date"] == 1
    assert first_status.json()["completion_ordinal"] == 1
    assert reset.json()["guest_number"] == 2
    assert reset.json()["completed"] is False
    assert reset.json()["completion_ordinal"] is None
    assert second_status.json()["completions_to_date"] == 2
    assert second_status.json()["completed"] is True
    assert second_status.json()["completion_ordinal"] == 2
    assert [(row["guest_number"], row["completion_ordinal"]) for row in rows] == [(1, 1), (2, 2)]


def test_deleting_below_three_leaves_completion_permanent(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        created = [
            _create(client, game_id, written_answer=f"moment {index + 1}")
            for index in range(3)
        ]
        before_delete = client.post("/api/guests")
        deleted = client.delete(
            f"/api/moments/{created[0].json()['private_moment']['id']}"
        )
        after_delete = client.post("/api/guests")

    assert all(response.status_code == 201 for response in created)
    assert before_delete.json()["completion_ordinal"] == 1
    assert deleted.status_code == 200
    assert after_delete.json()["saved_moment_count"] == 2
    assert after_delete.json()["completions_to_date"] == 1
    assert after_delete.json()["completed"] is True
    assert after_delete.json()["completion_ordinal"] == 1
    assert service.db.guest_completion_count() == 1


def test_guest_completion_status_fails_closed_with_best_effort_count(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        for index in range(3):
            assert _create(client, game_id, written_answer=f"moment {index + 1}").status_code == 201

        def fail_completion_status(_guest_number: int) -> dict[str, object]:
            raise RuntimeError("completion status unavailable")

        monkeypatch.setattr(service, "guest_completion_status", fail_completion_status)
        session = client.post("/api/guests")

    assert session.status_code == 200
    assert session.json()["completions_to_date"] == 1
    assert session.json()["completed"] is False
    assert session.json()["completion_ordinal"] is None


def test_editing_private_copy_leaves_public_copy_byte_identical(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        created = _create(client, game_id)
    assert created.status_code == 201
    private_id = created.json()["private_moment"]["id"]
    public_before = json.dumps(
        service.list_public_moments(),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()

    assert service.update_private_moment(
        private_id,
        1,
        "?!",
        "Q@h5",
        "The private explanation changed.",
    )

    public_after = json.dumps(
        service.list_public_moments(),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    private_after = service.list_private_moments(1)[0]
    assert public_after == public_before
    assert private_after["glyph"] == "?!"
    assert private_after["alternative_move"] == "Q@h5"
    assert private_after["written_answer"] == "The private explanation changed."


def test_moments_list_by_server_assigned_save_order(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        first = _create(client, game_id, written_answer="first")
        second = _create(client, game_id, written_answer="second")
        mine = client.get("/api/moments/mine").json()["moments"]
        public = client.get("/api/moments/public").json()["moments"]

    assert first.status_code == 201
    assert second.status_code == 201
    assert [moment["written_answer"] for moment in mine] == ["first", "second"]
    assert [moment["written_answer"] for moment in public] == ["first", "second"]
    assert [moment["save_order"] for moment in mine] == [1, 2]
    assert [moment["save_order"] for moment in public] == [1, 2]
    assert service.list_private_moments(1) == mine


def test_malformed_payload_is_refused_without_partial_storage_or_visibility_schema(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    malformed = {"game_id": game_id, **BASE_MOMENT, "move_token": "1Aextra", "visibility": "private"}

    with client:
        refused = client.post("/api/moments", json=malformed)

    assert refused.status_code == 422
    assert service.list_private_moments(1) == []
    assert service.list_public_moments() == []
    with service.db.connect() as conn:
        for table in ("private_moments", "public_moments"):
            table_info = conn.execute(f"PRAGMA table_info({table})").fetchall()
            columns = {row["name"] for row in table_info}
            foreign_keys = conn.execute(f"PRAGMA foreign_key_list({table})").fetchall()
            assert "visibility" not in columns
            assert {row["name"]: row["notnull"] for row in table_info if row["name"] in {"engine_identity", "engine_depth"}} == {
                "engine_identity": 0,
                "engine_depth": 0,
            }
            assert foreign_keys == []


def test_delete_removes_only_the_authors_private_copy(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        created = _create(client, game_id)
        private_id = created.json()["private_moment"]["id"]
        deleted = client.delete(f"/api/moments/{private_id}")

    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert service.list_private_moments(1) == []
    assert len(service.list_public_moments()) == 1


def test_public_moment_vote_toggles_without_mutating_frozen_row(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        created = _create(client, game_id)
        public_id = created.json()["public_moment"]["id"]
        with service.db.connect() as conn:
            public_before = json.dumps(
                dict(conn.execute("SELECT * FROM public_moments WHERE id = ?", (public_id,)).fetchone()),
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
            table_sql = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'moment_votes'"
            ).fetchone()["sql"]
            foreign_keys = conn.execute("PRAGMA foreign_key_list(moment_votes)").fetchall()

        voted = client.post(f"/api/moments/public/{public_id}/vote")
        listed = client.get("/api/moments/public").json()["moments"][0]
        with service.db.connect() as conn:
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    """
                    INSERT INTO moment_votes (
                        public_moment_id, voter_guest_number, created_at
                    ) VALUES (?, ?, ?)
                    """,
                    (public_id, 1, "2026-08-11T00:00:00+00:00"),
                )
            conn.rollback()

        unvoted = client.post(f"/api/moments/public/{public_id}/vote")
        with service.db.connect() as conn:
            public_after = json.dumps(
                dict(conn.execute("SELECT * FROM public_moments WHERE id = ?", (public_id,)).fetchone()),
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
            vote_total = conn.execute("SELECT COUNT(*) AS total FROM moment_votes").fetchone()["total"]

    assert voted.status_code == 200
    assert voted.json() == {"voted": True, "vote_count": 1}
    assert listed["vote_count"] == 1
    assert listed["voted"] is True
    assert unvoted.status_code == 200
    assert unvoted.json() == {"voted": False, "vote_count": 0}
    assert vote_total == 0
    assert public_after == public_before
    assert "INTEGER PRIMARY KEY AUTOINCREMENT" in table_sql
    assert "UNIQUE(public_moment_id, voter_guest_number)" in table_sql
    assert {(row["table"], row["from"], row["to"]) for row in foreign_keys} == {
        ("public_moments", "public_moment_id", "id"),
        ("guest_identities", "voter_guest_number", "guest_number"),
    }


def test_public_moment_vote_refuses_missing_identity_and_unknown_moment(tmp_path, monkeypatch) -> None:
    _service, client, _game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        unknown = client.post("/api/moments/public/999/vote")
        client.cookies.clear()
        missing_identity = client.post("/api/moments/public/999/vote")

    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "public_moment_not_found"
    assert missing_identity.status_code == 409
    assert missing_identity.json()["detail"]["code"] == "guest_identity_missing"


def test_server_engine_gate_flips_at_exactly_ten_private_moments(tmp_path, monkeypatch) -> None:
    _service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        for index in range(9):
            assert _create(client, game_id, written_answer=f"moment {index + 1}").status_code == 201
        below = client.post("/api/guests")
        tenth = _create(client, game_id, written_answer="moment 10")
        exact = client.post("/api/guests")

    assert below.json()["saved_moment_count"] == 9
    assert below.json()["analysis_unlocked"] is False
    assert tenth.status_code == 201
    assert exact.json()["saved_moment_count"] == 10
    assert exact.json()["analysis_unlocked"] is True


def test_client_claim_cannot_override_server_engine_gate(tmp_path, monkeypatch) -> None:
    _service, client, game_id = _client_with_game(tmp_path, monkeypatch)

    with client:
        for index in range(3):
            assert _create(client, game_id, written_answer=f"moment {index + 1}").status_code == 201
        claimed = client.post(
            "/api/guests",
            json={"saved_moment_count": 10, "analysis_unlocked": True},
        )

    assert claimed.json()["saved_moment_count"] == 3
    assert claimed.json()["analysis_unlocked"] is False
