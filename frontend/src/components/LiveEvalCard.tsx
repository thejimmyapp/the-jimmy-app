import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { AnalysisClient, AnalysisProtocolError, type AnalysisPosition, type AnalysisState } from "../analysisClient";
import type { BoardId, ReplayPosition } from "../types";
import { EvalCard, type EvalCardStatus } from "./EvalCard";

export const ANALYSIS_DEBOUNCE_MS = 400;
export const ANALYSIS_DEPTH = 10;

interface Props {
  gameLoaded: boolean;
  storedGameId: number | null;
  guestMatchId: number | null;
  globalPly: number;
  board: BoardId;
  boardName: string;
  position: ReplayPosition | null;
}

type PreparationState =
  | { kind: "idle" }
  | { kind: "preparing"; guestMatchId: number }
  | { kind: "failed"; guestMatchId: number; message: string };

const samePosition = (left: AnalysisPosition | null, right: AnalysisPosition) => Boolean(
  left
  && left.game_id === right.game_id
  && left.global_ply === right.global_ply
  && left.board === right.board,
);

const retryHint = (value: string | null) => {
  if (!value) return "Try again later.";
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    const rounded = Math.ceil(seconds);
    return `Try again in ${rounded} ${rounded === 1 ? "second" : "seconds"}.`;
  }
  return `Try again after ${value}.`;
};

const engineIdentity = (state: AnalysisState) => {
  if (state.kind === "completed") return state.result.engine_name ?? state.engine;
  if (state.kind === "queued" || state.kind === "running") return state.engine;
  return "Fairy-Stockfish";
};

const cardStatus = (state: AnalysisState): EvalCardStatus => {
  if (state.kind === "queued" || state.kind === "running") return "analysing";
  if (state.kind === "failed" || state.kind === "capacity") return "failed";
  if (state.kind === "completed") return state.result.variant_supported ? "complete" : "unsupported-variant";
  return "idle";
};

const prepareFailureMessage = (error: unknown) => {
  if (error instanceof ApiError && error.status === 409 && error.code === "guest_identity_missing") {
    return "Analysis cannot be prepared because this guest has no identity cookie yet. Return to the guest landing page first.";
  }
  if (error instanceof ApiError && error.status === 422 && error.code === "guest_replay_refused") {
    return "This game cannot be prepared for analysis because its replay failed validation.";
  }
  return "Analysis preparation failed. Turn analysis off and on to retry.";
};

