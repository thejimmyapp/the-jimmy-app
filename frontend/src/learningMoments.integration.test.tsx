import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ApiError } from "./api";
import { reconstructGuestMatch } from "./bughouseDecoder";
import replayFixtures from "./fixtures/guest-match-replays.json";
import { emptyGuestProgress, loadGuestProgress, storeGuestProgress } from "./guestProgress";
import { startGuestQuest } from "./quest";
import { useCoachStore } from "./store";
import type { CallbackReplayBoard, NormalizedMatch } from "./types";

const apiMock = vi.hoisted(() => ({
  guestSession: vi.fn(),
  resetGuestSession: vi.fn(),
  guestMatchups: vi.fn(),
  chessComMatchReplay: vi.fn(),
  storeChessComGuestMatch: vi.fn(),
  createMoment: vi.fn(),
  deleteMoment: vi.fn(),
  explorationMove: vi.fn(),
  explorationSanMove: vi.fn(),
}));
const clipboardWrite = vi.fn();

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

const glyphKey = { "!": "1", "?": "2", "!!": "3", "??": "4", "!?": "5", "?!": "6" } as const;

const saveMoment = async (glyph: keyof typeof glyphKey, note: string, useButton = false) => {
  if (useButton) fireEvent.click(screen.getByRole("button", { name: "Save current learning moment" }));
  else fireEvent.keyDown(window, { key: "m" });
  const wizard = screen.getByLabelText("Learning moment wizard steps 1 through 4");
  const moves = within(wizard).getByLabelText("Moves at this position");
  fireEvent.click(within(moves).getAllByRole("button")[0]);
  fireEvent.keyDown(within(wizard).getByRole("group", { name: "Required move glyph" }), { key: glyphKey[glyph] });
  const board = within(wizard).getByLabelText(/alternative chessboard/);
  const squares = within(board).getAllByRole("button");
  const sideToMove = board.closest(".board-panel")?.querySelector(".board-heading > span:last-child")?.textContent ?? "";
  const piecePattern = sideToMove.startsWith("Black") ? / [kqrbnp]$/ : / [KQRBNP]$/;
  const source = squares.find((button) => piecePattern.test(button.getAttribute("aria-label") ?? ""));
  const target = squares.find((button) => /^[a-h][1-8]$/.test(button.getAttribute("aria-label") ?? ""));
  if (!source || !target) throw new Error("Test replay did not expose a side-to-move piece and empty target square.");
  fireEvent.click(source);
  fireEvent.click(target);
  await within(wizard).findByRole("heading", { name: "Instead, play e3" });
  fireEvent.change(within(wizard).getByRole("textbox", { name: "Written answer after Because" }), { target: { value: note } });
  fireEvent.click(within(wizard).getByRole("button", { name: "Save moment" }));
  await waitFor(() => expect(screen.queryByLabelText("Learning moment wizard steps 1 through 4")).toBeNull());
};

