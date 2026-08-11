import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyRoomSnapshot } from "./socket";
import { useCoachStore } from "./store";

vi.mock("./api", () => ({ api: { game: vi.fn() } }));

describe("shared quest status", () => {
  beforeEach(() => useCoachStore.setState({ roomQuestDeadline: null, messages: [] }));

  it("applies and clears the host deadline from room snapshots", async () => {
    await applyRoomSnapshot({ "quest.status": { type: "quest.status", payload: { deadline: 1_786_337_100_000, completed: false } } });
    expect(useCoachStore.getState().roomQuestDeadline).toBe(1_786_337_100_000);
    await applyRoomSnapshot({ "quest.status": { type: "quest.status", payload: { deadline: null, completed: true } } });
    expect(useCoachStore.getState().roomQuestDeadline).toBeNull();
  });

  it("applies snapshot messages in server receipt order", async () => {
    await applyRoomSnapshot({
      messages: [
        { id: "second", author: "B", content: "second", timestamp: "2026-08-11T00:00:00Z", sequence: 2 },
        { id: "first", author: "A", content: "first", timestamp: "2026-08-11T00:00:01Z", sequence: 1 },
      ],
    });
    expect(useCoachStore.getState().messages.map((message) => message.content)).toEqual(["first", "second"]);
  });
});