export function LiveEvalCard({ gameLoaded, storedGameId, guestMatchId, globalPly, board, boardName, position }: Props) {
  const gameKey = guestMatchId ? `guest:${guestMatchId}` : storedGameId ? `stored:${storedGameId}` : null;
  const [enableIntent, setEnableIntent] = useState({ gameKey, enabled: false });
  const [storedGuestGames, setStoredGuestGames] = useState<Record<number, number>>({});
  const [preparation, setPreparation] = useState<PreparationState>({ kind: "idle" });
  const [state, setState] = useState<AnalysisState>({ kind: "idle" });
  const currentPositionRef = useRef<AnalysisPosition | null>(null);
  const clientRef = useRef<AnalysisClient | null>(null);
  const storeGenerationRef = useRef(0);
  const inFlightStoresRef = useRef(new Map<number, Promise<{ game_id: number }>>());
  const enabled = enableIntent.gameKey === gameKey && enableIntent.enabled;
  const effectiveStoredGameId = storedGameId ?? (guestMatchId ? storedGuestGames[guestMatchId] ?? null : null);
  const analysisPosition = useMemo(() => effectiveStoredGameId && position
    ? { game_id: effectiveStoredGameId, global_ply: globalPly, board } satisfies AnalysisPosition
    : null, [board, effectiveStoredGameId, globalPly, position]);
  currentPositionRef.current = analysisPosition;
  if (!clientRef.current) {
    clientRef.current = new AnalysisClient({ getCurrentPosition: () => currentPositionRef.current });
  }

  useEffect(() => {
    const client = clientRef.current;
    return () => client?.abandon();
  }, []);

  useEffect(() => {
    setEnableIntent({ gameKey, enabled: false });
    setPreparation({ kind: "idle" });
  }, [gameKey]);

  useEffect(() => {
    if (!enabled || storedGameId || !guestMatchId || storedGuestGames[guestMatchId]) return;
    const requestedMatchId = guestMatchId;
    const generation = ++storeGenerationRef.current;
    setPreparation({ kind: "preparing", guestMatchId: requestedMatchId });
    let request = inFlightStoresRef.current.get(requestedMatchId);
    if (!request) {
      request = api.storeChessComGuestMatch(requestedMatchId);
      inFlightStoresRef.current.set(requestedMatchId, request);
      void request.finally(() => {
        if (inFlightStoresRef.current.get(requestedMatchId) === request) inFlightStoresRef.current.delete(requestedMatchId);
      }).catch(() => undefined);
    }
    void request.then(({ game_id }) => {
      setStoredGuestGames((current) => current[requestedMatchId] === game_id ? current : { ...current, [requestedMatchId]: game_id });
      if (storeGenerationRef.current === generation) setPreparation({ kind: "idle" });
    }).catch((error: unknown) => {
      if (storeGenerationRef.current === generation) {
        setPreparation({ kind: "failed", guestMatchId: requestedMatchId, message: prepareFailureMessage(error) });
      }
    });
    return () => {
      if (storeGenerationRef.current === generation) storeGenerationRef.current += 1;
    };
  }, [enabled, guestMatchId, storedGameId, storedGuestGames]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    if (!enabled || !analysisPosition) {
      client.abandon();
      setState({ kind: "idle" });
      return;
    }

    const issuedFor = analysisPosition;
    setState({ kind: "idle" });
    const timer = window.setTimeout(() => {
      void client.analyze({ ...issuedFor, depth: ANALYSIS_DEPTH }, setState).catch((error: unknown) => {
        if (!samePosition(currentPositionRef.current, issuedFor)) return;
        const reason = error instanceof AnalysisProtocolError
          ? `The engine returned an invalid response: ${error.message}`
          : error instanceof Error ? error.message : "Analysis request failed";
        setState({ kind: "failed", position: issuedFor, job_id: null, reason });
      });
    }, ANALYSIS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [analysisPosition, enabled]);

  const visibleState: AnalysisState = state.kind === "idle"
    || (analysisPosition && "position" in state && samePosition(analysisPosition, state.position))
    ? state
    : { kind: "idle" };
  const completed = visibleState.kind === "completed" ? visibleState.result : null;
  const visiblePreparation = enabled && guestMatchId && preparation.kind !== "idle" && preparation.guestMatchId === guestMatchId
    ? preparation
    : { kind: "idle" } as const;
  const unavailableMessage = !gameLoaded
    ? "Select a stored completed game to use engine analysis."
    : !storedGameId && !guestMatchId
      ? "Analysis is unavailable because this replay has not been stored as a completed game."
      : null;
  const failureMessage = visibleState.kind === "capacity"
    ? `The engine is at capacity. ${retryHint(visibleState.retry_after)}`
    : visibleState.kind === "failed" ? visibleState.reason : undefined;
  const pendingMessage = visibleState.kind === "queued" && visibleState.queue_position
    ? `Queued behind ${visibleState.queue_position - 1} ${visibleState.queue_position - 1 === 1 ? "job" : "jobs"}.`
    : visibleState.kind === "queued" ? "Queued for engine analysis."
      : visibleState.kind === "running" ? "The engine is analysing this position."
        : undefined;
  const displayStatus: EvalCardStatus = visiblePreparation.kind === "preparing"
    ? "preparing"
    : visiblePreparation.kind === "failed" ? "prepare-failed" : cardStatus(visibleState);
  const displayFailureMessage = visiblePreparation.kind === "failed" ? visiblePreparation.message : failureMessage;
  const displayStateMessage = visiblePreparation.kind === "preparing"
    ? "Preparing this guest game for analysis."
    : unavailableMessage ?? pendingMessage;

  const changeEnabled = (nextEnabled: boolean) => {
    setEnableIntent({ gameKey, enabled: nextEnabled });
    if (!nextEnabled) setPreparation({ kind: "idle" });
  };

  return (
    <div className="live-eval-card">
      <EvalCard
        engine_identity={engineIdentity(visibleState)}
        depth={completed?.depth ?? ANALYSIS_DEPTH}
        status={displayStatus}
        enabled={enabled}
        score_cp={completed?.score_cp}
        mate_in={completed?.mate_in}
        principal_lines={completed ? [{ rank: 1, moves: completed.pv }] : []}
        white_pocket={position?.white_pocket ?? ""}
        black_pocket={position?.black_pocket ?? ""}
        failure_message={displayFailureMessage}
        state_message={displayStateMessage}
        board_label={`${boardName} · Board ${board} · ply ${globalPly}`}
        toggle_disabled={Boolean(unavailableMessage)}
        onEnabledChange={changeEnabled}
      />
    </div>
  );
}
