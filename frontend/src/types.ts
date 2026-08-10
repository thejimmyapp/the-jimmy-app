export type BoardId = "A" | "B";

export type MatchSeat = "A-white" | "A-black" | "B-white" | "B-black";

export interface NormalizedMatch {
  game_ids: Record<BoardId, number>;
  end_time: number;
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

export interface GuestMatchupList {
  matches: NormalizedMatch[];
  examined: number;
  excluded: number;
  exclusion_counts: Record<string, number>;
  players_sampled: string[];
  players_represented: string[];
  seed_source: "players_of_interest" | "leaderboard_top_50" | "players_of_interest_then_leaderboard_top_50";
  selection_window_hours: 1 | 3 | 12 | 48;
  cached: boolean;
}

export interface CallbackReplayBoard {
  id: number;
  uuid: string;
  partnerGameId: string;
  moveList: string;
  moveTimestamps: string;
  plyCount: number;
  baseTime1: number;
  timeIncrement1: number;
  initialFen: string;
  headers: Partial<Record<"White" | "Black" | "WhiteElo" | "BlackElo" | "Date" | "EndTime" | "Result" | "TimeControl", string | number>>;
}

export interface GuestMatchReplaySource {
  match: NormalizedMatch;
  boards: Record<BoardId, CallbackReplayBoard>;
}

export interface ReplayPosition {
  ply: number;
  label: string;
  board: string[][];
  side_to_move: string;
  variant_fen: string;
  fen?: string;
  white_pocket: string;
  black_pocket: string;
  white_clock: string;
  black_clock: string;
  elapsed_seconds?: number | null;
  partner_index: number | null;
  confidence?: "high" | "medium" | "low" | "study";
  warning?: string;
  from_square: string | null;
  to_square: string | null;
}

export interface MoveRecord {
  ply: number;
  display_move: string;
  color: string;
  elapsed_seconds: number | null;
}

export interface GameSummary {
  id: number;
  played_at: string;
  result: string;
  opponent: string | null;
  opponent_rating: number | null;
  partner: string | null;
  user_color: string | null;
  time_control: string | null;
}

export interface GamePayload {
  game: GameSummary & Record<string, unknown>;
  players: { board_a_white: string; board_a_black: string; board_b_white: string; board_b_black: string };
  moves_a: MoveRecord[];
  moves_b: MoveRecord[];
  positions_a: ReplayPosition[];
  positions_b: ReplayPosition[];
  timeline: Array<{ global_ply: number; board: BoardId; local_ply: number; move: string; board_a: ReplayPosition; board_b: ReplayPosition }>;
  second_board_available: boolean;
  limitations: string[];
  cross_board_ordering?: {
    method: "exact" | "clock-inferred";
    exact: boolean;
  };
  outcome: {
    summary: string;
    detail: string;
    loser_username: string | null;
    termination: string | null;
    board: BoardId | null;
    board_role: "high" | "low" | null;
    move_number: number | null;
  };
  lesson?: ReviewLesson | null;
}

export interface ReviewLesson {
  id: string;
  board: "A";
  local_ply: number;
  global_ply: number;
  played_move: string;
  best_move: string;
  severity: "inaccuracy" | "mistake" | "blunder";
  estimated_loss_cp: number;
  category: string;
  pattern: string;
  confidence: "high" | "medium";
  depth: number | null;
  partner_context: string | null;
}

export interface Annotation {
  id: string;
  board: BoardId;
  ply: number;
  author: string;
  color: "cyan" | "violet";
  type: "arrow" | "highlight";
  from: string;
  to?: string;
}

export interface ChatItem {
  id: string;
  author: string;
  content: string;
  board?: BoardId;
  ply?: number;
  timestamp: string;
}

export interface RoomParticipant {
  client_id: string;
  display_name: string;
}

export interface RoomEventPayload {
  version?: 1;
  event_id?: string;
  room_id?: string;
  sender_id?: string;
  timestamp?: string;
  type: string;
  payload?: Record<string, unknown>;
}

export interface RoomSnapshot {
  room?: { game_id?: number | null };
  presence?: RoomParticipant[];
  annotations?: Annotation[];
  messages?: ChatItem[];
  "game.select"?: RoomEventPayload;
  "timeline.seek"?: RoomEventPayload;
  "variation.create"?: RoomEventPayload;
  "variation.update"?: RoomEventPayload;
  "variation.return_to_game"?: RoomEventPayload;
  "quest.status"?: RoomEventPayload;
}

export interface RoomPayload {
  id: string;
  game_id: number | null;
  snapshot: RoomSnapshot;
}

export interface ExplorationPair {
  boardA: ReplayPosition;
  boardB: ReplayPosition | null;
}

export interface ExplorationMoveResult {
  legal: boolean;
  reason?: string;
  notation?: string;
  legal_destinations?: string[];
  board_a?: ReplayPosition;
  board_b?: ReplayPosition | null;
  board_a_fen?: string;
  board_b_fen?: string;
  capture_transferred?: boolean;
}

export interface PuzzleMove {
  board: BoardId;
  san: string;
}

export interface PuzzleMoveRun {
  board: BoardId;
  moves: string[];
}

export interface PuzzleResponse {
  status?: "wrong_move";
  complete?: boolean;
  moves?: PuzzleMoveRun[];
}

export interface PuzzlePayload {
  id: string;
  title: string;
  prompt: string;
  boards: [string, string];
  positions: { board_a: ReplayPosition; board_b: ReplayPosition };
  perspective: { board: BoardId; color: "white" | "black" };
  category: string;
  rating: number;
  tags: string[];
  source: { player: string; game_id: string; partner_game_id: string; url: string };
  players: { board_a_white: string; board_a_black: string; board_b_white: string; board_b_black: string };
}

export interface CoachPrepareRequest {
  game_id: number;
  global_ply: number;
  question: string;
  annotations: Array<{ board: BoardId; type: "arrow" | "highlight"; from: string; to?: string; color: string }>;
}

export interface CoachPreparedPayload {
  mode: "validated_context";
  summary: string;
  prompt: string;
  context: Record<string, unknown>;
  facts: {
    source: string;
    global_ply: number;
    boards: Record<BoardId, Record<string, unknown>>;
    transfers: Array<Record<string, unknown>>;
    missing_data: string[];
    urgency: "critical" | "high" | "normal" | "unknown";
    catalog: Record<string, unknown>;
  };
  board_a: { available: boolean; best_move?: string | null; side_to_move?: string; threats: string[]; mistakes: string[] };
  board_b: { available: boolean; best_move?: string | null; side_to_move?: string; threats: string[]; mistakes: string[] };
  team_plan: string[];
  piece_requests: string[];
  urgency: "critical" | "high" | "normal" | "unknown";
  quick_questions: string[];
  privacy: string;
}

export interface QwenStatus {
  enabled: boolean;
  state: "disabled" | "not_downloaded" | "downloading" | "ready" | "running" | "failed";
  detail: string;
  model: string;
  model_file: string;
  model_downloaded: boolean;
  runtime_available: boolean;
  context_size: number;
  max_tokens: number;
  temperature: number;
  top_p: number;
  reasoning_budget: number;
  threads?: number;
  batch_threads?: number;
  timeout_seconds?: number;
  last_generation_seconds?: number | null;
  last_prompt_chars?: number;
  last_output_chars?: number;
}

export interface CoachJob {
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  error?: string;
  result?: {
    explanation: string;
    qwen_commentary: string | null;
    validation: { status: "passed" | "rejected"; reasons: string[]; cited_fact_ids: string[] };
    qwen_error: string | null;
    prepared: CoachPreparedPayload;
    model: QwenStatus;
  };
}

export interface LeakMapJob {
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  processed: number;
  total: number;
  error?: string;
  result?: {
    games_seen: number;
    games_with_moves: number;
    critical_positions: number;
    stored_mistakes: number;
    skipped_games: number;
  };
}

export interface PlayerStats {
  username: string;
  summary: {
    total_games: number;
    wins: number;
    losses: number;
    draws: number;
    winrate: number | null;
    partner_boards: number;
    mistakes: number;
    blunders: number;
    avg_loss: number | null;
    most_common_losing_pattern: string | null;
    most_common_tactical_miss: string | null;
    time_trouble_frequency: string | null;
  };
  colors: Array<{ color: string; games: number; wins: number; losses: number; winrate: number | null }>;
  monthly: Array<{ month: string; games: number; wins: number; losses: number; winrate: number | null }>;
  rating_bands: Array<{ label: string; games: number; wins: number; winrate: number | null }>;
  partners: Array<{ partner: string; games: number; wins: number; winrate: number | null }>;
  opponents: Array<{ opponent: string; games: number; wins: number; winrate: number | null; avg_rating: number | null }>;
  mistake_categories: Array<{ category: string; count: number; avg_loss: number; max_loss: number }>;
  data_quality: { two_board_games: number; total_games: number; analysis_positions: number; analyzed_games: number };
}
