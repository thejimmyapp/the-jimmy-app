import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisClient, AnalysisProtocolError, type AnalysisPosition, type AnalysisState } from "../analysisClient";
import type { BoardId, ReplayPosition } from "../types";
import { EvalCard, type EvalCardStatus } from "./EvalCard";

export const ANALYSIS_DEBOUNCE_MS = 400;
export const ANALYSIS_DEPTH = 10;

interface Props {
  gameLoaded: boolean;
  storedGameId: number | null;
  globalPly: number;
  board: BoardId;
  boardName: string;
  position: ReplayPosition | null;
}

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

export function LiveEvalCard({ gameLoaded, storedGameId, globalPly, board, boardName, position }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<AnalysisState>({ kind: "idle" });
  const currentPositionRef = useRef<AnalysisPosition | null>(null);
  const clientRef = useRef<AnalysisClient | null>(null);
  const analysisPosition = useMemo(() => storedGameId && position
    ? { game_id: storedGameId, global_ply: globalPly, board } satisfies AnalysisPosition
    : null, [board, globalPly, position, storedGameId]);
  currentPositionRef.current = analysisPosition;
  if (!clientRef.current) {
    clientRef.current = new AnalysisClient({ getCurrentPosition: () => currentPositionRef.current });
  }

  useEffect(() => {
    const client = clientRef.current;
    return () => client?.abandon();
  }, []);

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
  const unavailableMessage = !gameLoaded
    ? "Select a stored completed game to use engine analysis."
    : !storedGameId
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

  return (
    <div className="live-eval-card">
      <EvalCard
        engine_identity={engineIdentity(visibleState)}
        depth={completed?.depth ?? ANALYSIS_DEPTH}
        status={cardStatus(visibleState)}
        enabled={enabled}
        score_cp={completed?.score_cp}
        mate_in={completed?.mate_in}
        principal_lines={completed ? [{ rank: 1, moves: completed.pv }] : []}
        white_pocket={position?.white_pocket ?? ""}
        black_pocket={position?.black_pocket ?? ""}
        failure_message={failureMessage}
        state_message={unavailableMessage ?? pendingMessage}
        board_label={`${boardName} · Board ${board} · ply ${globalPly}`}
        toggle_disabled={Boolean(unavailableMessage)}
        onEnabledChange={setEnabled}
      />
    </div>
  );
}
