import { create } from "zustand";
import type { Annotation, BoardId, ChatItem, ExplorationPair, GamePayload, GameSummary, NormalizedMatch, ReplayPosition, RoomParticipant } from "./types";

interface CoachState {
  username: string;
  games: GameSummary[];
  game: GamePayload | null;
  guestMatch: NormalizedMatch | null;
  globalPly: number;
  mode: "review" | "exploration";
  explorationStartPly: number | null;
  explorationPositions: ExplorationPair | null;
  explorationHistory: ExplorationPair[];
  explorationFuture: ExplorationPair[];
  variationMoves: string[];
  variationFutureMoves: string[];
  roomId: string | null;
  clientId: string;
  displayName: string;
  participants: RoomParticipant[];
  followPartner: boolean;
  annotations: Annotation[];
  messages: ChatItem[];
  setUsername: (username: string) => void;
  setGames: (games: GameSummary[]) => void;
  setGame: (game: GamePayload | null) => void;
  setGuestMatch: (match: NormalizedMatch | null) => void;
  seek: (ply: number) => void;
  applyExploration: (boardA: ReplayPosition, boardB: ReplayPosition | null, notation: string) => void;
  undoExploration: () => void;
  redoExploration: () => void;
  returnToGame: () => void;
  setRoom: (roomId: string, clientId: string, displayName: string) => void;
  setParticipants: (participants: RoomParticipant[]) => void;
  toggleFollow: () => void;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  addMessage: (message: ChatItem) => void;
}

export const useCoachStore = create<CoachState>((set) => ({
  username: localStorage.getItem("bughouse.username") ?? "",
  games: [],
  game: null,
  guestMatch: null,
  globalPly: 0,
  mode: "review",
  explorationStartPly: null,
  explorationPositions: null,
  explorationHistory: [],
  explorationFuture: [],
  variationMoves: [],
  variationFutureMoves: [],
  roomId: new URLSearchParams(location.search).get("room"),
  clientId: crypto.randomUUID(),
  displayName: "Coach",
  participants: [],
  followPartner: true,
  annotations: [],
  messages: [],
  setUsername: (username) => {
    localStorage.setItem("bughouse.username", username);
    set({ username });
  },
  setGames: (games) => set({ games }),
  setGame: (game) => set({ game, guestMatch: null, globalPly: 0, mode: "review", explorationStartPly: null, explorationPositions: null, explorationHistory: [], explorationFuture: [], variationMoves: [], variationFutureMoves: [] }),
  setGuestMatch: (guestMatch) => set({ guestMatch, game: null, globalPly: 0, mode: "review", explorationStartPly: null, explorationPositions: null, explorationHistory: [], explorationFuture: [], variationMoves: [], variationFutureMoves: [] }),
  seek: (globalPly) => set({ globalPly, mode: "review", explorationStartPly: null, explorationPositions: null, explorationHistory: [], explorationFuture: [], variationMoves: [], variationFutureMoves: [] }),
  applyExploration: (boardA, boardB, notation) => set((state) => ({
    mode: "exploration",
    explorationStartPly: state.explorationStartPly ?? state.globalPly,
    explorationHistory: state.explorationPositions ? [...state.explorationHistory, state.explorationPositions] : state.explorationHistory,
    explorationPositions: { boardA, boardB },
    explorationFuture: [],
    variationMoves: [...state.variationMoves, notation],
    variationFutureMoves: [],
  })),
  undoExploration: () => set((state) => {
    if (!state.explorationHistory.length) {
      return {
        mode: "review",
        explorationPositions: null,
        explorationFuture: state.explorationPositions ? [state.explorationPositions, ...state.explorationFuture] : state.explorationFuture,
        variationFutureMoves: state.variationMoves.length ? [state.variationMoves[state.variationMoves.length - 1], ...state.variationFutureMoves] : state.variationFutureMoves,
        variationMoves: [],
      };
    }
    const previous = state.explorationHistory[state.explorationHistory.length - 1];
    return {
      explorationPositions: previous,
      explorationHistory: state.explorationHistory.slice(0, -1),
      explorationFuture: state.explorationPositions ? [state.explorationPositions, ...state.explorationFuture] : state.explorationFuture,
      variationFutureMoves: state.variationMoves.length ? [state.variationMoves[state.variationMoves.length - 1], ...state.variationFutureMoves] : state.variationFutureMoves,
      variationMoves: state.variationMoves.slice(0, -1),
    };
  }),
  redoExploration: () => set((state) => {
    if (!state.explorationFuture.length) return {};
    const next = state.explorationFuture[0];
    const notation = state.variationFutureMoves[0];
    return {
      mode: "exploration",
      explorationPositions: next,
      explorationHistory: state.explorationPositions ? [...state.explorationHistory, state.explorationPositions] : state.explorationHistory,
      explorationFuture: state.explorationFuture.slice(1),
      variationMoves: notation ? [...state.variationMoves, notation] : state.variationMoves,
      variationFutureMoves: state.variationFutureMoves.slice(1),
    };
  }),
  returnToGame: () => set({ mode: "review", explorationStartPly: null, explorationPositions: null, explorationHistory: [], explorationFuture: [], variationMoves: [], variationFutureMoves: [] }),
  setRoom: (roomId, clientId, displayName) => set({ roomId, clientId, displayName }),
  setParticipants: (participants) => set({ participants }),
  toggleFollow: () => set((state) => ({ followPartner: !state.followPartner })),
  addAnnotation: (annotation) => set((state) => ({ annotations: [...state.annotations.filter((item) => item.id !== annotation.id), annotation] })),
  removeAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter((item) => item.id !== id) })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages.filter((item) => item.id !== message.id), message] })),
}));

export const currentPosition = (game: GamePayload | null, ply: number, board: BoardId) => {
  if (!game) return null;
  if (game.timeline.length) {
    const frame = game.timeline[Math.min(ply, game.timeline.length - 1)];
    return board === "A" ? frame.board_a : frame.board_b;
  }
  const main = game.positions_a[Math.min(ply, game.positions_a.length - 1)] ?? null;
  if (board === "A") return main;
  return main?.partner_index == null ? null : game.positions_b[main.partner_index] ?? null;
};
