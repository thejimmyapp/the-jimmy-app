import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, ExternalLink, FileInput, LockKeyhole } from "lucide-react";
import { api } from "../api";
import { isMeaningfulChessVector, parseEngineBestmove } from "../boardInteractions";
import { sendRoomEvent } from "../socket";
import { currentPosition, useCoachStore } from "../store";
import type { Annotation, BoardId, ExplorationMoveResult, ReplayPosition } from "../types";

const pieces: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const filledPieces: Record<string, string> = {
  K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E", P: "\u265F",
  k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F",
};

type PieceStyleId = "classic" | "solid" | "bold" | "soft";

const displayPiece = (piece: string, pieceStyle: PieceStyleId) => {
  if (pieceStyle === "solid") return filledPieces[piece] ?? "";
  return pieces[piece] ?? "";
};

const squareName = (row: number, col: number, orientation: "white" | "black") => {
  const file = orientation === "white" ? col : 7 - col;
  const rank = orientation === "white" ? 7 - row : row;
  return `${"abcdefgh"[file]}${rank + 1}`;
};

interface Props {
  boardId: BoardId;
  position: ReplayPosition | null;
  pairedPosition?: ReplayPosition | null;
  orientation: "white" | "black";
  pieceStyle: PieceStyleId;
  title: string;
  showTitle?: boolean;
  onCaptureMoment?: () => void;
  captureMomentDisabled?: boolean;
  playerTop: string;
  playerBottom: string;
  unavailable?: boolean;
  onImportBothBoards?: () => void;
  externalFallbackUrl?: string | null;
  locked?: boolean;
  onMoveIntent?: (intent: {
    board: BoardId;
    from?: string;
    to: string;
    dropPiece?: "P" | "N" | "B" | "R" | "Q";
  }) => Promise<ExplorationMoveResult>;
  onAnalysisChange?: (board: BoardId, analysis: BoardAnalysisState) => void;
  layout?: "standard" | "primary" | "compact";
  beforeAnalyze?: () => Promise<boolean>;
  keyboardFocused?: boolean;
  analysisLocked?: boolean;
}

export type BoardAnalysisState = {
  status: "idle" | "queued" | "running" | "completed" | "failed";
  bestmove?: string;
  score?: string;
  scoreCp?: number;
  mateIn?: number;
  depth?: number;
  pv?: string[];
  queuePosition?: number;
  error?: string;
};

