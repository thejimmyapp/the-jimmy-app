import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatEvaluation } from "../evalScore";
import { EvalCard, type EvalCardProps } from "./EvalCard";

afterEach(cleanup);

const baseProps: EvalCardProps = {
  engine_identity: "Fairy-Stockfish 14.0",
  depth: 16,
  status: "complete",
  enabled: true,
  score_cp: 137,
  white_pocket: "PNQ",
  black_pocket: "br",
  principal_lines: [
    { rank: 1, moves: ["p@f7+", "Kxf7", "n@e5+"] },
    { rank: 2, moves: ["Q@h7+", "Kxh7"] },
  ],
};

describe("EvalCard", () => {
  it("formats cp, mate, zero, and missing scores in the frontend", () => {
    expect(formatEvaluation({ score_cp: 137 })).toBe("1.37");
    expect(formatEvaluation({ mate_in: 3, score_cp: 999 })).toBe("mate 3");
    expect(formatEvaluation({ score_cp: 0 })).toBe("0.00");
    expect(formatEvaluation({})).toBe("unknown");
  });

  it("shows ranked drop notation, pockets, context limits, and attribution", () => {
    render(<EvalCard {...baseProps} />);
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("P@f7+ Kxf7 N@e5+")).toBeTruthy();
    expect(screen.getByText("PNQ")).toBeTruthy();
    expect(screen.getByText("br")).toBeTruthy();
    expect(screen.getByText(/cannot see the partner board/)).toBeTruthy();
    expect(screen.getByText("Analysis by Fairy-Stockfish")).toBeTruthy();
  });

  it("expands additional principal lines and exposes the enable toggle", () => {
    const onEnabledChange = vi.fn();
    render(<EvalCard {...baseProps} onEnabledChange={onEnabledChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more line" }));
    expect(screen.getByText("Q@h7+ Kxh7")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable" }));
    expect(onEnabledChange).toHaveBeenCalledWith(false);
  });

  it("identifies the analysed board and can disable the toggle", () => {
    render(<EvalCard {...baseProps} board_label="First Board · Board A · ply 14" toggle_disabled />);
    expect(screen.getByText("Analysed: First Board · Board A · ply 14")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Enable" }) as HTMLInputElement).disabled).toBe(true);
  });

  it.each([
    ["idle", "Idle"],
    ["analysing", "Analysing…"],
    ["failed", "Analysis failed"],
    ["unsupported-variant", "Unsupported variant"],
  ] as const)("renders the %s state without a fabricated numeric result", (status, label) => {
    render(<EvalCard {...baseProps} status={status} score_cp={undefined} principal_lines={[]} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("0.00")).toBeNull();
  });
});
