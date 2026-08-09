import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/guest-match-replays.json";
import {
  decoderTablesForTest,
  decodeMoveList,
  MatchReconstructionError,
  MoveListDecodeError,
  reconstructGuestMatch,
} from "./bughouseDecoder";
import type { CallbackReplayBoard, GuestMatchReplaySource, NormalizedMatch } from "./types";

const squareSymbol = (square: string) => {
  const index = "abcdefgh".indexOf(square[0]) + (Number(square[1]) - 1) * 8;
  return decoderTablesForTest.squareSymbols[index];
};

const encodedMove = (from: string, to: string) => `${squareSymbol(from)}${squareSymbol(to)}`;

const boardSource = (overrides: Partial<CallbackReplayBoard> & Pick<CallbackReplayBoard, "uuid" | "partnerGameId">): CallbackReplayBoard => {
  const moveList = overrides.moveList ?? "";
  const plyCount = moveList.length / 2;
  return {
    id: overrides.id ?? 1,
    uuid: overrides.uuid,
    partnerGameId: overrides.partnerGameId,
    moveList,
    moveTimestamps: overrides.moveTimestamps ?? Array.from({ length: plyCount }, (_, index) => String(1799 - index)).join(","),
    plyCount: overrides.plyCount ?? plyCount,
    baseTime1: overrides.baseTime1 ?? 1800,
    timeIncrement1: overrides.timeIncrement1 ?? 0,
    initialFen: overrides.initialFen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    headers: overrides.headers ?? {},
  };
};

const normalizedMatch = (a: CallbackReplayBoard, b: CallbackReplayBoard): NormalizedMatch => ({
  game_ids: { A: a.id, B: b.id },
  seats: {
    "A-white": { name: String(a.headers.White ?? "A White"), rating: Number(a.headers.WhiteElo ?? 2000) },
    "A-black": { name: String(a.headers.Black ?? "A Black"), rating: Number(a.headers.BlackElo ?? 1900) },
    "B-white": { name: String(b.headers.White ?? "B White"), rating: Number(b.headers.WhiteElo ?? 1800) },
    "B-black": { name: String(b.headers.Black ?? "B Black"), rating: Number(b.headers.BlackElo ?? 1700) },
  },
  ply_counts: { A: a.plyCount, B: b.plyCount },
  decisive_board: "A",
  loser_seat: "A-black",
  action: "checkmated",
  highest_rated: { name: "A White", rating: 2000, seat: "A-white", outcome: "WON" },
  loser_relative_to_highest: "oppo",
});

const replaySource = (a: CallbackReplayBoard, b: CallbackReplayBoard): GuestMatchReplaySource => ({
  match: normalizedMatch(a, b),
  boards: { A: a, B: b },
});

