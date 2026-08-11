import type { GuestProgress } from "./guestProgress";

export const QUEST_DURATION_MS = 5 * 60 * 1000;
export const QUEST_TARGET_MOMENTS = 3;
export const QUEST_COPY = "This tab is a locked feature. It unlocks when you complete the quest: save 3 learning moments from this game (press m). Why a quest? Because nobody does this naturally — that's exactly why it works. When the clock hits zero, this guest session resets and everything unsaved is gone. Jimmy is a real person and is not trying to charge you money. There is no subscription. Save 3 moments and the clock stops forever.";

export const startGuestQuest = (progress: GuestProgress, now = Date.now()): GuestProgress => {
  if (progress.questCompleted || progress.questDeadline !== null) return progress;
  return { ...progress, questDeadline: now + QUEST_DURATION_MS };
};

export const questRemainingSeconds = (deadline: number | null, now = Date.now()) => deadline === null
  ? null
  : Math.max(0, Math.ceil((deadline - now) / 1000));

export const formatQuestCountdown = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

export const completeGuestQuestIfReady = (progress: GuestProgress, savedMomentCount: number): GuestProgress => {
  if (progress.questCompleted || Math.min(QUEST_TARGET_MOMENTS, savedMomentCount) < QUEST_TARGET_MOMENTS) return progress;
  return {
    ...progress,
    questDeadline: null,
    questCompleted: true,
    capabilities: { ...progress.capabilities, dock_quest: "unlocked" },
  };
};

export const questRoomMessage = (seconds: number) => `everything here resets in ${formatQuestCountdown(seconds)} — help guest_1 complete their quest.`;
