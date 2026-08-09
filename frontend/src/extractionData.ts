export type BoardId = "A" | "B";
export type MatchSeat = "A-white" | "A-black" | "B-white" | "B-black";

export interface NormalizedMatch {
  game_ids: Record<BoardId, number>;
  seats: Record<MatchSeat, { name: string; rating: number }>;
  ply_counts: Record<BoardId, number>;
  decisive_board: BoardId;
  loser_seat: MatchSeat;
  action: "checkmated" | "resigned" | "flagged" | "abandoned";
  highest_rated: {
    name: string;
    rating: number;
    seat: MatchSeat;
    outcome: "WON" | "LOST";
  };
  loser_relative_to_highest: "oppo" | "partner" | "diag oppo" | null;
}

export interface PublicPlayer {
  username: string;
  displayName: string;
  avatar: string | null;
  profileUrl: string;
  archivesUrl: string;
  bughouseRating: number | null;
  bughouseRatingPath: "live_bughouse[].score" | null;
}

const BOARD_IDS = ["A", "B"] as const;
const MATCH_SEATS = ["A-white", "A-black", "B-white", "B-black"] as const;
const ACTIONS = ["checkmated", "resigned", "flagged", "abandoned"] as const;
const OUTCOMES = ["WON", "LOST"] as const;
const RELATIVE_SEATS = ["oppo", "partner", "diag oppo"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const oneOf = <T extends readonly string[]>(value: unknown, options: T): value is T[number] =>
  typeof value === "string" && options.includes(value as T[number]);

const validSeatMap = (value: unknown): value is NormalizedMatch["seats"] => {
  if (!isRecord(value)) return false;
  return MATCH_SEATS.every((seat) => {
    const player = value[seat];
    return isRecord(player) &&
      typeof player.name === "string" &&
      player.name.trim().length > 0 &&
      isInteger(player.rating);
  });
};

export function parseNormalizedMatch(value: unknown): NormalizedMatch {
  if (!isRecord(value)) {
    throw new Error("The match service returned an unexpected response shape.");
  }
  const gameIds = value.game_ids;
  const plyCounts = value.ply_counts;
  if (!isRecord(gameIds) ||
      !BOARD_IDS.every((board) => isInteger(gameIds[board]) && gameIds[board] >= 1) ||
      !validSeatMap(value.seats) ||
      !isRecord(plyCounts) ||
      !BOARD_IDS.every((board) => isInteger(plyCounts[board]) && plyCounts[board] >= 0) ||
      !oneOf(value.decisive_board, BOARD_IDS) ||
      !oneOf(value.loser_seat, MATCH_SEATS) ||
      !oneOf(value.action, ACTIONS) ||
      !isRecord(value.highest_rated) ||
      typeof value.highest_rated.name !== "string" ||
      !isInteger(value.highest_rated.rating) ||
      !oneOf(value.highest_rated.seat, MATCH_SEATS) ||
      !oneOf(value.highest_rated.outcome, OUTCOMES) ||
      !(value.loser_relative_to_highest === null || oneOf(value.loser_relative_to_highest, RELATIVE_SEATS))) {
    throw new Error("The match service returned an unexpected response shape.");
  }

  return value as unknown as NormalizedMatch;
}

async function readableError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as unknown;
  if (isRecord(body)) {
    if (typeof body.message === "string") return new Error(body.message);
    if (typeof body.detail === "string") return new Error(body.detail);
    if (isRecord(body.detail) && typeof body.detail.message === "string") {
      return new Error(body.detail.message);
    }
  }
  return new Error(fallback);
}

export async function fetchNormalizedMatch(gameId: string): Promise<NormalizedMatch> {
  let response: Response;
  try {
    response = await fetch(`/api/chesscom/matches/${encodeURIComponent(gameId)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("The match service could not be reached.");
  }

  if (!response.ok) {
    throw await readableError(response, `Match data is unavailable (${response.status}).`);
  }
  return parseNormalizedMatch(await response.json());
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fetchPublicJson(url: string, notFoundMessage: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Chess.com public data could not be reached.");
  }
  if (response.status === 404) throw new Error(notFoundMessage);
  if (!response.ok) {
    throw await readableError(response, `Chess.com public data is unavailable (${response.status}).`);
  }
  return response.json();
}

export async function fetchPublicPlayer(username: string): Promise<PublicPlayer> {
  const normalizedUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,25}$/.test(normalizedUsername)) {
    throw new Error("Enter a valid Chess.com username (2–25 letters, numbers, underscores, or hyphens).");
  }
  const encoded = encodeURIComponent(normalizedUsername);
  const notFoundMessage = "Chess.com could not find that username.";
  const profileValue = await fetchPublicJson(
    `https://api.chess.com/pub/player/${encoded}`,
    notFoundMessage,
  );
  const statsValue = await fetchPublicJson(
    `https://api.chess.com/pub/player/${encoded}/stats`,
    notFoundMessage,
  );
  const leaderboardValue = await fetchPublicJson(
    "https://api.chess.com/pub/leaderboards",
    "Chess.com's Bughouse leaderboard is unavailable.",
  );

  if (!isRecord(profileValue) || typeof profileValue.username !== "string" || !isRecord(statsValue)) {
    throw new Error("Chess.com returned an unexpected profile or stats response.");
  }
  const profileUsername = profileValue.username;

  const leaderboardEntries = isRecord(leaderboardValue) && Array.isArray(leaderboardValue.live_bughouse)
    ? leaderboardValue.live_bughouse
    : null;
  if (!leaderboardEntries) {
    throw new Error("Chess.com returned an unexpected leaderboard response.");
  }
  const leaderboardEntry = leaderboardEntries.find((entry) =>
    isRecord(entry) &&
    typeof entry.username === "string" &&
    entry.username.toLowerCase() === profileUsername.toLowerCase()
  );
  const leaderboardRating = isRecord(leaderboardEntry) && isInteger(leaderboardEntry.score)
    ? leaderboardEntry.score
    : null;
  const profileUrl = optionalString(profileValue.url) ??
    `https://www.chess.com/member/${encodeURIComponent(profileUsername)}`;

  return {
    username: profileUsername,
    displayName: optionalString(profileValue.name) ?? profileUsername,
    avatar: optionalString(profileValue.avatar),
    profileUrl,
    archivesUrl: `https://api.chess.com/pub/player/${encodeURIComponent(profileUsername.toLowerCase())}/games/archives`,
    bughouseRating: leaderboardRating,
    bughouseRatingPath: leaderboardRating !== null ? "live_bughouse[].score" : null,
  };
}

export function matchupCardText(match: NormalizedMatch): string {
  const highest = match.highest_rated;
  const seat = match.loser_relative_to_highest ? `${match.loser_relative_to_highest} ` : "";
  return `${highest.name}(${highest.rating}) ${highest.outcome} — ${seat}${match.action}`;
}
