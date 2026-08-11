import { beforeEach, describe, expect, it } from "vitest";
import { useCoachStore } from "./store";

describe("coach store", () => {
  beforeEach(() => useCoachStore.setState({ globalPly: 0, mode: "review", explorationPositions: null, explorationHistory: [], explorationFuture: [], variationMoves: [], variationFutureMoves: [], annotations: [], messages: [] }));

  it("separates exploration from the official game", () => {
    const position = { ply: 0, label: "", board: [], side_to_move: "White", variant_fen: "", white_pocket: "-", black_pocket: "-", white_clock: "-", black_clock: "-", partner_index: 0, from_square: null, to_square: null };
    useCoachStore.getState().seek(12);
    useCoachStore.getState().applyExploration(position, position, "e4");
    expect(useCoachStore.getState().mode).toBe("exploration");
    expect(useCoachStore.getState().explorationStartPly).toBe(12);
    expect(useCoachStore.getState().globalPly).toBe(12);
    useCoachStore.getState().returnToGame();
    expect(useCoachStore.getState().mode).toBe("review");
    expect(useCoachStore.getState().globalPly).toBe(12);
  });

  it("stores position-scoped annotations", () => {
    useCoachStore.getState().addAnnotation({ id: "one", board: "A", ply: 3, author: "Alex", color: "cyan", type: "highlight", from: "f7" });
    expect(useCoachStore.getState().annotations[0].ply).toBe(3);
  });

  it("orders room messages by their server receipt sequence", () => {
    useCoachStore.getState().addMessage({ id: "second", author: "B", content: "second", timestamp: "2026-08-11T00:00:00Z", sequence: 2 });
    useCoachStore.getState().addMessage({ id: "first", author: "A", content: "first", timestamp: "2026-08-11T00:00:01Z", sequence: 1 });
    expect(useCoachStore.getState().messages.map((message) => message.content)).toEqual(["first", "second"]);
  });

  it("undoes and redoes an exploration without changing the official ply", () => {
    const first = { ply: 0, label: "first", board: [], side_to_move: "White", variant_fen: "first", white_pocket: "-", black_pocket: "-", white_clock: "-", black_clock: "-", partner_index: null, from_square: null, to_square: null };
    const second = { ...first, label: "second", variant_fen: "second" };
    useCoachStore.getState().seek(9);
    useCoachStore.getState().applyExploration(first, null, "e4");
    useCoachStore.getState().applyExploration(second, null, "e5");
    useCoachStore.getState().undoExploration();
    expect(useCoachStore.getState().explorationPositions?.boardA.label).toBe("first");
    useCoachStore.getState().undoExploration();
    expect(useCoachStore.getState().mode).toBe("review");
    useCoachStore.getState().redoExploration();
    useCoachStore.getState().redoExploration();
    expect(useCoachStore.getState().explorationPositions?.boardA.label).toBe("second");
    expect(useCoachStore.getState().variationMoves).toEqual(["e4", "e5"]);
    expect(useCoachStore.getState().globalPly).toBe(9);
  });
});
