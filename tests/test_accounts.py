from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

import backend.main as main_module
from backend.services import GameService


def _service_client(tmp_path, monkeypatch) -> tuple[GameService, TestClient]:
    service = GameService(tmp_path / "accounts.sqlite")
    monkeypatch.setattr(main_module, "games", service)
    return service, TestClient(main_module.app)


def _stamp_completion(service: GameService, guest_number: int) -> int:
    with service.db.connect() as conn:
        sequence = conn.execute("INSERT INTO guest_completion_sequence DEFAULT VALUES")
        assert sequence.lastrowid is not None
        ordinal = int(sequence.lastrowid)
        conn.execute(
            """
            INSERT INTO guest_completions (
                guest_number, completed_at, completion_ordinal
            )
            VALUES (?, ?, ?)
            """,
            (guest_number, "2026-08-11T00:00:00+00:00", ordinal),
        )
        conn.commit()
    return ordinal


def _account_count(service: GameService) -> int:
    with service.db.connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS total FROM accounts").fetchone()
    return int(row["total"])


def test_claim_requires_guest_identity(tmp_path, monkeypatch) -> None:
    service, client = _service_client(tmp_path, monkeypatch)

    with client:
        response = client.post("/api/accounts/claim", json={"email": "guest@example.com"})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "guest_identity_missing"
    assert _account_count(service) == 0


def test_claim_without_completion_is_refused_without_account_row(tmp_path, monkeypatch) -> None:
    service, client = _service_client(tmp_path, monkeypatch)

    with client:
        assert client.post("/api/guests").status_code == 200
        response = client.post("/api/accounts/claim", json={"email": "guest@example.com"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "signup_requires_completion"
    assert _account_count(service) == 0


@pytest.mark.parametrize(
    "email",
    ["", "missing-at.example.com", "two@@example.com", "@example.com", "guest@", "guest @example.com", f"{'a' * 250}@x.com"],
)
def test_invalid_email_is_refused_without_account_row(tmp_path, monkeypatch, email: str) -> None:
    service, client = _service_client(tmp_path, monkeypatch)

    with client:
        landing = client.post("/api/guests")
        _stamp_completion(service, landing.json()["guest_number"])
        response = client.post("/api/accounts/claim", json={"email": email})

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_email"
    assert _account_count(service) == 0


def test_completed_guest_claim_is_idempotent_and_cookie_restores_account(tmp_path, monkeypatch) -> None:
    service, client = _service_client(tmp_path, monkeypatch)

    with client:
        landing = client.post("/api/guests")
        guest_number = landing.json()["guest_number"]
        assert _stamp_completion(service, guest_number) == 1
        first = client.post("/api/accounts/claim", json={"email": "first@example.com"})
        first_cookie = client.cookies.get(main_module.ACCOUNT_IDENTITY_COOKIE)
        current = client.get("/api/accounts/me")
        second = client.post("/api/accounts/claim", json={"email": "replacement@example.com"})
        second_cookie = client.cookies.get(main_module.ACCOUNT_IDENTITY_COOKIE)

    assert first.status_code == 200
    assert first.json() == {
        "guest_number": guest_number,
        "email": "first@example.com",
        "completion_ordinal": 1,
        "founder_eligible": True,
        "created_at": first.json()["created_at"],
    }
    assert first.json()["created_at"]
    assert first_cookie
    assert "httponly" in first.headers["set-cookie"].lower()
    assert current.json() == {"account": first.json()}
    assert second.json() == first.json()
    assert second_cookie == first_cookie
    assert _account_count(service) == 1
    with service.db.connect() as conn:
        account = dict(conn.execute("SELECT * FROM accounts").fetchone())
        table_sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'"
        ).fetchone()["sql"]
        foreign_keys = conn.execute("PRAGMA foreign_key_list(accounts)").fetchall()
    assert account["guest_number"] == guest_number
    assert account["email"] == "first@example.com"
    assert account["account_token"] == first_cookie
    assert "INTEGER PRIMARY KEY AUTOINCREMENT" in table_sql
    assert [(row["table"], row["from"], row["to"]) for row in foreign_keys] == [
        ("guest_identities", "guest_number", "guest_number")
    ]


@pytest.mark.parametrize("cookie_secure", [True, False])
def test_identity_cookie_secure_attribute_follows_setting(tmp_path, monkeypatch, cookie_secure: bool) -> None:
    service = GameService(tmp_path / f"cookies-{cookie_secure}.sqlite")
    monkeypatch.setattr(main_module, "games", service)
    monkeypatch.setattr(main_module.settings, "cookie_secure", cookie_secure)
    scheme = "https" if cookie_secure else "http"

    with TestClient(main_module.app, base_url=f"{scheme}://testserver") as client:
        landing = client.post("/api/guests")
        _stamp_completion(service, landing.json()["guest_number"])
        claimed = client.post("/api/accounts/claim", json={"email": "guest@example.com"})

    guest_set_cookie = landing.headers["set-cookie"]
    account_set_cookie = claimed.headers["set-cookie"]
    assert ("; Secure" in guest_set_cookie) is cookie_secure
    assert ("; Secure" in account_set_cookie) is cookie_secure


def test_founder_eligibility_flips_after_completion_ordinal_ten(tmp_path, monkeypatch) -> None:
    service, client = _service_client(tmp_path, monkeypatch)
    identities = [service.create_guest_identity() for _ in range(11)]
    for guest_number, _token in identities:
        assert _stamp_completion(service, guest_number) == guest_number

    with client:
        client.cookies.set(main_module.GUEST_IDENTITY_COOKIE, identities[9][1])
        tenth = client.post("/api/accounts/claim", json={"email": "ten@example.com"})
        client.cookies.set(main_module.GUEST_IDENTITY_COOKIE, identities[10][1])
        eleventh = client.post("/api/accounts/claim", json={"email": "eleven@example.com"})

    assert tenth.json()["completion_ordinal"] == 10
    assert tenth.json()["founder_eligible"] is True
    assert eleventh.json()["completion_ordinal"] == 11
    assert eleventh.json()["founder_eligible"] is False


def test_accounts_me_without_cookie_returns_null(tmp_path, monkeypatch) -> None:
    _service, client = _service_client(tmp_path, monkeypatch)

    with client:
        missing = client.get("/api/accounts/me")
        client.cookies.set(main_module.ACCOUNT_IDENTITY_COOKIE, "not-a-real-account-token")
        invalid = client.get("/api/accounts/me")

    assert missing.status_code == 200
    assert missing.json() == {"account": None}
    assert invalid.status_code == 200
    assert invalid.json() == {"account": None}
