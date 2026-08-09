import type {
  BoardId,
  CallbackReplayBoard,
  GamePayload,
  GuestMatchReplaySource,
  MoveRecord,
  ReplayPosition,
} from "./types";

const SQUARE_SYMBOLS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?";
const DROP_SYMBOLS = "&-*+=";
const DROP_PIECES = "QNRBP";
const PROMOTION_SYMBOLS = "{~}(^)[_]@#$";
const PROMOTION_PIECES = "QNRB";
const FILES = "abcdefgh";

type Color = "white" | "black";
type PieceType = "P" | "N" | "B" | "R" | "Q" | "K";
type PocketPiece = Exclude<PieceType, "K">;

export type MoveListDecodeErrorCode =
  | "odd_length"
  | "ply_count_mismatch"
  | "unknown_symbol"
  | "invalid_promotion_source";

export class MoveListDecodeError extends Error {
  readonly code: MoveListDecodeErrorCode;
  readonly ply: number | null;
  readonly symbol: string | null;
  readonly offset: number | null;

  constructor(code: MoveListDecodeErrorCode, message: string, details: { ply?: number; symbol?: string; offset?: number } = {}) {
    super(message);
    this.name = "MoveListDecodeError";
    this.code = code;
    this.ply = details.ply ?? null;
    this.symbol = details.symbol ?? null;
    this.offset = details.offset ?? null;
  }
}

export type MatchReconstructionErrorCode =
  | "invalid_fen"
  | "invalid_timestamp"
  | "illegal_move"
  | "missing_pocket_piece"
  | "invalid_partner_link";

export class MatchReconstructionError extends Error {
  readonly code: MatchReconstructionErrorCode;
  readonly board: BoardId | null;
  readonly ply: number | null;

  constructor(code: MatchReconstructionErrorCode, message: string, details: { board?: BoardId; ply?: number } = {}) {
    super(message);
    this.name = "MatchReconstructionError";
    this.code = code;
    this.board = details.board ?? null;
    this.ply = details.ply ?? null;
  }
}

type DecodedMove = {
  raw: string;
  ply: number;
  kind: "move" | "drop" | "promotion";
  from: string | null;
  to: string;
  dropPiece: PocketPiece | null;
  promotion: Exclude<PocketPiece, "P"> | null;
};

type Piece = {
  color: Color;
  type: PieceType;
  promoted: boolean;
};

type Pocket = Record<PocketPiece, number>;

type BoardState = {
  squares: Array<Piece | null>;
  turn: Color;
  castling: Set<string>;
  enPassant: string | null;
  halfmove: number;
  fullmove: number;
  pockets: Record<Color, Pocket>;
  clocks: Record<Color, number>;
  localPly: number;
  lastMove: AppliedMove | null;
};

type AppliedMove = {
  display: string;
  from: string | null;
  to: string;
  captured: Piece | null;
  mover: Color;
};

type TimedMove = {
  board: BoardId;
  localPly: number;
  elapsedTenths: number;
  remainingTenths: number;
  move: DecodedMove;
};

export type ReconstructedGuestMatch = {
  game: GamePayload;
  finalFens: Record<BoardId, string>;
};

const emptyPocket = (): Pocket => ({ P: 0, N: 0, B: 0, R: 0, Q: 0 });

const opposite = (color: Color): Color => color === "white" ? "black" : "white";

const symbolSquare = (symbol: string): string | null => {
  const index = SQUARE_SYMBOLS.indexOf(symbol);
  if (index < 0) return null;
  return `${FILES[index % 8]}${Math.floor(index / 8) + 1}`;
};

const squareIndex = (square: string): number => FILES.indexOf(square[0]) + (Number(square[1]) - 1) * 8;

