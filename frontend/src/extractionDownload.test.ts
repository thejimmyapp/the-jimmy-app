import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExtractionSnapshot,
  downloadExtractionSnapshot,
  serializeExtractionText,
} from "./extractionDownload";
import type { NormalizedMatch, PublicPlayer } from "./extractionData";

const MATCH: NormalizedMatch = {
  game_ids: { A: 180443871315, B: 180443871317 },
  seats: {
    "A-white": { name: "vjbaker", rating: 2799 },
    "A-black": { name: "larso", rating: 2677 },
    "B-white": { name: "littleplotkin", rating: 2608 },
    "B-black": { name: "chickencrossroad", rating: 2408 },
  },
  ply_counts: { A: 71, B: 81 },
  decisive_board: "B",
  loser_seat: "B-black",
  action: "checkmated",
  highest_rated: { name: "vjbaker", rating: 2799, seat: "A-white", outcome: "LOST" },
  loser_relative_to_highest: "partner",
};

const PLAYER: PublicPlayer = {
  username: "vjbaker",
  displayName: "Vincent Baker",
  avatar: "https://images.example/vjbaker.png",
  profileUrl: "https://www.chess.com/member/vjbaker",
  archivesUrl: "https://api.chess.com/pub/player/vjbaker/games/archives",
  bughouseRating: 2799,
  bughouseRatingPath: "live_bughouse[].score",
  profileData: { username: "vjbaker", joined: 123456, followers: 42 },
  statsData: { chess_blitz: { last: { rating: 2200 }, record: { win: 12, loss: 3 } } },
  bughouseLeaderboardEntry: { username: "vjbaker", score: 2799, rank: 1 },
};

const snapshot = buildExtractionSnapshot({
  sourceInput: "https://www.chess.com/game/live/180443871315",
  origin: "https://thejimmyapp.com",
  match: MATCH,
  loadedGameId: "180443871315",
  moveAddress: "23b",
  sharePath: "/extraction?game=180443871315&move=23b",
  player: PLAYER,
  exportedAt: "2026-08-09T12:34:56.000Z",
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extraction downloads", () => {
  it("captures normalized, moment, profile, stats, and capability facts without dropping nested data", () => {
    expect(snapshot.moment_address?.url).toBe(
      "https://thejimmyapp.com/extraction?game=180443871315&move=23b",
    );
    expect(snapshot.normalized_match?.seats["B-black"].rating).toBe(2408);
    expect(snapshot.normalized_match?.ply_counts).toEqual({ A: 71, B: 81 });
    expect(snapshot.normalized_match?.highest_rated.outcome).toBe("LOST");
    expect(snapshot.public_player?.raw_profile.followers).toBe(42);
    expect(snapshot.public_player?.raw_stats).toEqual(PLAYER.statsData);
    expect(snapshot.public_player?.bughouse_leaderboard_entry?.score).toBe(2799);
    expect(snapshot.capabilities.moves).toBe("pending decoder");
  });

  it("renders a human-readable text copy of every nested collection", () => {
    const text = serializeExtractionText(snapshot);

    expect(text).toContain("THE JIMMY APP — EXTRACTION DOWNLOAD");
    expect(text).toContain("moves: pending decoder");
    expect(text).toContain("url: https://thejimmyapp.com/extraction?game=180443871315&move=23b");
    expect(text).toContain("B-black:");
    expect(text).toContain("rating: 2408");
    expect(text).toContain("followers: 42");
    expect(text).toContain("win: 12");
    expect(text).toContain("rank: 1");
  });

  it.each([
    ["json", "thejimmyapp-match-180443871315.json", "application/json;charset=utf-8"],
    ["txt", "thejimmyapp-match-180443871315.txt", "text/plain;charset=utf-8"],
  ] as const)("creates and clicks a browser download for .%s", (format, filename, mimeType) => {
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob;
      return "blob:thejimmyapp-extraction";
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    let clickedDownload = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownload = this.download;
    });

    downloadExtractionSnapshot(snapshot, format);

    expect(clickedDownload).toBe(filename);
    expect(createObjectURL).toHaveBeenCalledOnce();
    const downloadedBlob = createObjectURL.mock.calls[0][0];
    expect(downloadedBlob).toBeInstanceOf(Blob);
    expect(downloadedBlob.type).toBe(mimeType);
    expect(downloadedBlob.size).toBeGreaterThan(100);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:thejimmyapp-extraction");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
