import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayPosition } from "../types";
import { ANALYSIS_DEBOUNCE_MS, LiveEvalCard } from "./LiveEvalCard";

const position: ReplayPosition = {
  ply: 14,
  label: "14",
  board: [],
  side_to_move: "white",
  variant_fen: "8/8/8/8/8/8/8/8[PNq] w - - 0 1",
  white_pocket: "PN",
  black_pocket: "q",
  white_clock: "1:00",
  black_clock: "1:00",
  partner_index: 7,
  from_square: null,
  to_square: null,
};

const submission = (jobId: string) => new Response(JSON.stringify({ job_id: jobId, status: "queued", engine: "Fairy-Stockfish" }), {
  status: 202,
  headers: { "Content-Type": "application/json" },
});

const completed = (board: "A" | "B", scoreCp: number) => new Response(JSON.stringify({
  status: "completed",
  engine: "Fairy-Stockfish",
  board,
  global_ply: 14,
  depth: 10,
  cached: false,
  result: {
    fen: position.variant_fen,
    bestmove: "P@f7+",
    score_cp: scoreCp,
    mate_in: null,
    pv: ["p@f7+", "Kxf7", "n@e5+"],
    depth: 10,
    variant_supported: true,
    engine_name: "Fairy-Stockfish 14",
  },
}), { status: 200, headers: { "Content-Type": "application/json" } });

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("LiveEvalCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("defaults off and waits for a stable position before requesting analysis", async () => {
    const fetcher = vi.mocked(fetch);
    fetcher.mockResolvedValueOnce(submission("job-a")).mockResolvedValueOnce(completed("A", 137));
    const view = render(<LiveEvalCard gameLoaded storedGameId={42} globalPly={14} board="A" boardName="First Board" position={position} />);

    expect((screen.getByRole("checkbox", { name: "Enable" }) as HTMLInputElement).checked).toBe(false);
    await act(async () => { vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS * 2); await flush(); });
    expect(fetcher).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable" }));
    await act(async () => { vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS - 1); await flush(); });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); await flush(); });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText("1.37")).toBeTruthy();
    expect(screen.getByText("Analysed: First Board · Board A · ply 14")).toBeTruthy();

    view.rerender(<LiveEvalCard gameLoaded storedGameId={42} globalPly={14} board="B" boardName="Second Board" position={position} />);
    expect(screen.queryByText("1.37")).toBeNull();
  });

  it("retargets a swap and never shows the old board result", async () => {
    let resolveOldJob: ((response: Response) => void) | undefined;
    const oldJob = new Promise<Response>((resolve) => { resolveOldJob = resolve; });
    const fetcher = vi.mocked(fetch);
    fetcher.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/analysis") {
        const request = JSON.parse(String(init?.body)) as { board: "A" | "B" };
        return submission(request.board === "A" ? "job-a" : "job-b");
      }
      if (url.endsWith("job-a")) return oldJob;
      return completed("B", 200);
    });

    const view = render(<LiveEvalCard gameLoaded storedGameId={42} globalPly={14} board="A" boardName="First Board" position={position} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable" }));
    await act(async () => { vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS); await flush(); });
    expect(fetcher).toHaveBeenCalledTimes(2);

    view.rerender(<LiveEvalCard gameLoaded storedGameId={42} globalPly={14} board="B" boardName="Second Board" position={position} />);
    await act(async () => { vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS); await flush(); });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(screen.getByText("2.00")).toBeTruthy();
    expect(screen.getByText("Analysed: Second Board · Board B · ply 14")).toBeTruthy();

    await act(async () => { resolveOldJob?.(completed("A", 999)); await flush(); });
    expect(screen.queryByText("9.99")).toBeNull();
    expect(screen.getByText("2.00")).toBeTruthy();
  });

  it("explains an unstored replay without calling the engine", async () => {
    const fetcher = vi.mocked(fetch);
    render(<LiveEvalCard gameLoaded storedGameId={null} globalPly={14} board="A" boardName="My Board" position={position} />);

    expect(screen.getByText("Analysis is unavailable because this replay has not been stored as a completed game.")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Enable" }) as HTMLInputElement).disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS * 2); await flush(); });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("shows Retry-After in human terms and does not retry automatically", async () => {
    const fetcher = vi.mocked(fetch);
    fetcher.mockResolvedValue(new Response(JSON.stringify({ detail: "Engine queue is full" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "12" },
    }));
    render(<LiveEvalCard gameLoaded storedGameId={42} globalPly={14} board="A" boardName="First Board" position={position} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable" }));
    await act(async () => { vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS); await flush(); });

    expect(screen.getByText("The engine is at capacity. Try again in 12 seconds.")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(60_000); await flush(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
