import type { MomentGlyph, SavedMoment } from "./guestProgress";
import type { BoardId, GamePayload, MatchSeat, NormalizedMatch } from "./types";

export type MomentCapture = Pick<SavedMoment, "matchIds" | "ply" | "boardId" | "move" | "seat"> & { moveToken: string };

export const momentToken = (board: BoardId, localPly: number) => {
  if (!Number.isInteger(localPly) || localPly <= 0) return null;
  const boardToken = localPly % 2 === 1 ? board : board.toLowerCase();
  return `${Math.ceil(localPly / 2)}${boardToken}`;
};

export const captureMomentContext = (
  match: NormalizedMatch | null,
  game: GamePayload | null,
  globalPly: number,
): MomentCapture | null => {
  if (!match || !game || globalPly <= 0) return null;
  const frame = game.timeline[globalPly];
  if (!frame || frame.global_ply !== globalPly || frame.local_ply <= 0 || frame.move === "Start") return null;
  const moveToken = momentToken(frame.board, frame.local_ply);
  if (!moveToken) return null;
  const color = frame.local_ply % 2 === 1 ? "white" : "black";
  return {
    matchIds: { ...match.game_ids },
    ply: globalPly,
    boardId: frame.board,
    move: frame.move,
    seat: `${frame.board}-${color}` as MatchSeat,
    moveToken,
  };
};

export const savedMomentFromCapture = (
  capture: MomentCapture,
  glyph: MomentGlyph,
  alternativeMove: string,
  note: string,
  serverId: number,
  savedAt = new Date().toISOString(),
): SavedMoment => ({ ...capture, serverId, glyph, alternativeMove, note: note.trim(), savedAt });

export const matchForSavedMoment = (matches: NormalizedMatch[], moment: SavedMoment) => matches.find((match) => (
  match.game_ids.A === moment.matchIds.A && match.game_ids.B === moment.matchIds.B
)) ?? null;

export const playerNamesForMoment = (match: NormalizedMatch | null) => match
  ? (["A-white", "A-black", "B-white", "B-black"] as MatchSeat[]).map((seat) => match.seats[seat].name).join(" · ")
  : "Players unavailable";