export function decodeMoveList(moveList: string, expectedPlyCount?: number): DecodedMove[] {
  if (moveList.length % 2 !== 0) {
    throw new MoveListDecodeError("odd_length", "The callback moveList ended with an incomplete move.", { offset: moveList.length - 1 });
  }
  const count = moveList.length / 2;
  if (expectedPlyCount !== undefined && count !== expectedPlyCount) {
    throw new MoveListDecodeError("ply_count_mismatch", `Decoded ${count} plies but the callback declared ${expectedPlyCount}.`);
  }
  const moves: DecodedMove[] = [];
  for (let index = 0; index < moveList.length; index += 2) {
    const ply = index / 2 + 1;
    const sourceSymbol = moveList[index];
    const targetSymbol = moveList[index + 1];
    const raw = `${sourceSymbol}${targetSymbol}`;
    const dropIndex = DROP_SYMBOLS.indexOf(sourceSymbol);
    if (dropIndex >= 0) {
      const to = symbolSquare(targetSymbol);
      if (!to) throw unknownSymbol(targetSymbol, ply, index + 1, "drop target");
      moves.push({ raw, ply, kind: "drop", from: null, to, dropPiece: DROP_PIECES[dropIndex] as PocketPiece, promotion: null });
      continue;
    }

    const from = symbolSquare(sourceSymbol);
    if (!from) throw unknownSymbol(sourceSymbol, ply, index, "move source");
    const promotionIndex = PROMOTION_SYMBOLS.indexOf(targetSymbol);
    if (promotionIndex >= 0) {
      const sourceRank = Number(from[1]);
      if (sourceRank !== 2 && sourceRank !== 7) {
        throw new MoveListDecodeError("invalid_promotion_source", `Promotion at ply ${ply} starts from ${from}, not the second or seventh rank.`, { ply, symbol: sourceSymbol, offset: index });
      }
      const fileOffset = promotionIndex % 3 - 1;
      const targetFile = FILES.indexOf(from[0]) + fileOffset;
      if (targetFile < 0 || targetFile > 7) {
        throw new MoveListDecodeError("invalid_promotion_source", `Promotion at ply ${ply} leaves the board.`, { ply, symbol: targetSymbol, offset: index + 1 });
      }
      const to = `${FILES[targetFile]}${sourceRank === 7 ? "8" : "1"}`;
      moves.push({
        raw,
        ply,
        kind: "promotion",
        from,
        to,
        dropPiece: null,
        promotion: PROMOTION_PIECES[Math.floor(promotionIndex / 3)] as Exclude<PocketPiece, "P">,
      });
      continue;
    }

    const to = symbolSquare(targetSymbol);
    if (!to) throw unknownSymbol(targetSymbol, ply, index + 1, "move target");
    moves.push({ raw, ply, kind: "move", from, to, dropPiece: null, promotion: null });
  }
  return moves;
}

function unknownSymbol(symbol: string, ply: number, offset: number, role: string): MoveListDecodeError {
  return new MoveListDecodeError("unknown_symbol", `Unknown callback symbol ${JSON.stringify(symbol)} at ply ${ply} (${role}); match refused.`, { symbol, ply, offset });
}

