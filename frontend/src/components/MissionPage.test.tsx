import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MissionPage } from "./MissionPage";

describe("MissionPage", () => {
  it("ships four placeholder sections and no product argument", () => {
    const { container } = render(<MissionPage />);
    expect(screen.getAllByRole("heading", { level: 2, name: "[COPY-PLACEHOLDER]" })).toHaveLength(4);
    const bodyWords = Array.from(container.querySelectorAll(".mission-document p"))
      .flatMap((paragraph) => paragraph.textContent?.trim().split(/\s+/) ?? []);
    expect(bodyWords.length).toBeGreaterThanOrEqual(350);
    expect(bodyWords.length).toBeLessThanOrEqual(450);
    expect(container.querySelectorAll(".mission-document p")).toHaveLength(4);
  });
});
