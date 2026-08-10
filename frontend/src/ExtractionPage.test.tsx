import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionPage } from "./ExtractionPage";
import { parseNormalizedMatch } from "./extractionData";
import { extractionSharePath, parseExtractionInput } from "./extractionInput";

const MATCH = {
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
} as const;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/extraction");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("parseExtractionInput", () => {
  it("recognizes a username", () => {
    expect(parseExtractionInput(" fearingforfreddy ")).toEqual({
      kind: "username",
      username: "fearingforfreddy",
    });
  });

  it("recognizes a Chess.com live-game URL and perspective", () => {
    expect(
      parseExtractionInput(
        "https://www.chess.com/game/live/180565671769?username=fearingforfreddy",
      ),
    ).toEqual({
      kind: "game",
      gameId: "180565671769",
      perspective: "fearingforfreddy",
    });
  });

  it("recognizes a positive numeric game id", () => {
    expect(parseExtractionInput("180565671769")).toEqual({
      kind: "game",
      gameId: "180565671769",
      perspective: null,
    });
  });

  it("recognizes a viewer URL with a canonical move address", () => {
    expect(
      parseExtractionInput(
        "https://bmacho.github.io/bughouse-viewer/view.html?game_id=180565671769&move=23b",
      ),
    ).toEqual({
      kind: "viewer",
      gameId: "180565671769",
      moveAddress: "23b",
    });
  });

  it("recognizes a standalone move address", () => {
    expect(parseExtractionInput("23b")).toEqual({
      kind: "move",
      moveAddress: "23b",
    });
  });

  it.each(["23.b", "x23b", "23b-extra", "00023b", "0b", "23c"])(
    "rejects the non-canonical move token %s in a viewer URL",
    (move) => {
      expect(
        parseExtractionInput(
          `https://bmacho.github.io/bughouse-viewer/view.html?game_id=180565671769&move=${move}`,
        ),
      ).toEqual({ kind: "invalid" });
    },
  );

  it("builds only strict extraction share paths", () => {
    expect(extractionSharePath("180565671769", "23b")).toBe(
      "/extraction?game=180565671769&move=23b",
    );
    expect(() => extractionSharePath("180565671769", "23.b")).toThrow();
  });
});

describe("normalized match validation", () => {
  it("fails closed when the match shape is incomplete", () => {
    expect(() => parseNormalizedMatch({ ...MATCH, loser_seat: "mystery" })).toThrow(
      "unexpected response shape",
    );
  });
});

describe("ExtractionPage", () => {
  it("fetches a game URL and renders the complete normalized collection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(MATCH));
    vi.stubGlobal("fetch", fetchMock);
    render(<ExtractionPage />);

    expect((screen.getByRole("button", { name: "Download .json" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/moves:/).parentElement?.textContent).toContain("pending decoder");

    const input = screen.getByLabelText("Username, game URL, viewer URL, or numeric game id");
    fireEvent.change(input, {
      target: { value: "https://www.chess.com/game/live/180443871315" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    expect(await screen.findByText("vjbaker(2799) LOST — partner checkmated")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download .json" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Download .txt" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("region", { name: "Team 1 · A-white + B-black" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Team 2 · A-black + B-white" })).toBeTruthy();
    expect(screen.getByText("180443871317")).toBeTruthy();
    expect(screen.getByText("81")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chesscom/matches/180443871315",
      { headers: { Accept: "application/json" } },
    );

    fireEvent.click(screen.getByText("Raw normalized JSON"));
    expect(screen.getByText(/"decisive_board": "B"/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Move token"), { target: { value: "23b" } });
    fireEvent.click(screen.getByRole("button", { name: "Build URL" }));
    expect((screen.getByLabelText("Shareable URL") as HTMLInputElement).value).toBe(
      "/extraction?game=180443871315&move=23b",
    );
  });

  it("accepts a numeric id and reports a readable match failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      detail: { message: "This match cannot be normalized safely." },
    }, 422)));
    render(<ExtractionPage />);

    fireEvent.change(screen.getByLabelText("Username, game URL, viewer URL, or numeric game id"), {
      target: { value: "180443871315" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This match cannot be normalized safely.",
    );
  });

  it("loads game and canonical moment query parameters on page load", async () => {
    window.history.replaceState({}, "", "/extraction?game=180443871315&move=23b");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(MATCH)));
    render(<ExtractionPage />);

    expect(await screen.findByText("vjbaker(2799) LOST — partner checkmated")).toBeTruthy();
    expect((screen.getByLabelText("Move token") as HTMLInputElement).value).toBe("23b");
    fireEvent.click(screen.getByRole("button", { name: "Build URL" }));
    expect((screen.getByLabelText("Shareable URL") as HTMLInputElement).value).toBe(
      "/extraction?game=180443871315&move=23b",
    );
  });

  it("loads the game but rejects a permissive viewer-style query token", async () => {
    window.history.replaceState({}, "", "/extraction?game=180443871315&move=23.b");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(MATCH)));
    render(<ExtractionPage />);

    expect(await screen.findByText("vjbaker(2799) LOST — partner checkmated")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Use a whole token such as 23b");
    expect(screen.queryByLabelText("Shareable URL")).toBeNull();
  });

  it("fetches public profile data serially and displays the Bughouse leaderboard score", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        username: "vjbaker",
        name: "Vincent Baker",
        avatar: "https://images.example/vjbaker.png",
        url: "https://www.chess.com/member/vjbaker",
      }))
      .mockResolvedValueOnce(response({ chess_blitz: { last: { rating: 2200 } } }))
      .mockResolvedValueOnce(response({
        live_bughouse: [{ username: "vjbaker", score: 2799 }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ExtractionPage />);

    fireEvent.change(screen.getByLabelText("Username, game URL, viewer URL, or numeric game id"), {
      target: { value: "vjbaker" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    expect(await screen.findByRole("heading", { name: "Vincent Baker" })).toBeTruthy();
    expect(screen.getByText("2799")).toBeTruthy();
    expect(screen.getByText("live_bughouse[].score")).toBeTruthy();
    expect(screen.getByRole("img", { name: "vjbaker avatar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open public game archives" }).getAttribute("href")).toBe(
      "https://api.chess.com/pub/player/vjbaker/games/archives",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.chess.com/pub/player/vjbaker",
      "https://api.chess.com/pub/player/vjbaker/stats",
      "https://api.chess.com/pub/leaderboards",
    ]);
  });

  it("shows a clean inline error for an unknown username", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ message: "Not Found" }, 404)));
    render(<ExtractionPage />);

    fireEvent.change(screen.getByLabelText("Username, game URL, viewer URL, or numeric game id"), {
      target: { value: "no_such_user_zz98765" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Chess.com could not find that username.",
    );
  });
});