export function reconstructGuestMatch(source: GuestMatchReplaySource): ReconstructedGuestMatch {
  const boardA = source.boards.A;
  const boardB = source.boards.B;
  if (
    boardA.id !== source.match.game_ids.A
    || boardB.id !== source.match.game_ids.B
    || boardA.partnerGameId !== boardB.uuid
    || boardB.partnerGameId !== boardA.uuid
  ) {
    throw new MatchReconstructionError("invalid_partner_link", "Callback boards do not link to each other.");
  }
  const decoded = {
    A: decodeMoveList(boardA.moveList, boardA.plyCount),
    B: decodeMoveList(boardB.moveList, boardB.plyCount),
  };
  const timed = {
    A: timedMoves("A", boardA, decoded.A),
    B: timedMoves("B", boardB, decoded.B),
  };
  const state = {
    A: parseFen(boardA.initialFen, boardA.baseTime1),
    B: parseFen(boardB.initialFen, boardB.baseTime1),
  };
  const positions = {
    A: [snapshot(state.A, 0)],
    B: [snapshot(state.B, 0)],
  };
  const timeline: GamePayload["timeline"] = [{
    global_ply: 0,
    board: "A",
    local_ply: 0,
    move: "Start",
    board_a: snapshot(state.A, 0),
    board_b: snapshot(state.B, 0),
  }];
  const events = mergeTimedMoves(timed.A, timed.B);

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const current = state[event.board];
    const partnerBoard: BoardId = event.board === "A" ? "B" : "A";
    const applied = applyMove(current, event.move, event.board);
    current.clocks[applied.mover] = event.remainingTenths;
    current.localPly = event.localPly;
    current.lastMove = applied;
    if (applied.captured) {
      if (applied.captured.type === "K") {
        throw illegal(event.board, event.localPly, "A king cannot be transferred to a pocket.");
      }
      const partnerColor = opposite(applied.mover);
      const pocketPiece: PocketPiece = applied.captured.promoted ? "P" : applied.captured.type;
      state[partnerBoard].pockets[partnerColor][pocketPiece] += 1;
    }
    const globalPly = index + 1;
    const frameA = snapshot(state.A, globalPly);
    const frameB = snapshot(state.B, globalPly);
    timeline.push({
      global_ply: globalPly,
      board: event.board,
      local_ply: event.localPly,
      move: applied.display,
      board_a: frameA,
      board_b: frameB,
    });
    positions[event.board].push(event.board === "A" ? frameA : frameB);
  }

  const moveRecords = {
    A: toMoveRecords(timed.A, timeline),
    B: toMoveRecords(timed.B, timeline),
  };
  const match = source.match;
  const loser = match.seats[match.loser_seat];
  const finalFens = { A: serializeFen(state.A), B: serializeFen(state.B) };
  const game: GamePayload = {
    game: {
      id: match.game_ids.A,
      played_at: `${String(boardA.headers.Date ?? "")} ${String(boardA.headers.EndTime ?? "")}`.trim(),
      result: String(boardA.headers.Result ?? "*"),
      opponent: match.seats["A-black"].name,
      opponent_rating: match.seats["A-black"].rating,
      partner: match.seats["B-black"].name,
      user_color: "white",
      time_control: String(boardA.headers.TimeControl ?? Math.floor(boardA.baseTime1 / 10)),
    },
    players: {
      board_a_white: match.seats["A-white"].name,
      board_a_black: match.seats["A-black"].name,
      board_b_white: match.seats["B-white"].name,
      board_b_black: match.seats["B-black"].name,
    },
    moves_a: moveRecords.A,
    moves_b: moveRecords.B,
    positions_a: positions.A,
    positions_b: positions.B,
    timeline,
    second_board_available: true,
    limitations: ["Cross-board order is inferred from remaining-clock timestamps; Chess.com does not provide an exact match event stream."],
    cross_board_ordering: { method: "clock-inferred", exact: false },
    outcome: {
      summary: `${loser.name} was ${match.action}.`,
      detail: `The decisive result occurred on Board ${match.decisive_board}.`,
      loser_username: loser.name,
      termination: match.action,
      board: match.decisive_board,
      board_role: null,
      move_number: Math.ceil(match.ply_counts[match.decisive_board] / 2),
    },
    lesson: null,
  };
  return { game, finalFens };
}

function timedMoves(board: BoardId, source: CallbackReplayBoard, moves: DecodedMove[]): TimedMove[] {
  const rawValues = source.moveTimestamps ? source.moveTimestamps.split(",") : [];
  if (rawValues.length !== moves.length && rawValues.length !== moves.length + 1) {
    throw new MatchReconstructionError("invalid_timestamp", `Board ${board} has ${rawValues.length} clock values for ${moves.length} plies.`, { board });
  }
  // Some completed callbacks append the non-moving player's terminal clock.
  // It is a match-end snapshot, not another ply.
  const raw = rawValues.slice(0, moves.length);
  const stamps = raw.map((value, index) => {
    if (!/^\d+$/.test(value)) {
      throw new MatchReconstructionError("invalid_timestamp", `Board ${board} has an invalid clock at ply ${index + 1}.`, { board, ply: index + 1 });
    }
    return Number(value);
  });
  const incrementTenths = source.timeIncrement1 * 10;
  return moves.map((move, index) => {
    const otherClock = index === 0 ? source.baseTime1 : stamps[index - 1];
    const elapsedTenths = 2 * source.baseTime1 + (index + 1) * incrementTenths - stamps[index] - otherClock;
    if (!Number.isFinite(elapsedTenths) || elapsedTenths < 0) {
      throw new MatchReconstructionError("invalid_timestamp", `Board ${board} clock arithmetic failed at ply ${index + 1}.`, { board, ply: index + 1 });
    }
    return { board, localPly: index + 1, elapsedTenths, remainingTenths: stamps[index], move };
  });
}

