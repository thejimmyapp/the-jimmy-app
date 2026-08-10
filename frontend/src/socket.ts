import { api } from "./api";
import { useCoachStore } from "./store";
import type { Annotation, ChatItem, ReplayPosition, RoomEventPayload, RoomParticipant, RoomSnapshot } from "./types";

let socket: WebSocket | null = null;

const eventTime = (event?: RoomEventPayload) => Date.parse(event?.timestamp ?? "") || 0;

const latestEvent = (snapshot: RoomSnapshot, types: Array<keyof RoomSnapshot>) =>
  types
    .map((type) => snapshot[type])
    .filter((event): event is RoomEventPayload => Boolean(event && "type" in event))
    .sort((left, right) => eventTime(right) - eventTime(left))[0];

const loadSharedGame = async (gameId: unknown) => {
  const id = Number(gameId);
  if (!Number.isInteger(id) || id <= 0) return;
  const store = useCoachStore.getState();
  if (store.game?.game.id === id) return;
  const plyBeforeLoad = store.globalPly;
  const game = await api.game(id);
  const plyAfterLoad = useCoachStore.getState().globalPly;
  useCoachStore.getState().setGame(game);
  if (plyAfterLoad !== plyBeforeLoad) {
    const max = Math.max(0, game.timeline.length ? game.timeline.length - 1 : game.positions_a.length - 1);
    useCoachStore.getState().seek(Math.max(0, Math.min(max, plyAfterLoad)));
  }
};

const applySeek = (event?: RoomEventPayload) => {
  if (!event) return;
  const ply = Number(event.payload?.global_ply ?? 0);
  if (!Number.isFinite(ply)) return;
  const store = useCoachStore.getState();
  if (store.followPartner) store.seek(Math.max(0, ply));
};

const applyVariation = (event?: RoomEventPayload) => {
  if (!event) return;
  const store = useCoachStore.getState();
  if (event.type === "variation.return_to_game") {
    store.returnToGame();
    return;
  }
  const boardA = event.payload?.board_a;
  const boardB = event.payload?.board_b;
  const startPly = Number(event.payload?.start_ply);
  if (Number.isFinite(startPly) && store.globalPly !== startPly) store.seek(Math.max(0, startPly));
  if (boardA) {
    useCoachStore
      .getState()
      .applyExploration(boardA as unknown as ReplayPosition, boardB ? boardB as unknown as ReplayPosition : null, String(event.payload?.notation ?? "move"));
  }
};

const applyQuestStatus = (event?: RoomEventPayload) => {
  const deadline = Number(event?.payload?.deadline);
  useCoachStore.getState().setRoomQuestDeadline(Number.isSafeInteger(deadline) && deadline > 0 ? deadline : null);
};

export const applyRoomSnapshot = async (snapshot: RoomSnapshot, fallbackGameId?: number | null) => {
  await loadSharedGame(snapshot["game.select"]?.payload?.game_id ?? snapshot.room?.game_id ?? fallbackGameId);
  applySeek(snapshot["timeline.seek"]);
  applyVariation(latestEvent(snapshot, ["variation.create", "variation.update", "variation.return_to_game"]));
  applyQuestStatus(snapshot["quest.status"]);
  useCoachStore.getState().setParticipants(snapshot.presence ?? []);
  snapshot.annotations?.forEach((item) => useCoachStore.getState().addAnnotation(item));
  snapshot.messages?.forEach((item) => useCoachStore.getState().addMessage(item));
};

export const connectRoomSocket = (roomId: string, clientId: string, displayName = "Guest") => {
  socket?.close();
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/ws/rooms/${roomId}?client_id=${encodeURIComponent(clientId)}&display_name=${encodeURIComponent(displayName)}`);
  socket.onmessage = (message) => {
    const event = JSON.parse(message.data) as { type: string; sender_id?: string; payload?: Record<string, unknown> };
    const store = useCoachStore.getState();
    if (event.sender_id === store.clientId) return;
    if (event.type === "room.snapshot") {
      void applyRoomSnapshot((event.payload ?? {}) as RoomSnapshot);
      return;
    }
    if (event.type === "game.select") void loadSharedGame(event.payload?.game_id);
    if (event.type === "timeline.seek" && store.followPartner) store.seek(Number(event.payload?.global_ply ?? 0));
    if (event.type === "presence.update") store.setParticipants((event.payload?.participants ?? []) as RoomParticipant[]);
    if (event.type === "annotation.create") store.addAnnotation(event.payload as unknown as Annotation);
    if (event.type === "annotation.delete") store.removeAnnotation(String(event.payload?.id ?? ""));
    if (event.type === "chat.message") {
      const chatItem = event.payload as unknown as ChatItem;
      store.addMessage(chatItem);
      window.dispatchEvent(new CustomEvent("thejimmyapp:chat-message", { detail: chatItem }));
    }
    if (event.type === "quest.status") applyQuestStatus({ type: event.type, payload: event.payload });
    if (event.type === "variation.create" || event.type === "variation.update") {
      const boardA = event.payload?.board_a;
      const boardB = event.payload?.board_b;
      if (boardA) store.applyExploration(boardA as unknown as ReplayPosition, boardB ? boardB as unknown as ReplayPosition : null, String(event.payload?.notation ?? "move"));
    }
    if (event.type === "variation.return_to_game") store.returnToGame();
  };
  return socket;
};

export const disconnectRoomSocket = () => {
  socket?.close();
  socket = null;
};

export const sendRoomEvent = (type: string, payload: Record<string, unknown>) => {
  const { roomId, clientId } = useCoachStore.getState();
  if (!roomId || socket?.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      version: 1,
      event_id: crypto.randomUUID(),
      room_id: roomId,
      sender_id: clientId,
      timestamp: new Date().toISOString(),
      type,
      payload,
    }),
  );
};
