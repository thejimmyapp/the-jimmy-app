import { beforeEach, describe, expect, it } from "vitest";
import { emptyGuestProgress, loadGuestProgress, storeGuestProgress } from "./guestProgress";
import { completeGuestQuestIfReady, formatQuestCountdown, questRemainingSeconds, questRoomMessage, QUEST_DURATION_MS, startGuestQuest } from "./quest";

const moment = (savedAt: string) => ({
  matchIds: { A: 101, B: 102 },
  ply: 15,
  boardId: "B" as const,
  move: "Ke1e2",
  seat: "A-white" as const,
  glyph: "!" as const,
  note: "The king move changes the transfer timing.",
  savedAt,
});

describe("guest quest lifecycle", () => {
  beforeEach(() => localStorage.clear());

  it("starts once and preserves the same absolute deadline across reload calculations", () => {
    const started = startGuestQuest(emptyGuestProgress(), 1_000);
    storeGuestProgress(started);
    const reloaded = loadGuestProgress();
    expect(started.questDeadline).toBe(1_000 + QUEST_DURATION_MS);
    expect(reloaded.questDeadline).toBe(started.questDeadline);
    expect(startGuestQuest(reloaded, 9_000)).toBe(reloaded);
    expect(questRemainingSeconds(reloaded.questDeadline, 61_000)).toBe(240);
    expect(formatQuestCountdown(277)).toBe("4:37");
  });

  it("stops permanently and unlocks the capability at three moments", () => {
    const running = startGuestQuest({
      ...emptyGuestProgress(),
      savedMoments: [moment("one"), moment("two"), moment("three")],
    }, 1_000);
    const completed = completeGuestQuestIfReady(running, 3);
    expect(completed.questCompleted).toBe(true);
    expect(completed.questDeadline).toBeNull();
    expect(completed.capabilities.dock_quest).toBe("unlocked");
    expect(completeGuestQuestIfReady({ ...completed, savedMoments: [] }, 0).questCompleted).toBe(true);
    expect(completeGuestQuestIfReady({ ...running, savedMoments: [] }, 2).questCompleted).toBe(false);
  });

  it("formats the live shared-room warning", () => {
    expect(questRoomMessage(277)).toBe("everything here resets in 4:37 — help guest_1 complete their quest.");
  });
});
