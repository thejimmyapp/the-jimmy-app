import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MomentGlyph } from "../guestProgress";
import { LearningMomentCard, type LearningMomentCardProps } from "./LearningMomentCard";

const momentPrompts: Record<MomentGlyph, string> = {
  "!": "[COPY-PLACEHOLDER] Show a move you might have played instead — and why it's worse.",
  "?": "[COPY-PLACEHOLDER] What should they have played, and what did they miss?",
  "!!": "[COPY-PLACEHOLDER] What makes this one hard to find?",
  "??": "[COPY-PLACEHOLDER] What's the punishment?",
  "!?": "[COPY-PLACEHOLDER] What risk did they accept?",
  "?!": "[COPY-PLACEHOLDER] What's the safer option?",
};

const position = [
  ["r", "", "b", "q", "", "r", "k", ""],
  ["p", "p", "", "", "b", "p", "p", "p"],
  ["", "", "n", "p", "", "n", "", ""],
  ["", "", "p", "", "p", "", "", ""],
  ["", "", "", "", "P", "", "", ""],
  ["", "", "N", "P", "", "N", "", ""],
  ["P", "P", "P", "", "B", "P", "P", "P"],
  ["R", "", "B", "Q", "", "R", "K", ""],
];

const baseProps: LearningMomentCardProps = {
  position,
  position_board: "A",
  played_move: "Nxf7",
  boards: {
    A: { white_pocket: "PN", black_pocket: "q", white_clock: "1:14.2", black_clock: "0:48.9" },
    B: { white_pocket: "BR", black_pocket: "ppn", white_clock: "0:57.0", black_clock: "1:21.6" },
  },
  glyph: "?",
  alternative_move: "P@f7+",
  answer: "The drop forces the king away before the file opens.",
  author_guest_number: 13,
  game_id: 180731271553,
  move_token: "17A",
};

afterEach(cleanup);

describe("LearningMomentCard", () => {
  it.each(Object.entries(momentPrompts) as Array<[MomentGlyph, string]>)("shows the placeholder question for %s", (glyph, prompt) => {
      render(<LearningMomentCard {...baseProps} glyph={glyph} />);
      expect(screen.getByText(prompt).getAttribute("data-copy-placeholder")).toBe("true");
  });

  it("shows the coupled position context and annotation", () => {
    render(<LearningMomentCard {...baseProps} />);

    expect(screen.getByRole("img", { name: "Board A position at 17A" })).toBeTruthy();
    expect(screen.getByText("Nxf7")).toBeTruthy();
    expect(screen.getByText("P@f7+")).toBeTruthy();
    expect(screen.getByText(baseProps.answer)).toBeTruthy();
    expect(screen.getByText("SirGuest#13")).toBeTruthy();
    expect(screen.getByText("SirGuest#13 wrote")).toBeTruthy();
    expect(screen.getByLabelText("Moment address 180731271553 · 17A")).toBeTruthy();

    const boardA = screen.getByRole("region", { name: "Board A pockets" });
    const boardB = screen.getByRole("region", { name: "Board B pockets" });
    expect(within(boardA).getByText("PN")).toBeTruthy();
    expect(within(boardA).getByText("q")).toBeTruthy();
    expect(within(boardB).getByText("BR")).toBeTruthy();
    expect(within(boardB).getByText("ppn")).toBeTruthy();
    for (const clock of ["1:14.2", "0:48.9", "0:57.0", "1:21.6"]) {
      expect(screen.getByText(clock)).toBeTruthy();
    }
  });

  it("labels every empty pocket explicitly", () => {
    render(<LearningMomentCard {...baseProps} boards={{
      A: { ...baseProps.boards.A, white_pocket: "", black_pocket: "" },
      B: { ...baseProps.boards.B, white_pocket: "", black_pocket: "" },
    }} />);

    expect(screen.getAllByText("Empty")).toHaveLength(4);
  });

  it("preserves a long written answer", () => {
    const answer = "A long explanation ".repeat(40).trim();
    render(<LearningMomentCard {...baseProps} answer={answer} />);
    expect(screen.getByText(answer)).toBeTruthy();
  });
});
