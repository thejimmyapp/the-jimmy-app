import type { BoardId, NormalizedMatch } from "./types";

export type BoardOrientation = "white" | "black";

export interface GuestBoardPresentation {
  primarySourceBoard: BoardId;
  partnerSourceBoard: BoardId;
  primaryOrientation: BoardOrientation;
  partnerOrientation: BoardOrientation;
}

export const guestBoardPresentation = (match: NormalizedMatch): GuestBoardPresentation => {
  const primarySourceBoard: BoardId = match.highest_rated.seat.startsWith("B-") ? "B" : "A";
  const primaryOrientation: BoardOrientation = match.highest_rated.seat.endsWith("-black") ? "black" : "white";
  return {
    primarySourceBoard,
    partnerSourceBoard: primarySourceBoard === "A" ? "B" : "A",
    primaryOrientation,
    partnerOrientation: primaryOrientation === "white" ? "black" : "white",
  };
};

export const sourceBoardForDisplay = (match: NormalizedMatch | null, displayBoard: BoardId): BoardId => {
  if (!match) return displayBoard;
  const presentation = guestBoardPresentation(match);
  return displayBoard === "A" ? presentation.primarySourceBoard : presentation.partnerSourceBoard;
};