function mergeTimedMoves(boardA: TimedMove[], boardB: TimedMove[]): TimedMove[] {
  const merged: TimedMove[] = [];
  let a = 0;
  let b = 0;
  while (a < boardA.length || b < boardB.length) {
    if (b >= boardB.length || (a < boardA.length && boardA[a].elapsedTenths <= boardB[b].elapsedTenths)) {
      merged.push(boardA[a]);
      a += 1;
    } else {
      merged.push(boardB[b]);
      b += 1;
    }
  }
  return merged;
}

function parseFen(fen: string, baseTime: number): BoardState {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) throw fenError("FEN must contain six fields.");
  const ranks = fields[0].split("/");
  if (ranks.length !== 8) throw fenError("FEN placement must contain eight ranks.");
  const squares: Array<Piece | null> = Array(64).fill(null);
  for (let row = 0; row < ranks.length; row += 1) {
    let file = 0;
    for (const token of ranks[row]) {
      if (/^[1-8]$/.test(token)) {
        file += Number(token);
        continue;
      }
      if (!/^[prnbqkPRNBQK]$/.test(token) || file >= 8) throw fenError(`Invalid FEN piece token ${JSON.stringify(token)}.`);
      const color: Color = token === token.toUpperCase() ? "white" : "black";
      const rank = 7 - row;
      squares[rank * 8 + file] = { color, type: token.toUpperCase() as PieceType, promoted: false };
      file += 1;
    }
    if (file !== 8) throw fenError(`FEN rank ${8 - row} does not contain eight squares.`);
  }
  if (fields[1] !== "w" && fields[1] !== "b") throw fenError("FEN side to move is invalid.");
  if (fields[2] !== "-" && !/^(?=.{1,4}$)K?Q?k?q?$/.test(fields[2])) throw fenError("FEN castling rights are invalid.");
  if (fields[3] !== "-" && !/^[a-h][36]$/.test(fields[3])) throw fenError("FEN en-passant square is invalid.");
  if (!/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) throw fenError("FEN move counters are invalid.");
  return {
    squares,
    turn: fields[1] === "w" ? "white" : "black",
    castling: new Set(fields[2] === "-" ? [] : [...fields[2]]),
    enPassant: fields[3] === "-" ? null : fields[3],
    halfmove: Number(fields[4]),
    fullmove: Number(fields[5]),
    pockets: { white: emptyPocket(), black: emptyPocket() },
    clocks: { white: baseTime, black: baseTime },
    localPly: 0,
    lastMove: null,
  };
}

function fenError(message: string): MatchReconstructionError {
  return new MatchReconstructionError("invalid_fen", message);
}

function illegal(board: BoardId, ply: number, message: string): MatchReconstructionError {
  return new MatchReconstructionError("illegal_move", `Board ${board}, ply ${ply}: ${message}`, { board, ply });
}

