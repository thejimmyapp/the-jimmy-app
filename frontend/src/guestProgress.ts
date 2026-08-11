import type { BoardId, MatchSeat, ReviewLesson } from "./types";

const LEGACY_GUEST_PROGRESS_KEY = "thejimmyapp.guestProgress.v1";
const PRE_QUEST_GUEST_PROGRESS_KEY = "thejimmyapp.guestProgress.v2";
export const GUEST_PROGRESS_KEY = "thejimmyapp.guestProgress.v3";
export const ANALYSIS_ACKNOWLEDGEMENT_KEY = "thejimmyapp.analysisAcknowledgement.v1";
export const GUEST_PROGRESS_VERSION = 3 as const;
export const ANALYSIS_ACKNOWLEDGEMENT_VERSION = "analysis-limits-2026-08-06";

export type MapNodeId = "start" | "analyze" | "library" | "partner";

export const capabilityKeys = [
  "rail_onboarding",
  "rail_review",
  "rail_statistics",
  "rail_settings",
  "rail_chesscom",
  "dock_review",
  "dock_games",
  "dock_library",
  "dock_collaborate",
  "dock_quest",
  "board_analysis",
  "team_coach",
] as const;

export type CapabilityKey = (typeof capabilityKeys)[number];
export type CapabilityState = "locked" | "unlocked";
export type CapabilityMap = Record<CapabilityKey, CapabilityState>;

export const initialCapabilityMap = (): CapabilityMap => ({
  rail_onboarding: "unlocked",
  rail_review: "locked",
  rail_statistics: "locked",
  rail_settings: "locked",
  rail_chesscom: "locked",
  dock_review: "locked",
  dock_games: "locked",
  dock_library: "locked",
  dock_collaborate: "locked",
  dock_quest: "locked",
  board_analysis: "locked",
  team_coach: "locked",
});

export const isCapabilityLocked = (capabilities: CapabilityMap, key: CapabilityKey) => capabilities[key] === "locked";

export interface SavedLesson {
  id: string;
  gameId: number;
  board: "A";
  localPly: number;
  globalPly: number;
  playedMove: string;
  bestMove: string;
  severity: "mistake" | "blunder";
  estimatedLossCp: number;
  category: string;
  pattern: string;
  confidence: "high" | "medium";
  depth: number | null;
  partnerContext: string | null;
  savedAt: string;
}

export const momentGlyphs = ["!!", "!", "!?", "?!", "?", "??"] as const;
export type MomentGlyph = (typeof momentGlyphs)[number];

export interface SavedMoment {
  serverId?: number;
  matchIds: Record<BoardId, number>;
  ply: number;
  boardId: BoardId;
  move: string;
  seat: MatchSeat;
  glyph: MomentGlyph;
  alternativeMove?: string;
  note: string;
  savedAt: string;
}

export interface GuestProgress {
  version: typeof GUEST_PROGRESS_VERSION;
  firstGameOpened: boolean;
  mapNode: MapNodeId;
  savedLessons: SavedLesson[];
  savedMoments: SavedMoment[];
  questDeadline: number | null;
  questCompleted: boolean;
  capabilities: CapabilityMap;
}

export const emptyGuestProgress = (): GuestProgress => ({
  version: GUEST_PROGRESS_VERSION,
  firstGameOpened: false,
  mapNode: "start",
  savedLessons: [],
  savedMoments: [],
  questDeadline: null,
  questCompleted: false,
  capabilities: initialCapabilityMap(),
});

const mapNodes = new Set<MapNodeId>(["start", "analyze", "library", "partner"]);
const loadCapabilities = (value: unknown): CapabilityMap => {
  const initial = initialCapabilityMap();
  if (!value || typeof value !== "object") return initial;
  const stored = value as Partial<Record<CapabilityKey, unknown>>;
  return Object.fromEntries(capabilityKeys.map((key) => [key, stored[key] === "unlocked" ? "unlocked" : initial[key]])) as CapabilityMap;
};

const isSavedLesson = (value: unknown): value is SavedLesson => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedLesson>;
  return typeof item.id === "string"
    && item.id.length > 0
    && Number.isSafeInteger(item.gameId)
    && Number.isInteger(item.localPly)
    && Number.isInteger(item.globalPly)
    && item.board === "A"
    && typeof item.playedMove === "string"
    && typeof item.bestMove === "string"
    && (item.severity === "mistake" || item.severity === "blunder")
    && (item.confidence === "high" || item.confidence === "medium")
    && typeof item.savedAt === "string";
};

const isSavedMoment = (value: unknown): value is SavedMoment => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedMoment>;
  return (item.serverId === undefined || (Number.isSafeInteger(item.serverId) && Number(item.serverId) > 0))
    && (item.alternativeMove === undefined || (typeof item.alternativeMove === "string" && item.alternativeMove.trim().length > 0))
    && Boolean(item.matchIds)
    && Number.isSafeInteger(item.matchIds?.A)
    && Number.isSafeInteger(item.matchIds?.B)
    && Number.isInteger(item.ply)
    && Number(item.ply) > 0
    && (item.boardId === "A" || item.boardId === "B")
    && typeof item.move === "string"
    && item.move.trim().length > 0
    && typeof item.seat === "string"
    && /^(A|B)-(white|black)$/.test(item.seat)
    && momentGlyphs.includes(item.glyph as MomentGlyph)
    && typeof item.note === "string"
    && item.note.trim().length > 0
    && typeof item.savedAt === "string"
    && item.savedAt.length > 0;
};

