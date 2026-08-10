from __future__ import annotations

import asyncio
from collections import defaultdict, deque
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

    async def publish(self, room_id: str, event: dict[str, Any]) -> None:
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
            messages = self.snapshots[room_id].setdefault("messages", [])
            if isinstance(messages, list):
                messages.append(event.get("payload", {}))
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
