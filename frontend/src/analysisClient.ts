export type AnalysisBoard = "A" | "B";

export interface AnalysisPosition {
  game_id: number;
  global_ply: number;
  board: AnalysisBoard;
}

export interface AnalysisRequest extends AnalysisPosition {
  depth: number;
}

export interface EngineAnalysisResult {
  fen: string;
  bestmove: string | null;
  score_cp: number | null;
  mate_in: number | null;
  pv: string[];
  depth: number | null;
  variant_supported: boolean;
  engine_name: string | null;
}

export type AnalysisState =
  | { kind: "idle" }
  | { kind: "queued"; position: AnalysisPosition; job_id: string; engine: string; queue_position: number | null }
  | { kind: "running"; position: AnalysisPosition; job_id: string; engine: string }
  | { kind: "completed"; position: AnalysisPosition; job_id: string; engine: string; result: EngineAnalysisResult; cached: boolean }
  | { kind: "failed"; position: AnalysisPosition; job_id: string | null; reason: string }
  | { kind: "capacity"; position: AnalysisPosition; retry_after: string | null; reason: string };

export type AnalysisTerminalState = Extract<AnalysisState, { kind: "completed" | "failed" | "capacity" }>;

export class AnalysisProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisProtocolError";
  }
}

export class AnalysisRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisRequestError";
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface AnalysisClientOptions {
  fetcher?: FetchLike;
  getCurrentPosition: () => AnalysisPosition | null;
  pollIntervalMs?: number;
}

interface SubmissionResponse {
  job_id: string;
  status: "queued";
  engine: string;
}

type JobResponse =
  | { status: "queued"; engine: string; board: AnalysisBoard; global_ply: number; depth: number; queue_position: number }
  | { status: "running"; engine: string; board: AnalysisBoard; global_ply: number; depth: number }
  | { status: "completed"; engine: string; board: AnalysisBoard; global_ply: number; depth: number; result: EngineAnalysisResult; cached: boolean }
  | { status: "failed"; engine: string; board: AnalysisBoard; global_ply: number; depth: number; error: string };

const samePosition = (left: AnalysisPosition | null, right: AnalysisPosition) => Boolean(
  left
  && left.game_id === right.game_id
  && left.global_ply === right.global_ply
  && left.board === right.board,
);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const exactRecord = (value: unknown, required: string[], optional: string[], label: string) => {
  if (!isRecord(value)) throw new AnalysisProtocolError(`${label} must be an object`);
  const keys = Object.keys(value);
  const missing = required.filter((key) => !(key in value));
  const unexpected = keys.filter((key) => !required.includes(key) && !optional.includes(key));
  if (missing.length) throw new AnalysisProtocolError(`${label} is missing ${missing.join(", ")}`);
  if (unexpected.length) throw new AnalysisProtocolError(`${label} has unexpected ${unexpected.join(", ")}`);
  return value;
};

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value) throw new AnalysisProtocolError(`${label} must be a non-empty string`);
  return value;
};

const nullableString = (value: unknown, label: string) => value === null ? null : requiredString(value, label);

const requiredInteger = (value: unknown, label: string, minimum?: number, maximum?: number) => {
  if (!Number.isInteger(value)) throw new AnalysisProtocolError(`${label} must be an integer`);
  const integer = value as number;
  if (minimum !== undefined && integer < minimum) throw new AnalysisProtocolError(`${label} must be at least ${minimum}`);
  if (maximum !== undefined && integer > maximum) throw new AnalysisProtocolError(`${label} must be at most ${maximum}`);
  return integer;
};

const nullableInteger = (value: unknown, label: string) => value === null ? null : requiredInteger(value, label);

const requiredBoard = (value: unknown) => {
  if (value !== "A" && value !== "B") throw new AnalysisProtocolError("analysis job board must be A or B");
  return value;
};

const parseJson = async (response: Response, label: string) => {
  try {
    return await response.json() as unknown;
  } catch {
    throw new AnalysisProtocolError(`${label} is not valid JSON`);
  }
};

const parseSubmission = (value: unknown): SubmissionResponse => {
  const record = exactRecord(value, ["job_id", "status", "engine"], [], "analysis submission");
  if (record.status !== "queued") throw new AnalysisProtocolError("analysis submission status must be queued");
  return {
    job_id: requiredString(record.job_id, "analysis submission job_id"),
    status: "queued",
    engine: requiredString(record.engine, "analysis submission engine"),
  };
};

