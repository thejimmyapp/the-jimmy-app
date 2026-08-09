import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import replayFixtures from "./fixtures/guest-match-replays.json";
import { useCoachStore } from "./store";
import type { CallbackReplayBoard, GuestMatchReplaySource, NormalizedMatch } from "./types";

const apiMock = vi.hoisted(() => ({
  guestMatchups: vi.fn(),
  chessComMatchReplay: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, api: { ...original.api, ...apiMock } };
});

vi.mock("./socket", () => ({
  applyRoomSnapshot: vi.fn(),
  connectRoomSocket: vi.fn(),
  sendRoomEvent: vi.fn(),
}));

const boardA = replayFixtures.matches[0].boards.A as CallbackReplayBoard;
const boardB = replayFixtures.matches[0].boards.B as CallbackReplayBoard;
const match: NormalizedMatch = {
  game_ids: { A: boardA.id, B: boardB.id },
  seats: {
    "A-white": { name: String(boardA.headers.White), rating: Number(boardA.headers.WhiteElo) },
    "A-black": { name: String(boardA.headers.Black), rating: Number(boardA.headers.BlackElo) },
    "B-white": { name: String(boardB.headers.White), rating: Number(boardB.headers.WhiteElo) },
    "B-black": { name: String(boardB.headers.Black), rating: Number(boardB.headers.BlackElo) },
  },
  ply_counts: { A: boardA.plyCount, B: boardB.plyCount },
  decisive_board: "A",
  loser_seat: "A-white",
  action: "checkmated",
  highest_rated: { name: String(boardB.headers.White), rating: Number(boardB.headers.WhiteElo), seat: "B-white", outcome: "LOST" },
  loser_relative_to_highest: "diag oppo",
};
const source: GuestMatchReplaySource = { match, boards: { A: boardA, B: boardB } };

describe("guest replay workspace integration", () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
    useCoachStore.setState({ game: null, guestMatch: null, roomId: null, globalPly: 0, mode: "review" });
    apiMock.guestMatchups.mockResolvedValue({
      matches: [match],
      examined: 1,
      excluded: 0,
      exclusion_counts: {},
      players_sampled: ["one", "two", "three"],
      players_represented: ["one", "two", "three"],
      seed_source: "players_of_interest",
      cached: false,
    });
    apiMock.chessComMatchReplay.mockResolvedValue(source);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("walks spawn to the list, opens both real boards, pockets, Moves, and keyboard replay", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: /Guest Spawn/ }));
    const list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });

    expect(await screen.findByText("BOARD A · GUEST MATCH")).toBeTruthy();
    const boardAElement = screen.getByLabelText("BOARD A · GUEST MATCH chessboard");
    expect(within(boardAElement).getAllByRole("button")).toHaveLength(64);
    expect(screen.getByRole("tab", { name: "Moves" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Synchronized move history")).toBeTruthy();
    expect(useCoachStore.getState().game?.timeline).toHaveLength(boardA.plyCount + boardB.plyCount + 1);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useCoachStore.getState().globalPly).toBe(1);
    const firstPocketPly = useCoachStore.getState().game?.timeline.findIndex((frame) =>
      frame.board_a.white_pocket !== "-"
      || frame.board_a.black_pocket !== "-"
      || frame.board_b.white_pocket !== "-"
      || frame.board_b.black_pocket !== "-",
    ) ?? -1;
    expect(firstPocketPly).toBeGreaterThan(0);
    for (let ply = 1; ply < firstPocketPly; ply += 1) fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(useCoachStore.getState().globalPly).toBe(firstPocketPly));
    expect(document.querySelectorAll(".pocket-rail span").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "Partner" }));
    expect(screen.getByLabelText("BOARD B · PARTNER BOARD chessboard")).toBeTruthy();
    expect(screen.getAllByLabelText(/droppers$/)).toHaveLength(4);
    expect(useCoachStore.getState().game?.cross_board_ordering).toEqual({ method: "clock-inferred", exact: false });
  });
});
