from __future__ import annotations

from datetime import UTC, datetime
from threading import Event
from uuid import uuid4

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.exc import SQLAlchemyError
from starlette.websockets import WebSocketDisconnect

import backend.main as main_module
from backend.main import app, get_session, settings
from backend.models import SharedNote


@pytest.mark.parametrize("full_path", ["api", "api/unknown"])
def test_frontend_response_decision_refuses_api_paths(full_path: str) -> None:
    assert main_module.decide_frontend_response(full_path, candidate_is_file=False) == "api_404"


@pytest.mark.parametrize(
    "full_path",
    ["", "mission", "privacy", f"puzzle/{'a' * 40}"],
)
def test_frontend_response_decision_preserves_spa_fallback(full_path: str) -> None:
    assert main_module.decide_frontend_response(full_path, candidate_is_file=False) == "index"


def test_frontend_response_decision_serves_real_relative_file(tmp_path) -> None:
    relative_path = "assets/app.js"
    candidate = tmp_path / relative_path
    candidate.parent.mkdir()
    candidate.write_text("console.log('ok')", encoding="utf-8")

    assert main_module.decide_frontend_response(
        relative_path,
        candidate_is_file=candidate.is_file(),
    ) == "file"


def test_frontend_response_decision_refuses_file_outside_dist(tmp_path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    outside = tmp_path / "x"
    outside.write_text("outside", encoding="utf-8")
    resolved = (dist / "../x").resolve()
    safe_file = resolved.is_file() and resolved.is_relative_to(dist.resolve())

    assert safe_file is False
    assert main_module.decide_frontend_response("../x", candidate_is_file=safe_file) == "index"


def test_frontend_routes_return_json_for_unknown_api_and_html_for_spa(tmp_path) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    index_body = "<!doctype html><title>temporary frontend</title>"
    asset_body = "console.log('inside dist')"
    outside_body = "outside-dist-secret"
    (dist / "index.html").write_text(index_body, encoding="utf-8")
    (dist / "assets" / "app.js").write_text(asset_body, encoding="utf-8")
    (tmp_path / "secret.txt").write_text(outside_body, encoding="utf-8")
    test_app = FastAPI()
    main_module.register_frontend_routes(test_app, dist)

    with TestClient(test_app) as client:
        missing_api = client.get("/api/does-not-exist")
        root = client.get("/")
        mission = client.get("/mission")
        asset = client.get("/assets/app.js")
        traversal = client.get("/%2E%2E/secret.txt")

    assert missing_api.status_code == 404
    assert missing_api.headers["content-type"].startswith("application/json")
    assert missing_api.json() == {
        "detail": {
            "code": "not_found",
            "message": "API route /api/does-not-exist was not found.",
        }
    }
    assert index_body not in missing_api.text
    assert root.status_code == 200
    assert root.headers["content-type"].startswith("text/html")
    assert root.text == index_body
    assert mission.status_code == 200
    assert mission.headers["content-type"].startswith("text/html")
    assert mission.text == index_body
    assert asset.status_code == 200
    assert asset.text == asset_body
    assert traversal.status_code == 200
    assert traversal.headers["content-type"].startswith("text/html")
    assert traversal.text == index_body
    assert outside_body not in traversal.text


def receive_event_type(socket, expected_type: str) -> dict:
    seen: list[str] = []
    for _ in range(6):
        event = socket.receive_json()
        seen.append(str(event.get("type")))
        if event.get("type") == expected_type:
            return event
    raise AssertionError(f"Expected {expected_type}, saw {seen}")


def test_health_and_openapi() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["service"] == "thejimmyapp"
        assert response.json()["ai_coach"]["model_file"] == "Qwen3.5-4B-Q4_K_M.gguf"
        assert "/ws/rooms/{room_id}" not in client.get("/openapi.json").json()["paths"]


def test_coach_status_and_stats_username_validation() -> None:
    with TestClient(app) as client:
        status_response = client.get("/api/coach/status")
        assert status_response.status_code == 200
        assert status_response.json()["temperature"] == 0.15
        assert status_response.json()["context_size"] == 2048
        assert status_response.json()["max_tokens"] == 256
        assert status_response.json()["threads"] == 4
        assert status_response.json()["timeout_seconds"] == 90
        assert status_response.json()["reasoning_budget"] == 0
        invalid = client.get("/api/stats/not%20valid")
        assert invalid.status_code == 400


def test_leak_map_analysis_routes_validate_requests_and_jobs() -> None:
    with TestClient(app) as client:
        invalid = client.post("/api/leak-map/analyze", json={"username": "not valid"})
        assert invalid.status_code == 422
        missing = client.get("/api/leak-map/jobs/not-a-real-job")
        assert missing.status_code == 404


def test_chesscom_oauth_callback_is_reserved_without_claiming_authorization() -> None:
    with TestClient(app) as client:
        response = client.get("/api/oauth/chesscom/callback")

    assert response.status_code == 200
    assert response.json() == {
        "status": "pending_authorization",
        "detail": "Chess.com OAuth is not enabled. This callback is reserved for the requested integration.",
    }
    assert (
        settings.chesscom_oauth_callback_url
        == "https://jimmyapp-production.up.railway.app/api/oauth/chesscom/callback"
    )


@pytest.mark.parametrize(
    "host",
    ["thejimmyapp.com", "jimmyapp-production.up.railway.app", "service.railway.internal"],
)
def test_production_hosts_are_trusted(host: str) -> None:
    with TestClient(app) as client:
        assert client.get("/health", headers={"host": host}).status_code == 200


def test_unknown_host_is_rejected() -> None:
    with TestClient(app) as client:
        assert client.get("/health", headers={"host": "attacker.example"}).status_code == 400


@pytest.mark.parametrize(
    "origin",
    ["https://thejimmyapp.com", "https://jimmyapp-production.up.railway.app"],
)
def test_production_cors_origins_are_allowed(origin: str) -> None:
    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={"origin": origin, "access-control-request-method": "GET"},
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_unknown_cors_origin_is_not_allowed() -> None:
    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "origin": "https://attacker.example",
                "access-control-request-method": "GET",
            },
        )
    assert "access-control-allow-origin" not in response.headers