export function BoardPanel({ boardId, position, pairedPosition, orientation, pieceStyle, title, showTitle = true, onCaptureMoment, captureMomentDisabled = false, playerTop, playerBottom, unavailable = false, onImportBothBoards, externalFallbackUrl, locked = false, onMoveIntent, onAnalysisChange, layout = "standard", beforeAnalyze, keyboardFocused = false, analysisLocked = false }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const lastWheelAt = useRef(0);
  const [arrowStart, setArrowStart] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<"P" | "N" | "B" | "R" | "Q" | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);
  const [interactionStatus, setInteractionStatus] = useState("");
  const [analysis, setAnalysis] = useState<BoardAnalysisState>({ status: "idle" });
  const [oneBoardAccepted, setOneBoardAccepted] = useState(false);
  const { game, globalPly, mode, explorationPositions, explorationFuture, annotations, addAnnotation, removeAnnotation, applyExploration, undoExploration, redoExploration, seek } = useCoachStore();
  const visible = useMemo(
    () => annotations.filter((item) => item.board === boardId && item.ply === globalPly),
    [annotations, boardId, globalPly],
  );
  const engineMove = useMemo(() => parseEngineBestmove(analysis.bestmove), [analysis.bestmove]);
  const matrix = position?.board ?? Array.from({ length: 8 }, () => Array<string>(8).fill(""));
  const rows = orientation === "white" ? matrix : [...matrix].reverse().map((row) => [...row].reverse());
  const topPocketColor = orientation === "white" ? "Black" : "White";
  const bottomPocketColor = orientation === "white" ? "White" : "Black";
  const pocketValue = (color: "White" | "Black") => color === "White" ? position?.white_pocket ?? "-" : position?.black_pocket ?? "-";

  useEffect(() => {
    setAnalysis({ status: "idle" });
    onAnalysisChange?.(boardId, { status: "idle" });
  }, [boardId, onAnalysisChange, position?.variant_fen]);

  useEffect(() => {
    setOneBoardAccepted(false);
  }, [game?.game.id]);

  const removeDrawing = (annotation: Annotation) => {
    removeAnnotation(annotation.id);
    sendRoomEvent("annotation.delete", { id: annotation.id });
  };

  const createAnnotation = (from: string, to: string) => {
    if (!isMeaningfulChessVector(from, to)) {
      setInteractionStatus("Use a straight, diagonal, or knight-move arrow");
      window.setTimeout(() => setInteractionStatus(""), 1300);
      return;
    }
    const annotation: Annotation = {
      id: crypto.randomUUID(), board: boardId, ply: globalPly, author: "You", color: "cyan",
      type: "arrow", from, to,
    };
    addAnnotation(annotation);
    sendRoomEvent("annotation.create", annotation as unknown as Record<string, unknown>);
  };

  const publishExplorationState = () => {
    const state = useCoachStore.getState();
    if (state.mode !== "exploration" || !state.explorationPositions) {
      sendRoomEvent("variation.return_to_game", {});
      return;
    }
    sendRoomEvent("variation.update", {
      board_a: state.explorationPositions.boardA,
      board_b: state.explorationPositions.boardB,
      notation: state.variationMoves[state.variationMoves.length - 1] ?? "move",
      start_ply: state.explorationStartPly ?? state.globalPly,
    });
  };

  const boardPair = () => {
    if (pairedPosition !== undefined) {
      return boardId === "A"
        ? { boardA: position, boardB: pairedPosition }
        : { boardA: pairedPosition, boardB: position };
    }
    return {
      boardA: explorationPositions?.boardA ?? currentPosition(game, globalPly, "A"),
      boardB: explorationPositions?.boardB ?? currentPosition(game, globalPly, "B"),
    };
  };

  const playExplorationMove = async (from: string | undefined, to: string, dropPiece?: "P" | "N" | "B" | "R" | "Q") => {
    if (locked) return;
    const { boardA, boardB } = boardPair();
    if (!boardA || (boardId === "B" && !boardB)) {
      setInteractionStatus("This board is not available for exploration");
      return;
    }
    let result: ExplorationMoveResult;
    try {
      result = onMoveIntent
        ? await onMoveIntent({ board: boardId, from, to, dropPiece })
        : await api.explorationMove({
            board_a_fen: boardA.variant_fen,
            board_b_fen: boardB?.variant_fen,
            board: boardId,
            from_square: from,
            to_square: to,
            drop_piece: dropPiece,
          });
    } catch (error) {
      setInteractionStatus(error instanceof Error ? error.message : "Move could not be played");
      window.setTimeout(() => setInteractionStatus(""), 1800);
      return;
    }
    if (!result.legal || !result.board_a) {
      setLegalTargets(result.legal_destinations ?? []);
      setInteractionStatus(result.reason ?? "Illegal move");
      window.setTimeout(() => setInteractionStatus(""), 1500);
      return;
    }
    if (!onMoveIntent) {
      result.board_a.white_clock = boardA.white_clock;
      result.board_a.black_clock = boardA.black_clock;
      if (result.board_b && boardB) {
        result.board_b.white_clock = boardB.white_clock;
        result.board_b.black_clock = boardB.black_clock;
      }
      applyExploration(result.board_a, result.board_b ?? null, result.notation ?? `${from ?? dropPiece}@${to}`);
      sendRoomEvent(mode === "review" ? "variation.create" : "variation.update", {
        board_a: result.board_a,
        board_b: result.board_b,
        notation: result.notation,
        start_ply: globalPly,
      });
    }
    setSelectedSource(null);
    setSelectedDrop(null);
    setLegalTargets([]);
    setInteractionStatus(result.capture_transferred ? "Move applied · capture sent to partner" : "Move applied");
    window.setTimeout(() => setInteractionStatus(""), 1200);
  };

  const showLegalTargets = async (from?: string, dropPiece?: "P" | "N" | "B" | "R" | "Q") => {
    if (locked) return;
    const { boardA, boardB } = boardPair();
    if (!boardA || (boardId === "B" && !boardB)) return;
    const result = await api.explorationMove({
      board_a_fen: boardA.variant_fen,
      board_b_fen: boardB?.variant_fen,
      board: boardId,
      from_square: from,
      to_square: from ?? "a1",
      drop_piece: dropPiece,
      dry_run: true,
    });
    setLegalTargets(result.legal_destinations ?? []);
  };

  const selectSquare = (square: string, piece: string) => {
    if (locked) return;
    const pieceColor = piece && piece === piece.toUpperCase() ? "White" : "Black";
    const drawing = visible.find((item) => item.type === "highlight" && item.from === square);
    if (drawing) {
      removeDrawing(drawing);
      return;
    }
    if (selectedDrop) {
      void playExplorationMove(undefined, square, selectedDrop);
      return;
    }
    if (selectedSource) {
      if (selectedSource === square) {
        setSelectedSource(null);
        setLegalTargets([]);
        setInteractionStatus("");
      } else if (piece && position?.side_to_move === pieceColor) {
        setSelectedSource(square);
        void showLegalTargets(square);
        setInteractionStatus(`Selected ${square} · choose a destination`);
      } else {
        void playExplorationMove(selectedSource, square);
      }
      return;
    }
    if (piece && position?.side_to_move === pieceColor) {
      setSelectedSource(square);
      void showLegalTargets(square);
      setInteractionStatus(`Selected ${square} · choose a destination`);
    }
  };

  const scrubWithWheel = (deltaY: number) => {
    if (!game || Math.abs(deltaY) < 4) return;
    const now = Date.now();
    if (now - lastWheelAt.current < 120) return;
    lastWheelAt.current = now;
    setSelectedSource(null);
    setSelectedDrop(null);
    setLegalTargets([]);
    if (deltaY < 0) {
      if (mode === "exploration") {
        undoExploration();
        publishExplorationState();
      } else {
        const next = Math.max(0, globalPly - 1);
        seek(next);
        sendRoomEvent("timeline.seek", { global_ply: next });
      }
      return;
    }
    if (explorationFuture.length) {
      redoExploration();
      publishExplorationState();
      return;
    }
    if (mode === "review") {
      const max = Math.max(0, game.timeline.length ? game.timeline.length - 1 : game.positions_a.length - 1);
      const next = Math.min(max, globalPly + 1);
      seek(next);
      sendRoomEvent("timeline.seek", { global_ply: next });
    }
  };

  const analyze = async () => {
    if (!game || !position || unavailable || mode === "exploration" || analysisLocked) return;
    if (beforeAnalyze && !(await beforeAnalyze())) return;
    setAnalysis({ status: "queued", queuePosition: 1 });
    try {
      const submitted = await api.analyze({
        gameId: game.game.id,
        globalPly,
        board: boardId,
      });
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        const job = await api.analysisJob(submitted.job_id);
        if (job.status === "queued") {
          setAnalysis({ status: "queued", queuePosition: job.queue_position ?? 1 });
          continue;
        }
        if (job.status === "running") {
          setAnalysis({ status: "running" });
          continue;
        }
        if (job.status === "completed") {
          const score = job.result?.mate_in != null ? `M${job.result.mate_in}` : job.result?.score_cp != null ? `${job.result.score_cp} cp` : "—";
          const completed: BoardAnalysisState = { status: "completed", bestmove: job.result?.bestmove, score, scoreCp: job.result?.score_cp, mateIn: job.result?.mate_in, depth: job.result?.depth, pv: job.result?.pv };
          setAnalysis(completed);
          onAnalysisChange?.(boardId, completed);
          return;
        }
        if (job.status === "failed") throw new Error(job.error ?? "Engine analysis failed");
      }
      throw new Error("Engine analysis timed out");
    } catch (error) {
      setAnalysis({ status: "failed", error: error instanceof Error ? error.message : "Engine analysis failed" });
    }
  };

  return (
    <section className={`board-panel board-layout-${layout} ${mode === "exploration" ? "is-exploring" : ""} ${unavailable ? "is-unavailable" : ""} ${keyboardFocused ? "board-focus-active" : ""}`} data-keyboard-focus={keyboardFocused ? "active" : "inactive"}>
      <div className="board-heading">{showTitle && <strong>{title}</strong>}{onCaptureMoment && <button type="button" className="moment-capture-button" onClick={onCaptureMoment} disabled={captureMomentDisabled} aria-label="Save current learning moment" title="Save current learning moment (m)"><kbd>m</kbd> moment</button>}{keyboardFocused && <span className="board-focus-badge">KEYBOARD FOCUS</span>}<span>{position?.side_to_move ?? "Unavailable"} to move</span></div>
      <PlayerBar name={playerTop} clock={orientation === "white" ? position?.black_clock : position?.white_clock} />
      <div className={`board-stage ${layout === "standard" ? "horizontal-pockets" : "vertical-pockets"}`}>
        {layout !== "standard" && <div className="pocket-stack">
          <PocketRail color={topPocketColor} value={pocketValue(topPocketColor)} draggable={!locked && position?.side_to_move === topPocketColor} pieceStyle={pieceStyle} selectedPiece={selectedDrop} onSelectPiece={selectPocketPiece} onDragPiece={beginPocketDrag} />
          <PocketRail color={bottomPocketColor} value={pocketValue(bottomPocketColor)} draggable={!locked && position?.side_to_move === bottomPocketColor} pieceStyle={pieceStyle} selectedPiece={selectedDrop} onSelectPiece={selectPocketPiece} onDragPiece={beginPocketDrag} />
        </div>}
        {layout === "standard" && <PocketRail color={topPocketColor} value={pocketValue(topPocketColor)} draggable={!locked && position?.side_to_move === topPocketColor} pieceStyle={pieceStyle} selectedPiece={selectedDrop} onSelectPiece={selectPocketPiece} onDragPiece={beginPocketDrag} />}
        <div
          className="board"
          ref={boardRef}
          onContextMenu={(event) => event.preventDefault()}
          onWheel={(event) => { event.preventDefault(); scrubWithWheel(event.deltaY); }}
          aria-label={`${title} chessboard`}
        >
        {rows.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
          const square = squareName(rowIndex, colIndex, orientation);
          const marked = visible.some((item) => item.from === square || item.to === square);
          const lastMove = position?.from_square === square || position?.to_square === square;
          const pieceColor = piece && piece === piece.toUpperCase() ? "White" : "Black";
          const canDrag = !locked && Boolean(piece) && position?.side_to_move === pieceColor;
          return (
            <button
              className={`square ${(rowIndex + colIndex) % 2 ? "dark" : "light"} ${marked ? "annotated" : ""} ${lastMove ? "last-move" : ""} ${selectedSource === square ? "selected-source" : ""} ${legalTargets.includes(square) ? "legal-target" : ""}`}
              key={square}
              aria-label={`${square}${piece ? ` ${piece}` : ""}`}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => { if (event.button === 2) setArrowStart(square); }}
              onMouseUp={(event) => { if (event.button === 2 && arrowStart) { createAnnotation(arrowStart, square); setArrowStart(null); } }}
              onClick={() => selectSquare(square, piece)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (locked) return;
                const from = event.dataTransfer.getData("bughouse/from") || undefined;
                const dropPiece = event.dataTransfer.getData("bughouse/drop") as "P" | "N" | "B" | "R" | "Q" | "";
                void playExplorationMove(from, square, dropPiece || undefined);
              }}
            >
              {colIndex === 0 && <span className="coordinate rank-coordinate">{square[1]}</span>}
              {rowIndex === 7 && <span className="coordinate file-coordinate">{square[0]}</span>}
              <span
                className={`piece ${piece === piece.toUpperCase() ? "white-piece" : "black-piece"}`}
                draggable={canDrag}
                onDragStart={(event) => { event.dataTransfer.setData("bughouse/from", square); event.dataTransfer.effectAllowed = "move"; setSelectedSource(square); void showLegalTargets(square); }}
              >{displayPiece(piece, pieceStyle)}</span>
            </button>
          );
        }))}
          <svg className="annotation-layer" viewBox="0 0 800 800" aria-label="Board annotations">
            <defs>
              <marker id={`arrowhead-${boardId}`} markerWidth="8" markerHeight="8" refX="5.8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L6,3 z" fill="#24d6e8" /></marker>
              <marker id={`engine-arrowhead-${boardId}`} markerWidth="8" markerHeight="8" refX="5.8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L6,3 z" fill="#70f0a0" /></marker>
            </defs>
            {engineMove && <EngineSuggestion move={engineMove} orientation={orientation} markerId={`engine-arrowhead-${boardId}`} sideToMove={position?.side_to_move ?? "White"} pieceStyle={pieceStyle} />}
            {visible.filter((item) => item.type === "arrow" && item.to).map((item) => <Arrow key={item.id} annotation={item} orientation={orientation} markerId={`arrowhead-${boardId}`} onRemove={() => removeDrawing(item)} />)}
          </svg>
        </div>
        {layout === "standard" && <PocketRail color={bottomPocketColor} value={pocketValue(bottomPocketColor)} draggable={!locked && position?.side_to_move === bottomPocketColor} pieceStyle={pieceStyle} selectedPiece={selectedDrop} onSelectPiece={selectPocketPiece} onDragPiece={beginPocketDrag} />}
      </div>
      <PlayerBar name={playerBottom} clock={orientation === "white" ? position?.white_clock : position?.black_clock} bottom />
      <div className={`board-footer analysis-${analysis.status}`}>
        <button className={`analyze-button ${analysisLocked ? "capability-locked" : ""}`} title={analysisLocked ? "Fairy-Stockfish unlocks in a future guest capability" : mode === "exploration" ? "Return to the completed game before running engine analysis" : "Queue this completed-game position for Fairy-Stockfish"} onClick={analyze} disabled={!game || !position || unavailable || mode === "exploration" || analysis.status === "queued" || analysis.status === "running" || analysisLocked}>
          <BrainCircuit size={15} /> <AnalysisLabel analysis={analysis} />{analysisLocked && <LockKeyhole className="capability-lock-badge" size={10} aria-hidden="true" />}
        </button>
        {analysis.status === "completed" && analysis.pv?.length ? <span className="analysis-pv" title={analysis.pv.join(" ")}>PV {analysis.pv.slice(0, 4).join(" ")}</span> : null}
        {analysis.status === "failed" ? <span className="analysis-error" title={analysis.error}>{analysis.error}</span> : <span className="interaction-status">{interactionStatus}</span>}
      </div>
      {unavailable && (
        <div className={`board-panel-unavailable ${oneBoardAccepted ? "one-board-accepted" : ""}`} role="status">
          <strong>Second Board is unavailable</strong>
          <span>The second board was not included in the available Chess.com data.</span>
          {oneBoardAccepted ? (
            <>
              <small>Continuing with First Board only.</small>
              <button type="button" onClick={() => setOneBoardAccepted(false)}>Show recovery actions</button>
            </>
          ) : (
            <div className="incomplete-board-actions">
              <button type="button" onClick={() => setOneBoardAccepted(true)}>Continue one-board review</button>
              {onImportBothBoards && <button type="button" onClick={onImportBothBoards}><FileInput size={13} /> Import both board PGNs</button>}
              {externalFallbackUrl && <a href={externalFallbackUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open this game in bMacho <small>(external third-party tool)</small></a>}
            </div>
          )}
        </div>
      )}
    </section>
  );

  function selectPocketPiece(piece: "P" | "N" | "B" | "R" | "Q") {
    const next = selectedDrop === piece ? null : piece;
    setSelectedSource(null);
    setSelectedDrop(next);
    if (next) {
      void showLegalTargets(undefined, next);
      setInteractionStatus(`Selected ${piece} from pocket · choose a destination`);
    } else {
      setLegalTargets([]);
      setInteractionStatus("");
    }
  }

  function beginPocketDrag(piece: "P" | "N" | "B" | "R" | "Q") {
    setSelectedSource(null);
    setSelectedDrop(piece);
    void showLegalTargets(undefined, piece);
    setInteractionStatus(`Dragging ${piece} from pocket`);
  }
}

