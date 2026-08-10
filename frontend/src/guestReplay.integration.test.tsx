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
    "B-black": { name: String(boardB.headers.Black), rating: 1000 },
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

  it("stages a featured player on the rating-derived Second Board and preserves named focus through swaps", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    const list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });

    const stagedSecondBoard = await screen.findByLabelText("Second Board chessboard");
    const stagedSecondPanel = stagedSecondBoard.closest(".board-panel") as HTMLElement;
    expect(screen.queryByText("BOARD A · FEATURED PLAYER")).toBeNull();
    expect(within(stagedSecondBoard).getAllByRole("button")).toHaveLength(64);
    expect(within(stagedSecondBoard).getAllByRole("button")[0].getAttribute("aria-label")?.startsWith("a8")).toBe(true);
    expect(within(stagedSecondPanel).getByText(String(boardB.headers.White))).toBeTruthy();
    expect(stagedSecondPanel.getAttribute("data-keyboard-focus")).toBe("active");
    expect(screen.getByRole("tab", { name: "Moves" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "First Board" }).getAttribute("aria-selected")).toBe("false");
    const timeline = screen.getByLabelText("Synchronized move history");
    expect(timeline).toBeTruthy();
    expect(useCoachStore.getState().game?.timeline).toHaveLength(boardA.plyCount + boardB.plyCount + 1);
    const firstOriginalBoardBMove = useCoachStore.getState().game?.timeline.find((frame) => frame.board === "B")?.move;
    expect(firstOriginalBoardBMove).toBeTruthy();
    expect(within(timeline.querySelectorAll(".move-track")[0] as HTMLElement).getByText(firstOriginalBoardBMove!)).toBeTruthy();
    const analyze = screen.getByRole("button", { name: /Analyze with Fairy-Stockfish/ }) as HTMLButtonElement;
    const coach = screen.getByRole("button", { name: /Team Coach/ }) as HTMLButtonElement;
    expect(analyze.disabled).toBe(true);
    expect(analyze.classList.contains("capability-locked")).toBe(true);
    expect(coach.disabled).toBe(true);
    expect(coach.classList.contains("capability-locked")).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useCoachStore.getState().globalPly).toBe(1);
    fireEvent.keyDown(window, { key: "Tab" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "First Board" }).getAttribute("aria-selected")).toBe("true"));
    const dockFirstBoard = screen.getByLabelText("First Board chessboard");
    const dockFirstPanel = dockFirstBoard.closest(".board-panel") as HTMLElement;
    expect(within(dockFirstBoard).getAllByRole("button")[0].getAttribute("aria-label")?.startsWith("h1")).toBe(true);
    expect(within(dockFirstPanel).getByText(String(boardA.headers.Black))).toBeTruthy();
    expect(stagedSecondPanel.getAttribute("data-keyboard-focus")).toBe("inactive");
    expect(dockFirstPanel.getAttribute("data-keyboard-focus")).toBe("active");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useCoachStore.getState().globalPly).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Swap staged board" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Second Board" }).getAttribute("aria-selected")).toBe("false"));
    expect(screen.getByRole("tab", { name: "Moves" }).getAttribute("aria-selected")).toBe("true");
    const stagedFirstBoard = screen.getByLabelText("First Board chessboard");
    const stagedFirstPanel = stagedFirstBoard.closest(".board-panel") as HTMLElement;
    expect(within(stagedFirstBoard).getAllByRole("button")[0].getAttribute("aria-label")?.startsWith("h1")).toBe(true);
    expect(within(stagedFirstPanel).getByText(String(boardA.headers.Black))).toBeTruthy();
    expect(stagedFirstPanel.getAttribute("data-keyboard-focus")).toBe("active");

    fireEvent.click(screen.getByRole("tab", { name: "Second Board" }));
    const dockSecondBoard = screen.getByLabelText("Second Board chessboard");
    const dockSecondPanel = dockSecondBoard.closest(".board-panel") as HTMLElement;
    expect(within(dockSecondBoard).getAllByRole("button")[0].getAttribute("aria-label")?.startsWith("a8")).toBe(true);
    expect(within(dockSecondPanel).getByText(String(boardB.headers.White))).toBeTruthy();
    expect(dockSecondPanel.getAttribute("data-keyboard-focus")).toBe("active");

    fireEvent.click(screen.getByRole("button", { name: "Swap staged board" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "First Board" }).getAttribute("aria-selected")).toBe("false"));
    expect(screen.getByRole("tab", { name: "Moves" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Second Board chessboard").closest(".board-panel")?.getAttribute("data-keyboard-focus")).toBe("active");

    fireEvent.keyDown(window, { key: "Tab" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "First Board" }).getAttribute("aria-selected")).toBe("true"));
    const firstPocketPly = useCoachStore.getState().game?.timeline.findIndex((frame) =>
      frame.board_a.white_pocket !== "-"
      || frame.board_a.black_pocket !== "-"
      || frame.board_b.white_pocket !== "-"
      || frame.board_b.black_pocket !== "-",
    ) ?? -1;
    expect(firstPocketPly).toBeGreaterThan(0);
    for (let ply = useCoachStore.getState().globalPly; ply < firstPocketPly; ply += 1) fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(useCoachStore.getState().globalPly).toBe(firstPocketPly));
    expect(document.querySelectorAll(".pocket-rail span").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "First Board" }));
    expect(screen.getByLabelText("First Board chessboard")).toBeTruthy();
    expect(screen.getAllByLabelText(/droppers$/)).toHaveLength(4);
    expect(useCoachStore.getState().game?.cross_board_ordering).toEqual({ method: "clock-inferred", exact: false });
  });
});