def test_room_websocket_rejects_unknown_browser_origin() -> None:
    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        joined = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Alex"}).json()
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(
                f"/ws/rooms/{room['id']}?client_id={joined['client_id']}&display_name=Alex",
                headers={"origin": "https://attacker.example"},
            ):
                pass
    assert exc_info.value.code == status.WS_1008_POLICY_VIOLATION


def test_room_websocket_accepts_custom_domain_origin() -> None:
    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        joined = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Alex"}).json()
        with client.websocket_connect(
            f"/ws/rooms/{room['id']}?client_id={joined['client_id']}&display_name=Alex",
            headers={"origin": "https://thejimmyapp.com"},
        ) as socket:
            assert socket.receive_json()["type"] == "room.snapshot"


def test_room_websocket_relays_versioned_event() -> None:
    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        joined = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Alex"}).json()
        with client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={joined['client_id']}&display_name=Alex") as socket:
            snapshot = socket.receive_json()
            assert snapshot["type"] == "room.snapshot"
            event = {
                "version": 1,
                "event_id": str(uuid4()),
                "room_id": room["id"],
                "sender_id": joined["client_id"],
                "timestamp": datetime.now(UTC).isoformat(),
                "type": "timeline.seek",
                "payload": {"global_ply": 12},
            }
            socket.send_json(event)
            assert receive_event_type(socket, "timeline.seek")["payload"]["global_ply"] == 12


