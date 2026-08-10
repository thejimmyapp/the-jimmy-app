import { describe, expect, it } from "vitest";
import { guestBoardPresentation } from "./guestBoardPresentation";
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
  it("stages an original Board B featured player and orients their team at the bottom", () => {
    const presentation = guestBoardPresentation(match("B-white"));
    expect(presentation.featuredSourceBoard).toBe("B");
    expect(presentation.stagedSourceBoard).toBe("B");
    expect(presentation.dockSourceBoard).toBe("A");
    expect(presentation.stagedOrientation).toBe("white");
    expect(presentation.dockOrientation).toBe("black");
    expect(guestBoardPresentation(match("B-black")).stagedOrientation).toBe("black");
  });

  it("names the lower combined-rating board Second Board and swaps names with the surfaces", () => {
    const presentation = guestBoardPresentation(match("B-white"));
    expect(presentation.sourceNames).toEqual({ A: "Second Board", B: "First Board" });
    expect(presentation.stagedName).toBe("First Board");
    expect(presentation.dockName).toBe("Second Board");

    const swapped = guestBoardPresentation(match("B-white"), true);
    expect(swapped.stagedSourceBoard).toBe("A");
    expect(swapped.stagedName).toBe("Second Board");
    expect(swapped.dockName).toBe("First Board");
    expect(swapped.stagedOrientation).toBe("black");
  });

  it("breaks equal-rating ties by naming the featured player's board First", () => {
    const tied = match("B-white");
    tied.seats["A-white"].rating = 2;
    tied.seats["A-black"].rating = 5;
    expect(guestBoardPresentation(tied).sourceNames).toEqual({ A: "Second Board", B: "First Board" });
  });
});
