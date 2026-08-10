import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import replayFixtures from "./fixtures/guest-match-replays.json";
import { loadGuestProgress } from "./guestProgress";
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
  sendRoomEvent: vi.fn(),
}));

const boardA = replayFixtures.matches[0].boards.A as CallbackReplayBoard;
const boardB = replayFixtures.matches[0].boards.B as CallbackReplayBoard;

const firstMatch: NormalizedMatch = {
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
  });

  it("saves three moments across two games, opens an exact ply, and deletes one", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><App /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    let list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(await screen.findAllByLabelText(/Board chessboard/)).toHaveLength(2);

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
});
