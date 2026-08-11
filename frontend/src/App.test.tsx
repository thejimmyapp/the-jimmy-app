import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import replayFixtures from "./fixtures/guest-match-replays.json";
import { GUEST_PROGRESS_KEY } from "./guestProgress";
import { useCoachStore } from "./store";
import type { CallbackReplayBoard, GamePayload, NormalizedMatch } from "./types";

const apiMock = vi.hoisted(() => ({
  guestSession: vi.fn(),
  resetGuestSession: vi.fn(),
  games: vi.fn(),
  guestMatchups: vi.fn(),
  chessComMatchReplay: vi.fn(),
  game: vi.fn(),
  resolveGame: vi.fn(),
  connectChessCom: vi.fn(),
  enrichChessCom: vi.fn(),
  importPgn: vi.fn(),
  createRoom: vi.fn(),
  room: vi.fn(),
  joinRoom: vi.fn(),
  coachStatus: vi.fn(),
  runCoach: vi.fn(),
  coachJob: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, api: apiMock };
});
vi.mock("./socket", () => ({
  applyRoomSnapshot: vi.fn(),
  connectRoomSocket: vi.fn(),
  disconnectRoomSocket: vi.fn(),
  sendRoomEvent: vi.fn(),
}));
vi.mock("./components/BoardPanel", () => ({
  BoardPanel: ({ title, showTitle = true, unavailable, beforeAnalyze }: { title: string; showTitle?: boolean; unavailable?: boolean; beforeAnalyze?: () => Promise<boolean> }) => (
    <div data-testid={`board-${title}`}>{showTitle && <span>{title}</span>}{unavailable && <span>Second board was not included in the available Chess.com data.</span>}{beforeAnalyze && <button onClick={() => void beforeAnalyze()}>Run mocked analysis</button>}</div>
  ),
}));
vi.mock("./components/SidePanel", () => ({ SidePanel: ({ boardContent }: { boardContent: ReactNode }) => <div>Games panel{boardContent}</div> }));
vi.mock("./components/Timeline", () => ({ Timeline: () => <div>Timeline</div> }));

const completeGame: GamePayload = {
  game: {
    id: 42,
    played_at: "2026-08-02T20:00:00Z",
    result: "win",
    opponent: "Opponent",
    opponent_rating: 1800,
    partner: "Partner",
    user_color: "white",
    time_control: "180",
    url: "https://www.chess.com/game/live/123456789",
  },
  players: {
    board_a_white: "FixtureUser",
    board_a_black: "Opponent",
    board_b_white: "DiagonalOpponent",
    board_b_black: "Partner",
  },
  moves_a: [],
  moves_b: [],
  positions_a: [],
  positions_b: [],
  timeline: [],
  second_board_available: true,
  limitations: [],
  outcome: {
    summary: "FixtureUser won",
    detail: "Completed game",
    loser_username: "Opponent",
    termination: "resigned",
    board: "A",
    board_role: "high",
    move_number: 1,
  },
};

const guestMatch: NormalizedMatch = {
  game_ids: { A: 180443871315, B: 180443871317 },
  end_time: 1_786_320_000,
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

const renderApp = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
};

afterEach(() => {
  cleanup();
  useCoachStore.setState({ username: "", game: null, guestMatch: null, games: [], roomId: null });
});

