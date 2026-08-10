import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyRoomSnapshot } from "./socket";
import { useCoachStore } from "./store";

vi.mock("./api", () => ({ api: { game: vi.fn() } }));

describe("shared quest status", () => {
  beforeEach(() => useCoachStore.setState({ roomQuestDeadline: null }));

  it("applies and clears the host deadline from room snapshots", async () => {
    await applyRoomSnapshot({ "quest.status": { type: "quest.status", payload: { deadline: 1_786_337_100_000, completed: false } } });
    expect(useCoachStore.getState().roomQuestDeadline).toBe(1_786_337_100_000);
    await applyRoomSnapshot({ "quest.status": { type: "quest.status", payload: { deadline: null, completed: true } } });
    expect(useCoachStore.getState().roomQuestDeadline).toBeNull();
  });
});
