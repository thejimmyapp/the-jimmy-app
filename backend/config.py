from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import os
import shutil

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[1]

DEFAULT_CHESSCOM_PLAYERS_OF_INTEREST = ",".join((
    "RyanTime",
    "sassystacks30",
    "Wakatakakagi",
    "salodavid",
    "NikhilDhalla",
    "OldStar357",
    "Elaina_defense",
    "Ronaldo7899",
    "tickeroftime",
    "Knight-m4re",
    "mcbcflute",
    "josh_leonard",
    "DontKno",
    "partyrock45",
    "TopGunSac",
    "LollyWen",
    "al388",
    "Kengyry",
    "Ziordl",
    "Rafael_Ventura",
    "shexman",
    "dedefave",
    "1038tjc9wtg",
    "JarlCarlander",
    "111Michael",
    "AllenChiverson",
    "nimzoman13",
    "SuperAwesomeSarthak",
    "Dielie",
    "Thebluetime",
    "XxElproxX2nd",
    "chessexclam",
))


def _runtime_data_dir() -> Path:
    mount = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")
    return Path(mount) if mount else ROOT_DIR / "data"


def _default_fairy_stockfish_path() -> Path:
    bundled = ROOT_DIR / "engines" / "fairy-stockfish"
    if bundled.exists():
        return bundled
    installed = shutil.which("fairy-stockfish")
    if installed:
        return Path(installed)
    return ROOT_DIR / "engines" / "fairy-stockfish.exe"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    app_name: str = "The Jimmy App — Collaborative Bughouse Coach"
    environment: str = "development"
    database_url: str = f"sqlite:///{(ROOT_DIR / 'data' / 'webapp.db').as_posix()}"
    legacy_database_path: Path = ROOT_DIR / "data" / "bughouse.db"
    fairy_stockfish_path: Path = Field(default_factory=_default_fairy_stockfish_path)
    chesscom_user_agent: str = "thejimmyapp/1.0 contact=hello@thejimmyapp.com"
    chesscom_cache_ttl_seconds: int = Field(default=900, ge=60, le=86_400)
    chesscom_max_archives: int = Field(default=12, ge=1, le=120)
    chesscom_max_games: int = Field(default=500, ge=1, le=5000)
    chesscom_match_proxy_enabled: bool = True
    chesscom_match_timeout_seconds: float = Field(default=12.0, ge=1, le=30)
    chesscom_match_cache_ttl_seconds: int = Field(default=900, ge=60, le=86_400)
    chesscom_players_of_interest: str = DEFAULT_CHESSCOM_PLAYERS_OF_INTEREST
    chesscom_guest_max_archives_per_player: int = Field(default=2, ge=1, le=6)
    chesscom_guest_max_matches_examined: int = Field(default=40, ge=5, le=200)
    chesscom_oauth_callback_url: str = (
        "https://jimmyapp-production.up.railway.app/api/oauth/chesscom/callback"
    )
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "https://thejimmyapp.com,https://jimmyapp-production.up.railway.app"
    )
    trusted_hosts: str = (
        "localhost,127.0.0.1,testserver,thejimmyapp.com,"
        "jimmyapp-production.up.railway.app,*.railway.app,*.railway.internal"
    )
    websocket_origins: str = ""
    max_pgn_bytes: int = 2_000_000
    engine_depth: int = Field(default=10, ge=4, le=24)
    engine_timeout_seconds: float = Field(default=8.0, ge=1, le=60)
    analysis_max_active_jobs: int = Field(default=4, ge=1, le=32)
    analysis_max_job_records: int = Field(default=100, ge=4, le=1000)
    analysis_cache_records: int = Field(default=200, ge=1, le=2000)
    coach_max_active_jobs: int = Field(default=2, ge=1, le=8)
    coach_max_job_records: int = Field(default=50, ge=2, le=500)
    leak_map_max_active_jobs: int = Field(default=1, ge=1, le=4)
    leak_map_max_job_records: int = Field(default=25, ge=1, le=250)
    compute_job_ttl_seconds: int = Field(default=900, ge=60, le=86_400)
    room_ttl_hours: int = Field(default=168, ge=1, le=2160)
    qwen_enabled: bool = True
    qwen_model_name: str = "lmstudio-community/Qwen3.5-4B-GGUF"
    qwen_model_filename: str = "Qwen3.5-4B-Q4_K_M.gguf"
    qwen_model_url: str = (
        "https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF/resolve/main/"
        "Qwen3.5-4B-Q4_K_M.gguf?download=true"
    )
    qwen_model_path: Path = Field(
        default_factory=lambda: _runtime_data_dir() / "models" / "Qwen3.5-4B-Q4_K_M.gguf"
    )
    llama_cli_path: Path = ROOT_DIR / "llama" / "llama-cli"
    qwen_context_size: int = Field(default=2048, ge=1024, le=32768)
    qwen_max_tokens: int = Field(default=256, ge=128, le=4096)
    qwen_temperature: float = Field(default=0.15, ge=0, le=1)
    qwen_top_p: float = Field(default=0.85, gt=0, le=1)
    qwen_reasoning_budget: int = Field(default=0, ge=-1, le=512)
    qwen_threads: int = Field(default=4, ge=1, le=16)
    qwen_batch_threads: int = Field(default=4, ge=1, le=16)
    qwen_timeout_seconds: float = Field(default=90, ge=30, le=900)
    qwen_min_free_bytes: int = 3_200_000_000

    @property
    def cors_origin_list(self) -> list[str]:
        return _split_csv(self.cors_origins)

    @property
    def trusted_host_list(self) -> list[str]:
        return _split_csv(self.trusted_hosts)

    @property
    def websocket_origin_list(self) -> list[str]:
        return _split_csv(self.websocket_origins or self.cors_origins)

    @property
    def chesscom_players_of_interest_list(self) -> list[str]:
        return _split_csv(self.chesscom_players_of_interest)

    def is_allowed_websocket_origin(self, origin: str | None) -> bool:
        if not origin:
            return True
        normalized = origin.rstrip("/")
        return normalized in {value.rstrip("/") for value in self.websocket_origin_list}


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