describe("clean-room callback moveList decoder", () => {
  it("decodes all five drop symbols to P@square-style moves", () => {
    const moves = decodeMoveList("&a-a*a+a=a", 5);
    expect(moves.map((move) => [move.dropPiece, move.to])).toEqual([
      ["Q", "a1"], ["N", "a1"], ["R", "a1"], ["B", "a1"], ["P", "a1"],
    ]);
  });

  it("covers the complete 12-symbol promotion table", () => {
    const encoded = [...decoderTablesForTest.promotionSymbols].map((symbol) => `${squareSymbol("d7")}${symbol}`).join("");
    const moves = decodeMoveList(encoded, 12);
    expect(moves.map((move) => `${move.to}=${move.promotion}`)).toEqual([
      "c8=Q", "d8=Q", "e8=Q",
      "c8=N", "d8=N", "e8=N",
      "c8=R", "d8=R", "e8=R",
      "c8=B", "d8=B", "e8=B",
    ]);
  });

  it("fails closed with a typed error for unknown and truncated symbols", () => {
    expect(() => decodeMoveList(">a")).toThrowError(MoveListDecodeError);
    try {
      decodeMoveList("a>");
      throw new Error("decoder accepted an unknown target");
    } catch (error) {
      expect(error).toBeInstanceOf(MoveListDecodeError);
      expect((error as MoveListDecodeError).code).toBe("unknown_symbol");
      expect((error as MoveListDecodeError).symbol).toBe(">");
    }
    expect(() => decodeMoveList("a")).toThrowError(MoveListDecodeError);
  });

  it("replays castling and en passant without special-case input notation", () => {
    const uuidA = "00000000-0000-4000-8000-000000000001";
    const uuidB = "00000000-0000-4000-8000-000000000002";
    const movesA = [
      encodedMove("e2", "e4"), encodedMove("a7", "a6"), encodedMove("e4", "e5"),
      encodedMove("d7", "d5"), encodedMove("e5", "d6"), encodedMove("g8", "f6"),
      encodedMove("g1", "f3"), encodedMove("e7", "e6"), encodedMove("f1", "e2"),
      encodedMove("f8", "e7"), encodedMove("e1", "g1"),
    ].join("");
    const a = boardSource({ id: 11, uuid: uuidA, partnerGameId: uuidB, moveList: movesA });
    const b = boardSource({ id: 12, uuid: uuidB, partnerGameId: uuidA });
    const result = reconstructGuestMatch(replaySource(a, b));
    expect(result.finalFens.A.split(" ")[0]).toBe("rnbqk2r/1pp1bppp/p2Ppn2/8/8/5N2/PPPPBPPP/RNBQ1RK1");
  });

  it("returns a captured promoted piece to the partner pocket as a pawn", () => {
    const uuidA = "00000000-0000-4000-8000-000000000003";
    const uuidB = "00000000-0000-4000-8000-000000000004";
    const promoteQueenLeft = `${squareSymbol("d7")}{`;
    const a = boardSource({
      id: 21,
      uuid: uuidA,
      partnerGameId: uuidB,
      initialFen: "2rk4/3P4/8/8/8/8/8/7K w - - 0 1",
      moveList: `${promoteQueenLeft}${encodedMove("d8", "c8")}`,
      moveTimestamps: "1799,1798",
    });
    const b = boardSource({
      id: 22,
      uuid: uuidB,
      partnerGameId: uuidA,
      initialFen: "7k/8/8/8/8/8/8/7K w - - 0 1",
      moveList: `=${squareSymbol("a2")}`,
      moveTimestamps: "1797",
    });
    const result = reconstructGuestMatch(replaySource(a, b));
    const last = result.game.timeline.at(-1);
    expect(last?.board_b.board[6][0]).toBe("P");
    expect(last?.board_b.white_pocket).toBe("-");
  });

  it("refuses a drop when the inferred event stream has no matching pocket piece", () => {
    const uuidA = "00000000-0000-4000-8000-000000000005";
    const uuidB = "00000000-0000-4000-8000-000000000006";
    const a = boardSource({ id: 31, uuid: uuidA, partnerGameId: uuidB });
    const b = boardSource({ id: 32, uuid: uuidB, partnerGameId: uuidA, moveList: `-${squareSymbol("d4")}` });
    expect(() => reconstructGuestMatch(replaySource(a, b))).toThrowError(MatchReconstructionError);
  });
});

describe("five-match callback fixture validation", () => {
  it("matches all 10 public API final FENs and declared ply counts", () => {
    let passedBoards = 0;
    for (const fixture of fixtures.matches) {
      const a = fixture.boards.A as CallbackReplayBoard & { expectedFinalFen: string };
      const b = fixture.boards.B as CallbackReplayBoard & { expectedFinalFen: string };
      expect(decodeMoveList(a.moveList, a.plyCount)).toHaveLength(a.plyCount);
      expect(decodeMoveList(b.moveList, b.plyCount)).toHaveLength(b.plyCount);
      const result = reconstructGuestMatch(replaySource(a, b));
      for (const board of ["A", "B"] as const) {
        const callback = board === "A" ? a : b;
        expect(result.finalFens[board], `match ${a.id}, board ${board}`).toBe(callback.expectedFinalFen);
        passedBoards += 1;
        console.info(`PASS ${passedBoards}/10 · match ${a.id} · board ${board} · ${callback.plyCount} plies`);
      }
      expect(result.game.positions_a).toHaveLength(a.plyCount + 1);
      expect(result.game.positions_b).toHaveLength(b.plyCount + 1);
      expect(result.game.timeline).toHaveLength(a.plyCount + b.plyCount + 1);
      expect(result.game.cross_board_ordering).toEqual({ method: "clock-inferred", exact: false });
    }
    expect(passedBoards).toBe(10);
    console.info("VALIDATION COMPLETE · 10/10 boards passed");
  });
});
