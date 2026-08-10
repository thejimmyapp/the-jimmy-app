import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReplayLimitationsExpander } from "./ReplayLimitationsExpander";

afterEach(cleanup);

describe("replay limitations expander", () => {
  it("starts collapsed and preserves both limitation boxes inside one expander", () => {
    render(<ReplayLimitationsExpander notices={["Cross-board order was clock-inferred (not exact)."]} />);
    const summary = screen.getByText("what this replay can and cannot tell you");
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);

    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(screen.getByText("REPLAY LIMITS")).toBeTruthy();
    expect(screen.getByText("Cross-board order was clock-inferred (not exact).")).toBeTruthy();
    expect(screen.getByText("Know what the analysis can and cannot see")).toBeTruthy();
    expect(screen.getByText("Fairy-Stockfish evaluates the selected board. Without complete partner-board data, it cannot fully account for transfers, piece requests, timing, and danger on the other board.")).toBeTruthy();
    expect(screen.getByText("Chess.com does not always provide the partner board or exact cross-board timing. Pocket (“dropper”) counts may therefore be incomplete or reconstructed approximately.")).toBeTruthy();
    expect(screen.getByText("Saved learning moments can still be useful prompts for review, but they are not guarantees of the best Bughouse decision.")).toBeTruthy();
  });
});
