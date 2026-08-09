import type { BoardId, CoachJob, CoachPreparedPayload, CoachPrepareRequest, ExplorationMoveResult, GamePayload, GameSummary, GuestMatchReplaySource, GuestMatchupList, LeakMapJob, NormalizedMatch, PlayerStats, PuzzleMove, PuzzlePayload, PuzzleResponse, QwenStatus, RoomPayload } from "./types";

type ApiErrorDetail = { code?: string; message?: string; external_game_id?: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly externalGameId?: string;

  constructor(status: number, message: string, detail?: ApiErrorDetail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = detail?.code;
    this.externalGameId = detail?.external_game_id;
  }
}

const json = async <T>(responsePromise: Promise<Response>): Promise<T> => {
  const response = await responsePromise;
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string | ApiErrorDetail };
    const detail = typeof body.detail === "object" && body.detail ? body.detail : undefined;
    const message = typeof body.detail === "string" ? body.detail : detail?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message, detail);
  }
  return response.json() as Promise<T>;
};

export const api = {
  chessComMatch: (gameId: number) => json<NormalizedMatch>(fetch(`/api/chesscom/matches/${gameId}`)),
  chessComMatchReplay: (gameId: number) => json<GuestMatchReplaySource>(fetch(`/api/chesscom/matches/${gameId}/replay`)),
  guestMatchups: () => json<GuestMatchupList>(fetch("/api/chesscom/guest-matchups")),
  connectChessCom: (username: string) =>
    json<{ public_profile_connected: boolean; bughouse_games_found: number; new_games_stored: number }>(
      fetch("/api/chesscom/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      }),
    ),
  enrichChessCom: (username: string, curlText: string) =>
    json<{ checked: number; enriched: number; remaining_without_second_board: number; credentials_stored: boolean }>(
      fetch("/api/chesscom/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, curl_text: curlText, limit: 5000 }),
      }),
    ),
  importPgn: (username: string, pgn: string, secondBoardPgn: string) =>
    json<{ created: boolean; source: "manual"; second_board_supplied: boolean; game_id: number }>(
      fetch("/api/games/import-pgn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pgn, second_board_pgn: secondBoardPgn }),
      }),
    ),
  resolveGame: (url: string, username?: string) =>
    json<{ status: "resolved"; source: "stored" | "chesscom_public_archive"; external_game_id: string; game_id: number; game: GamePayload }>(
      fetch("/api/games/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, username: username || null }),
      }),
    ),
  games: (username: string) =>
    json<{ games: GameSummary[] }>(fetch(`/api/chesscom/${encodeURIComponent(username)}/bughouse-games?limit=1000`)),
  game: (gameId: number) => json<GamePayload>(fetch(`/api/games/${gameId}`)),
  createRoom: (gameId?: number) =>
    json<{ id: string; game_id: number | null; share_path: string }>(
      fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId ?? null }),
      }),
    ),
  room: (roomId: string) => json<RoomPayload>(fetch(`/api/rooms/${roomId}`)),
  joinRoom: (roomId: string, displayName: string) =>
    json<{ client_id: string; display_name: string }>(
      fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      }),
    ),
  analyze: (request: { gameId: number; globalPly: number; board: "A" | "B" }) =>
    json<{ job_id: string; status: string; engine: string }>(
      fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id: request.gameId,
          global_ply: request.globalPly,
          board: request.board,
          depth: 10,
        }),
      }),
    ),
  analysisJob: (jobId: string) =>
    json<{
      status: "queued" | "running" | "completed" | "failed";
      engine?: string;
      queue_position?: number;
      result?: { bestmove?: string; score_cp?: number; mate_in?: number; depth?: number; pv?: string[]; engine_name?: string; variant_supported?: boolean };
      error?: string;
    }>(fetch(`/api/analysis/${jobId}`)),
  prepareCoach: (request: CoachPrepareRequest) =>
    json<CoachPreparedPayload>(fetch("/api/coach/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })),
  coachStatus: () => json<QwenStatus>(fetch("/api/coach/status")),
  runCoach: (request: CoachPrepareRequest) =>
    json<{ job_id: string; status: string }>(fetch("/api/coach/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })),
  coachJob: (jobId: string) => json<CoachJob>(fetch(`/api/coach/jobs/${encodeURIComponent(jobId)}`)),
  playerStats: (username: string) => json<PlayerStats>(fetch(`/api/stats/${encodeURIComponent(username)}`)),
  runLeakMapAnalysis: (username: string) =>
    json<{ job_id: string; status: string }>(fetch("/api/leak-map/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, game_limit: 10, max_positions_per_game: 6 }),
    })),
  leakMapJob: (jobId: string) => json<LeakMapJob>(fetch(`/api/leak-map/jobs/${encodeURIComponent(jobId)}`)),
  explorationMove: (request: {
    board_a_fen: string;
    board_b_fen?: string;
    board: BoardId;
    from_square?: string;
    to_square: string;
    drop_piece?: "P" | "N" | "B" | "R" | "Q";
    dry_run?: boolean;
  }) => json<ExplorationMoveResult>(fetch("/api/exploration/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })),
  explorationSanMove: (request: { board_a_fen: string; board_b_fen: string; board: BoardId; san: string }) =>
    json<ExplorationMoveResult>(fetch("/api/exploration/san", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })),
  puzzle: (puzzleId: string) => json<PuzzlePayload>(fetch(`/api/puzzles/${encodeURIComponent(puzzleId)}`)),
  puzzleMove: (puzzleId: string, moves: PuzzleMove[]) =>
    json<PuzzleResponse>(fetch(`/puzzle-move/${encodeURIComponent(puzzleId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves }),
    })),
  puzzleNextMove: (puzzleId: string, moves: PuzzleMove[]) =>
    json<PuzzleResponse>(fetch(`/puzzle-next-move/${encodeURIComponent(puzzleId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves }),
    })),
  puzzleSolution: (puzzleId: string, moves: PuzzleMove[]) =>
    json<PuzzleResponse>(fetch(`/puzzle-solution/${encodeURIComponent(puzzleId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves }),
    })),
};
