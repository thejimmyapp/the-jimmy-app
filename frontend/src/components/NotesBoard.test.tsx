import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicMomentRecord } from "../api";
import { NotesBoard } from "./NotesBoard";

const apiMock = vi.hoisted(() => ({ listPublicMoments: vi.fn(), togglePublicMomentVote: vi.fn() }));

vi.mock("../api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api")>();
  return { ...original, api: { ...original.api, ...apiMock } };
});

const publicMoment = (overrides: Partial<PublicMomentRecord> = {}): PublicMomentRecord => ({
  id: 101,
  save_order: 1,
  game_id: 901,
  move_token: "17A",
  glyph: "!!",
  alternative_move: "N@f7",
  written_answer: "Because it forces the king into the mating net.",
  engine_identity: "Fairy-Stockfish",
  engine_depth: 18,
  author_guest_number: 21,
  board_a_white_pocket: "N",
  board_a_black_pocket: "",
  board_b_white_pocket: "P",
  board_b_black_pocket: "q",
  board_a_white_clock: "01:21",
  board_a_black_clock: "01:15",
  board_b_white_clock: "00:54",
  board_b_black_clock: "00:48",
  created_at: "2026-08-11T18:00:00+00:00",
  vote_count: 2,
  voted: false,
  ...overrides,
});

beforeEach(() => {
  apiMock.listPublicMoments.mockResolvedValue({ moments: [] });
  apiMock.togglePublicMomentVote.mockResolvedValue({ voted: true, vote_count: 3 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("global public notes board", () => {
  it("renders frozen public moments from multiple guest authors", async () => {
    apiMock.listPublicMoments.mockResolvedValue({
      moments: [
        publicMoment(),
        publicMoment({ id: 102, save_order: 2, move_token: "18b", glyph: "?!", alternative_move: "Qh4", written_answer: "Because the diagonal stays defended.", author_guest_number: 34, engine_identity: null, engine_depth: null, created_at: "2026-08-11T18:01:00+00:00", vote_count: 0 }),
      ],
    });
    render(<NotesBoard />);

    expect(await screen.findByText("17A · Board A · !!")).toBeTruthy();
    expect(screen.getByText("18b · Board B · ?!")).toBeTruthy();
    expect(screen.getByLabelText("Public learning moments").querySelectorAll("article")).toHaveLength(2);
    expect(screen.getByText("SirGuest#21")).toBeTruthy();
    expect(screen.getByText("SirGuest#34")).toBeTruthy();
    expect(screen.getByText("N@f7")).toBeTruthy();
    expect(screen.getByText("Because it forces the king into the mating net.")).toBeTruthy();
    expect(screen.getByText("Fairy-Stockfish · depth 18")).toBeTruthy();
    expect(screen.getByText("2026-08-11T18:00:00+00:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upvote · 2" }).getAttribute("aria-pressed")).toBe("false");
    expect(apiMock.listPublicMoments).toHaveBeenCalledOnce();
  });

  it("toggles the server-backed vote count and fails closed on a refusal", async () => {
    apiMock.listPublicMoments.mockResolvedValue({ moments: [publicMoment()] });
    render(<NotesBoard />);

    fireEvent.click(await screen.findByRole("button", { name: "Upvote · 2" }));
    const voted = await screen.findByRole("button", { name: "Upvote · 3" });
    expect(voted.getAttribute("aria-pressed")).toBe("true");
    expect(apiMock.togglePublicMomentVote).toHaveBeenCalledWith(101);

    apiMock.togglePublicMomentVote.mockRejectedValueOnce(new Error("refused"));
    fireEvent.click(voted);
    expect((await screen.findByRole("alert")).textContent).toBe("Vote could not be saved.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Upvote · 3" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("renders the public empty state", async () => {
    render(<NotesBoard />);
    expect(await screen.findByText("No public moments yet.")).toBeTruthy();
  });

  it("fails closed with a graceful inline message", async () => {
    apiMock.listPublicMoments.mockRejectedValue(new Error("unavailable"));
    render(<NotesBoard />);
    expect((await screen.findByRole("alert")).textContent).toContain("Public moments could not be loaded.");
    expect(screen.queryByLabelText("Public learning moments")).toBeNull();
  });
});
