import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { MoveListDecodeError } from "../bughouseDecoder";
import { formatRelativeAge } from "../guestMatchAge";
import type { NormalizedMatch } from "../types";
import { GuestMatchupList } from "./GuestMatchupList";

vi.mock("../api", () => ({ api: { guestMatchups: vi.fn() } }));

const matches: NormalizedMatch[] = Array.from({ length: 5 }, (_, index) => ({
  game_ids: { A: 100 + index * 2, B: 101 + index * 2 },
  end_time: 1_786_319_880 - index * 3600,
  seats: {
    "A-white": { name: `Player${index}`, rating: 2500 - index },
    "A-black": { name: "Opponent", rating: 2200 },
    "B-white": { name: "Diagonal", rating: 2100 },
    "B-black": { name: "Partner", rating: 2150 },
  },
  ply_counts: { A: 40, B: 42 },
  decisive_board: "A",
  loser_seat: "A-black",
  action: "checkmated",
  highest_rated: { name: `Player${index}`, rating: 2500 - index, seat: "A-white", outcome: "WON" },
  loser_relative_to_highest: "oppo",
}));

const matchupPayload = (items = matches) => ({
  matches: items,
  examined: 7,
  excluded: 2,
  exclusion_counts: { under_20_plies: 2 },
  players_sampled: ["one", "two", "three"],
  players_represented: ["one", "two", "three"],
  seed_source: "leaderboard_top_50" as const,
  selection_window_hours: 12 as const,
  cached: false,
});

const renderList = (children: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("guest matchup list", () => {
  it("keeps one keyboard focus target, cycles with arrows, and selects with Enter", async () => {
    vi.mocked(api.guestMatchups).mockResolvedValue(matchupPayload());
    const onSelect = vi.fn();
    renderList(<GuestMatchupList onSelect={onSelect} />);
    const list = await screen.findByRole("listbox", { name: "Guest matchups" });

    await waitFor(() => expect(document.activeElement).toBe(list));
    const regenerate = screen.getByRole("button", { name: "Regenerate list" });
    regenerate.focus();
    expect(document.activeElement).toBe(regenerate);
    list.focus();
    expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(matches[1]);
    expect(screen.getByText("Player1(2499) WON — oppo checkmated")).toBeTruthy();
  });

  it("keeps the error state keyboard-only and retries with Enter", async () => {
    vi.mocked(api.guestMatchups).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(matchupPayload());
    renderList(<GuestMatchupList onSelect={vi.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Press Enter to retry");
    fireEvent.keyDown(screen.getByRole("region", { name: "Choose a guest matchup" }), { key: "Enter" });
    expect(await screen.findByRole("listbox", { name: "Guest matchups" })).toBeTruthy();
    expect(api.guestMatchups).toHaveBeenCalledTimes(2);
  });

  it("keeps an unverifiable selection out of the workspace", async () => {
    vi.mocked(api.guestMatchups).mockResolvedValue(matchupPayload());
    const onSelect = vi.fn().mockRejectedValue(new MoveListDecodeError("unknown_symbol", "unknown callback symbol"));
    renderList(<GuestMatchupList onSelect={onSelect} />);
    const list = await screen.findByRole("listbox", { name: "Guest matchups" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toContain("decoder cannot verify");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("shows honest ages, expands the rationale, and regenerates to a different set", async () => {
    const alternatives = matches.map((match, index) => ({
      ...match,
      game_ids: { A: 1_000 + index * 2, B: 1_001 + index * 2 },
      highest_rated: { ...match.highest_rated, name: `Fresh${index}` },
    }));
    vi.mocked(api.guestMatchups)
      .mockResolvedValueOnce(matchupPayload())
      .mockResolvedValueOnce(matchupPayload(alternatives));
    renderList(<GuestMatchupList onSelect={vi.fn()} />);
    await screen.findByRole("listbox", { name: "Guest matchups" });

    expect(formatRelativeAge(1_000, 3_520)).toBe("42 min ago");
    expect(formatRelativeAge(1_000, 11_800)).toBe("3 h ago");
    const details = screen.getByText("why is this the list of options").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("why is this the list of options"));
    expect(details.open).toBe(true);
    expect(screen.getByText("Because it's a quest. Five fresh games from strong and interesting bughouse players, played recently. More options does not mean more good.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate list" }));
    expect(await screen.findByText("Fresh0(2500) WON — oppo checkmated")).toBeTruthy();
    expect(api.guestMatchups).toHaveBeenLastCalledWith({
      refresh: true,
      excludeGameIds: matches.flatMap((match) => [match.game_ids.A, match.game_ids.B]),
    });
  });
});
