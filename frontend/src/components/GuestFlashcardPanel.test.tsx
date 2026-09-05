import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type AccountSummary, type MomentRecord } from "../api";
import { GuestFlashcardPanel } from "./GuestFlashcardPanel";

const apiMock = vi.hoisted(() => ({ listMyMoments: vi.fn(), reviewMoment: vi.fn() }));

vi.mock("../api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api")>();
  return { ...original, api: { ...original.api, ...apiMock } };
});

const account = (overrides: Partial<AccountSummary> = {}): AccountSummary => ({
  guest_number: 7,
  email: "guest@example.com",
  completion_ordinal: 7,
  founder_eligible: true,
  created_at: "2026-08-11T00:00:00+00:00",
  ...overrides,
});

const moment = (overrides: Partial<MomentRecord> = {}): MomentRecord => ({
  id: 1,
  save_order: 1,
  game_id: 901,
  move_token: "17A",
  glyph: "!!",
  alternative_move: "N@f7",
  written_answer: "Because it forces the king into the mating net.",
  engine_identity: "Fairy-Stockfish",
  engine_depth: 18,
  author_guest_number: 7,
  board_a_white_pocket: "N",
  board_a_black_pocket: "",
  board_b_white_pocket: "P",
  board_b_black_pocket: "q",
  board_a_white_clock: "01:21",
  board_a_black_clock: "01:15",
  board_b_white_clock: "00:54",
  board_b_black_clock: "00:48",
  created_at: "2026-08-11T00:00:00+00:00",
  due: true,
  attempted: false,
  failed_last: false,
  due_at: null,
  attempts: 0,
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

beforeEach(() => {
  apiMock.listMyMoments.mockResolvedValue({ moments: [] });
  apiMock.reviewMoment.mockResolvedValue({
    id: 1,
    private_moment_id: 1,
    attempts: 1,
    last_result: "pass",
    last_grade: "good",
    interval_days: 1,
    ease: 2.5,
    due_at: "2026-08-12T00:00:00+00:00",
    reviewed_at: "2026-08-11T00:00:00+00:00",
    created_at: "2026-08-11T00:00:00+00:00",
    due: false,
    attempted: true,
    failed_last: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("saved moment flashcard deck", () => {
  it("renders every authoritative moment and reveals the answer and provenance", async () => {
    apiMock.listMyMoments.mockResolvedValue({
      moments: [
        moment(),
        moment({ id: 2, save_order: 2, move_token: "18b", glyph: "?!", alternative_move: "Qh4", written_answer: "Because the diagonal stays defended.", engine_identity: null, engine_depth: null }),
      ],
    });
    renderPanel();

    expect(await screen.findByText("17A · Board A · !!")).toBeTruthy();
    expect(screen.getByText("What's the stronger idea here?")).toBeTruthy();
    expect(screen.getByLabelText("Flashcard position").textContent).toBe("1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Flip" }));
    expect(screen.getByText("N@f7")).toBeTruthy();
    expect(screen.getByText("Because it forces the king into the mating net.")).toBeTruthy();
    expect(screen.getByText("Fairy-Stockfish · depth 18")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("18b · Board B · ?!")).toBeTruthy();
    expect(screen.getByLabelText("Flashcard position").textContent).toBe("2 of 2");
    expect(screen.getByRole("button", { name: "Flip" })).toBeTruthy();
  });

  it("wraps next and previous and supports the deck keyboard controls", async () => {
    apiMock.listMyMoments.mockResolvedValue({ moments: [moment(), moment({ id: 2, move_token: "18b", glyph: "?" })] });
    renderPanel();
    const dialog = await screen.findByRole("dialog", { name: "SirGuest#7 Flashcard library" });

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("18b · Board B · ?")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("17A · Board A · !!")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: " " });
    expect(screen.getByText("N@f7")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Enter" });
    expect(screen.getByText("17A · Board A · !!")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(screen.getByText("18b · Board B · ?")).toBeTruthy();
  });

  it("keeps the existing empty state for a guest with no saved moments", async () => {
    renderPanel();
    expect(await screen.findByText("No flashcards yet.")).toBeTruthy();
  });

  it("fails closed with an inline message when moments cannot be loaded", async () => {
    apiMock.listMyMoments.mockRejectedValue(new ApiError(503, "unavailable"));
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toContain("Flashcards could not be loaded.");
    expect(screen.queryByLabelText("Saved moment flashcards")).toBeNull();
  });

  it("shows due, attempted, and failed-last review badges from the server", async () => {
    apiMock.listMyMoments.mockResolvedValue({
      moments: [moment({ due: false, attempted: true, failed_last: true, attempts: 3 })],
    });
    renderPanel();

    const state = await screen.findByLabelText("Review state");
    expect(state.textContent).toContain("Not due");
    expect(state.textContent).toContain("Attempted");
    expect(state.textContent).toContain("Failed last");
  });

  it("grades a card and refreshes review badges only from the server response", async () => {
    apiMock.listMyMoments.mockResolvedValue({ moments: [moment()] });
    renderPanel();
    await screen.findByText("17A · Board A · !!");

    fireEvent.click(screen.getByRole("button", { name: "Grade good" }));

    await waitFor(() => expect(apiMock.reviewMoment).toHaveBeenCalledWith(1, "good"));
    expect(await screen.findByText("Not due")).toBeTruthy();
    expect(screen.getByText("Attempted")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Review recorded: good.");
  });

  it("keeps the current card and reports a failed grade write accessibly", async () => {
    apiMock.listMyMoments.mockResolvedValue({ moments: [moment()] });
    apiMock.reviewMoment.mockRejectedValue(new ApiError(503, "unavailable"));
    renderPanel();
    await screen.findByText("17A · Board A · !!");

    fireEvent.click(screen.getByRole("button", { name: "Grade again" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Review grade could not be saved. Try again.");
    expect(screen.getByText("17A · Board A · !!")).toBeTruthy();
  });
});

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
