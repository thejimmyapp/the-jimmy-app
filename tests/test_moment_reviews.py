from __future__ import annotations

from datetime import datetime
import json
import sqlite3

import pytest

from tests.test_moment_persistence import _client_with_game, _create


def _review(client, moment_id: int, grade: str):
    return client.post(f"/api/moments/{moment_id}/review", json={"grade": grade})


def test_grading_upserts_one_review_row_and_uses_previous_interval(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    with client:
        moment_id = _create(client, game_id).json()["private_moment"]["id"]
        first = _review(client, moment_id, "hard")
        second = _review(client, moment_id, "easy")

    assert first.status_code == 200
    assert first.json()["interval_days"] == 1
    assert second.status_code == 200
    assert second.json()["interval_days"] == 3.25
    assert second.json()["attempts"] == 2
    assert second.json()["ease"] == 2.5
    with service.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM moment_reviews").fetchone()[0] == 1


def test_again_is_due_now_and_good_is_scheduled_in_future(tmp_path, monkeypatch) -> None:
    _service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    with client:
        moment_id = _create(client, game_id).json()["private_moment"]["id"]
        again = _review(client, moment_id, "again").json()
        good = _review(client, moment_id, "good").json()

    assert again["last_result"] == "fail"
    assert again["interval_days"] == 0
    assert again["due"] is True
    assert again["due_at"] == again["reviewed_at"]
    assert good["last_result"] == "pass"
    assert good["interval_days"] == 1
    assert good["due"] is False
    assert datetime.fromisoformat(good["due_at"]) > datetime.fromisoformat(good["reviewed_at"])


def test_list_private_moments_surfaces_review_flags(tmp_path, monkeypatch) -> None:
    _service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    with client:
        moment_id = _create(client, game_id).json()["private_moment"]["id"]
        unattempted = client.get("/api/moments/mine").json()["moments"][0]
        _review(client, moment_id, "again")
        attempted = client.get("/api/moments/mine").json()["moments"][0]

    assert unattempted["due"] is True
    assert unattempted["attempted"] is False
    assert unattempted["failed_last"] is False
    assert unattempted["due_at"] is None
    assert unattempted["attempts"] == 0
    assert attempted["due"] is True
    assert attempted["attempted"] is True
    assert attempted["failed_last"] is True
    assert attempted["due_at"]
    assert attempted["attempts"] == 1


def test_non_author_cannot_grade_private_moment(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    with client:
        moment_id = _create(client, game_id).json()["private_moment"]["id"]
        assert client.post("/api/guests/reset").json()["guest_number"] == 2
        refused = _review(client, moment_id, "good")

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "moment_not_found"
    with service.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM moment_reviews").fetchone()[0] == 0


def test_grading_never_mutates_public_moments_and_freeze_remains_intact(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    with client:
        created = _create(client, game_id).json()
        private_id = created["private_moment"]["id"]
        public_id = created["public_moment"]["id"]
        with service.db.connect() as conn:
            public_before = json.dumps(dict(conn.execute(
                "SELECT * FROM public_moments WHERE id = ?", (public_id,)
            ).fetchone()), sort_keys=True).encode()
        assert _review(client, private_id, "easy").status_code == 200

    with service.db.connect() as conn:
        public_after = json.dumps(dict(conn.execute(
            "SELECT * FROM public_moments WHERE id = ?", (public_id,)
        ).fetchone()), sort_keys=True).encode()
        triggers = {row["name"] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'freeze_public_moment%'"
        )}
        with pytest.raises(sqlite3.IntegrityError, match="public moments are frozen"):
            conn.execute("UPDATE public_moments SET glyph = '?' WHERE id = ?", (public_id,))

    assert public_after == public_before
    assert triggers == {"freeze_public_moment_updates", "freeze_public_moment_deletes"}


def test_delete_private_moment_removes_its_review_row(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    with client:
        moment_id = _create(client, game_id).json()["private_moment"]["id"]
        assert _review(client, moment_id, "good").status_code == 200
        deleted = client.delete(f"/api/moments/{moment_id}")

    assert deleted.status_code == 200
    with service.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM moment_reviews").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM private_moments").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM public_moments").fetchone()[0] == 1


def test_bad_grade_is_rejected_without_writing_review_state(tmp_path, monkeypatch) -> None:
    service, client, game_id = _client_with_game(tmp_path, monkeypatch)
    with client:
        moment_id = _create(client, game_id).json()["private_moment"]["id"]
        refused = _review(client, moment_id, "perfect")

    assert refused.status_code == 422
    with service.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM moment_reviews").fetchone()[0] == 0
