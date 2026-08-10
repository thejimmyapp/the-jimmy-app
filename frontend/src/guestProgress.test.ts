import { beforeEach, describe, expect, it } from "vitest";
import type { ReviewLesson } from "./types";
import {
  ANALYSIS_ACKNOWLEDGEMENT_KEY,
  ANALYSIS_ACKNOWLEDGEMENT_VERSION,
  GUEST_PROGRESS_KEY,
  acceptAnalysisAcknowledgement,
  clearGuestProgress,
  emptyGuestProgress,
  hasAnalysisAcknowledgement,
  isLessonEligible,
  loadGuestProgress,
  qualifyingGameCount,
  savedLessonFrom,
  savedMomentCount,
  storeGuestProgress,
  type SavedMoment,
} from "./guestProgress";

const lesson = (overrides: Partial<ReviewLesson> = {}): ReviewLesson => ({
  id: "mistake-1",
  board: "A",
  local_ply: 7,
  global_ply: 11,
  played_move: "Nxf7",
  best_move: "N@h6",
  severity: "mistake",
  estimated_loss_cp: 184,
  category: "ignored partner danger",
  pattern: "removal of defender",
  confidence: "high",
  depth: 14,
  partner_context: null,
  ...overrides,
});

const moment: SavedMoment = {
  matchIds: { A: 101, B: 102 },
  ply: 24,
  boardId: "B",
  move: "N@h6",
  seat: "A-black",
  glyph: "!?",
  note: "Cuts off the king while the other board catches up.",
  savedAt: "2026-08-10T00:00:00.000Z",
};

describe("versioned guest progress", () => {
  beforeEach(() => localStorage.clear());

  it("recovers safely from corrupt and stale storage", () => {
    localStorage.setItem(GUEST_PROGRESS_KEY, "not-json");
    expect(loadGuestProgress()).toEqual(emptyGuestProgress());
    localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify({ version: 0, firstGameOpened: true }));
    expect(loadGuestProgress()).toEqual(emptyGuestProgress());
  });

  it("hydrates a complete locked capability map for legacy progress", () => {
    localStorage.setItem("thejimmyapp.guestProgress.v1", JSON.stringify({ version: 1, firstGameOpened: false, mapNode: "start", savedLessons: [] }));
    const progress = loadGuestProgress();
    expect(progress.capabilities.rail_onboarding).toBe("unlocked");
    expect(progress.capabilities.rail_statistics).toBe("locked");
    expect(progress.capabilities.dock_review).toBe("locked");
    expect(progress.capabilities.board_analysis).toBe("locked");
    expect(progress.capabilities.team_coach).toBe("locked");
    expect(progress.savedMoments).toEqual([]);
    expect(Object.keys(progress.capabilities)).toHaveLength(11);
  });

  it("counts qualifying distinct games without over-counting duplicates", () => {
    const first = savedLessonFrom(10, lesson(), "2026-01-01T00:00:00Z")!;
    const sameGame = savedLessonFrom(10, lesson({ id: "mistake-2" }))!;
    const second = savedLessonFrom(11, lesson({ id: "mistake-3", confidence: "medium" }))!;
    const third = savedLessonFrom(12, lesson({ id: "mistake-4", severity: "blunder" }))!;
    expect(qualifyingGameCount([first, sameGame])).toBe(1);
    expect(qualifyingGameCount([first, sameGame, second, third])).toBe(3);
  });

  it("rejects inaccuracies, low confidence, and unsupported suggestions", () => {
    expect(isLessonEligible(lesson())).toBe(true);
    expect(isLessonEligible(lesson({ severity: "inaccuracy" }))).toBe(false);
    expect(isLessonEligible({ ...lesson(), confidence: "low" } as unknown as ReviewLesson)).toBe(false);
    expect(isLessonEligible(lesson({ best_move: "" }))).toBe(false);
  });

  it("persists, rehydrates, and clears progress and acknowledgement", () => {
    const progress = { ...emptyGuestProgress(), firstGameOpened: true, mapNode: "library" as const, savedLessons: [savedLessonFrom(10, lesson())!], savedMoments: [moment] };
    storeGuestProgress(progress);
    expect(loadGuestProgress()).toEqual(progress);
    expect(savedMomentCount(loadGuestProgress())).toBe(1);
    expect(hasAnalysisAcknowledgement()).toBe(false);
    acceptAnalysisAcknowledgement();
    expect(localStorage.getItem(ANALYSIS_ACKNOWLEDGEMENT_KEY)).toBe(ANALYSIS_ACKNOWLEDGEMENT_VERSION);
    expect(hasAnalysisAcknowledgement()).toBe(true);
    clearGuestProgress();
    expect(loadGuestProgress()).toEqual(emptyGuestProgress());
    expect(hasAnalysisAcknowledgement()).toBe(false);
  });
});
