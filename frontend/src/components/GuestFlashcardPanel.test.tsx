import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type AccountSummary } from "../api";
import { GuestFlashcardPanel } from "./GuestFlashcardPanel";

const account = (overrides: Partial<AccountSummary> = {}): AccountSummary => ({
  guest_number: 7,
  email: "guest@example.com",
  completion_ordinal: 7,
  founder_eligible: true,
  created_at: "2026-08-11T00:00:00+00:00",
  ...overrides,
});

const renderPanel = (overrides: Partial<Parameters<typeof GuestFlashcardPanel>[0]> = {}) => {
  const props: Parameters<typeof GuestFlashcardPanel>[0] = {
    guestNumber: 7,
    remainingSeconds: 0,
    questCompleted: true,
    completionRecorded: false,
    account: null,
    accountLoading: false,
    onClaimAccount: vi.fn(),
    onAccountClaimed: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<GuestFlashcardPanel {...props} />), props };
};

afterEach(cleanup);

describe("completed guest identity claim", () => {
  it("does not expose sign-up before the server records completion", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Claim your identity" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
  });

  it("surfaces an invalid-email refusal inline", async () => {
    const onClaimAccount = vi.fn().mockRejectedValue(
      new ApiError(422, "Enter a valid email.", { code: "invalid_email" }),
    );
    renderPanel({ completionRecorded: true, onClaimAccount });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Claim your identity" }));

    expect((await screen.findByRole("alert")).textContent).toBe("enter a valid email");
    expect(onClaimAccount).toHaveBeenCalledWith("bad");
  });

  it("shows founder status after a successful claim", async () => {
    const claimed = account();
    const onClaimAccount = vi.fn().mockResolvedValue(claimed);
    const onAccountClaimed = vi.fn();
    renderPanel({ completionRecorded: true, onClaimAccount, onAccountClaimed });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: claimed.email } });
    fireEvent.click(screen.getByRole("button", { name: "Claim your identity" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Claimed — Founder #7"));
    expect(onAccountClaimed).toHaveBeenCalledWith(claimed);
  });

  it("reflects a hydrated non-founder account without another form", () => {
    renderPanel({ completionRecorded: true, account: account({ completion_ordinal: 11, founder_eligible: false }) });
    expect(screen.getByRole("status").textContent).toBe("Identity claimed (#11)");
    expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
  });
});
