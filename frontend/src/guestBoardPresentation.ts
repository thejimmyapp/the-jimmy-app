import type { BoardId, NormalizedMatch } from "./types";

export type BoardOrientation = "white" | "black";
export type BoardDisplayName = "First Board" | "Second Board";

export interface GuestBoardPresentation {
  featuredSourceBoard: BoardId;
  stagedSourceBoard: BoardId;
  dockSourceBoard: BoardId;
  stagedOrientation: BoardOrientation;
  dockOrientation: BoardOrientation;
  stagedName: BoardDisplayName;
  dockName: BoardDisplayName;
  sourceNames: Record<BoardId, BoardDisplayName>;
}

const otherBoard = (board: BoardId): BoardId => board === "A" ? "B" : "A";

const ratingTotal = (match: NormalizedMatch, board: BoardId) => (
  match.seats[`${board}-white`].rating + match.seats[`${board}-black`].rating
);

export const guestBoardPresentation = (match: NormalizedMatch, swapped = false): GuestBoardPresentation => {
  const featuredSourceBoard: BoardId = match.highest_rated.seat.startsWith("B-") ? "B" : "A";
  const featuredOrientation: BoardOrientation = match.highest_rated.seat.endsWith("-black") ? "black" : "white";
  const otherSourceBoard = otherBoard(featuredSourceBoard);
  const boardATotal = ratingTotal(match, "A");
  const boardBTotal = ratingTotal(match, "B");
  const secondSourceBoard: BoardId = boardATotal === boardBTotal
    ? otherSourceBoard
    : boardATotal < boardBTotal ? "A" : "B";
  const sourceNames: Record<BoardId, BoardDisplayName> = secondSourceBoard === "A"
    ? { A: "Second Board", B: "First Board" }
    : { A: "First Board", B: "Second Board" };
  const stagedSourceBoard = swapped ? otherSourceBoard : featuredSourceBoard;
  const dockSourceBoard = otherBoard(stagedSourceBoard);
  const sourceOrientations: Record<BoardId, BoardOrientation> = {
    [featuredSourceBoard]: featuredOrientation,
    [otherSourceBoard]: featuredOrientation === "white" ? "black" : "white",
  } as Record<BoardId, BoardOrientation>;
  return {
    featuredSourceBoard,
    stagedSourceBoard,
    dockSourceBoard,
    stagedOrientation: sourceOrientations[stagedSourceBoard],
    dockOrientation: sourceOrientations[dockSourceBoard],
    stagedName: sourceNames[stagedSourceBoard],
    dockName: sourceNames[dockSourceBoard],
    sourceNames,
  };
};