const parseProgress = (raw: string): GuestProgress => {
  const parsed = JSON.parse(raw) as Omit<Partial<GuestProgress>, "version"> & { version?: number };
  if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== GUEST_PROGRESS_VERSION) return emptyGuestProgress();
  const savedMoments = parsed.version >= 2 && Array.isArray(parsed.savedMoments) ? parsed.savedMoments.filter(isSavedMoment) : [];
  const questCompleted = parsed.version === GUEST_PROGRESS_VERSION ? parsed.questCompleted === true : savedMoments.length >= 3;
  const storedDeadline = Number(parsed.questDeadline);
  const capabilities = loadCapabilities(parsed.capabilities);
  if (questCompleted) capabilities.dock_quest = "unlocked";
  return {
    version: GUEST_PROGRESS_VERSION,
    firstGameOpened: parsed.firstGameOpened === true,
    mapNode: mapNodes.has(parsed.mapNode as MapNodeId) ? parsed.mapNode as MapNodeId : "start",
    savedLessons: Array.isArray(parsed.savedLessons) ? parsed.savedLessons.filter(isSavedLesson) : [],
    savedMoments,
    questDeadline: !questCompleted && parsed.version === GUEST_PROGRESS_VERSION && Number.isSafeInteger(storedDeadline) && storedDeadline > 0 ? storedDeadline : null,
    questCompleted,
    capabilities,
  };
};

export const loadGuestProgress = (): GuestProgress => {
  try {
    const raw = localStorage.getItem(GUEST_PROGRESS_KEY) ?? localStorage.getItem(PRE_QUEST_GUEST_PROGRESS_KEY) ?? localStorage.getItem(LEGACY_GUEST_PROGRESS_KEY);
    if (!raw) return emptyGuestProgress();
    return parseProgress(raw);
  } catch {
    return emptyGuestProgress();
  }
};

export const storeGuestProgress = (progress: GuestProgress) => {
  localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(progress));
};

export const savedMomentKey = (moment: SavedMoment) => [
  moment.matchIds.A,
  moment.matchIds.B,
  moment.ply,
  moment.boardId,
  moment.glyph,
  moment.savedAt,
  moment.note,
].join(":");

export const savedMomentCount = (progress: Pick<GuestProgress, "savedMoments">) => progress.savedMoments.length;

export const isLessonEligible = (lesson: ReviewLesson | null | undefined) => Boolean(
  lesson
  && lesson.id.trim()
  && lesson.best_move.trim()
  && (lesson.confidence === "high" || lesson.confidence === "medium")
  && (lesson.severity === "mistake" || lesson.severity === "blunder"),
);

export const lessonStorageId = (gameId: number, lesson: ReviewLesson) => `${gameId}:${lesson.id}`;

export const savedLessonFrom = (gameId: number, lesson: ReviewLesson, savedAt = new Date().toISOString()): SavedLesson | null => {
  if (!isLessonEligible(lesson)) return null;
  return {
    id: lessonStorageId(gameId, lesson),
    gameId,
    board: "A",
    localPly: lesson.local_ply,
    globalPly: lesson.global_ply,
    playedMove: lesson.played_move,
    bestMove: lesson.best_move,
    severity: lesson.severity as "mistake" | "blunder",
    estimatedLossCp: lesson.estimated_loss_cp,
    category: lesson.category,
    pattern: lesson.pattern,
    confidence: lesson.confidence,
    depth: lesson.depth,
    partnerContext: lesson.partner_context,
    savedAt,
  };
};

export const qualifyingGameCount = (items: SavedLesson[]) => new Set(
  items.filter((item) => item.bestMove.trim() && (item.severity === "mistake" || item.severity === "blunder") && (item.confidence === "high" || item.confidence === "medium"))
    .map((item) => item.gameId),
).size;

export const hasAnalysisAcknowledgement = () => localStorage.getItem(ANALYSIS_ACKNOWLEDGEMENT_KEY) === ANALYSIS_ACKNOWLEDGEMENT_VERSION;

export const acceptAnalysisAcknowledgement = () => {
  localStorage.setItem(ANALYSIS_ACKNOWLEDGEMENT_KEY, ANALYSIS_ACKNOWLEDGEMENT_VERSION);
};

export const clearGuestProgress = () => {
  localStorage.removeItem(GUEST_PROGRESS_KEY);
  localStorage.removeItem(PRE_QUEST_GUEST_PROGRESS_KEY);
  localStorage.removeItem(LEGACY_GUEST_PROGRESS_KEY);
  localStorage.removeItem(ANALYSIS_ACKNOWLEDGEMENT_KEY);
};