function PlayerBar({ name, clock, bottom = false }: { name: string; clock?: string; bottom?: boolean }) {
  return <div className={`player-bar ${bottom ? "bottom" : ""}`}><strong>{name}</strong><span className="clock">{clock ?? "--:--"}</span></div>;
}

function PocketRail({ color, value, draggable, pieceStyle, selectedPiece, onSelectPiece, onDragPiece }: { color: "White" | "Black"; value: string; draggable: boolean; pieceStyle: PieceStyleId; selectedPiece: "P" | "N" | "B" | "R" | "Q" | null; onSelectPiece: (piece: "P" | "N" | "B" | "R" | "Q") => void; onDragPiece: (piece: "P" | "N" | "B" | "R" | "Q") => void }) {
  const counts = [...value].filter((piece) => pieces[piece]).reduce<Record<string, number>>((result, piece) => ({ ...result, [piece]: (result[piece] ?? 0) + 1 }), {});
  const entries = Object.entries(counts).filter(([piece]) => color === "White" ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
  return <div className={`pocket-rail ${color.toLowerCase()}`} aria-label={`${color} droppers`}><small>Droppers</small>{entries.map(([piece, count]) => { const symbol = piece.toUpperCase() as "P" | "N" | "B" | "R" | "Q"; return <span className={selectedPiece === symbol && draggable ? "selected-pocket-piece" : ""} key={piece} draggable={draggable} onClick={() => { if (draggable) onSelectPiece(symbol); }} onDragStart={(event) => { if (!draggable) { event.preventDefault(); return; } event.dataTransfer.setData("bughouse/drop", symbol); event.dataTransfer.effectAllowed = "move"; onDragPiece(symbol); }}>{displayPiece(piece, pieceStyle)}{count > 1 && <b>{count}</b>}</span>; })}</div>;
}

function AnalysisLabel({ analysis }: { analysis: BoardAnalysisState }) {
  if (analysis.status === "queued") return <>Fairy-Stockfish queued · #{analysis.queuePosition ?? 1}</>;
  if (analysis.status === "running") return <>Fairy-Stockfish analyzing…</>;
  if (analysis.status === "completed") return <>Best {analysis.bestmove ?? "—"} · {analysis.score} {analysis.depth ? `· d${analysis.depth}` : ""}</>;
  if (analysis.status === "failed") return <>Retry Fairy-Stockfish</>;
  return <>Analyze with Fairy-Stockfish</>;
}

function boardPoint(square: string, orientation: "white" | "black") {
  let file = "abcdefgh".indexOf(square[0]); let rank = Number(square[1]) - 1;
  if (orientation === "black") { file = 7 - file; rank = 7 - rank; }
  return { x: file * 100 + 50, y: (7 - rank) * 100 + 50 };
}

function EngineSuggestion({ move, orientation, markerId, sideToMove, pieceStyle }: { move: NonNullable<ReturnType<typeof parseEngineBestmove>>; orientation: "white" | "black"; markerId: string; sideToMove: string; pieceStyle: PieceStyleId }) {
  const to = boardPoint(move.to, orientation);
  if (!move.from && move.dropPiece) {
    const pieceKey = sideToMove === "Black" ? move.dropPiece.toLowerCase() : move.dropPiece;
    return <g className="engine-suggestion engine-drop"><circle cx={to.x} cy={to.y} r="40" /><text x={to.x} y={to.y}>{displayPiece(pieceKey, pieceStyle)}</text></g>;
  }
  if (!move.from) return null;
  const from = boardPoint(move.from, orientation);
  return <g className="engine-suggestion"><circle className="engine-source" cx={from.x} cy={from.y} r="23" /><line className="engine-arrow" x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={`url(#${markerId})`} /><circle className="engine-target" cx={to.x} cy={to.y} r="36" /></g>;
}

function Arrow({ annotation, orientation, markerId, onRemove }: { annotation: Annotation; orientation: "white" | "black"; markerId: string; onRemove: () => void }) {
  const from = boardPoint(annotation.from, orientation); const to = boardPoint(annotation.to ?? annotation.from, orientation);
  return <line className="annotation-arrow" x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={annotation.color === "cyan" ? "#24d6e8" : "#a879ff"} strokeWidth="14" strokeLinecap="round" opacity=".78" markerEnd={`url(#${markerId})`} onClick={(event) => { event.stopPropagation(); onRemove(); }} />;
}
