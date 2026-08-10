import { describe, expect, it } from "vitest";
import { guestBoardPresentation, sourceBoardForDisplay } from "./guestBoardPresentation";
import type { NormalizedMatch } from "./types";

const match = (seat: NormalizedMatch["highest_rated"]["seat"]): NormalizedMatch => ({
  game_ids: { A: 1, B: 2 },
  seats: {
    "A-white": { name: "A white", rating: 1 },
    "A-black": { name: "A black", rating: 2 },
    "B-white": { name: "B white", rating: 3 },
    "B-black": { name: "B black", rating: 4 },
  },
  ply_counts: { A: 20, B: 20 },
  decisive_board: "B",
  loser_seat: "B-black",
  action: "checkmated",
  highest_rated: { name: seat, rating: 4, seat, outcome: "LOST" },
  loser_relative_to_highest: "partner",
});

describe("guest board presentation", () => {
  it("promotes original Board B to display Board A and preserves featured color orientation", () => {
    expect(guestBoardPresentation(match("B-white"))).toEqual({
      primarySourceBoard: "B",
      partnerSourceBoard: "A",
      primaryOrientation: "white",
      partnerOrientation: "black",
    });
    expect(guestBoardPresentation(match("B-black")).primaryOrientation).toBe("black");
    expect(sourceBoardForDisplay(match("B-white"), "A")).toBe("B");
    expect(sourceBoardForDisplay(match("B-white"), "B")).toBe("A");
  });
});