const parseResult = (value: unknown): EngineAnalysisResult => {
  const record = exactRecord(
    value,
    ["fen", "bestmove", "score_cp", "mate_in", "pv", "depth", "variant_supported", "engine_name"],
    [],
    "analysis result",
  );
  if (!Array.isArray(record.pv) || record.pv.some((move) => typeof move !== "string")) {
    throw new AnalysisProtocolError("analysis result pv must be an array of strings");
  }
  if (typeof record.variant_supported !== "boolean") {
    throw new AnalysisProtocolError("analysis result variant_supported must be a boolean");
  }
  return {
    fen: requiredString(record.fen, "analysis result fen"),
    bestmove: nullableString(record.bestmove, "analysis result bestmove"),
    score_cp: nullableInteger(record.score_cp, "analysis result score_cp"),
    mate_in: nullableInteger(record.mate_in, "analysis result mate_in"),
    pv: [...record.pv] as string[],
    depth: nullableInteger(record.depth, "analysis result depth"),
    variant_supported: record.variant_supported,
    engine_name: nullableString(record.engine_name, "analysis result engine_name"),
  };
};

const parseJob = (value: unknown): JobResponse => {
  if (!isRecord(value)) throw new AnalysisProtocolError("analysis job must be an object");
  const status = value.status;
  const commonRequired = ["status", "engine", "board", "global_ply", "depth"];
  const common = (record: Record<string, unknown>): { engine: string; board: AnalysisBoard; global_ply: number; depth: number } => ({
    engine: requiredString(record.engine, "analysis job engine"),
    board: requiredBoard(record.board),
    global_ply: requiredInteger(record.global_ply, "analysis job global_ply", 0),
    depth: requiredInteger(record.depth, "analysis job depth", 4, 24),
  });
  if (status === "queued") {
    const record = exactRecord(value, [...commonRequired, "queue_position"], [], "queued analysis job");
    return { status, ...common(record), queue_position: requiredInteger(record.queue_position, "analysis job queue_position", 1) };
  }
  if (status === "running") {
    const record = exactRecord(value, commonRequired, [], "running analysis job");
    return { status, ...common(record) };
  }
  if (status === "completed") {
    const record = exactRecord(value, [...commonRequired, "result"], ["cached"], "completed analysis job");
    if ("cached" in record && typeof record.cached !== "boolean") throw new AnalysisProtocolError("analysis job cached must be a boolean");
    return { status, ...common(record), result: parseResult(record.result), cached: record.cached === true };
  }
  if (status === "failed") {
    const record = exactRecord(value, [...commonRequired, "error"], [], "failed analysis job");
    return { status, ...common(record), error: requiredString(record.error, "analysis job error") };
  }
  throw new AnalysisProtocolError("analysis job status is unsupported");
};

const parseErrorReason = async (response: Response) => {
  const record = exactRecord(await parseJson(response, "analysis error"), ["detail"], [], "analysis error");
  return requiredString(record.detail, "analysis error detail");
};

const validateRequest = (request: AnalysisRequest) => {
  if (!Number.isInteger(request.game_id) || request.game_id <= 0) throw new AnalysisRequestError("game_id must be a positive integer");
  if (!Number.isInteger(request.global_ply) || request.global_ply < 0) throw new AnalysisRequestError("global_ply must be a non-negative integer");
  if (request.board !== "A" && request.board !== "B") throw new AnalysisRequestError("board must be A or B");
  if (!Number.isInteger(request.depth) || request.depth < 4 || request.depth > 24) throw new AnalysisRequestError("depth must be an integer from 4 through 24");
};

const delay = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) {
    reject(new DOMException("Aborted", "AbortError"));
    return;
  }
  const timeout = globalThis.setTimeout(resolve, milliseconds);
  signal.addEventListener("abort", () => {
    globalThis.clearTimeout(timeout);
    reject(new DOMException("Aborted", "AbortError"));
  }, { once: true });
});

export class AnalysisClient {
  private readonly fetcher: FetchLike;
  private readonly getCurrentPosition: () => AnalysisPosition | null;
  private readonly pollIntervalMs: number;
  private generation = 0;
  private controller: AbortController | null = null;
  private currentState: AnalysisState = { kind: "idle" };

  constructor({ fetcher = fetch, getCurrentPosition, pollIntervalMs = 250 }: AnalysisClientOptions) {
    this.fetcher = fetcher;
    this.getCurrentPosition = getCurrentPosition;
    this.pollIntervalMs = Math.max(0, pollIntervalMs);
  }

  getState(): AnalysisState {
    return this.currentState;
  }

  abandon(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.currentState = { kind: "idle" };
  }

