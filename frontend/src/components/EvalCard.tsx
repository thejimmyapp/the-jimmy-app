import { useId, useState } from "react";
import { formatEvaluation } from "../evalScore";

export type EvalCardStatus = "idle" | "preparing" | "analysing" | "complete" | "prepare-failed" | "failed" | "unsupported-variant";

export interface EvalPrincipalLine {
  rank: number;
  moves: string[];
}

export interface EvalCardProps {
  engine_identity: string;
  depth: number;
  status: EvalCardStatus;
  enabled: boolean;
  score_cp?: number | null;
  mate_in?: number | null;
  principal_lines?: EvalPrincipalLine[];
  white_pocket: string;
  black_pocket: string;
  failure_message?: string;
  state_message?: string;
  board_label?: string;
  toggle_disabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

const displayPocket = (pocket: string) => pocket.trim() || "—";

const displayMove = (move: string) => move.replace(/^([pnbrq])@/i, (_, piece: string) => `${piece.toUpperCase()}@`);

const stateLabel = (props: EvalCardProps) => {
  if (props.status === "preparing") return "Preparing…";
  if (props.status === "analysing") return "Analysing…";
  if (props.status === "prepare-failed") return "Preparation failed";
  if (props.status === "failed") return "Analysis failed";
  if (props.status === "unsupported-variant") return "Unsupported variant";
  if (props.status === "idle") return "Idle";
  return formatEvaluation(props);
};

export function EvalCard(props: EvalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const linesId = useId();
  const lines = props.principal_lines ?? [];
  const visibleLines = expanded ? lines : lines.slice(0, 1);
  const additionalLineCount = Math.max(0, lines.length - 1);
  const isFailure = props.status === "prepare-failed" || props.status === "failed" || props.status === "unsupported-variant";

  return (
    <article className={`eval-card eval-card--${props.status}`} aria-busy={props.status === "preparing" || props.status === "analysing"}>
      <header className="eval-card__header">
        <div>
          <span className="eval-card__kicker">ENGINE EVALUATION</span>
          <h3>{props.engine_identity}</h3>
          <span className="eval-card__depth">Depth {props.depth}</span>
          {props.board_label && <span className="eval-card__board">{props.status === "complete" ? "Analysed" : "Staged target"}: {props.board_label}</span>}
        </div>
        <label className="eval-card__toggle">
          <span>Enable</span>
          <input
            type="checkbox"
            checked={props.enabled}
            disabled={props.toggle_disabled}
            onChange={(event) => props.onEnabledChange?.(event.currentTarget.checked)}
          />
        </label>
      </header>

      <div className="eval-card__score-row">
        <strong className="eval-card__score">{stateLabel(props)}</strong>
        {props.status === "analysing" && <span className="eval-card__pulse" aria-hidden="true" />}
      </div>

      {isFailure && (
        <p className="eval-card__failure" role="alert">
          {props.failure_message ?? (props.status === "unsupported-variant" ? "This position cannot be evaluated by this engine." : "The engine returned no result.")}
        </p>
      )}

      {props.status === "idle" && <p className="eval-card__state" role="status">{props.state_message ?? "Enable analysis when you want a freeze-frame reading."}</p>}
      {props.status === "preparing" && <p className="eval-card__state" role="status">{props.state_message ?? "Preparing this game for analysis."}</p>}
      {props.status === "analysing" && <p className="eval-card__state" role="status">{props.state_message ?? "Waiting for a scored principal line."}</p>}

      {props.status === "complete" && (
        <div className="eval-card__lines" id={linesId}>
          {visibleLines.length ? visibleLines.map((line) => (
            <div className="eval-card__line" key={`${line.rank}-${line.moves.join("-")}`}>
              <span className="eval-card__rank">#{line.rank}</span>
              <code>{line.moves.map(displayMove).join(" ")}</code>
            </div>
          )) : <p className="eval-card__state">No principal line returned.</p>}
          {additionalLineCount > 0 && (
            <button
              className="eval-card__expand"
              type="button"
              aria-expanded={expanded}
              aria-controls={linesId}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show primary line only" : `Show ${additionalLineCount} more ${additionalLineCount === 1 ? "line" : "lines"}`}
            </button>
          )}
        </div>
      )}

      <div className="eval-card__pockets" role="group" aria-label="Pockets used for this evaluation">
        <span className="eval-card__pocket-label">POCKETS USED</span>
        <span><b>White</b><code>{displayPocket(props.white_pocket)}</code></span>
        <span><b>Black</b><code>{displayPocket(props.black_pocket)}</code></span>
      </div>

      <p className="eval-card__context" data-copy-placeholder="true">
        [COPY-PLACEHOLDER] This number comes from one board and its pocket. Fairy-Stockfish cannot see the partner board, so partner-board context may change the number; it is still useful as a tactical signal.
      </p>

      <footer className="eval-card__footer">Analysis by Fairy-Stockfish</footer>
    </article>
  );
}
