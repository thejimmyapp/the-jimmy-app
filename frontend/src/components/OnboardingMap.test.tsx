import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingMap } from "./OnboardingMap";

const renderMap = (overrides: Partial<Parameters<typeof OnboardingMap>[0]> = {}) => render(
  <OnboardingMap guest_number={13} total_guests={13} completions_to_date={0} onGuestSpawn={vi.fn()} onWordVertigoUnmute={vi.fn()} {...overrides} />,
);

const addDockTarget = () => {
  const target = document.createElement("div");
  target.id = "app-dock-panel";
  document.body.append(target);
  return target;
};

describe("locked-shell onboarding", () => {
  afterEach(() => {
    cleanup();
    document.getElementById("app-dock-panel")?.remove();
    vi.useRealTimers();
  });

  it("focuses Guest Spawn on load and traps Tab and arrows between the two nodes", () => {
    renderMap();
    const guest = screen.getByRole("button", { name: /Click me\?/ });
    const wordInput = screen.getByRole("textbox", { name: /Sign in/ });

    expect(document.activeElement).toBe(guest);
    fireEvent.keyDown(guest, { key: "ArrowRight" });
    expect(document.activeElement).toBe(wordInput);
    fireEvent.keyDown(wordInput, { key: "Tab" });
    expect(document.activeElement).toBe(guest);
    fireEvent.keyDown(guest, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(wordInput);
    fireEvent.keyDown(wordInput, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(guest);
  });

  it("starts on the first character, locks input, and cycles reveal speed modulo four", () => {
    vi.useFakeTimers();
    const onActiveChange = vi.fn();
    const { container } = renderMap({ onWordVertigoActiveChange: onActiveChange });
    const wordInput = screen.getByRole("textbox", { name: /Sign in/ }) as HTMLInputElement;

    fireEvent.change(wordInput, { target: { value: "b" } });
    expect(wordInput.readOnly).toBe(true);
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    expect(container.querySelector(".word-vertigo-active")).toBeTruthy();
    expect(container.querySelector(".guest-entry-node")?.hasAttribute("inert")).toBe(true);
    act(() => vi.advanceTimersByTime(126));
    const reveal = container.querySelector<HTMLButtonElement>(".word-vertigo-reveal");
    expect(reveal?.textContent).toBe("A");
    expect(reveal?.dataset.speed).toBe("0.4");

    fireEvent.click(reveal as HTMLButtonElement);
    expect(reveal?.dataset.speed).toBe("0.6");
    fireEvent.click(reveal as HTMLButtonElement);
    expect(reveal?.dataset.speed).toBe("0.75");
    fireEvent.click(reveal as HTMLButtonElement);
    expect(reveal?.dataset.speed).toBe("1.9");
    fireEvent.click(reveal as HTMLButtonElement);
    expect(reveal?.dataset.speed).toBe("0.4");
    fireEvent.click(reveal as HTMLButtonElement);
    expect(reveal?.dataset.speed).toBe("0.6");
  });

  it("resets the ephemeral countdown on remount and exposes both escape controls", () => {
    vi.useFakeTimers();
    addDockTarget();
    const onUnmute = vi.fn().mockResolvedValue(undefined);
    const first = renderMap({ onWordVertigoUnmute: onUnmute });

    fireEvent.change(screen.getByRole("textbox", { name: /Sign in/ }), { target: { value: "!" } });
    expect(screen.getByRole("timer").textContent).toBe("01:30");
    expect(document.querySelectorAll(".word-vertigo-audio-bar")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("timer").textContent).toBe("01:25");
    fireEvent.click(screen.getByRole("button", { name: "unmute" }));
    expect(onUnmute).toHaveBeenCalledOnce();

    first.unmount();
    expect(vi.getTimerCount()).toBe(0);
    renderMap();
    fireEvent.change(screen.getByRole("textbox", { name: /Sign in/ }), { target: { value: "x" } });
    expect(screen.getByRole("timer").textContent).toBe("01:30");
    fireEvent.click(screen.getByRole("button", { name: "start over" }));
    const resetInput = screen.getByRole("textbox", { name: /Sign in/ }) as HTMLInputElement;
    expect(resetInput.value).toBe("");
    expect(resetInput.readOnly).toBe(false);
    expect(screen.queryByRole("timer")).toBeNull();
  });
});