  async analyze(request: AnalysisRequest, onState?: (state: AnalysisState) => void): Promise<AnalysisTerminalState | undefined> {
    validateRequest(request);
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const token = ++this.generation;
    const issuedFor: AnalysisPosition = { game_id: request.game_id, global_ply: request.global_ply, board: request.board };
    let jobId: string | null = null;
    this.currentState = { kind: "idle" };

    try {
      const response = await this.fetcher("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id: request.game_id,
          global_ply: request.global_ply,
          board: request.board,
          depth: request.depth,
        }),
        signal: controller.signal,
      });
      if (!this.isCurrent(token, issuedFor)) return this.discard(token);

      if (response.status === 429) {
        const state: AnalysisTerminalState = {
          kind: "capacity",
          position: issuedFor,
          retry_after: response.headers.get("Retry-After"),
          reason: await parseErrorReason(response),
        };
        return this.finish(token, issuedFor, state, onState);
      }
      if (response.status === 409) {
        const state: AnalysisTerminalState = { kind: "failed", position: issuedFor, job_id: null, reason: await parseErrorReason(response) };
        return this.finish(token, issuedFor, state, onState);
      }
      if (response.status !== 202) {
        const state: AnalysisTerminalState = { kind: "failed", position: issuedFor, job_id: null, reason: `Analysis submission failed (${response.status})` };
        return this.finish(token, issuedFor, state, onState);
      }

      const submission = parseSubmission(await parseJson(response, "analysis submission"));
      jobId = submission.job_id;
      if (!this.emit(token, issuedFor, { kind: "queued", position: issuedFor, job_id: jobId, engine: submission.engine, queue_position: null }, onState)) {
        return this.discard(token);
      }

      while (true) {
        const jobResponse = await this.fetcher(`/api/analysis/${encodeURIComponent(jobId)}`, { signal: controller.signal });
        if (!this.isCurrent(token, issuedFor)) return this.discard(token);
        if (!jobResponse.ok) {
          const state: AnalysisTerminalState = { kind: "failed", position: issuedFor, job_id: jobId, reason: `Analysis polling failed (${jobResponse.status})` };
          return this.finish(token, issuedFor, state, onState);
        }
        const job = parseJob(await parseJson(jobResponse, "analysis job"));
        if (job.board !== request.board || job.global_ply !== request.global_ply || job.depth !== request.depth) {
          throw new AnalysisProtocolError("analysis job identity does not match its request");
        }
        if (job.status === "completed") {
          return this.finish(token, issuedFor, { kind: "completed", position: issuedFor, job_id: jobId, engine: job.engine, result: job.result, cached: job.cached }, onState);
        }
        if (job.status === "failed") {
          return this.finish(token, issuedFor, { kind: "failed", position: issuedFor, job_id: jobId, reason: job.error }, onState);
        }
        const pendingState: AnalysisState = job.status === "queued"
          ? { kind: "queued", position: issuedFor, job_id: jobId, engine: job.engine, queue_position: job.queue_position }
          : { kind: "running", position: issuedFor, job_id: jobId, engine: job.engine };
        if (!this.emit(token, issuedFor, pendingState, onState)) return this.discard(token);
        await delay(this.pollIntervalMs, controller.signal);
      }
    } catch (error) {
      if (error instanceof AnalysisProtocolError || error instanceof AnalysisRequestError) {
        if (!this.isCurrent(token, issuedFor)) return this.discard(token);
        controller.abort();
        this.controller = null;
        this.currentState = { kind: "idle" };
        throw error;
      }
      if (controller.signal.aborted || !this.isCurrent(token, issuedFor)) return this.discard(token);
      const reason = error instanceof Error ? error.message : "Analysis request failed";
      return this.finish(token, issuedFor, { kind: "failed", position: issuedFor, job_id: jobId, reason }, onState);
    }
  }

  private isCurrent(token: number, issuedFor: AnalysisPosition) {
    return token === this.generation && samePosition(this.getCurrentPosition(), issuedFor);
  }

  private discard(token: number): undefined {
    if (token === this.generation) {
      this.controller?.abort();
      this.controller = null;
      this.currentState = { kind: "idle" };
    }
    return undefined;
  }

  private emit(token: number, issuedFor: AnalysisPosition, state: AnalysisState, onState?: (state: AnalysisState) => void) {
    if (!this.isCurrent(token, issuedFor)) return false;
    this.currentState = state;
    onState?.(state);
    return true;
  }

  private finish(token: number, issuedFor: AnalysisPosition, state: AnalysisTerminalState, onState?: (state: AnalysisState) => void) {
    if (!this.emit(token, issuedFor, state, onState)) return undefined;
    if (token === this.generation) this.controller = null;
    return state;
  }
}
