import { describe, expect, it } from "vitest";
import { legalPageFromPath } from "./routes";

describe("direct legal routes", () => {
  it("resolves privacy and terms direct URLs", () => {
    expect(legalPageFromPath("/privacy")).toBe("privacy");
    expect(legalPageFromPath("/privacy/")).toBe("privacy");
    expect(legalPageFromPath("/terms")).toBe("terms");
    expect(legalPageFromPath("/terms/")).toBe("terms");
    expect(legalPageFromPath("/")).toBeNull();
  });

  it("resolves notices and rejects an unknown legal path", () => {
    expect(legalPageFromPath("/third-party-notices")).toBe("notices");
    expect(legalPageFromPath("/third-party-notices/")).toBe("notices");
    expect(legalPageFromPath("/not-a-legal-page")).toBeNull();
  });
});
