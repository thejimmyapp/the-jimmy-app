import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingMap } from "./OnboardingMap";

describe("locked-shell onboarding", () => {
  afterEach(cleanup);

  it("focuses Guest Spawn on load and traps Tab and arrows between the two nodes", () => {
    render(<OnboardingMap onGuestSpawn={vi.fn()} onUsernameSubmit={vi.fn()} />);
    const guest = screen.getByRole("button", { name: /Guest Spawn/ });
    const username = screen.getByRole("textbox", { name: /Username/ });

    expect(document.activeElement).toBe(guest);
    fireEvent.keyDown(guest, { key: "ArrowRight" });
    expect(document.activeElement).toBe(username);
    fireEvent.change(username, { target: { value: "Jimmy_42" } });
    expect((username as HTMLInputElement).value).toBe("Jimmy_42");
    fireEvent.keyDown(username, { key: "Tab" });
    expect(document.activeElement).toBe(guest);
    fireEvent.keyDown(guest, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(username);
    fireEvent.keyDown(username, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(guest);
  });

  it("calls only the named entry callbacks and validates usernames syntactically", () => {
    const onGuestSpawn = vi.fn();
    const onUsernameSubmit = vi.fn();
    render(<OnboardingMap onGuestSpawn={onGuestSpawn} onUsernameSubmit={onUsernameSubmit} />);
    const guest = screen.getByRole("button", { name: /Guest Spawn/ });
    const username = screen.getByRole("textbox", { name: /Username/ });

    fireEvent.click(guest);
    expect(onGuestSpawn).toHaveBeenCalledOnce();
    fireEvent.change(username, { target: { value: "bad name" } });
    fireEvent.keyDown(username, { key: "Enter" });
    expect(onUsernameSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("2–25");
    fireEvent.change(username, { target: { value: "Jimmy-42" } });
    fireEvent.keyDown(username, { key: "Enter" });
    expect(onUsernameSubmit).toHaveBeenCalledWith("Jimmy-42");
  });
});
