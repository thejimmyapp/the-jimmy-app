from __future__ import annotations

import pytest

import backend.main as main_module


@pytest.fixture(autouse=True)
def allow_identity_cookie_round_trips_over_http(monkeypatch) -> None:
    monkeypatch.setattr(main_module.settings, "cookie_secure", False)
