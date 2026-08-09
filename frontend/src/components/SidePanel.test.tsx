import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCapabilityMap, type SavedLesson } from "../guestProgress";
import { useCoachStore } from "../store";
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
    partnerContent: <div>Compact partner board</div>,
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
  beforeEach(() => useCoachStore.setState({ game: null, games: [], messages: [], roomId: null, globalPly: 0 }));
  afterEach(cleanup);

  it("defaults to Partner and preserves a collaboration draft across primary tabs", () => {
    renderPanel();
    expect(screen.getByText("Compact partner board")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Collaborate" }));
    const composer = screen.getByPlaceholderText("Message your partner") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "keep this draft" } });
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    fireEvent.click(screen.getByRole("tab", { name: "Collaborate" }));
    expect((screen.getByPlaceholderText("Message your partner") as HTMLTextAreaElement).value).toBe("keep this draft");
  });

  it("reopens a saved exact game reference and can remove it", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    expect(screen.getByText("1/3 games toward partner-board instructions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Nxf7 → N@h6/ }));
    await waitFor(() => expect(props.onOpenSavedLesson).toHaveBeenCalledWith(saved));
    fireEvent.click(screen.getByRole("button", { name: "Remove saved lesson from game 42" }));
    expect(props.onRemoveSavedLesson).toHaveBeenCalledWith(saved.id);
  });
});