describe("URL-first exact review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    history.replaceState(null, "", "/");
    useCoachStore.setState({ username: "", game: null, guestMatch: null, games: [], roomId: null });
    apiMock.guestSession.mockResolvedValue({ guest_number: 13, total_guests: 13, completions_to_date: null, saved_moment_count: 0, analysis_unlocked: false });
    apiMock.resetGuestSession.mockResolvedValue({ guest_number: 14, total_guests: 14, completions_to_date: null, saved_moment_count: 0, analysis_unlocked: false });
    apiMock.games.mockResolvedValue({ games: [] });
    apiMock.guestMatchups.mockResolvedValue({
      matches: Array.from({ length: 5 }, (_, index) => ({
        ...guestMatch,
        game_ids: { A: guestMatch.game_ids.A + index * 2, B: guestMatch.game_ids.B + index * 2 },
      })),
      examined: 5,
      excluded: 0,
      exclusion_counts: {},
      players_sampled: ["vjbaker", "nochewycandy"],
      players_represented: ["vjbaker", "nochewycandy", "third-player"],
      seed_source: "leaderboard_top_50",
      cached: false,
    });
    const fixture = replayFixtures.matches[0].boards;
    apiMock.chessComMatchReplay.mockResolvedValue({
      match: guestMatch,
      boards: {
        A: { ...fixture.A, id: guestMatch.game_ids.A } as CallbackReplayBoard,
        B: { ...fixture.B, id: guestMatch.game_ids.B } as CallbackReplayBoard,
      },
    });
    apiMock.game.mockResolvedValue(completeGame);
    apiMock.resolveGame.mockResolvedValue({
      status: "resolved",
      source: "stored",
      external_game_id: "123456789",
      game_id: 42,
      game: completeGame,
    });
    apiMock.room.mockResolvedValue({ id: "room-1", game_id: null, snapshot: {} });
    apiMock.joinRoom.mockResolvedValue({ client_id: "client-1", display_name: "Guest" });
    apiMock.coachStatus.mockResolvedValue({ enabled: false, state: "disabled" });
    apiMock.importPgn.mockResolvedValue({ created: true, source: "manual", second_board_supplied: true, game_id: 42 });
    apiMock.enrichChessCom.mockResolvedValue({ checked: 0, enriched: 0, remaining_without_second_board: 0, credentials_stored: false });
  });

  it("locks ordinary RAIL chrome and DOCK while leaving the three active onboarding items accessible", () => {
    const { container } = renderApp();
    const rail = container.querySelector(".app-rail");
    const lockedRailContent = container.querySelector(".app-rail-locked-content");
    const dock = container.querySelector(".app-dock");
    expect(rail?.hasAttribute("inert")).toBe(false);
    expect(lockedRailContent?.hasAttribute("inert")).toBe(true);
    expect(dock?.hasAttribute("inert")).toBe(true);
    expect(lockedRailContent?.getAttribute("aria-hidden")).toBe("true");
    expect(dock?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("navigation", { name: "Main views" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Task tools" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open building blocks" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open mission" }).getAttribute("href")).toBe("/mission");
    expect(screen.getByRole("button", { name: "Open flashcard library" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Privacy" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Click me\?/ }));
  });

  it("renders real guest counters and opens the keyboard-reachable countdown panel", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "Salutations, SirGuest#13!" })).toBeTruthy();
    expect(screen.getByText("— of 13 visitors have completed the three-for-five challenge to date. Fail to complete it in time and you will be returned to the landing page under your new name, SirGuest#14. Mwahaha! Kittens and cookies! Mwahaha, yessss.")).toBeTruthy();
    const libraryButton = screen.getByRole("button", { name: "Open flashcard library" });
    libraryButton.focus();
    fireEvent.click(libraryButton);
    expect(screen.getByRole("dialog", { name: "SirGuest#13 Flashcard library" })).toBeTruthy();
    expect(screen.getByRole("timer", { name: "Session countdown" }).textContent).toMatch(/^(5:00|4:59)$/);
    expect(screen.getByText("No flashcards yet.")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "SirGuest#13 Flashcard library" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "SirGuest#13 Flashcard library" })).toBeNull();
  });

  it("keeps the building-blocks rail link unlocked and opens it in a new tab", () => {
    const { container } = renderApp();
    const link = container.querySelector<HTMLAnchorElement>(".rail-blocks-link");
    expect(link?.getAttribute("href")).toBe("/blocks/index.html");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
    expect(link?.textContent).toBe("🎨");
    expect(link?.hasAttribute("aria-disabled")).toBe(false);
    expect(link?.classList.contains("capability-locked")).toBe(false);
  });

  it("restores a standalone exact review from the browser URL on reload", async () => {
    history.replaceState(null, "", "/?game=42");
    renderApp();

    await waitFor(() => expect(apiMock.game).toHaveBeenCalledWith(42));
    expect(await screen.findByTestId("board-First Board")).toBeTruthy();
    expect(screen.queryByText("First Board")).toBeNull();
    expect(new URLSearchParams(location.search).get("game")).toBe("42");
  });

  it("loads guest matchups, selects by keyboard, stores the match, and unlocks Review/Moves", async () => {
    renderApp();
    const statistics = screen.getByRole("button", { name: "Statistics", hidden: true }) as HTMLButtonElement;
    expect(statistics.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    const list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });

    await waitFor(() => expect(useCoachStore.getState().guestMatch).toEqual(guestMatch));
    expect(useCoachStore.getState().game?.timeline.length).toBeGreaterThan(100);
    expect(screen.getByTestId("board-First Board")).toBeTruthy();
    expect(screen.getByText("Second Board")).toBeTruthy();
    expect(screen.queryByText("BOARD A · FEATURED PLAYER")).toBeNull();
    expect(screen.queryByText("BOARD B · PARTNER BOARD")).toBeNull();
    expect(screen.queryByText(/175% browser zoom/)).toBeNull();
    expect((screen.getByRole("button", { name: "Review" }) as HTMLButtonElement).disabled).toBe(false);
    expect(statistics.disabled).toBe(true);
    const stored = JSON.parse(localStorage.getItem(GUEST_PROGRESS_KEY) ?? "{}") as { capabilities?: Record<string, string> };
    expect(stored.capabilities?.rail_review).toBe("unlocked");
    expect(stored.capabilities?.dock_review).toBe("unlocked");
    expect(stored.capabilities?.rail_statistics).toBe("locked");
    expect(stored.capabilities?.board_analysis).toBe("locked");
    expect(stored.capabilities?.team_coach).toBe("locked");
    expect(apiMock.guestMatchups).toHaveBeenCalledOnce();
    expect(apiMock.chessComMatchReplay).toHaveBeenCalledWith(guestMatch.game_ids.A);
    expect(apiMock.resolveGame).not.toHaveBeenCalled();
    expect(apiMock.connectChessCom).not.toHaveBeenCalled();
  });

  it("requires and persists the versioned acknowledgement only when analysis is requested", async () => {
    history.replaceState(null, "", "/?game=42");
    renderApp();
    expect(await screen.findByTestId("board-First Board")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /analysis acknowledgement/i })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Run mocked analysis" })[0]);
    const continueButton = screen.getByRole("button", { name: "Continue to analysis" }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/single-board engine suggestion/i));
    fireEvent.click(screen.getByLabelText(/missing Chess.com data/i));
    fireEvent.click(continueButton);
    expect(localStorage.getItem("thejimmyapp.analysisAcknowledgement.v1")).toBe("analysis-limits-2026-08-06");
  });

  it("gives room links precedence over a standalone game query", async () => {
    history.replaceState(null, "", "/?room=room-1&game=42");
    useCoachStore.setState({ roomId: "room-1", game: null });
    renderApp();

    await waitFor(() => expect(apiMock.room).toHaveBeenCalledWith("room-1"));
    expect(apiMock.game).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Review the game you just played." })).toBeNull();
  });

  it("uses the existing guest selection path when word vertigo unmute escapes", async () => {
    const selectedMatch: NormalizedMatch = {
      ...guestMatch,
      game_ids: { A: guestMatch.game_ids.A + 2, B: guestMatch.game_ids.B + 2 },
    };
    const fixture = replayFixtures.matches[0].boards;
    apiMock.chessComMatchReplay.mockResolvedValueOnce({
      match: selectedMatch,
      boards: {
        A: { ...fixture.A, id: selectedMatch.game_ids.A } as CallbackReplayBoard,
        B: { ...fixture.B, id: selectedMatch.game_ids.B } as CallbackReplayBoard,
      },
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.21);
    const { container } = renderApp();
    fireEvent.change(screen.getByRole("textbox", { name: /Sign in/ }), { target: { value: "x" } });
    const unmute = await screen.findByRole("button", { name: "unmute" });
    expect(container.querySelector(".app-shell")?.classList.contains("word-vertigo-sequence")).toBe(true);
    expect(container.querySelector(".app-rail")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector(".app-rail-locked-content")?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector(".app-dock")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector(".app-dock-content")?.hasAttribute("inert")).toBe(true);
    fireEvent.click(unmute);

    await waitFor(() => expect(useCoachStore.getState().guestMatch).toEqual(selectedMatch));
    expect(apiMock.guestMatchups).toHaveBeenCalledOnce();
    expect(apiMock.chessComMatchReplay).toHaveBeenCalledWith(selectedMatch.game_ids.A);
    expect(screen.getByTestId("board-First Board")).toBeTruthy();
    random.mockRestore();
  });
});