describe("guest learning moment library", () => {
  let serverMomentCount = 0;
  let nextMomentId = 1;

  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
    useCoachStore.setState({ game: null, guestMatch: null, roomId: null, globalPly: 0, mode: "review" });
    serverMomentCount = 0;
    nextMomentId = 1;
    clipboardWrite.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboardWrite } });
    apiMock.guestSession.mockImplementation(async () => ({ guest_number: 13, total_guests: 13, completions_to_date: null, saved_moment_count: serverMomentCount, analysis_unlocked: serverMomentCount >= 10 }));
    apiMock.resetGuestSession.mockResolvedValue({ guest_number: 14, total_guests: 14, completions_to_date: null, saved_moment_count: 0, analysis_unlocked: false });
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
    apiMock.storeChessComGuestMatch.mockResolvedValue({ game_id: 901 });
    apiMock.createMoment.mockImplementation(async (request) => {
      const id = nextMomentId++;
      serverMomentCount += 1;
      const moment = { id, ...request };
      return { private_moment: moment, public_moment: { ...moment, id: id + 10_000 } };
    });
    apiMock.deleteMoment.mockImplementation(async () => {
      serverMomentCount -= 1;
      return { deleted: true };
    });
    apiMock.explorationMove.mockImplementation(async (request) => {
      if (request.dry_run) return { legal: true, legal_destinations: ["e3"] };
      const current = useCoachStore.getState();
      const frame = current.game?.timeline[Math.max(0, current.globalPly - 1)];
      return { legal: true, notation: "e3", board_a: frame?.board_a, board_b: frame?.board_b };
    });
    apiMock.explorationSanMove.mockImplementation(async () => {
      const current = useCoachStore.getState();
      const frame = current.game?.timeline[Math.max(0, current.globalPly - 1)];
      return { legal: true, notation: "e3", board_a: frame?.board_a, board_b: frame?.board_b };
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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
    expect(screen.getByRole("tab", { name: "Quest" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open flashcard library" }));
    expect(screen.getByRole("timer", { name: "Session countdown" }).textContent).toMatch(/^(5:00|4:59)$/);
    fireEvent.click(screen.getByRole("button", { name: "Close flashcard library" }));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await saveMoment("!!", "Timing");
    expect(container.querySelector(".side-panel")?.getAttribute("data-saved-moment-count")).toBe("1");
    expect(apiMock.storeChessComGuestMatch).toHaveBeenCalledWith(firstMatch.game_ids.A);
    expect(apiMock.storeChessComGuestMatch.mock.invocationCallOrder[0]).toBeLessThan(apiMock.createMoment.mock.invocationCallOrder[0]);
    expect(apiMock.createMoment.mock.calls[0][0]).toMatchObject({
      game_id: 901,
      glyph: "!!",
      alternative_move: "e3",
      written_answer: "Because Timing",
      engine_identity: null,
      engine_depth: null,
    });
    expect(apiMock.createMoment.mock.calls[0][0].move_token).toMatch(/^[1-9]\d*[AaBb]$/);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await saveMoment("?!", "The transfer changes what the other board can allow.");
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
    await saveMoment("!", "A second game shows the same timing from another angle.", true);
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
    await waitFor(() => expect(loadGuestProgress().savedMoments).toHaveLength(2));
    expect(container.querySelector(".side-panel")?.getAttribute("data-saved-moment-count")).toBe("2");
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(2);
  }, 10_000);

  it("shows a malformed moment address without loading or seeking a game", async () => {
    history.replaceState(null, "", "/?game=101&moment=1Aextra");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);

    expect((await screen.findByRole("alert")).textContent).toContain("is malformed");
    expect(useCoachStore.getState().game).toBeNull();
    expect(useCoachStore.getState().globalPly).toBe(0);
    expect(apiMock.guestMatchups).not.toHaveBeenCalled();
    expect(apiMock.chessComMatchReplay).not.toHaveBeenCalled();
  });

  it("shows an unknown bridge game without loading or seeking a replay", async () => {
    history.replaceState(null, "", "/?game=999999999&moment=1A");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);

    expect((await screen.findByRole("alert")).textContent).toContain("could not resolve bridge game 999999999");
    expect(useCoachStore.getState().game).toBeNull();
    expect(useCoachStore.getState().globalPly).toBe(0);
    expect(apiMock.chessComMatchReplay).not.toHaveBeenCalled();
  });

  it("shows a zero-frame moment address without committing the loaded replay", async () => {
    history.replaceState(null, "", `/?game=${firstMatch.game_ids.A}&moment=999A`);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);

    expect((await screen.findByRole("alert")).textContent).toContain("does not identify any coupled replay frame");
    expect(useCoachStore.getState().game).toBeNull();
    expect(useCoachStore.getState().globalPly).toBe(0);
    expect(apiMock.chessComMatchReplay).toHaveBeenCalledWith(firstMatch.game_ids.A);
  });

  it("round-trips a copied saved-moment link through the fail-closed reader", async () => {
    const firstClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={firstClient}><App /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    fireEvent.keyDown(await screen.findByRole("listbox", { name: "Guest matchups" }), { key: "Enter" });
    expect(await screen.findAllByLabelText(/Board chessboard/)).toHaveLength(2);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await saveMoment("!", "the copied address returns to this exact frame");

    fireEvent.click(screen.getByRole("tab", { name: /Library/ }));
    fireEvent.click(screen.getByRole("button", { name: /Copy moment link for/ }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledOnce());
    const copied = new URL(String(clipboardWrite.mock.calls[0][0]));
    const savedRequest = apiMock.createMoment.mock.calls[0][0];
    expect(copied.searchParams.get("game")).toBe(String(firstMatch.game_ids.A));
    expect(copied.searchParams.get("moment")).toBe(savedRequest.move_token);

    cleanup();
    useCoachStore.setState({ game: null, guestMatch: null, roomId: null, globalPly: 0, mode: "review" });
    history.replaceState(null, "", `${copied.pathname}${copied.search}`);
    const secondClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={secondClient}><App /></QueryClientProvider>);

    await waitFor(() => expect(useCoachStore.getState().guestMatch?.game_ids).toEqual(firstMatch.game_ids));
    expect(useCoachStore.getState().globalPly).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull();
  }, 10_000);

  it("sends a playable engine line with provenance, clears it on divergence, and refuses an unplayable line", async () => {
    serverMomentCount = 10;
    let requestedAnalysis: { board: "A" | "B"; global_ply: number } | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (String(input) === "/api/analysis") {
        requestedAnalysis = JSON.parse(String(init?.body)) as { board: "A" | "B"; global_ply: number };
        return new Response(JSON.stringify({ job_id: "engine-moment", status: "queued", engine: "Fairy-Stockfish" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      const analysis = requestedAnalysis;
      if (!analysis) throw new Error("Analysis was polled before it was submitted.");
      return new Response(JSON.stringify({
        status: "completed",
        engine: "Fairy-Stockfish",
        board: analysis.board,
        global_ply: analysis.global_ply,
        depth: 10,
        cached: false,
        result: {
          fen: "8/8/8/8/8/8/8/8[] w - - 0 1",
          bestmove: "e2e4",
          score_cp: 42,
          mate_in: null,
          pv: ["e2e4", "e7e5"],
          depth: 10,
          variant_supported: true,
          engine_name: "Fairy-Stockfish 14",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    fireEvent.keyDown(await screen.findByRole("listbox", { name: "Guest matchups" }), { key: "Enter" });
    expect(await screen.findAllByLabelText(/Board chessboard/)).toHaveLength(2);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const selectedFrame = useCoachStore.getState().game?.timeline[1];
    if (!selectedFrame) throw new Error("Test replay did not expose the first coupled move frame.");
    if (selectedFrame.board === "A") fireEvent.click(screen.getByRole("button", { name: "Swap staged board" }));
    fireEvent.click(screen.getByRole("tab", { name: "Analysis" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Enable" }));
    const sendControl = await screen.findByRole("button", { name: "Send to moment" });

    fireEvent.click(sendControl);
    let wizard = await screen.findByLabelText("Learning moment wizard steps 1 through 4");
    fireEvent.click(within(within(wizard).getByLabelText("Moves at this position")).getAllByRole("button")[0]);
    fireEvent.keyDown(within(wizard).getByRole("group", { name: "Required move glyph" }), { key: "1" });
    expect(within(wizard).getByRole("heading", { name: "Instead, play e3" })).toBeTruthy();
    fireEvent.change(within(wizard).getByRole("textbox", { name: "Written answer after Because" }), { target: { value: "the engine line keeps the initiative" } });
    fireEvent.click(within(wizard).getByRole("button", { name: "Save moment" }));
    await waitFor(() => expect(screen.queryByLabelText("Learning moment wizard steps 1 through 4")).toBeNull());
    expect(apiMock.explorationSanMove).toHaveBeenLastCalledWith(expect.objectContaining({ board: selectedFrame.board, san: "e2e4" }));
    expect(apiMock.createMoment.mock.calls.at(-1)?.[0]).toMatchObject({
      alternative_move: "e3",
      engine_identity: "Fairy-Stockfish 14",
      engine_depth: 10,
    });

    fireEvent.click(screen.getByRole("button", { name: "Send to moment" }));
    wizard = await screen.findByLabelText("Learning moment wizard steps 1 through 4");
    fireEvent.click(within(within(wizard).getByLabelText("Moves at this position")).getAllByRole("button")[0]);
    fireEvent.keyDown(within(wizard).getByRole("group", { name: "Required move glyph" }), { key: "2" });
    expect(within(wizard).getByRole("heading", { name: "Instead, play e3" })).toBeTruthy();
    apiMock.explorationMove.mockImplementation(async (request) => {
      if (request.dry_run) return { legal: true, legal_destinations: ["e3"] };
      const current = useCoachStore.getState();
      const frame = current.game?.timeline[Math.max(0, current.globalPly - 1)];
      return { legal: true, notation: "Nf3", board_a: frame?.board_a, board_b: frame?.board_b };
    });
    const board = within(wizard).getByLabelText(/alternative chessboard/);
    const squares = within(board).getAllByRole("button");
    const sideToMove = board.closest(".board-panel")?.querySelector(".board-heading > span:last-child")?.textContent ?? "";
    const piecePattern = sideToMove.startsWith("Black") ? / [kqrbnp]$/ : / [KQRBNP]$/;
    fireEvent.click(squares.find((button) => piecePattern.test(button.getAttribute("aria-label") ?? ""))!);
    fireEvent.click(squares.find((button) => /^[a-h][1-8]$/.test(button.getAttribute("aria-label") ?? ""))!);
    await within(wizard).findByRole("heading", { name: "Instead, play Nf3" });
    fireEvent.change(within(wizard).getByRole("textbox", { name: "Written answer after Because" }), { target: { value: "a different board move was chosen" } });
    fireEvent.click(within(wizard).getByRole("button", { name: "Save moment" }));
    await waitFor(() => expect(screen.queryByLabelText("Learning moment wizard steps 1 through 4")).toBeNull());
    expect(apiMock.createMoment.mock.calls.at(-1)?.[0]).toMatchObject({
      alternative_move: "Nf3",
      engine_identity: null,
      engine_depth: null,
    });

    apiMock.explorationSanMove.mockResolvedValueOnce({ legal: false, reason: "This notation is not legal in the current Bughouse position." });
    fireEvent.click(screen.getByRole("button", { name: "Send to moment" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be played in the selected frame");
    expect(screen.queryByLabelText("Learning moment wizard steps 1 through 4")).toBeNull();
    expect(apiMock.createMoment).toHaveBeenCalledTimes(2);
  });

  it("leaves the live count unchanged and surfaces a daily-cap refusal", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Click me\?/ }));
    fireEvent.keyDown(await screen.findByRole("listbox", { name: "Guest matchups" }), { key: "Enter" });
    expect(await screen.findAllByLabelText(/Board chessboard/)).toHaveLength(2);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    apiMock.createMoment.mockRejectedValueOnce(new ApiError(429, "daily moment cap reached", { code: "daily_moment_cap_reached" }));

    if (screen.queryByLabelText("Learning moment wizard steps 1 through 4")) throw new Error("Wizard unexpectedly open before save.");
    fireEvent.keyDown(window, { key: "m" });
    const wizard = screen.getByLabelText("Learning moment wizard steps 1 through 4");
    fireEvent.click(within(within(wizard).getByLabelText("Moves at this position")).getAllByRole("button")[0]);
    fireEvent.keyDown(within(wizard).getByRole("group", { name: "Required move glyph" }), { key: "1" });
    const board = within(wizard).getByLabelText(/alternative chessboard/);
    const squares = within(board).getAllByRole("button");
    fireEvent.click(squares.find((button) => / [KQRBNP]$/.test(button.getAttribute("aria-label") ?? ""))!);
    fireEvent.click(squares.find((button) => /^[a-h][1-8]$/.test(button.getAttribute("aria-label") ?? ""))!);
    await within(wizard).findByRole("heading", { name: "Instead, play e3" });
    fireEvent.change(within(wizard).getByRole("textbox", { name: "Written answer after Because" }), { target: { value: "the timing fails" } });
    fireEvent.click(within(wizard).getByRole("button", { name: "Save moment" }));

    expect((await within(wizard).findByRole("alert")).textContent).toContain("daily_moment_cap_reached");
    expect(container.querySelector(".side-panel")?.getAttribute("data-saved-moment-count")).toBe("0");
    expect(loadGuestProgress().savedMoments).toHaveLength(0);
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
    expect(screen.getByRole("tab", { name: "Quest" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open flashcard library" }));
    expect(screen.getByRole("timer", { name: "Session countdown" }).textContent).toBe("0:01");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(document.querySelector(".session-expiry-wipe")).not.toBeNull();
    expect(apiMock.resetGuestSession).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(apiMock.resetGuestSession).toHaveBeenCalledOnce();
    expect(useCoachStore.getState().game).toBeNull();
    expect(useCoachStore.getState().guestMatch).toBeNull();
    const restarted = loadGuestProgress();
    expect(restarted.firstGameOpened).toBe(false);
    expect(restarted.savedMoments).toHaveLength(0);
    expect(restarted.questDeadline).toBeGreaterThan(Date.now());
    expect(screen.getByRole("heading", { name: "Salutations, SirGuest#14!" })).toBeTruthy();
    expect(screen.getByText("— of 14 visitors have completed the three-for-five challenge to date. Fail to complete it in time and you will be returned to the landing page under your new name, SirGuest#15. Mwahaha! Kittens and cookies! Mwahaha, yessss.")).toBeTruthy();
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
      await saveMoment(glyph, note);
    }

    const completed = loadGuestProgress();
    expect(completed.savedMoments).toHaveLength(3);
    expect(completed.questCompleted).toBe(true);
    expect(completed.questDeadline).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Complete" }));
    expect(screen.getByRole("progressbar", { name: "Quest learning moments" }).getAttribute("aria-valuenow")).toBe("3");
  });
});