def test_room_messages_keep_receipt_order_when_persistence_finishes_in_reverse(monkeypatch: pytest.MonkeyPatch) -> None:
    first_started = Event()
    release_first = Event()
    first_completed = Event()
    second_completed = Event()
    persistence_order: list[str] = []

    def persist_in_reverse(_: str, __: dict[str, object], content: str) -> None:
        if content == "first":
            first_started.set()
            assert release_first.wait(2)
            persistence_order.append(content)
            first_completed.set()
            return
        persistence_order.append(content)
        second_completed.set()

    monkeypatch.setattr(main_module, "_persist_room_chat_message", persist_in_reverse)

    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        senders = [
            client.post(f"/api/rooms/{room['id']}/join", json={"display_name": name}).json()
            for name in ("First", "Second", "Observer")
        ]
        with (
            client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={senders[0]['client_id']}&display_name=First") as first_socket,
            client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={senders[1]['client_id']}&display_name=Second") as second_socket,
            client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={senders[2]['client_id']}&display_name=Observer") as observer_socket,
        ):
            assert receive_event_type(first_socket, "room.snapshot")["type"] == "room.snapshot"
            assert receive_event_type(second_socket, "room.snapshot")["type"] == "room.snapshot"
            assert receive_event_type(observer_socket, "room.snapshot")["type"] == "room.snapshot"

            def chat_event(sender: dict[str, object], content: str) -> dict[str, object]:
                return {
                    "version": 1,
                    "event_id": str(uuid4()),
                    "room_id": room["id"],
                    "sender_id": sender["client_id"],
                    "timestamp": datetime.now(UTC).isoformat(),
                    "type": "chat.message",
                    "payload": {"id": str(uuid4()), "author": sender["display_name"], "content": content, "timestamp": datetime.now(UTC).isoformat()},
                }

            first_socket.send_json(chat_event(senders[0], "first"))
            assert first_started.wait(2)
            second_socket.send_json(chat_event(senders[1], "second"))
            assert second_completed.wait(2)

            observed: list[dict[str, object]] = []
            while not any(item["content"] == "second" for item in observed):
                observed.append(receive_event_type(observer_socket, "chat.message")["payload"])
            release_first.set()
            assert first_completed.wait(2)
            while len(observed) < 2:
                observed.append(receive_event_type(observer_socket, "chat.message")["payload"])

        late_joiner = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Late"}).json()
        with client.websocket_connect(
            f"/ws/rooms/{room['id']}?client_id={late_joiner['client_id']}&display_name=Late"
        ) as late_socket:
            initial_messages = receive_event_type(late_socket, "room.snapshot")["payload"]["messages"]
        snapshot_messages = client.get(f"/api/rooms/{room['id']}").json()["snapshot"]["messages"]

    assert persistence_order == ["second", "first"]
    assert [item["content"] for item in observed] == ["first", "second"]
    assert [item["content"] for item in initial_messages] == ["first", "second"]
    assert [item["content"] for item in snapshot_messages] == ["first", "second"]
    assert [item["sequence"] for item in observed] == sorted(item["sequence"] for item in observed)


def test_room_notes_use_id_as_a_stable_created_at_tie_breaker() -> None:
    created_at = datetime.now(UTC)
    id_prefix = str(uuid4())[:-1]
    later_id = f"{id_prefix}2"
    earlier_id = f"{id_prefix}1"
    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        with main_module.SessionLocal() as session:
            session.add_all(
                [
                    SharedNote(id=later_id, room_id=room["id"], author="Later UUID", content="second", created_at=created_at),
                    SharedNote(id=earlier_id, room_id=room["id"], author="Earlier UUID", content="first", created_at=created_at),
                ]
            )
            session.commit()

        notes = client.get(f"/api/rooms/{room['id']}/notes").json()

    assert [note["id"] for note in notes] == [earlier_id, later_id]


def test_room_websocket_persists_quest_deadline_for_invitees() -> None:
    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        joined = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Guest 1"}).json()
        deadline = 1_786_337_100_000
        with client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={joined['client_id']}&display_name=Guest%201") as socket:
            assert socket.receive_json()["type"] == "room.snapshot"
            event = {
                "version": 1,
                "event_id": str(uuid4()),
                "room_id": room["id"],
                "sender_id": joined["client_id"],
                "timestamp": datetime.now(UTC).isoformat(),
                "type": "quest.status",
                "payload": {"deadline": deadline, "completed": False},
            }
            socket.send_json(event)
            assert receive_event_type(socket, "quest.status")["payload"]["deadline"] == deadline

        state = client.get(f"/api/rooms/{room['id']}").json()
        assert state["snapshot"]["quest.status"]["payload"]["deadline"] == deadline


class DiskFullSession:
    def add(self, _: object) -> None:
        pass

    def commit(self) -> None:
        raise SQLAlchemyError("database or disk is full")

    def rollback(self) -> None:
        pass

    def get(self, *_: object) -> None:
        return None


