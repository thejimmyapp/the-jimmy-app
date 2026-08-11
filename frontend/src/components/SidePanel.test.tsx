import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCapabilityMap, type SavedLesson } from "../guestProgress";
import { QUEST_COPY } from "../quest";
import { useCoachStore } from "../store";
import type { NormalizedMatch } from "../types";
import { SidePanel } from "./SidePanel";

const saved: SavedLesson = {
  id: "42:mistake-1",
  gameId: 42,
  board: "A",
  localPly: 7,
  globalPly: 11,
  playedMove: "Nxf7",
  bestMove: "N@h6",
  severity: "mistake",
  estimatedLossCp: 184,
  category: "king safety",
  pattern: "removal of defender",
  confidence: "high",
  depth: 14,
  partnerContext: null,
  savedAt: "2026-08-06T00:00:00Z",
};

const renderPanel = (overrides: Partial<Parameters<typeof SidePanel>[0]> = {}) => {
  const props: Parameters<typeof SidePanel>[0] = {
    onSelectGame: vi.fn(),
    loadingGame: false,
    boardContent: <div>Compact second board</div>,
    analysisContent: <div>Live engine card</div>,
    infoContent: <div>Review information</div>,
    savedLessons: [saved],
    qualifyingGames: 1,
    onOpenSavedLesson: vi.fn().mockResolvedValue(true),
    onRemoveSavedLesson: vi.fn(),
    onMap: vi.fn(),
    capabilities: {
      ...initialCapabilityMap(),
      dock_review: "unlocked",
      dock_games: "unlocked",
      dock_library: "unlocked",
      dock_collaborate: "unlocked",
    },
    ...overrides,
  };
  render(<SidePanel {...props} />);
  return props;
};

describe("review utility panel", () => {
  beforeEach(() => useCoachStore.setState({ game: null, guestMatch: null, games: [], messages: [], roomId: null, globalPly: 0 }));
  afterEach(cleanup);

  it("orders review tabs with Info first and leaves every sub-tab unselected without a game", () => {
    renderPanel({ boardContent: undefined, capabilities: initialCapabilityMap() });
    const container = document.body;
    const labels = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Review views"] > button')).map((button) => button.textContent);
    expect(labels).toEqual(["Info", "Moves", "Second Board"]);
    expect(container.querySelector('[aria-label="Review views"] > button.active')).toBeNull();
    expect(container.querySelector('[aria-label="Review views"] > button[aria-selected="true"]')).toBeNull();
    expect(screen.queryByText("Complete onboarding to open review tools.")).toBeNull();
  });

  it("preserves a collaboration draft across primary tabs", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Collaborate" }));
    const composer = screen.getByPlaceholderText("Message your partner") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "keep this draft" } });
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    fireEvent.click(screen.getByRole("tab", { name: "Collaborate" }));
    expect((screen.getByPlaceholderText("Message your partner") as HTMLTextAreaElement).value).toBe("keep this draft");
  });

  it("keeps the Analysis tab active regardless of onboarding capabilities", () => {
    renderPanel({ capabilities: initialCapabilityMap() });
    const analysis = screen.getByRole("tab", { name: "Analysis" }) as HTMLButtonElement;
    expect(screen.getByText("Live engine card").closest(".analysis-pane")?.getAttribute("aria-hidden")).toBe("true");
    expect(analysis.disabled).toBe(false);
    fireEvent.click(analysis);
    expect(screen.getByText("Live engine card")).toBeTruthy();
    expect(screen.getByText("Live engine card").closest(".analysis-pane")?.getAttribute("aria-hidden")).toBe("false");
  });

  it("exposes a native swap button and keeps focus attached to the same named board", async () => {
    useCoachStore.setState({ guestMatch: {} as NormalizedMatch });
    const onSwapBoards = vi.fn();
    const onActiveBoardChange = vi.fn();
    renderPanel({ boardFocusEnabled: true, onSwapBoards, onActiveBoardChange });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Moves" }).getAttribute("aria-selected")).toBe("true"));

    const swap = screen.getByRole("button", { name: "Swap staged board" });
    expect(swap.getAttribute("type")).toBe("button");
    fireEvent.click(swap);

    expect(onSwapBoards).toHaveBeenCalledOnce();
    expect(onActiveBoardChange).toHaveBeenLastCalledWith("B");
    expect(screen.getByRole("tab", { name: "Second Board" }).getAttribute("aria-selected")).toBe("true");
  });

  it("reopens a saved exact game reference and can remove it", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    expect(screen.getByText("1/3 games toward second-board instructions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Nxf7 → N@h6/ }));
    await waitFor(() => expect(props.onOpenSavedLesson).toHaveBeenCalledWith(saved));
    fireEvent.click(screen.getByRole("button", { name: "Remove saved lesson from game 42" }));
    expect(props.onRemoveSavedLesson).toHaveBeenCalledWith(saved.id);
  });

  it("keeps the locked quest preview operable and shows progress plus the room warning", () => {
    useCoachStore.setState({ roomId: "room-1" });
    renderPanel({ questProgress: 2, roomQuestRemainingSeconds: 277 });
    const questTab = screen.getByRole("tab", { name: "Quest" }) as HTMLButtonElement;
    expect(questTab.disabled).toBe(false);
    expect(questTab.classList.contains("capability-locked")).toBe(true);
    fireEvent.click(questTab);
    expect(screen.getByText(QUEST_COPY)).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Quest learning moments" }).getAttribute("aria-valuenow")).toBe("2");
    expect(screen.getByText("everything here resets in 4:37 — help guest_1 complete their quest.")).toBeTruthy();
  });
});