function applyMove(state: BoardState, move: DecodedMove, board: BoardId): AppliedMove {
  const mover = state.turn;
  const priorEnPassant = state.enPassant;
  state.enPassant = null;

  if (move.kind === "drop") {
    const pieceType = move.dropPiece as PocketPiece;
    const destination = squareIndex(move.to);
    if (state.squares[destination]) throw illegal(board, move.ply, `Cannot drop ${pieceType} on occupied ${move.to}.`);
    if (pieceType === "P" && (move.to[1] === "1" || move.to[1] === "8")) throw illegal(board, move.ply, `Cannot drop a pawn on ${move.to}.`);
    if (state.pockets[mover][pieceType] <= 0) {
      throw new MatchReconstructionError("missing_pocket_piece", `Board ${board}, ply ${move.ply}: ${mover} has no ${pieceType} to drop.`, { board, ply: move.ply });
    }
    state.pockets[mover][pieceType] -= 1;
    state.squares[destination] = { color: mover, type: pieceType, promoted: false };
    state.halfmove = pieceType === "P" ? 0 : state.halfmove + 1;
    finishTurn(state, mover);
    return { display: `${pieceType}@${move.to}`, from: null, to: move.to, captured: null, mover };
  }

  const from = move.from as string;
  const fromIndex = squareIndex(from);
  const toIndex = squareIndex(move.to);
  const moving = state.squares[fromIndex];
  if (!moving) throw illegal(board, move.ply, `No piece exists on ${from}.`);
  if (moving.color !== mover) throw illegal(board, move.ply, `${from} contains the wrong side's piece.`);
  const target = state.squares[toIndex];
  if (target?.color === mover) throw illegal(board, move.ply, `Cannot capture a friendly piece on ${move.to}.`);
  let captured = target;
  let captureSquare = toIndex;
  const fileDelta = FILES.indexOf(move.to[0]) - FILES.indexOf(from[0]);
  const rankDelta = Number(move.to[1]) - Number(from[1]);

  if (moving.type === "P") {
    const direction = mover === "white" ? 1 : -1;
    if (fileDelta !== 0 && !target) {
      if (Math.abs(fileDelta) !== 1 || rankDelta !== direction || priorEnPassant !== move.to) {
        throw illegal(board, move.ply, `Pawn move ${from}-${move.to} is not a valid en passant capture.`);
      }
      captureSquare = toIndex - direction * 8;
      captured = state.squares[captureSquare];
      if (!captured || captured.color === mover || captured.type !== "P") throw illegal(board, move.ply, "En passant capture pawn is missing.");
    } else if (fileDelta !== 0) {
      if (Math.abs(fileDelta) !== 1 || rankDelta !== direction) throw illegal(board, move.ply, `Pawn capture ${from}-${move.to} is invalid.`);
    } else {
      if (target || (rankDelta !== direction && rankDelta !== 2 * direction)) throw illegal(board, move.ply, `Pawn move ${from}-${move.to} is invalid.`);
      if (Math.abs(rankDelta) === 2) {
        const startRank = mover === "white" ? "2" : "7";
        const passedIndex = fromIndex + direction * 8;
        if (from[1] !== startRank || state.squares[passedIndex]) throw illegal(board, move.ply, `Pawn cannot advance two squares from ${from}.`);
        state.enPassant = `${from[0]}${Number(from[1]) + direction}`;
      }
    }
  }

  const isCastle = moving.type === "K" && from[0] === "e" && from[1] === move.to[1] && Math.abs(fileDelta) === 2;
  if (isCastle) moveCastleRook(state, mover, from, move.to, board, move.ply);
  state.squares[fromIndex] = null;
  if (captureSquare !== toIndex) state.squares[captureSquare] = null;
  if (move.kind === "promotion") {
    if (moving.type !== "P" || (move.to[1] !== "1" && move.to[1] !== "8")) throw illegal(board, move.ply, "Promotion does not move a pawn to the last rank.");
    state.squares[toIndex] = { color: mover, type: move.promotion as Exclude<PocketPiece, "P">, promoted: true };
  } else {
    state.squares[toIndex] = moving;
  }
  updateCastlingRights(state, moving, from, move.to, captured);
  state.halfmove = moving.type === "P" || captured ? 0 : state.halfmove + 1;
  const captureMarker = captured ? "x" : "";
  const display = isCastle
    ? (move.to[0] === "g" ? "O-O" : "O-O-O")
    : move.kind === "promotion"
      ? `${from}${captureMarker}${move.to}=${move.promotion}`
      : moving.type === "P"
        ? (captured ? `${from[0]}x${move.to}` : move.to)
        : `${moving.type}${from}${captureMarker}${move.to}`;
  finishTurn(state, mover);
  return { display, from, to: move.to, captured, mover };
}

function moveCastleRook(state: BoardState, mover: Color, from: string, to: string, board: BoardId, ply: number) {
  const rank = mover === "white" ? "1" : "8";
  if (from !== `e${rank}` || (to !== `g${rank}` && to !== `c${rank}`)) throw illegal(board, ply, "Castling geometry is invalid.");
  const kingSide = to[0] === "g";
  const right = mover === "white" ? (kingSide ? "K" : "Q") : (kingSide ? "k" : "q");
  if (!state.castling.has(right)) throw illegal(board, ply, `Castling right ${right} is unavailable.`);
  const rookFrom = `${kingSide ? "h" : "a"}${rank}`;
  const rookTo = `${kingSide ? "f" : "d"}${rank}`;
  const rook = state.squares[squareIndex(rookFrom)];
  if (!rook || rook.color !== mover || rook.type !== "R") throw illegal(board, ply, `Castling rook is missing from ${rookFrom}.`);
  state.squares[squareIndex(rookFrom)] = null;
  state.squares[squareIndex(rookTo)] = rook;
}

