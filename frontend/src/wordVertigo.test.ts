import { describe, expect, it } from "vitest";
import { formatWordVertigoCountdown, wordVertigoBlurb } from "./wordVertigo";

describe("word vertigo content selection", () => {
  it("selects by letter case-insensitively and fails over for non-letters", () => {
    expect(wordVertigoBlurb("B")).toContain("The word is borborygmus.");
    expect(wordVertigoBlurb("!")).toContain("The word is anhemabiaophoia.");
  });

  it("formats the ephemeral microwave countdown", () => {
    expect(formatWordVertigoCountdown(90)).toBe("01:30");
    expect(formatWordVertigoCountdown(5)).toBe("00:05");
    expect(formatWordVertigoCountdown(0)).toBe("00:00");
  });
});
