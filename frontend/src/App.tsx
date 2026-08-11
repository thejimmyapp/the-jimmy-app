import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, BookOpen, Bot, Check, Copy, ExternalLink, FileInput, Flag, Home, LockKeyhole, LogOut, Palette, Radio, Redo2, RotateCcw, Settings, ShieldCheck, Swords, Undo2, UserRoundPlus, Users, X } from "lucide-react";
import { CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { MatchReconstructionError, reconstructGuestMatch } from "./bughouseDecoder";
import { buildChessComConnectorPrompt } from "./chesscomConnectorPrompt";
import { bmachoUrlFromChessComUrl } from "./chesscomGameUrl";
import { guestBoardPresentation } from "./guestBoardPresentation";
import { guestMatchupsQuery } from "./guestMatchupsQuery";
import { BoardPanel } from "./components/BoardPanel";
import { AppShell } from "./components/AppShell";
import { AnalysisAcknowledgement } from "./components/AnalysisAcknowledgement";
import { FakeStockfishGate } from "./components/FakeStockfishCard";
import { LegalLinks } from "./components/LegalLinks";
import { LiveEvalCard } from "./components/LiveEvalCard";
import { GuestMatchupList } from "./components/GuestMatchupList";
import { GuestFlashcardPanel } from "./components/GuestFlashcardPanel";
import { OnboardingMap } from "./components/OnboardingMap";
import { MomentEditor } from "./components/MomentEditor";
import { ReviewLesson } from "./components/ReviewLesson";
import { ReplayLimitationsExpander } from "./components/ReplayLimitationsExpander";
import { SidePanel } from "./components/SidePanel";
import { StatsDashboard } from "./components/StatsDashboard";
import { TeamCoach } from "./components/TeamCoach";
import { acceptAnalysisAcknowledgement, clearGuestProgress, emptyGuestProgress, hasAnalysisAcknowledgement, isCapabilityLocked, lessonStorageId, loadGuestProgress, qualifyingGameCount, savedLessonFrom, savedMomentCount, savedMomentKey, storeGuestProgress, type CapabilityKey, type GuestProgress, type MomentGlyph, type SavedLesson, type SavedMoment } from "./guestProgress";
import { EMPTY_GUEST_SESSION } from "./guestChrome";
import { captureMomentContext, matchForSavedMoment, playerNamesForMoment, savedMomentFromCapture, type MomentCapture } from "./learningMoments";
import { completeGuestQuestIfReady, questMomentProgress, questRemainingSeconds, startGuestQuest } from "./quest";
import { applyRoomSnapshot, connectRoomSocket, disconnectRoomSocket, sendRoomEvent } from "./socket";
import { currentPosition, useCoachStore } from "./store";
import { replayNotices } from "./replayIntegrity";
import type { BoardId, GameSummary, NormalizedMatch } from "./types";

const boardThemes = [
  { id: "slate", name: "Slate", light: "#c8d2d8", dark: "#58717e", white: "#f7f5ed", black: "#17202b" },
  { id: "classic", name: "Classic", light: "#edd8b4", dark: "#b98b64", white: "#fff9ec", black: "#050505" },
  { id: "wood", name: "Wood", light: "#e6c690", dark: "#9b683d", white: "#fff7e3", black: "#3e3e3e" },
  { id: "green", name: "Green", light: "#eee4c9", dark: "#739352", white: "#f7f7f0", black: "#1f2933" },
  { id: "blue", name: "Blue", light: "#d8e3ea", dark: "#6d92a4", white: "#ffffff", black: "#182536" },
  { id: "violet", name: "Violet", light: "#ded6ea", dark: "#7c6798", white: "#fffaf0", black: "#1d1630" },
  { id: "mono", name: "Mono", light: "#dedede", dark: "#7b7b7b", white: "#ffffff", black: "#0b0b0b" },
] as const;

type BoardThemeId = (typeof boardThemes)[number]["id"];
const pieceStyles = [
  { id: "classic", name: "Classic", white: "\u2658", black: "\u265E" },
  { id: "solid", name: "Filled", white: "\u265E", black: "\u265E" },
  { id: "bold", name: "Bold", white: "\u265C", black: "\u265C" },
  { id: "soft", name: "Soft", white: "\u2657", black: "\u265D" },
] as const;
const pieceSizes = [
  { id: "compact", name: "Compact" },
  { id: "normal", name: "Normal" },
  { id: "large", name: "Large" },
  { id: "xl", name: "XL" },
] as const;
type PieceStyleId = (typeof pieceStyles)[number]["id"];
type PieceSizeId = (typeof pieceSizes)[number]["id"];
const themeStorageKey = "thejimmyapp.boardTheme";
const pieceStyleStorageKey = "thejimmyapp.pieceStyle";
const pieceSizeStorageKey = "thejimmyapp.pieceSize";

const initialBoardTheme = (): BoardThemeId => {
  const saved = localStorage.getItem(themeStorageKey);
  return boardThemes.some((theme) => theme.id === saved) ? saved as BoardThemeId : "slate";
};

const initialPieceStyle = (): PieceStyleId => {
  const saved = localStorage.getItem(pieceStyleStorageKey);
  return pieceStyles.some((style) => style.id === saved) ? saved as PieceStyleId : "solid";
};

const initialPieceSize = (): PieceSizeId => {
  const saved = localStorage.getItem(pieceSizeStorageKey);
  return pieceSizes.some((size) => size.id === saved) ? saved as PieceSizeId : "normal";
};

export default function App() {
  const store = useCoachStore();
  const queryClient = useQueryClient();
  const { roomId, username, setGame, setGuestReplay, setRoom } = store;
  const joinedRoomRef = useRef<string | null>(null);
  const [boardTheme, setBoardTheme] = useState<BoardThemeId>(initialBoardTheme);
  const [pieceStyle, setPieceStyle] = useState<PieceStyleId>(initialPieceStyle);
  const [pieceSize, setPieceSize] = useState<PieceSizeId>(initialPieceSize);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [view, setView] = useState<"review" | "stats">("review");
  const [activeReviewBoard, setActiveReviewBoard] = useState<BoardId>("A");
  const [connectOpen, setConnectOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(store.username);
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const [authenticatedOpen, setAuthenticatedOpen] = useState(false);
  const [boardAPgn, setBoardAPgn] = useState("");
  const [boardBPgn, setBoardBPgn] = useState("");
  const [curlText, setCurlText] = useState("");
  const [setupPromptCopied, setSetupPromptCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [guestProgress, setGuestProgress] = useState<GuestProgress>(loadGuestProgress);
  const [acknowledgementOpen, setAcknowledgementOpen] = useState(false);
  const [onboardingPhase, setOnboardingPhase] = useState<"entry" | "matchups">("entry");
  const [wordVertigoActive, setWordVertigoActive] = useState(false);
  const [boardsSwapped, setBoardsSwapped] = useState(false);
  const [momentCapture, setMomentCapture] = useState<MomentCapture | null>(null);
  const [questNow, setQuestNow] = useState(Date.now);
  const [guestLibraryOpen, setGuestLibraryOpen] = useState(false);
  const [sessionWipeActive, setSessionWipeActive] = useState(false);
  const expiryRunningRef = useRef(false);
  const analysisResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const [reviewGameId, setReviewGameId] = useState<number | null>(() => {
    if (store.roomId) return null;
    const value = new URLSearchParams(location.search).get("game");
    if (!value || !/^[1-9][0-9]*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  });
  const updateGuestProgress = useCallback((update: (current: GuestProgress) => GuestProgress) => {
    setGuestProgress((current) => {
      const next = update(current);
      storeGuestProgress(next);
      return next;
    });
  }, []);
  const openGame = useCallback((game: Parameters<typeof setGame>[0]) => {
    setGame(game);
    setArchiveOpen(false);
    setConnectOpen(false);
    setView("review");
    const gameId = game?.game.id;
    if (!gameId || useCoachStore.getState().roomId) return;
    const browserUrl = new URL(location.href);
    browserUrl.searchParams.set("game", String(gameId));
    history.replaceState(null, "", `${browserUrl.pathname}${browserUrl.search}${browserUrl.hash}`);
    setReviewGameId(gameId);
    updateGuestProgress((current) => ({ ...current, firstGameOpened: true, mapNode: current.mapNode === "start" ? "analyze" : current.mapNode }));
  }, [setGame, updateGuestProgress]);
  const gamesQuery = useQuery({ queryKey: ["games", store.username], queryFn: () => api.games(store.username), enabled: Boolean(store.username) });
  const guestSessionQuery = useQuery({ queryKey: ["guest-session"], queryFn: api.guestSession, staleTime: Infinity });
  const momentMatchupsQuery = useQuery({ ...guestMatchupsQuery, enabled: guestProgress.savedMoments.length > 0 });
  const roomQuery = useQuery({ queryKey: ["room", store.roomId], queryFn: () => api.room(store.roomId as string), enabled: Boolean(store.roomId) });
  const restoredGameQuery = useQuery({ queryKey: ["game", reviewGameId], queryFn: () => api.game(reviewGameId as number), enabled: Boolean(reviewGameId && !store.roomId && !store.game) });
  useEffect(() => { if (gamesQuery.data) useCoachStore.getState().setGames(gamesQuery.data.games); }, [gamesQuery.data]);
  useEffect(() => { if (roomQuery.data && useCoachStore.getState().roomId) void applyRoomSnapshot(roomQuery.data.snapshot, roomQuery.data.game_id); }, [roomQuery.data]);
  useEffect(() => { if (restoredGameQuery.data) openGame(restoredGameQuery.data); }, [openGame, restoredGameQuery.data]);
  const gameMutation = useMutation({ mutationFn: api.game, onSuccess: openGame });
  const resolveMutation = useMutation({
    mutationFn: ({ url, username }: { url: string; username: string }) => api.resolveGame(url, username || undefined),
    onSuccess: (resolved, variables) => {
      if (variables.username) store.setUsername(variables.username);
      openGame(resolved.game);
    },
  });
  void resolveMutation;
  const connectMutation = useMutation({
    mutationFn: api.connectChessCom,
    onSuccess: () => {
      setConnectOpen(false);
      setArchiveOpen(true);
      return queryClient.invalidateQueries({ queryKey: ["games"] });
    },
  });
  const importMutation = useMutation({
    mutationFn: ({ username, boardA, boardB }: { username: string; boardA: string; boardB: string }) => api.importPgn(username, boardA, boardB),
    onSuccess: async (imported) => {
      setBoardAPgn("");
      setBoardBPgn("");
      const importedGame = await api.game(imported.game_id);
      openGame(importedGame);
      await queryClient.invalidateQueries({ queryKey: ["games"] });
    },
  });
  const enrichMutation = useMutation({
    mutationFn: () => api.enrichChessCom(usernameDraft.trim(), curlText),
    onSuccess: async () => {
      setCurlText("");
      await queryClient.invalidateQueries({ queryKey: ["games"] });
      setArchiveOpen(true);
    },
  });
  const roomMutation = useMutation({ mutationFn: () => api.createRoom(store.game?.game.id), onSuccess: async (room) => {
    joinedRoomRef.current = room.id;
    setShareCopied(false);
    const joined = await api.joinRoom(room.id, store.username || "Coach"); store.setRoom(room.id, joined.client_id, joined.display_name); history.replaceState(null, "", room.share_path);
    const roomSocket = connectRoomSocket(room.id, joined.client_id, joined.display_name);
    if (guestProgress.questDeadline !== null || guestProgress.questCompleted) {
      roomSocket.addEventListener("open", () => sendRoomEvent("quest.status", { deadline: guestProgress.questDeadline, completed: guestProgress.questCompleted }), { once: true });
    }
  }});
  useEffect(() => {
    if (!roomId || joinedRoomRef.current === roomId) return;
    const currentRoomId = roomId;
    joinedRoomRef.current = currentRoomId;
    void api.joinRoom(currentRoomId, username || "Guest").then((joined) => {
      setRoom(currentRoomId, joined.client_id, joined.display_name);
      connectRoomSocket(currentRoomId, joined.client_id, joined.display_name);
    });
  }, [roomId, username, setRoom]);

  const sourceBoardA = store.explorationPositions?.boardA ?? currentPosition(store.game, store.globalPly, "A");
  const sourceBoardB = store.explorationPositions?.boardB ?? currentPosition(store.game, store.globalPly, "B");
  const integrityNotices = replayNotices(store.game, sourceBoardA, sourceBoardB);
  const userIsWhite = store.game?.game.user_color !== "black";
  const players = store.game?.players;
  const secondBoardAvailable = Boolean(store.game?.second_board_available);
  const guestPresentation = store.guestMatch ? guestBoardPresentation(store.guestMatch, boardsSwapped) : null;
  const stagedSourceBoard: BoardId = guestPresentation?.stagedSourceBoard ?? "A";
  const dockSourceBoard: BoardId = guestPresentation?.dockSourceBoard ?? "B";
  const stagedOrientation = guestPresentation?.stagedOrientation ?? (userIsWhite ? "white" : "black");
  const dockOrientation = guestPresentation?.dockOrientation ?? (userIsWhite ? "black" : "white");
  const stagedBoardName = guestPresentation?.stagedName ?? "First Board";
  const dockBoardName = guestPresentation?.dockName ?? "Second Board";
  const sourcePositions = { A: sourceBoardA, B: sourceBoardB };
  const stagedPosition = sourcePositions[stagedSourceBoard];
  const dockPosition = sourcePositions[dockSourceBoard];
  const boardPlayers = {
    A: { white: players?.board_a_white ?? "White A", black: players?.board_a_black ?? "Black A" },
    B: { white: players?.board_b_white ?? "White B", black: players?.board_b_black ?? "Black B" },
  };
  const oppositeColor = (color: "white" | "black") => color === "white" ? "black" : "white";
  const stagedPlayerBottom = boardPlayers[stagedSourceBoard][stagedOrientation];
  const stagedPlayerTop = boardPlayers[stagedSourceBoard][oppositeColor(stagedOrientation)];
  const dockPlayerBottom = boardPlayers[dockSourceBoard][dockOrientation];
  const dockPlayerTop = boardPlayers[dockSourceBoard][oppositeColor(dockOrientation)];
  const dockBoardAvailable = dockSourceBoard === "A" || secondBoardAvailable;
  const availableMomentMatches = momentMatchupsQuery.data?.matches ?? [];
  const momentPlayers = Object.fromEntries(guestProgress.savedMoments.map((moment) => {
    const currentMatch = store.guestMatch?.game_ids.A === moment.matchIds.A && store.guestMatch.game_ids.B === moment.matchIds.B ? store.guestMatch : null;
    return [savedMomentKey(moment), playerNamesForMoment(currentMatch ?? matchForSavedMoment(availableMomentMatches, moment))];
  }));
  const momentCount = savedMomentCount(guestProgress);
  const guestSession = guestSessionQuery.data ?? EMPTY_GUEST_SESSION;
  const questProgress = questMomentProgress(guestProgress);
  const questRemaining = questRemainingSeconds(guestProgress.questDeadline, questNow);
  const roomQuestDeadline = store.roomQuestDeadline;
  const sharedQuestDeadline = roomQuestDeadline ?? (store.guestMatch ? guestProgress.questDeadline : null);
  const roomQuestRemaining = questRemainingSeconds(sharedQuestDeadline, questNow);
  const setRoomQuestDeadline = store.setRoomQuestDeadline;
  const selectGame = (game: GameSummary) => { gameMutation.mutate(game.id); sendRoomEvent("game.select", { game_id: game.id }); };
  const openImport = () => { setManualImportOpen(true); setConnectOpen(true); };
  const connect = (event: FormEvent) => { event.preventDefault(); const clean = usernameDraft.trim(); if (!clean) return; store.setUsername(clean); connectMutation.mutate(clean); };
  const importCompleteGame = (event: FormEvent) => {
    event.preventDefault();
    const clean = usernameDraft.trim();
    if (!clean || !boardAPgn.trim() || !boardBPgn.trim()) return;
    store.setUsername(clean);
    importMutation.mutate({ username: clean, boardA: boardAPgn.trim(), boardB: boardBPgn.trim() });
  };
  const chooseBoardTheme = (theme: BoardThemeId) => {
    setBoardTheme(theme);
    localStorage.setItem(themeStorageKey, theme);
  };
  const choosePieceStyle = (style: PieceStyleId) => {
    setPieceStyle(style);
    localStorage.setItem(pieceStyleStorageKey, style);
  };
  const choosePieceSize = (size: PieceSizeId) => {
    setPieceSize(size);
    localStorage.setItem(pieceSizeStorageKey, size);
  };
  const viewerCount = store.participants.length || (store.roomId ? 1 : 0);
  const inviteUrl = store.roomId ? `${location.origin}/?room=${store.roomId}` : "";
  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  };
  const connectorPrompt = buildChessComConnectorPrompt(location.origin);
  const copyConnectorPrompt = async () => {
    await navigator.clipboard.writeText(connectorPrompt);
    setSetupPromptCopied(true);
    window.setTimeout(() => setSetupPromptCopied(false), 1800);
  };
  const currentGameFallbackUrl = bmachoUrlFromChessComUrl(store.game?.game.url);
  const showOnboarding = !store.game && !store.guestMatch && !store.roomId && !archiveOpen && view === "review";
  const qualifyingGames = qualifyingGameCount(guestProgress.savedLessons);
  const currentLesson = store.game?.lesson;
  const currentLessonId = store.game && currentLesson ? lessonStorageId(store.game.game.id, currentLesson) : null;
  const lessonSaved = Boolean(currentLessonId && guestProgress.savedLessons.some((item) => item.id === currentLessonId));

  useEffect(() => {
    if (!showOnboarding || guestProgress.questCompleted || guestProgress.questDeadline !== null) return;
    updateGuestProgress((current) => startGuestQuest(current));
  }, [guestProgress.questCompleted, guestProgress.questDeadline, showOnboarding, updateGuestProgress]);

  useEffect(() => {
    setActiveReviewBoard("A");
    setBoardsSwapped(false);
    setMomentCapture(null);
  }, [store.game?.game.id, store.guestMatch?.highest_rated.seat]);

  const resetGuestSession = useCallback(() => {
    disconnectRoomSocket();
    clearGuestProgress();
    setGuestProgress(emptyGuestProgress());
    useCoachStore.setState({
      game: null,
      guestMatch: null,
      globalPly: 0,
      mode: "review",
      explorationStartPly: null,
      explorationPositions: null,
      explorationHistory: [],
      explorationFuture: [],
      variationMoves: [],
      variationFutureMoves: [],
      roomId: null,
      participants: [],
      annotations: [],
      messages: [],
      roomQuestDeadline: null,
    });
    setOnboardingPhase("entry");
    setWordVertigoActive(false);
    setArchiveOpen(false);
    setConnectOpen(false);
    setCoachOpen(false);
    setView("review");
    setReviewGameId(null);
    setMomentCapture(null);
    setGuestLibraryOpen(false);
    const browserUrl = new URL(location.href);
    browserUrl.searchParams.delete("game");
    browserUrl.searchParams.delete("room");
    history.replaceState(null, "", `${browserUrl.pathname}${browserUrl.search}${browserUrl.hash}`);
  }, []);

  useEffect(() => {
    const timerRunning = (guestProgress.questDeadline !== null && !guestProgress.questCompleted) || sharedQuestDeadline !== null;
    if (!timerRunning) return;
    const tick = () => setQuestNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [guestProgress.questCompleted, guestProgress.questDeadline, sharedQuestDeadline]);

  useEffect(() => {
    if (questRemaining !== 0 || guestProgress.questDeadline === null || guestProgress.questCompleted || expiryRunningRef.current) return;
    expiryRunningRef.current = true;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!reducedMotion) setSessionWipeActive(true);
    const finishReset = async () => {
      try {
        const nextIdentity = await api.resetGuestSession();
        queryClient.setQueryData(["guest-session"], nextIdentity);
      } catch {
        queryClient.setQueryData(["guest-session"], EMPTY_GUEST_SESSION);
      } finally {
        resetGuestSession();
        setSessionWipeActive(false);
        expiryRunningRef.current = false;
      }
    };
    if (reducedMotion) {
      void finishReset();
      return;
    }
    const timer = window.setTimeout(() => void finishReset(), 800);
    return () => window.clearTimeout(timer);
  }, [guestProgress.questCompleted, guestProgress.questDeadline, queryClient, questRemaining, resetGuestSession]);

  useEffect(() => {
    if (roomQuestDeadline !== null && roomQuestRemaining === 0) setRoomQuestDeadline(null);
  }, [roomQuestDeadline, roomQuestRemaining, setRoomQuestDeadline]);

  useEffect(() => {
    if (!store.roomId || !store.guestMatch) return;
    sendRoomEvent("quest.status", { deadline: guestProgress.questDeadline, completed: guestProgress.questCompleted });
  }, [guestProgress.questCompleted, guestProgress.questDeadline, store.guestMatch, store.roomId]);

  const openMomentEditor = useCallback(() => {
    const current = useCoachStore.getState();
    if (current.mode !== "review") return;
    const capture = captureMomentContext(current.guestMatch, current.game, current.globalPly, stagedSourceBoard);
    if (capture) setMomentCapture(capture);
  }, [stagedSourceBoard]);

  useEffect(() => {
    const openFromKeyboard = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
      if (event.key.toLowerCase() !== "m" || isTyping || momentCapture) return;
      event.preventDefault();
      openMomentEditor();
    };
    window.addEventListener("keydown", openFromKeyboard);
    return () => window.removeEventListener("keydown", openFromKeyboard);
  }, [momentCapture, openMomentEditor]);

  const onGuestSpawn = useCallback(() => {
    setOnboardingPhase("matchups");
  }, []);

  const selectGuestMatch = useCallback(async (match: NormalizedMatch) => {
    const source = await api.chessComMatchReplay(match.game_ids.A);
    if (source.match.game_ids.A !== match.game_ids.A || source.match.game_ids.B !== match.game_ids.B) {
      throw new MatchReconstructionError("invalid_partner_link", "The selected matchup changed while its replay was loading.");
    }
    const replay = reconstructGuestMatch(source);
    setGuestReplay(source.match, replay.game);
    setView("review");
    updateGuestProgress((current) => startGuestQuest({
      ...current,
      firstGameOpened: true,
      mapNode: "analyze",
      capabilities: {
        ...current.capabilities,
        rail_review: "unlocked",
        dock_review: "unlocked",
      },
    }));
  }, [setGuestReplay, updateGuestProgress]);

  const saveLearningMoment = (glyph: MomentGlyph, note: string) => {
    if (!momentCapture) return;
    const moment = savedMomentFromCapture(momentCapture, glyph, note);
    updateGuestProgress((current) => completeGuestQuestIfReady({
      ...current,
      savedMoments: [...current.savedMoments, moment],
      capabilities: { ...current.capabilities, dock_library: "unlocked" },
    }));
    setMomentCapture(null);
  };

  const removeSavedMoment = (key: string) => updateGuestProgress((current) => ({
    ...current,
    savedMoments: current.savedMoments.filter((moment) => savedMomentKey(moment) !== key),
  }));

  const openSavedMoment = async (moment: SavedMoment) => {
    const current = useCoachStore.getState();
    const currentMatch = current.guestMatch?.game_ids.A === moment.matchIds.A && current.guestMatch.game_ids.B === moment.matchIds.B ? current.guestMatch : null;
    let match = currentMatch ?? matchForSavedMoment(momentMatchupsQuery.data?.matches ?? [], moment);
    if (!match) {
      const matchupList = await queryClient.fetchQuery(guestMatchupsQuery);
      match = matchForSavedMoment(matchupList.matches, moment);
    }
    if (!match) return false;
    if (!currentMatch || !current.game) await selectGuestMatch(match);
    const loaded = useCoachStore.getState();
    if (!loaded.game || moment.ply >= loaded.game.timeline.length) return false;
    loaded.seek(moment.ply);
    sendRoomEvent("timeline.seek", { global_ply: moment.ply });
    return true;
  };

  const escapeWordVertigo = useCallback(async () => {
    const matchupList = await queryClient.fetchQuery(guestMatchupsQuery);
    if (!matchupList.matches.length) return;
    const randomIndex = Math.floor(Math.random() * matchupList.matches.length);
    await selectGuestMatch(matchupList.matches[randomIndex]);
  }, [queryClient, selectGuestMatch]);

  const toggleCurrentLesson = () => {
    if (!store.game || !store.game.lesson) return;
    const saved = savedLessonFrom(store.game.game.id, store.game.lesson);
    if (!saved) return;
    updateGuestProgress((current) => current.savedLessons.some((item) => item.id === saved.id)
      ? { ...current, savedLessons: current.savedLessons.filter((item) => item.id !== saved.id) }
      : { ...current, savedLessons: [...current.savedLessons, saved] });
  };

  const removeSavedLesson = (id: string) => updateGuestProgress((current) => ({ ...current, savedLessons: current.savedLessons.filter((item) => item.id !== id) }));

  const openSavedLesson = async (lesson: SavedLesson) => {
    try {
      const game = await api.game(lesson.gameId);
      openGame(game);
      const max = Math.max(0, game.timeline.length ? game.timeline.length - 1 : game.positions_a.length - 1);
      const target = Math.max(0, Math.min(max, lesson.globalPly));
      useCoachStore.getState().seek(target);
      sendRoomEvent("timeline.seek", { global_ply: target });
      return Boolean(game.lesson && lessonStorageId(game.game.id, game.lesson) === lesson.id);
    } catch {
      return false;
    }
  };

  const goToMap = () => {
    disconnectRoomSocket();
    useCoachStore.setState({ game: null, guestMatch: null, roomId: null, participants: [], globalPly: 0, roomQuestDeadline: null });
    setOnboardingPhase("entry");
    setWordVertigoActive(false);
    setArchiveOpen(false);
    setView("review");
    setReviewGameId(null);
    setMomentCapture(null);
    const browserUrl = new URL(location.href);
    browserUrl.searchParams.delete("game");
    browserUrl.searchParams.delete("room");
    history.replaceState(null, "", `${browserUrl.pathname}${browserUrl.search}${browserUrl.hash}`);
  };

  const beforeAnalyze = useCallback((): Promise<boolean> => {
    if (hasAnalysisAcknowledgement()) return Promise.resolve(true);
    setAcknowledgementOpen(true);
    return new Promise((resolve) => { analysisResolverRef.current = resolve; });
  }, []);

  const closeAcknowledgement = useCallback(() => {
    setAcknowledgementOpen(false);
    analysisResolverRef.current?.(false);
    analysisResolverRef.current = null;
  }, []);

  const continueAcknowledgement = () => {
    acceptAnalysisAcknowledgement();
    setAcknowledgementOpen(false);
    analysisResolverRef.current?.(true);
    analysisResolverRef.current = null;
  };

  const reviewInfo = store.game ? <>
    {store.game.outcome && <div className={`review-summary ${store.game.game.result}`} role="status"><span>GAME RESULT</span><strong>{store.game.outcome.summary}</strong><small>{store.game.outcome.detail}</small></div>}
    {store.game.lesson && <ReviewLesson lesson={store.game.lesson} saved={lessonSaved} onToggleSave={toggleCurrentLesson} onReview={(globalPly) => { store.seek(globalPly); sendRoomEvent("timeline.seek", { global_ply: globalPly }); }} />}
    <ReplayLimitationsExpander notices={integrityNotices} />
    <section className="game-metadata"><span>GAME METADATA</span><dl><div><dt>Game</dt><dd>{store.game.game.id}</dd></div><div><dt>Played</dt><dd>{String(store.game.game.played_at ?? "Unknown").slice(0, 10)}</dd></div><div><dt>Result</dt><dd>{String(store.game.game.result ?? "Unknown")}</dd></div><div><dt>Two-board replay</dt><dd>{store.game.second_board_available ? "Available" : "Unavailable"}</dd></div>{store.game.cross_board_ordering && <div><dt>Cross-board order</dt><dd>{store.game.cross_board_ordering.exact ? "Exact" : "Clock-inferred (not exact)"}</dd></div>}</dl></section>
  </> : <div className="empty-panel">Select a game to see review information.</div>;
  const capabilityLocked = (key: CapabilityKey) => isCapabilityLocked(guestProgress.capabilities, key);
  const guestAnalysisLocked = Boolean(store.guestMatch && capabilityLocked("board_analysis"));
  const guestCoachLocked = Boolean(store.guestMatch && capabilityLocked("team_coach"));
  return (
    <>
    <AppShell
      className={`${view === "stats" ? "stats-view" : ""} ${showOnboarding ? "review-entry-shell" : ""} ${wordVertigoActive ? "word-vertigo-sequence" : ""}`}
      boardTheme={boardTheme}
      pieceStyle={pieceStyle}
      pieceSize={pieceSize}
      onboardingLocked={showOnboarding}
      dockOverlayActive={showOnboarding && wordVertigoActive}
      railUnlockedAction={<div className="rail-unlocked-actions">
        <a className="rail-blocks-link rail-active-item" data-onboarding-active-rail href="/blocks/index.html" target="_blank" rel="noreferrer" aria-label="Open building blocks" title="Open building blocks"><span className="rail-blocks-glyph" aria-hidden="true">🎨</span></a>
        <a className="rail-active-item" data-onboarding-active-rail href="/mission" aria-label="Open mission" title="Mission"><Flag size={17} /></a>
        <button className="rail-active-item" data-onboarding-active-rail type="button" aria-label="Open flashcard library" title="Flashcard library" onClick={() => setGuestLibraryOpen(true)}><BookOpen size={17} /></button>
      </div>}
      rail={<>
        <div className={`rail-brand ${capabilityLocked("rail_onboarding") ? "capability-locked" : ""}`} title="The Jimmy App"><span className="brand-mark">J</span></div>
        <nav className="rail-nav" aria-label="Main views">
          <button disabled={capabilityLocked("rail_review")} className={`${view === "review" ? "active" : ""} ${capabilityLocked("rail_review") ? "capability-locked" : ""}`} aria-label="Review" title="Review" onClick={() => setView("review")}><Swords size={17} />{capabilityLocked("rail_review") && <LockKeyhole className="capability-lock-badge" size={10} aria-hidden="true" />}</button>
          <button disabled={capabilityLocked("rail_statistics")} className={`${view === "stats" ? "active" : ""} ${capabilityLocked("rail_statistics") ? "capability-locked" : ""}`} aria-label="Statistics" title="Statistics" onClick={() => setView("stats")}><BarChart3 size={17} />{capabilityLocked("rail_statistics") && <LockKeyhole className="capability-lock-badge" size={10} aria-hidden="true" />}</button>
        </nav>
        <div className="rail-actions">
          <button disabled={capabilityLocked("rail_onboarding")} className={capabilityLocked("rail_onboarding") ? "capability-locked" : ""} aria-label="Return to onboarding" title="Return to onboarding" onClick={goToMap}><Home size={17} /></button>
          <button disabled={capabilityLocked("rail_settings")} className={capabilityLocked("rail_settings") ? "capability-locked" : ""} aria-label="Board settings" title="Board settings" onClick={() => setSettingsOpen(true)}><Settings size={17} />{capabilityLocked("rail_settings") && <LockKeyhole className="capability-lock-badge" size={10} aria-hidden="true" />}</button>
          <button disabled={capabilityLocked("rail_chesscom")} className={capabilityLocked("rail_chesscom") ? "capability-locked" : ""} aria-label="Connect Chess.com" title="Connect Chess.com" onClick={() => setConnectOpen(true)}><Radio size={17} />{capabilityLocked("rail_chesscom") && <LockKeyhole className="capability-lock-badge" size={10} aria-hidden="true" />}</button>
        </div>
      </>}
      stage={showOnboarding ? (onboardingPhase === "entry" ? <OnboardingMap {...guestSession} onGuestSpawn={onGuestSpawn} onWordVertigoActiveChange={setWordVertigoActive} onWordVertigoUnmute={escapeWordVertigo} /> : <GuestMatchupList onSelect={selectGuestMatch} />) : view === "review" ? <section className="workspace">
        <div className={`boards-zone ${store.game ? "has-game" : ""}`}>
          {store.mode === "exploration" && <div className="stage-actions"><button title="Undo exploration move" onClick={store.undoExploration}><Undo2 size={16} /></button>{store.explorationFuture.length > 0 && <button title="Redo exploration move" onClick={store.redoExploration}><Redo2 size={16} /></button>}<button title="Return to game" onClick={() => { store.returnToGame(); sendRoomEvent("variation.return_to_game", {}); }}><RotateCcw size={16} /></button></div>}
          {store.game ? <div className="boards-grid"><BoardPanel boardId={stagedSourceBoard} position={stagedPosition} orientation={stagedOrientation} pieceStyle={pieceStyle} layout="primary" beforeAnalyze={beforeAnalyze} analysisLocked={guestAnalysisLocked} keyboardFocused={Boolean(store.guestMatch) && activeReviewBoard === "A"} title={stagedBoardName} showTitle={false} onCaptureMoment={store.guestMatch ? openMomentEditor : undefined} captureMomentDisabled={!captureMomentContext(store.guestMatch, store.game, store.globalPly, stagedSourceBoard)} playerTop={stagedPlayerTop} playerBottom={stagedPlayerBottom} /></div> : <div className="empty-workspace"><strong>Select a Bughouse game</strong><span>Choose a game from the Games tab.</span></div>}
        </div>
      </section> : <StatsDashboard username={store.username} />}
      dock={<SidePanel capabilities={guestProgress.capabilities} initialTab="review" activeBoard={activeReviewBoard} boardFocusEnabled={Boolean(store.guestMatch)} onActiveBoardChange={setActiveReviewBoard} stagedSourceBoard={stagedSourceBoard} dockSourceBoard={dockSourceBoard} stagedBoardName={stagedBoardName} dockBoardName={dockBoardName} onSwapBoards={store.guestMatch ? () => setBoardsSwapped((current) => !current) : undefined} onSelectGame={selectGame} loadingGame={gameMutation.isPending} onMap={goToMap} savedLessons={guestProgress.savedLessons} savedMoments={guestProgress.savedMoments} savedMomentCount={momentCount} questCompleted={guestProgress.questCompleted} questProgress={questProgress} roomQuestRemainingSeconds={roomQuestRemaining} momentPlayers={momentPlayers} qualifyingGames={qualifyingGames} onOpenSavedLesson={openSavedLesson} onRemoveSavedLesson={removeSavedLesson} onOpenSavedMoment={openSavedMoment} onRemoveSavedMoment={removeSavedMoment} infoContent={reviewInfo} analysisContent={<FakeStockfishGate isGuest={Boolean(store.guestMatch)} savedMomentCount={momentCount} guestNumber={guestSession.guest_number}><LiveEvalCard gameLoaded={Boolean(store.game)} storedGameId={store.game && !store.guestMatch ? Number(store.game.game.id) : null} guestMatchId={store.guestMatch?.game_ids.A ?? null} globalPly={store.globalPly} board={stagedSourceBoard} boardName={stagedBoardName} position={stagedPosition} /></FakeStockfishGate>} dockActions={store.game ? <><button className="share-button" disabled={roomMutation.isPending} onClick={() => { if (store.roomId) void copyInviteLink(); else roomMutation.mutate(); }} title={store.roomId ? inviteUrl : "Create a shared review room"}>{store.roomId ? <Copy size={16} /> : <UserRoundPlus size={16} />} {store.roomId ? "Copy invite link" : roomMutation.isPending ? "Creating room..." : "Invite partner"}</button>{shareCopied && <span className="copy-confirm">Link copied</span>}{roomMutation.error && <span className="room-error" title={roomMutation.error.message}>Invite failed</span>}{store.roomId && <span className="viewer-pill" title={store.participants.map((item) => item.display_name).join(", ") || "Waiting for viewers"}><Users size={14} /> {viewerCount}</span>}{view === "review" && <button disabled={guestCoachLocked} className={`coach-button ${guestCoachLocked ? "capability-locked" : ""}`} title={guestCoachLocked ? "Team Coach unlocks in a future guest capability" : "Run the coupled Bughouse coaching pipeline"} onClick={() => setCoachOpen(true)}><Bot size={16} /> Team Coach{guestCoachLocked && <LockKeyhole className="capability-lock-badge" size={10} aria-hidden="true" />}</button>}</> : undefined} boardContent={store.game ? <BoardPanel boardId={dockSourceBoard} position={dockPosition} orientation={dockOrientation} pieceStyle={pieceStyle} layout="compact" beforeAnalyze={beforeAnalyze} analysisLocked={guestAnalysisLocked} keyboardFocused={Boolean(store.guestMatch) && activeReviewBoard === "B"} title={dockBoardName} playerTop={dockBoardAvailable ? dockPlayerTop : "Diagonal Opponent Unknown"} playerBottom={dockBoardAvailable ? dockPlayerBottom : "Partner Unknown"} unavailable={!dockBoardAvailable} onImportBothBoards={openImport} externalFallbackUrl={currentGameFallbackUrl} /> : undefined} />}
    />
      {guestLibraryOpen && document.getElementById("app-stage-panel") && createPortal(<GuestFlashcardPanel guestNumber={guestSession.guest_number} remainingSeconds={questRemaining} questCompleted={guestProgress.questCompleted} onClose={() => setGuestLibraryOpen(false)} />, document.getElementById("app-stage-panel")!)}
    {store.game && <TeamCoach open={coachOpen} onClose={() => setCoachOpen(false)} boardA={sourceBoardA} boardB={sourceBoardB} />}
      {momentCapture && document.getElementById("app-stage-panel") && createPortal(<MomentEditor capture={momentCapture} onSave={saveLearningMoment} onCancel={() => setMomentCapture(null)} />, document.getElementById("app-stage-panel")!)}
      <AnalysisAcknowledgement open={acknowledgementOpen} onClose={closeAcknowledgement} onContinue={continueAcknowledgement} />
      {sessionWipeActive && <div className="session-expiry-wipe" role="presentation" />}
      {connectOpen && (document.getElementById("app-dock-panel") ?? document.getElementById("app-stage-panel")) && createPortal(
          <form className={`connect-modal dock-tool-panel ${manualImportOpen || authenticatedOpen ? "connector-mode" : ""}`} onSubmit={connect}>
            <button type="button" className="modal-close" onClick={() => setConnectOpen(false)} aria-label="Close"><X /></button>
            <span className="modal-kicker">CHESS.COM CONNECTION</span>
            <h1>Connect your games</h1>
            <p>Load public games by username, paste both board PGNs, or use advanced pgn-info enrichment for partner-board data.</p>
            <label>Chess.com username<input autoFocus value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} pattern="[A-Za-z0-9_-]+" minLength={2} maxLength={25} /></label>
            {connectMutation.error && <div className="form-error">{connectMutation.error.message}</div>}
            <button className="primary" disabled={connectMutation.isPending}>{connectMutation.isPending ? "Loading public archives…" : "Load public games"}</button>
            <button type="button" className="authenticated-toggle safe-import-toggle" onClick={() => setManualImportOpen(!manualImportOpen)}>
              <FileInput size={15} /> {manualImportOpen ? "Hide PGN import" : "Import two-board PGNs"}
            </button>
            {manualImportOpen && (
              <section className="authenticated-panel safe-import-panel">
                <strong><ShieldCheck size={15} /> Credential-free two-board import</strong>
                <p>Paste completed PGNs for both boards from the same Bughouse game. Each PGN must contain a final result; clock comments are used to synchronize the boards when present.</p>
                <label>Board A PGN<textarea aria-label="Board A PGN" value={boardAPgn} onChange={(event) => setBoardAPgn(event.target.value)} placeholder={"[Variant \"Bughouse\"]\n\n1. e4 …"} spellCheck={false} /></label>
                <label>Board B PGN<textarea aria-label="Board B PGN" value={boardBPgn} onChange={(event) => setBoardBPgn(event.target.value)} placeholder={"[Variant \"Bughouse\"]\n\n1. d4 …"} spellCheck={false} /></label>
                {importMutation.error && <div className="form-error">{importMutation.error.message}</div>}
                {importMutation.data && <div className="connector-success">Complete two-board game imported. No Chess.com credentials were used or stored.</div>}
                <button type="button" className="primary" disabled={boardAPgn.trim().length < 8 || boardBPgn.trim().length < 8 || !usernameDraft.trim() || importMutation.isPending} onClick={importCompleteGame}>
                  {importMutation.isPending ? "Importing both boards…" : "Import complete game"}
                </button>
              </section>
            )}
            <button type="button" className="authenticated-toggle" onClick={() => setAuthenticatedOpen(!authenticatedOpen)}>
              <Bot size={15} /> {authenticatedOpen ? "Hide advanced pgn-info" : "Advanced pgn-info enrichment"}
            </button>
            {authenticatedOpen && (
              <section className="authenticated-panel">
                <div className="connector-heading">
                  <span className="connector-icon"><Bot size={18} /></span>
                  <div>
                    <strong>Recover partner boards from Chess.com pgn-info</strong>
                    <p>Use only your own logged-in browser session. The cURL is used once and never stored.</p>
                  </div>
                </div>
                <ol className="connector-checklist">
                  <li><span>1</span><div><strong>Load public games first</strong><small>Use the username button above so the app knows which games to enrich.</small></div></li>
                  <li><span>2</span><div><strong>Open Chess.com archive</strong><small>Stay logged into your own Chess.com account.</small></div></li>
                  <li><span>3</span><div><strong>Copy one pgn-info request</strong><small>Paste it below. The app discards credentials after this request.</small></div></li>
                </ol>
                <a className="archive-link" href="https://www.chess.com/games/archive" target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open Chess.com archive</a>
                <div className="prompt-box">
                  <div><strong>Codex helper prompt</strong><small>Generic for any Chess.com account</small></div>
                  <button type="button" onClick={() => void copyConnectorPrompt()}>{setupPromptCopied ? <Check size={14} /> : <Copy size={14} />}{setupPromptCopied ? "Copied" : "Copy prompt"}</button>
                  <textarea readOnly value={connectorPrompt} aria-label="Codex setup prompt" />
                </div>
                <div className="connector-privacy"><ShieldCheck size={15} /><span>Do not share this cURL in chat. Paste it only here; it is not saved by the app.</span></div>
                <details className="manual-connector">
                  <summary>Paste pgn-info cURL</summary>
                  <textarea value={curlText} onChange={(event) => setCurlText(event.target.value)} placeholder="Paste the pgn-info cURL request" spellCheck={false} />
                </details>
                {enrichMutation.error && <div className="form-error">{enrichMutation.error.message}</div>}
                {enrichMutation.data && <div className="connector-success">Checked {enrichMutation.data.checked} games. Enriched {enrichMutation.data.enriched}. Credentials stored: no.</div>}
                <button type="button" className="primary" disabled={curlText.length < 40 || !usernameDraft.trim() || enrichMutation.isPending} onClick={() => enrichMutation.mutate()}>
                  {enrichMutation.isPending ? "Loading partner boards..." : "Enrich existing games"}
                </button>
              </section>
            )}
            {store.username && <button type="button" className="text-button" onClick={() => setConnectOpen(false)}><LogOut size={15} /> Continue as {store.username}</button>}
          </form>, (document.getElementById("app-dock-panel") ?? document.getElementById("app-stage-panel"))!,
      )}
      {settingsOpen && (document.getElementById("app-dock-panel") ?? document.getElementById("app-stage-panel")) && createPortal(
          <section className="settings-modal dock-tool-panel" role="dialog" aria-label="Board settings">
            <button type="button" className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="Close"><X /></button>
            <span className="modal-kicker">BOARD SETTINGS</span>
            <h1>Board style</h1>
            <div className="theme-grid">
              {boardThemes.map((theme) => {
                const active = theme.id === boardTheme;
                const previewStyle = {
                  "--preview-light": theme.light,
                  "--preview-dark": theme.dark,
                  "--preview-white": theme.white,
                  "--preview-black": theme.black,
                } as CSSProperties;
                return (
                  <button key={theme.id} className={`theme-card ${active ? "active" : ""}`} type="button" onClick={() => chooseBoardTheme(theme.id)}>
                    <span className="theme-preview" style={previewStyle}>
                      <i />
                      <i />
                      <i />
                      <i />
                      <b className="preview-white">{"\u2658"}</b>
                      <b className="preview-black">{"\u265E"}</b>
                    </span>
                    <span>{theme.name}</span>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
            </div>
            <h2>Piece style</h2>
            <div className="piece-style-grid">
              {pieceStyles.map((style) => (
                <button key={style.id} className={`piece-style-card ${style.id === pieceStyle ? "active" : ""}`} type="button" onClick={() => choosePieceStyle(style.id)}>
                  <span className="piece-style-preview"><b className="preview-white">{style.white}</b><b className="preview-black">{style.black}</b></span>
                  <span>{style.name}</span>
                  {style.id === pieceStyle && <Check size={14} />}
                </button>
              ))}
            </div>
            <h2>Piece size</h2>
            <div className="segmented-control" role="group" aria-label="Piece size">
              {pieceSizes.map((size) => <button key={size.id} className={pieceSize === size.id ? "active" : ""} type="button" onClick={() => choosePieceSize(size.id)}>{size.name}</button>)}
            </div>
            <div className="settings-legal"><LegalLinks /></div>
            <button className="settings-done" type="button" onClick={() => setSettingsOpen(false)}><Palette size={15} /> Apply style</button>
          </section>, (document.getElementById("app-dock-panel") ?? document.getElementById("app-stage-panel"))!,
      )}
    </>
  );
}
