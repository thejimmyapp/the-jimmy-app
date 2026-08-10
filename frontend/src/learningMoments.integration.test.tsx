import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { reconstructGuestMatch } from "./bughouseDecoder";
import replayFixtures from "./fixtures/guest-match-replays.json";
import { GUEST_PROGRESS_KEY, emptyGuestProgress, loadGuestProgress, storeGuestProgress } from "./guestProgress";
import { startGuestQuest } from "./quest";
import { useCoachStore } from "./store";
import type { CallbackReplayBoard, NormalizedMatch } from "./types";

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
  disconnectRoomSocket: vi.fn(),
  sendRoomEvent: vi.fn(),
}));

const boardA = replayFixtures.matches[0].boards.A as CallbackReplayBoard;
const boardB = replayFixtures.matches[0].boards.B as CallbackReplayBoard;

const firstMatch: NormalizedMatch = {
  game_ids: { A: boardA.id, B: boardB.id },
  end_time: 1_786_320_000,
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

const secondMatch: NormalizedMatch = {
  ...firstMatch,
  game_ids: { A: boardA.id + 2, B: boardB.id + 2 },
  seats: {
    "A-white": { ...firstMatch.seats["A-white"], name: "Second Alpha" },
    "A-black": { ...firstMatch.seats["A-black"], name: "Second Beta" },
    "B-white": { ...firstMatch.seats["B-white"], name: "Second Gamma" },
    "B-black": { ...firstMatch.seats["B-black"], name: "Second Delta" },
  },
  highest_rated: { ...firstMatch.highest_rated, name: "Second Gamma" },
};

const replayFor = (match: NormalizedMatch) => ({
  match,
  boards: {
    A: { ...boardA, id: match.game_ids.A },
    B: { ...boardB, id: match.game_ids.B },
  },
});

const saveMoment = (glyph: string, note: string, useButton = false) => {
  if (useButton) fireEvent.click(screen.getByRole("button", { name: "Save current learning moment" }));
  else fireEvent.keyDown(window, { key: "m" });
  fireEvent.click(screen.getByRole("radio", { name: glyph }));
  fireEvent.change(screen.getByPlaceholderText("what it does / why it stood out"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Save moment" }));
};

describe("guest learning moment library", () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
    useCoachStore.setState({ game: null, guestMatch: null, roomId: null, globalPly: 0, mode: "review" });
    apiMock.guestMatchups.mockResolvedValue({
      matches: [firstMatch, secondMatch],
      examined: 2,
      excluded: 0,
      exclusion_counts: {},
      players_sampled: ["one", "two", "three"],
      players_represented: ["one", "two", "three"],
      seed_source: "players_of_interest",
      cached: false,
    });
    apiMock.chessComMatchReplay.mockImplementation(async (gameId: number) => replayFor(gameId === secondMatch.game_ids.A ? secondMatch : firstMatch));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("saves three moments across two games, opens an exact ply, and deletes one", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><App /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    let list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(await screen.findAllByLabelText(/Board chessboard/)).toHaveLength(2);
    expect(loadGuestProgress().questDeadline).not.toBeNull();
    expect(screen.getByRole("tab", { name: /^(5:00|4:59)$/ })).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    saveMoment("!!", "The first game starts to squeeze the king.");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    saveMoment("?!", "The transfer changes what the other board can allow.");
    expect(loadGuestProgress().savedMoments).toHaveLength(2);
    expect(loadGuestProgress().capabilities.dock_library).toBe("unlocked");
    expect(loadGuestProgress().savedMoments[0]).toMatchObject({ matchIds: firstMatch.game_ids, ply: 1, glyph: "!!" });

    fireEvent.click(screen.getByRole("button", { name: "Return to onboarding" }));
    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    await waitFor(() => expect(useCoachStore.getState().guestMatch?.game_ids).toEqual(secondMatch.game_ids));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    saveMoment("!", "A second game shows the same timing from another angle.", true);
    expect(loadGuestProgress().questCompleted).toBe(true);
    expect(loadGuestProgress().questDeadline).toBeNull();
    expect(loadGuestProgress().capabilities.dock_quest).toBe("unlocked");
    expect(screen.getByRole("tab", { name: "Complete" })).toBeTruthy();

    const libraryTab = screen.getByRole("tab", { name: /Library/ }) as HTMLButtonElement;
    expect(libraryTab.disabled).toBe(false);
    fireEvent.click(libraryTab);
    expect(container.querySelector(".side-panel")?.getAttribute("data-saved-moment-count")).toBe("3");
    expect(screen.getByText("3 saved moments")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(3);
    expect(screen.getAllByText(/RyanTime · Wakatakakagi/)).toHaveLength(2);
    expect(screen.getByText(/Second Alpha · Second Beta/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]);
    await waitFor(() => expect(useCoachStore.getState().guestMatch?.game_ids).toEqual(firstMatch.game_ids));
    expect(useCoachStore.getState().globalPly).toBe(1);

    fireEvent.click(screen.getByRole("tab", { name: /Library/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete saved moment at ply 2" }));
    expect(loadGuestProgress().savedMoments).toHaveLength(2);
    expect(container.querySelector(".side-panel")?.getAttribute("data-saved-moment-count")).toBe("2");
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(2);
  });

  it("clears an insufficient guest session and returns to entry when the persisted deadline expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T05:00:00.000Z"));
    const replay = reconstructGuestMatch(replayFor(firstMatch));
    useCoachStore.getState().setGuestReplay(firstMatch, replay.game);
    const running = startGuestQuest({
      ...emptyGuestProgress(),
      firstGameOpened: true,
      capabilities: { ...emptyGuestProgress().capabilities, rail_review: "unlocked", dock_review: "unlocked" },
    });
    storeGuestProgress({ ...running, questDeadline: Date.now() + 1_000 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
    expect(screen.getByRole("tab", { name: "0:01" })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1_250);
      await Promise.resolve();
    });

    expect(useCoachStore.getState().game).toBeNull();
    expect(useCoachStore.getState().guestMatch).toBeNull();
    expect(localStorage.getItem(GUEST_PROGRESS_KEY)).toBeNull();
    expect(screen.getByRole("heading", { name: "Greetings small children" })).toBeTruthy();
  });

  it("completes the quest after three moments saved from one guest game", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    const list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(await screen.findAllByLabelText(/Board chessboard/)).toHaveLength(2);

    for (const [glyph, note] of [["!!", "First moment."], ["!?", "Second moment."], ["!", "Third moment."]] as const) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
      saveMoment(glyph, note);
    }

    const completed = loadGuestProgress();
    expect(completed.savedMoments).toHaveLength(3);
    expect(completed.questCompleted).toBe(true);
    expect(completed.questDeadline).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Complete" }));
    expect(screen.getByRole("progressbar", { name: "Quest learning moments" }).getAttribute("aria-valuenow")).toBe("3");
  });
});
