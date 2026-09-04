#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from typing import Any
from urllib.parse import urljoin

import httpx


DEFAULT_BASE_URL = "https://jimmyapp-production.up.railway.app"


class SmokeFailure(RuntimeError):
    pass


def fetch(base_url: str, path: str, timeout: float) -> tuple[int, str, bytes]:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    try:
        response = httpx.get(
            url,
            headers={"User-Agent": "thejimmyapp-production-smoke/1.0"},
            follow_redirects=True,
            timeout=timeout,
        )
    except httpx.HTTPError as exc:
        raise SmokeFailure(f"{path} could not be reached: {exc}") from exc
    if response.status_code != 200:
        raise SmokeFailure(f"{path} returned HTTP {response.status_code}")
    content_type = response.headers.get("content-type", "").split(";", 1)[0]
    return response.status_code, content_type, response.content


def fetch_json(base_url: str, path: str, timeout: float) -> dict[str, Any]:
    status, content_type, body = fetch(base_url, path, timeout)
    if status != 200 or content_type != "application/json":
        raise SmokeFailure(f"{path} did not return a JSON 200 response")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise SmokeFailure(f"{path} returned malformed JSON") from exc
    if not isinstance(payload, dict):
        raise SmokeFailure(f"{path} returned a non-object JSON payload")
    return payload


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def run_smoke(base_url: str, timeout: float, game_id: int | None) -> dict[str, object]:
    checks: list[str] = []
    health = fetch_json(base_url, "/health", timeout)
    require(health.get("status") == "ok", "health status is not ok")
    require(health.get("database") == "available", "database is unavailable")
    require(health.get("fairy_stockfish") == "available", "Fairy-Stockfish is unavailable")
    ai_coach = health.get("ai_coach") if isinstance(health.get("ai_coach"), dict) else {}
    if ai_coach.get("enabled") is True:
        require(ai_coach.get("state") in {"ready", "running"}, "local Qwen runtime is not ready")
    checks.append("health")

    for path in ("/", "/privacy", "/terms"):
        status, content_type, body = fetch(base_url, path, timeout)
        require(status == 200, f"{path} did not return 200")
        require(content_type == "text/html", f"{path} did not return HTML")
        require(b'id="root"' in body, f"{path} did not return the application shell")
        checks.append(path)

    oauth = fetch_json(base_url, "/api/oauth/chesscom/callback", timeout)
    require(bool(oauth), "OAuth callback returned an empty payload")
    checks.append("oauth_callback")

    openapi = fetch_json(base_url, "/openapi.json", timeout)
    schemas = openapi.get("components", {}).get("schemas", {})
    analysis = schemas.get("AnalysisRequest", {})
    coach = schemas.get("CoachPrepareRequest", {})
    require(analysis.get("additionalProperties") is False, "AnalysisRequest accepts extra fields")
    require(coach.get("additionalProperties") is False, "CoachPrepareRequest accepts extra fields")
    require(
        set(analysis.get("properties", {})) == {"game_id", "global_ply", "board", "depth"},
        "AnalysisRequest authority fields changed",
    )
    require(
        set(coach.get("properties", {})) == {"game_id", "global_ply", "question", "annotations"},
        "CoachPrepareRequest authority fields changed",
    )
    checks.append("authority_contracts")

    if game_id is not None:
        fetch_json(base_url, f"/api/games/{game_id}", timeout)
        fetch_json(base_url, f"/api/games/{game_id}/snapshot/0", timeout)
        checks.append("stored_replay")

    return {
        "status": "ok",
        "base_url": base_url,
        "checks": checks,
        "qwen": {
            "state": ai_coach.get("state"),
            "context_size": ai_coach.get("context_size"),
            "max_tokens": ai_coach.get("max_tokens"),
            "threads": ai_coach.get("threads"),
            "timeout_seconds": ai_coach.get("timeout_seconds"),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run read-only production smoke checks.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--game-id", type=int)
    args = parser.parse_args()
    try:
        result = run_smoke(args.base_url, args.timeout, args.game_id)
    except SmokeFailure as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
