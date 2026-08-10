import { describe, expect, it } from "vitest";
import { captureMomentContext, matchForSavedMoment, playerNamesForMoment, savedMomentFromCapture } from "./learningMoments";
import type { GamePayload, NormalizedMatch, ReplayPosition } from "./types";

const position: ReplayPosition = {
  ply: 0,
  label: "Start",
  board: [],
  side_to_move: "White",
  variant_fen: "",
  white_pocket: "-",
  black_pocket: "-",
  white_clock: "3:00",
  black_clock: "3:00",
  partner_index: 0,
  from_square: null,
  to_square: null,
};

const match: NormalizedMatch = {
  game_ids: { A: 101, B: 102 },
  seats: {
    "A-white": { name: "Alpha", rating: 2200 },
    "A-black": { name: "Beta", rating: 2100 },
    "B-white": { name: "Gamma", rating: 2000 },
    "B-black": { name: "Delta", rating: 1900 },
  },
  ply_counts: { A: 20, B: 20 },
  decisive_board: "A",
  loser_seat: "A-black",
  action: "checkmated",
  highest_rated: { name: "Alpha", rating: 2200, seat: "A-white", outcome: "WON" },
  loser_relative_to_highest: "oppo",
};

const game: GamePayload = {
  game: { id: 101, played_at: "", result: "win", opponent: "Beta", opponent_rating: 2100, partner: "Delta", user_color: "white", time_control: "180" },
  players: { board_a_white: "Alpha", board_a_black: "Beta", board_b_white: "Gamma", board_b_black: "Delta" },
  moves_a: [],
  moves_b: [],
  positions_a: [position],
  positions_b: [position],
  timeline: [
    { global_ply: 0, board: "A", local_ply: 0, move: "Start", board_a: position, board_b: position },
    { global_ply: 1, board: "B", local_ply: 1, move: "e4", board_a: position, board_b: position },
    { global_ply: 2, board: "A", local_ply: 2, move: "N@h6", board_a: position, board_b: position },
  ],
  second_board_available: true,
  limitations: [],
  outcome: { summary: "", detail: "", loser_username: null, termination: null, board: null, board_role: null, move_number: null },
};

describe("learning moment capture", () => {
  it("captures the staged board plus the producing move and seat", () => {
    expect(captureMomentContext(match, game, 0, "A")).toBeNull();
    const capture = captureMomentContext(match, game, 2, "B");
    expect(capture).toEqual({ matchIds: { A: 101, B: 102 }, ply: 2, boardId: "B", move: "N@h6", seat: "A-black" });
    expect(savedMomentFromCapture(capture!, "!?", "  keeps the diagonal closed  ", "2026-08-10T00:00:00.000Z")).toEqual({
      ...capture,
      glyph: "!?",
      note: "keeps the diagonal closed",
      savedAt: "2026-08-10T00:00:00.000Z",
    });
  });

  it("resolves saved match ids and renders all four player names", () => {
    const saved = savedMomentFromCapture(captureMomentContext(match, game, 1, "A")!, "!", "timing");
    expect(matchForSavedMoment([match], saved)).toBe(match);
    expect(playerNamesForMoment(match)).toBe("Alpha · Beta · Gamma · Delta");
  });
});
