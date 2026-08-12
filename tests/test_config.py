from __future__ import annotations

from pathlib import Path

import pytest

import backend.config as config_module


@pytest.mark.parametrize(
    ("system_name", "binary_name"),
    (("Linux", "fairy-stockfish"), ("Windows", "fairy-stockfish.exe")),
)
def test_default_fairy_stockfish_path_matches_platform(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    system_name: str,
    binary_name: str,
) -> None:
    monkeypatch.setattr(config_module, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(config_module.platform, "system", lambda: system_name)
    monkeypatch.setattr(config_module.shutil, "which", lambda _binary: None)

    assert config_module._default_fairy_stockfish_path() == (
        tmp_path / "engines" / binary_name
    )


def test_fairy_stockfish_environment_override_takes_precedence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    override = Path("/srv/engines/custom-fairy-stockfish")
    monkeypatch.setenv("FAIRY_STOCKFISH_PATH", str(override))

    settings = config_module.Settings(_env_file=None)

    assert settings.fairy_stockfish_path == override