function updateCastlingRights(state: BoardState, moving: Piece, from: string, to: string, captured: Piece | null) {
  if (moving.type === "K") {
    if (moving.color === "white") { state.castling.delete("K"); state.castling.delete("Q"); }
    else { state.castling.delete("k"); state.castling.delete("q"); }
  }
  const rookRightBySquare: Record<string, string> = { a1: "Q", h1: "K", a8: "q", h8: "k" };
  if (moving.type === "R" && rookRightBySquare[from]) state.castling.delete(rookRightBySquare[from]);
  if (captured?.type === "R" && rookRightBySquare[to]) state.castling.delete(rookRightBySquare[to]);
}

function finishTurn(state: BoardState, mover: Color) {
  if (mover === "black") state.fullmove += 1;
  state.turn = opposite(mover);
}

function snapshot(state: BoardState, partnerIndex: number): ReplayPosition {
  const whitePocket = pocketText(state.pockets.white, true);
  const blackPocket = pocketText(state.pockets.black, false);
  return {
    ply: state.localPly,
    label: state.lastMove?.display ?? "Start",
    board: boardMatrix(state),
    side_to_move: state.turn === "white" ? "White" : "Black",
    variant_fen: serializeVariantFen(state),
    fen: serializeFen(state),
    white_pocket: whitePocket || "-",
    black_pocket: blackPocket || "-",
    white_clock: formatClock(state.clocks.white),
    black_clock: formatClock(state.clocks.black),
    partner_index: partnerIndex,
    confidence: "medium",
    warning: "Cross-board order is clock-inferred, not exact.",
    from_square: state.lastMove?.from ?? null,
    to_square: state.lastMove?.to ?? null,
  };
}

function boardMatrix(state: BoardState): string[][] {
  const rows: string[][] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    const row: string[] = [];
    for (let file = 0; file < 8; file += 1) {
      const piece = state.squares[rank * 8 + file];
      row.push(piece ? (piece.color === "white" ? piece.type : piece.type.toLowerCase()) : "");
    }
    rows.push(row);
  }
  return rows;
}

function placementFen(state: BoardState): string {
  return boardMatrix(state).map((row) => {
    let output = "";
    let empty = 0;
    for (const piece of row) {
      if (!piece) { empty += 1; continue; }
      if (empty) { output += String(empty); empty = 0; }
      output += piece;
    }
    return output + (empty ? String(empty) : "");
  }).join("/");
}

function serializeFen(state: BoardState): string {
  const castling = "KQkq".split("").filter((right) => state.castling.has(right)).join("") || "-";
  return `${placementFen(state)} ${state.turn === "white" ? "w" : "b"} ${castling} ${state.enPassant ?? "-"} ${state.halfmove} ${state.fullmove}`;
}

function serializeVariantFen(state: BoardState): string {
  const standard = serializeFen(state);
  const [placement, ...fields] = standard.split(" ");
  const pocket = `${pocketText(state.pockets.white, true)}${pocketText(state.pockets.black, false)}`;
  return `${placement}[${pocket}] ${fields.join(" ")}`;
}

function pocketText(pocket: Pocket, uppercase: boolean): string {
  const text = (["P", "N", "B", "R", "Q"] as PocketPiece[])
    .map((piece) => piece.repeat(pocket[piece]))
    .join("");
  return uppercase ? text : text.toLowerCase();
}

function formatClock(tenths: number): string {
  const safe = Math.max(0, tenths);
  const minutes = Math.floor(safe / 600);
  const seconds = Math.floor((safe % 600) / 10);
  const decimal = safe % 10;
  return decimal ? `${minutes}:${String(seconds).padStart(2, "0")}.${decimal}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toMoveRecords(events: TimedMove[], timeline: GamePayload["timeline"]): MoveRecord[] {
  return events.map((event) => {
    const frame = timeline.find((item) => item.board === event.board && item.local_ply === event.localPly);
    return {
      ply: event.localPly,
      display_move: frame?.move ?? event.move.raw,
      color: event.localPly % 2 === 1 ? "White" : "Black",
      elapsed_seconds: event.elapsedTenths / 10,
    };
  });
}

export const decoderTablesForTest = {
  squareSymbols: SQUARE_SYMBOLS,
  dropSymbols: DROP_SYMBOLS,
  promotionSymbols: PROMOTION_SYMBOLS,
};