def test_room_creation_falls_back_to_memory_when_sqlite_volume_is_full() -> None:
    def override_session():
        yield DiskFullSession()

    app.dependency_overrides[get_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.post("/api/rooms", json={"game_id": None})
            assert response.status_code == 200
            room = response.json()
            assert room["share_path"] == f"/?room={room['id']}"
            assert client.get(f"/api/rooms/{room['id']}").status_code == 200
            joined = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Alex"})
            assert joined.status_code == 200
    finally:
        app.dependency_overrides.pop(get_session, None)


def test_room_presence_tracks_joiners_and_leavers() -> None:
    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        leader = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Leader"}).json()
        guest = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Guest"}).json()
        with client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={leader['client_id']}&display_name=Leader") as leader_socket:
            snapshot = receive_event_type(leader_socket, "room.snapshot")
            assert snapshot["payload"]["presence"] == [{"client_id": leader["client_id"], "display_name": "Leader"}]
            with client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={guest['client_id']}&display_name=Guest") as guest_socket:
                guest_snapshot = receive_event_type(guest_socket, "room.snapshot")
                assert [item["display_name"] for item in guest_snapshot["payload"]["presence"]] == ["Leader", "Guest"]
                presence = receive_event_type(leader_socket, "presence.update")
                assert [item["display_name"] for item in presence["payload"]["participants"]] == ["Leader", "Guest"]
            presence = receive_event_type(leader_socket, "presence.update")
            assert [item["display_name"] for item in presence["payload"]["participants"]] == ["Leader"]


def test_room_shares_selected_game_and_latest_timeline_with_late_joiners() -> None:
    with TestClient(app) as client:
        room = client.post("/api/rooms", json={"game_id": None}).json()
        leader = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Leader"}).json()
        guest = client.post(f"/api/rooms/{room['id']}/join", json={"display_name": "Guest"}).json()
        with (
            client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={leader['client_id']}&display_name=Leader") as leader_socket,
            client.websocket_connect(f"/ws/rooms/{room['id']}?client_id={guest['client_id']}&display_name=Guest") as guest_socket,
        ):
            assert receive_event_type(leader_socket, "room.snapshot")["type"] == "room.snapshot"
            assert receive_event_type(guest_socket, "room.snapshot")["type"] == "room.snapshot"
            selected = {
                "version": 1,
                "event_id": str(uuid4()),
                "room_id": room["id"],
                "sender_id": leader["client_id"],
                "timestamp": datetime.now(UTC).isoformat(),
                "type": "game.select",
                "payload": {"game_id": 4242},
            }
            leader_socket.send_json(selected)
            assert receive_event_type(leader_socket, "game.select")["type"] == "game.select"
            assert receive_event_type(guest_socket, "game.select")["payload"]["game_id"] == 4242
            seek = {
                "version": 1,
                "event_id": str(uuid4()),
                "room_id": room["id"],
                "sender_id": leader["client_id"],
                "timestamp": datetime.now(UTC).isoformat(),
                "type": "timeline.seek",
                "payload": {"global_ply": 27},
            }
            leader_socket.send_json(seek)
            assert receive_event_type(leader_socket, "timeline.seek")["type"] == "timeline.seek"
            assert receive_event_type(guest_socket, "timeline.seek")["payload"]["global_ply"] == 27

        state = client.get(f"/api/rooms/{room['id']}").json()
        assert state["game_id"] == 4242
        assert state["snapshot"]["room"]["game_id"] == 4242
        assert state["snapshot"]["game.select"]["payload"]["game_id"] == 4242
        assert state["snapshot"]["timeline.seek"]["payload"]["global_ply"] == 27


def test_exploration_accepts_legal_move_and_rejects_illegal_arrow() -> None:
    start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1"
    with TestClient(app) as client:
        legal = client.post(
            "/api/exploration/move",
            json={"board_a_fen": start, "board_b_fen": start, "board": "A", "from_square": "e2", "to_square": "e4"},
        )
        assert legal.status_code == 200
        assert legal.json()["legal"] is True
        illegal = client.post(
            "/api/exploration/move",
            json={"board_a_fen": start, "board_b_fen": start, "board": "A", "from_square": "e2", "to_square": "e5", "dry_run": True},
        )
        assert illegal.json()["legal"] is False
        assert "e4" in illegal.json()["legal_destinations"]


def test_exploration_capture_transfers_piece_to_partner_pocket() -> None:
    board_a = "4k3/8/8/8/3p4/4P3/8/4K3[] w - - 0 1"
    board_b = "4k3/8/8/8/8/8/8/4K3[] w - - 0 1"
    with TestClient(app) as client:
        response = client.post(
            "/api/exploration/move",
            json={"board_a_fen": board_a, "board_b_fen": board_b, "board": "A", "from_square": "e3", "to_square": "d4"},
        )
    assert response.json()["legal"] is True
    assert response.json()["capture_transferred"] is True
    assert response.json()["board_b"]["black_pocket"] == "p"


def test_exploration_works_when_partner_board_is_unavailable() -> None:
    start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1"
    with TestClient(app) as client:
        response = client.post(
            "/api/exploration/move",
            json={"board_a_fen": start, "board": "A", "from_square": "g1", "to_square": "f3"},
        )
    payload = response.json()
    assert payload["legal"] is True
    assert payload["board_a"]["to_square"] == "f3"
    assert payload["board_b"] is None


def test_exploration_accepts_a_legal_pocket_drop() -> None:
    board_a = "4k3/8/8/8/8/8/8/4K3[N] w - - 0 1"
    with TestClient(app) as client:
        response = client.post(
            "/api/exploration/move",
            json={"board_a_fen": board_a, "board": "A", "to_square": "f7", "drop_piece": "N"},
        )
    payload = response.json()
    assert payload["legal"] is True
    assert payload["notation"].startswith("N@f7")
    assert payload["board_a"]["board"][1][5] == "N"


def test_exploration_lists_legal_targets_for_piece_selection() -> None:
    start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1"
    with TestClient(app) as client:
        response = client.post(
            "/api/exploration/move",
            json={"board_a_fen": start, "board": "A", "from_square": "g1", "to_square": "g1", "dry_run": True},
        )
    payload = response.json()
    assert payload["legal"] is False
    assert payload["legal_destinations"] == ["f3", "h3"]


def test_authenticated_session_connector_enriches_without_storing_credentials() -> None:
    curl_text = (
        "curl 'https://www.chess.com/callback/game/pgn-info' "
        "-H 'content-type: application/json' "
        "-b 'session=fake' "
        "--data-raw '{\"_token\":\"fake\"}'"
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/chesscom/enrich",
            json={"username": "fixture-user", "curl_text": curl_text, "limit": 10},
        )
        openapi = client.get("/openapi.json").json()
        paths = openapi["paths"]
        schemas = openapi["components"]["schemas"]

    assert response.status_code == 200
    assert response.json() == {
        "checked": 0,
        "enriched": 0,
        "remaining_without_second_board": 0,
        "credentials_stored": False,
    }
    assert "/api/chesscom/enrich" in paths
    assert "ChessComEnrichRequest" in schemas


def test_engine_and_coach_contracts_reject_client_position_authority() -> None:
    with TestClient(app) as client:
        openapi = client.get("/openapi.json").json()
        analysis_fields = openapi["components"]["schemas"]["AnalysisRequest"]["properties"]
        coach_fields = openapi["components"]["schemas"]["CoachPrepareRequest"]["properties"]
        analysis = client.post(
            "/api/analysis",
            json={
                "game_id": 1,
                "global_ply": 0,
                "board": "A",
                "variant_fen": "client-controlled-position",
            },
        )
        coach = client.post(
            "/api/coach/analyze",
            json={
                "game_id": 1,
                "global_ply": 0,
                "question": "What should our team play?",
                "board_a": {"variant_fen": "client-controlled-position"},
            },
        )

    assert not {"variant_fen", "board_a_fen", "board_b_fen"} & analysis_fields.keys()
    assert not {"board_a", "board_b", "engine_suggestions"} & coach_fields.keys()
    assert analysis.status_code == 422
    assert coach.status_code == 422
