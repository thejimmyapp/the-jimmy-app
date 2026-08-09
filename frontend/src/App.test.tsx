import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { GUEST_PROGRESS_KEY } from "./guestProgress";
import { useCoachStore } from "./store";
import type { GamePayload, NormalizedMatch } from "./types";

const apiMock = vi.hoisted(() => ({
  games: vi.fn(),
  guestMatchups: vi.fn(),
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
  sendRoomEvent: vi.fn(),
}));
vi.mock("./components/BoardPanel", () => ({
  BoardPanel: ({ title, unavailable, beforeAnalyze }: { title: string; unavailable?: boolean; beforeAnalyze?: () => Promise<boolean> }) => (
    <div><span>{title}</span>{unavailable && <span>Partner board was not included in the available Chess.com data.</span>}{beforeAnalyze && <button onClick={() => void beforeAnalyze()}>Run mocked analysis</button>}</div>
  ),
}));
vi.mock("./components/SidePanel", () => ({ SidePanel: ({ partnerContent }: { partnerContent: ReactNode }) => <div>Games panel{partnerContent}</div> }));
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

  it("renders RAIL and DOCK inert and keeps them out of the accessibility tree during onboarding", () => {
    const { container } = renderApp();
    const rail = container.querySelector(".app-rail");
    const dock = container.querySelector(".app-dock");
    expect(rail?.hasAttribute("inert")).toBe(true);
    expect(dock?.hasAttribute("inert")).toBe(true);
    expect(rail?.getAttribute("aria-hidden")).toBe("true");
    expect(dock?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("navigation", { name: "Main views" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Task tools" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Privacy" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Guest Spawn/ }));
  });

  it("restores a standalone exact review from the browser URL on reload", async () => {
    history.replaceState(null, "", "/?game=42");
    renderApp();

    await waitFor(() => expect(apiMock.game).toHaveBeenCalledWith(42));
    expect(await screen.findByText("BOARD A · YOUR BOARD")).toBeTruthy();
    expect(new URLSearchParams(location.search).get("game")).toBe("42");
  });

  it("loads guest matchups, selects by keyboard, stores the match, and unlocks Review/Moves", async () => {
    renderApp();
    const statistics = screen.getByRole("button", { name: "Statistics", hidden: true }) as HTMLButtonElement;
    expect(statistics.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Guest Spawn/ }));
    const list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });

    expect(useCoachStore.getState().guestMatch).toEqual(guestMatch);
    expect(screen.getByText("Select a Bughouse game")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Review" }) as HTMLButtonElement).disabled).toBe(false);
    expect(statistics.disabled).toBe(true);
    const stored = JSON.parse(localStorage.getItem(GUEST_PROGRESS_KEY) ?? "{}") as { capabilities?: Record<string, string> };
    expect(stored.capabilities?.rail_review).toBe("unlocked");
    expect(stored.capabilities?.dock_review).toBe("unlocked");
    expect(stored.capabilities?.rail_statistics).toBe("locked");
    expect(apiMock.guestMatchups).toHaveBeenCalledOnce();
    expect(apiMock.resolveGame).not.toHaveBeenCalled();
    expect(apiMock.connectChessCom).not.toHaveBeenCalled();
  });

  it("requires and persists the versioned acknowledgement only when analysis is requested", async () => {
    history.replaceState(null, "", "/?game=42");
    renderApp();
    expect(await screen.findByText("BOARD A · YOUR BOARD")).toBeTruthy();
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

  it("validates and commits the username stub without unlocking or network activity", () => {
    renderApp();
    const username = screen.getByRole("textbox", { name: /Username/ });
    fireEvent.change(username, { target: { value: "Jimmy_42" } });
    fireEvent.keyDown(username, { key: "Enter" });
    expect(localStorage.getItem(GUEST_PROGRESS_KEY)).toBeNull();
    expect(apiMock.resolveGame).not.toHaveBeenCalled();
    expect(apiMock.connectChessCom).not.toHaveBeenCalled();
    expect(apiMock.importPgn).not.toHaveBeenCalled();
  });
});
