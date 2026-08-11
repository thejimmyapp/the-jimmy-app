import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAKE_STOCKFISH_HEADER,
  FAKE_STOCKFISH_PULSE_INTERVAL_MS,
  FakeStockfishGate,
  fakeStockfishRefusalCopy,
} from "./FakeStockfishCard";

describe("FakeStockfishGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("ships the owner strings byte-identically", () => {
    expect(FAKE_STOCKFISH_HEADER).toBe("have no fear! stockfish is here!");
    expect(fakeStockfishRefusalCopy(13)).toBe("PSYCH! You fell for that? Ha! No you can't use stockfish until you have 10 learning moments saved. The feature is NOT a paywall. You gotsta finish yer quest, SirGuest#13. Hop to it!");
  });

  it("looks real, refuses on press, records 13-second pulses, then traps the toggle", async () => {
    const fetcher = vi.mocked(fetch);
    const view = render(
      <FakeStockfishGate isGuest savedMomentCount={3} guestNumber={13}>
        <div>Real analysis path</div>
      </FakeStockfishGate>,
    );

    expect(screen.getByText(FAKE_STOCKFISH_HEADER)).toBeTruthy();
    expect(screen.getByText("0.84")).toBeTruthy();
    expect(screen.getByText("N@e5+ Kh8 Q@h6 Rg8")).toBeTruthy();
    const toggle = screen.getByRole("checkbox", { name: "Enable" }) as HTMLInputElement;
    expect(toggle.disabled).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    expect(screen.getByText(fakeStockfishRefusalCopy(13)).textContent).toBe(fakeStockfishRefusalCopy(13));
    expect(screen.queryByText("0.84")).toBeNull();
    expect(screen.getByText("Accumulated quest-clock debt: 0 seconds.")).toBeTruthy();
    expect(screen.queryByText("−13")).toBeNull();

    await act(async () => { vi.advanceTimersByTime(FAKE_STOCKFISH_PULSE_INTERVAL_MS); });
    expect(screen.getByText("−13")).toBeTruthy();
    expect(screen.getByText("Accumulated quest-clock debt: 13 seconds.")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(FAKE_STOCKFISH_PULSE_INTERVAL_MS); });
    expect(screen.getByText("Accumulated quest-clock debt: 26 seconds.")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable" }));
    expect(screen.getByText(FAKE_STOCKFISH_HEADER)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Enable" })).toBeNull();
    expect(screen.getByText("[PLACEHOLDER: distracting loop]")).toBeTruthy();
    expect(screen.getByText("Accumulated quest-clock debt: 26 seconds.")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(FAKE_STOCKFISH_PULSE_INTERVAL_MS * 2); });
    expect(screen.getByText("Accumulated quest-clock debt: 26 seconds.")).toBeTruthy();

    view.rerender(
      <FakeStockfishGate isGuest savedMomentCount={4} guestNumber={13}>
        <div>Real analysis path</div>
      </FakeStockfishGate>,
    );
    expect(screen.queryByText("[PLACEHOLDER: distracting loop]")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Enable" })).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("renders only the real analysis path at ten moments or for a non-guest", () => {
    const view = render(
      <FakeStockfishGate isGuest savedMomentCount={10} guestNumber={13}>
        <div>Real analysis path</div>
      </FakeStockfishGate>,
    );
    expect(screen.getByText("Real analysis path")).toBeTruthy();
    expect(screen.queryByText(FAKE_STOCKFISH_HEADER)).toBeNull();

    view.rerender(
      <FakeStockfishGate isGuest={false} savedMomentCount={0} guestNumber={13}>
        <div>Real analysis path</div>
      </FakeStockfishGate>,
    );
    expect(screen.getByText("Real analysis path")).toBeTruthy();
    expect(screen.queryByText(FAKE_STOCKFISH_HEADER)).toBeNull();
  });
});
