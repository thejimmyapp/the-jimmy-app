from __future__ import annotations

import os

import pytest

# Never let the test app warm the guest list against live Chess.com.
os.environ.setdefault("CHESSCOM_GUEST_WARM_ON_STARTUP", "false")

import backend.main as main_module  # noqa: E402


@pytest.fixture(autouse=True)
def allow_identity_cookie_round_trips_over_http(monkeypatch) -> None:
    monkeypatch.setattr(main_module.settings, "cookie_secure", False)
