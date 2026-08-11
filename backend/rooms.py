from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from itertools import count
from typing import Any
from uuid import uuid4

from fastapi import WebSocket


class RoomHub:
    def __init__(self) -> None:
        self.connections: dict[str, dict[str, WebSocket]] = defaultdict(dict)
        self.participants: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
        self.snapshots: dict[str, dict[str, Any]] = defaultdict(dict)
        self.seen_events: dict[str, deque[str]] = defaultdict(lambda: deque(maxlen=1000))
        self.lock = asyncio.Lock()
        self.publish_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self.message_sequence = count(1)

    async def connect(self, room_id: str, client_id: str, websocket: WebSocket, display_name: str) -> None:
        await websocket.accept()
        async with self.lock:
            self.connections[room_id][client_id] = websocket
            self.participants[room_id][client_id] = {"client_id": client_id, "display_name": display_name}
            self.snapshots[room_id]["presence"] = self.presence(room_id)

    async def disconnect(self, room_id: str, client_id: str) -> None:
        async with self.lock:
            self.connections[room_id].pop(client_id, None)
            self.participants[room_id].pop(client_id, None)
            self.snapshots[room_id]["presence"] = self.presence(room_id)

    def presence(self, room_id: str) -> list[dict[str, str]]:
        return list(self.participants[room_id].values())

    def set_room_game(self, room_id: str, game_id: int | None) -> None:
        self.snapshots[room_id]["room"] = {"game_id": game_id}

    def has_room(self, room_id: str) -> bool:
        return "room" in self.snapshots.get(room_id, {})

    def snapshot(self, room_id: str) -> dict[str, Any]:
        snapshot = dict(self.snapshots.get(room_id, {}))
        messages = snapshot.get("messages")
        if isinstance(messages, list):
            snapshot["messages"] = sorted(messages, key=_message_sequence)
        return snapshot

    def sequence_chat_message(self, room_id: str, event: dict[str, Any]) -> dict[str, Any]:
        payload = event.get("payload")
        sequenced_payload = dict(payload) if isinstance(payload, dict) else {}
        sequenced_payload["sequence"] = next(self.message_sequence)
        sequenced_event = {**event, "payload": sequenced_payload}
        self._store_message(room_id, sequenced_payload)
        return sequenced_event

    def _store_message(self, room_id: str, message: object) -> None:
        messages = self.snapshots[room_id].setdefault("messages", [])
        if not isinstance(messages, list):
            return
        message_id = str(message.get("id") or "") if isinstance(message, dict) else ""
        messages[:] = sorted(
            [item for item in messages if not message_id or str(item.get("id") or "") != message_id] + [message],
            key=_message_sequence,
        )

    async def publish(self, room_id: str, event: dict[str, Any]) -> None:
        async with self.publish_locks[room_id]:
            event_id = str(event.get("event_id") or "")
            if event_id in self.seen_events[room_id]:
                return
            self.seen_events[room_id].append(event_id)
            event_type = str(event.get("type") or "")
            if event_type in {"game.select", "timeline.seek", "variation.create", "variation.update", "variation.return_to_game", "quest.status"}:
                self.snapshots[room_id][event_type] = event
            elif event_type == "annotation.create":
                annotations = self.snapshots[room_id].setdefault("annotations", [])
                if isinstance(annotations, list):
                    annotations.append(event.get("payload", {}))
            elif event_type == "annotation.delete":
                annotation_id = str(event.get("payload", {}).get("id") or "")
                annotations = self.snapshots[room_id].get("annotations", [])
                if isinstance(annotations, list):
                    self.snapshots[room_id]["annotations"] = [item for item in annotations if str(item.get("id")) != annotation_id]
            elif event_type == "chat.message":
                self._store_message(room_id, event.get("payload", {}))
            stale: list[str] = []
            for client_id, socket in list(self.connections[room_id].items()):
                try:
                    await socket.send_json(event)
                except Exception:
                    stale.append(client_id)
            for client_id in stale:
                await self.disconnect(room_id, client_id)

    async def broadcast_presence(self, room_id: str, exclude_client_id: str | None = None) -> None:
        if exclude_client_id:
            event = {
                "version": 1,
                "event_id": str(uuid4()),
                "room_id": room_id,
                "sender_id": "server",
                "type": "presence.update",
                "payload": {"participants": self.presence(room_id)},
            }
            for client_id, socket in list(self.connections[room_id].items()):
                if client_id == exclude_client_id:
                    continue
                try:
                    await socket.send_json(event)
                except Exception:
                    await self.disconnect(room_id, client_id)
            return
        await self.publish(
            room_id,
            {
                "version": 1,
                "event_id": str(uuid4()),
                "room_id": room_id,
                "sender_id": "server",
                "type": "presence.update",
                "payload": {"participants": self.presence(room_id)},
            },
        )


room_hub = RoomHub()


def _message_sequence(message: object) -> int:
    if not isinstance(message, dict):
        return 2**63 - 1
    sequence = message.get("sequence")
    return sequence if isinstance(sequence, int) and not isinstance(sequence, bool) else 2**63 - 1
