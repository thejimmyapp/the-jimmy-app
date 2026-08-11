import { describe, expect, it } from "vitest";
import { AnalysisClient, AnalysisProtocolError, type AnalysisPosition } from "./analysisClient";

const position = (global_ply: number): AnalysisPosition => ({ game_id: 42, global_ply, board: "A" });

const jsonResponse = (status: number, body: object, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const completedJob = (global_ply = 14) => ({
  status: "completed",
  engine: "Fairy-Stockfish",
  board: "A",
  global_ply,
  depth: 12,
  result: {
    fen: "8/8/8/8/8/8/8/8[] w - - 0 1",
    bestmove: "P@f7",
    score_cp: 125,
    mate_in: null,
    pv: ["P@f7", "Kxf7"],
    depth: 12,
    variant_supported: true,
    engine_name: "Fairy-Stockfish",
  },
});

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

describe("AnalysisClient stale-result guard", () => {
  it("discards a ply 14 result that arrives after the caller moves to ply 17", async () => {
    let current = position(14);
    let resolvePoll: ((response: Response) => void) | undefined;
    const pollResponse = new Promise<Response>((resolve) => { resolvePoll = resolve; });
    const fetcher = async (input: RequestInfo | URL) => {
      if (String(input) === "/api/analysis") {
        return jsonResponse(202, { job_id: "job-14", status: "queued", engine: "Fairy-Stockfish" });
      }
      return pollResponse;
    };
    const client = new AnalysisClient({ fetcher, getCurrentPosition: () => current, pollIntervalMs: 0 });

    const pending = client.analyze({ ...position(14), depth: 12 });
    await Promise.resolve();
    current = position(17);
    resolvePoll?.(jsonResponse(200, completedJob()));

    await expect(pending).resolves.toBeUndefined();
  });

  it("keeps only the current position when two poll responses arrive in reverse order", async () => {
    let current = position(14);
    const poll14 = deferred<Response>();
    const poll17 = deferred<Response>();
    const poll14Started = deferred<void>();
    const poll17Started = deferred<void>();
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/analysis") {
        const request = JSON.parse(String(init?.body)) as { global_ply: number };
        return jsonResponse(202, { job_id: `job-${request.global_ply}`, status: "queued", engine: "Fairy-Stockfish" });
      }
      if (url.endsWith("job-14")) {
        poll14Started.resolve();
        return poll14.promise;
      }
      poll17Started.resolve();
      return poll17.promise;
    };
    const client = new AnalysisClient({ fetcher, getCurrentPosition: () => current, pollIntervalMs: 0 });

    const staleRequest = client.analyze({ ...position(14), depth: 12 });
    await poll14Started.promise;
    current = position(17);
    const currentRequest = client.analyze({ ...position(17), depth: 12 });
    await poll17Started.promise;

    poll17.resolve(jsonResponse(200, completedJob(17)));
    await expect(currentRequest).resolves.toMatchObject({ kind: "completed", position: position(17) });
    poll14.resolve(jsonResponse(200, completedJob(14)));
    await expect(staleRequest).resolves.toBeUndefined();
    expect(client.getState()).toMatchObject({ kind: "completed", position: position(17) });
  });

  it("surfaces Retry-After when the engine queue rejects for capacity", async () => {
    const fetcher = async () => jsonResponse(
      429,
      { detail: "The local compute queue is full" },
      { "Retry-After": "37" },
    );
    const client = new AnalysisClient({ fetcher, getCurrentPosition: () => position(14) });

    await expect(client.analyze({ ...position(14), depth: 12 })).resolves.toEqual({
      kind: "capacity",
      position: position(14),
      retry_after: "37",
      reason: "The local compute queue is full",
    });
  });

  it("rejects a malformed completed response rather than partially parsing it", async () => {
    let call = 0;
    const malformed = completedJob();
    const partialResult: Record<string, unknown> = { ...malformed.result };
    delete partialResult.variant_supported;
    const fetcher = async () => {
      call += 1;
      return call === 1
        ? jsonResponse(202, { job_id: "job-14", status: "queued", engine: "Fairy-Stockfish" })
        : jsonResponse(200, { ...malformed, result: partialResult });
    };
    const client = new AnalysisClient({ fetcher, getCurrentPosition: () => position(14), pollIntervalMs: 0 });

    await expect(client.analyze({ ...position(14), depth: 12 })).rejects.toBeInstanceOf(AnalysisProtocolError);
    expect(client.getState().kind).toBe("idle");
  });

  it("carries queue position and maps a 409 to a failed state without a score", async () => {
    let call = 0;
    const queuedStates: number[] = [];
    const fetcher = async () => {
      call += 1;
      if (call === 1) return jsonResponse(202, { job_id: "job-14", status: "queued", engine: "Fairy-Stockfish" });
      if (call === 2) return jsonResponse(200, { status: "queued", engine: "Fairy-Stockfish", board: "A", global_ply: 14, depth: 12, queue_position: 3 });
      return jsonResponse(200, completedJob());
    };
    const client = new AnalysisClient({ fetcher, getCurrentPosition: () => position(14), pollIntervalMs: 0 });
    await client.analyze(
      { ...position(14), depth: 12 },
      (state) => { if (state.kind === "queued" && state.queue_position !== null) queuedStates.push(state.queue_position); },
    );
    expect(queuedStates).toEqual([3]);

    const rejected = new AnalysisClient({
      fetcher: async () => jsonResponse(409, { detail: "Only completed games can be analyzed" }),
      getCurrentPosition: () => position(14),
    });
    await expect(rejected.analyze({ ...position(14), depth: 12 })).resolves.toEqual({
      kind: "failed",
      position: position(14),
      job_id: null,
      reason: "Only completed games can be analyzed",
    });
  });
});
