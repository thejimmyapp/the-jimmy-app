import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalPage } from "./LegalPage";

describe("public legal pages", () => {
  it("renders the privacy disclosures and public legal navigation", () => {
    render(<LegalPage page="privacy" />);
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeTruthy();
    expect(screen.getByText(/does not request or accept Chess.com passwords/i)).toBeTruthy();
    expect(screen.getByText(/does not currently apply a guaranteed automatic deletion period/i)).toBeTruthy();
    expect(screen.getByText(/versioned onboarding progress/i)).toBeTruthy();
    expect(screen.getByText(/Clear guest progress/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  });

  it("renders completed-game and no-live-assistance terms", () => {
    render(<LegalPage page="terms" />);
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeTruthy();
    expect(screen.getByText(/Public Chess.com imports are limited to completed archive records/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No live assistance or cheating" })).toBeTruthy();
    expect(screen.getByText(/not affiliated with, sponsored by, or endorsed by Chess.com/i)).toBeTruthy();
  });

  it("renders third-party attributions and the notices navigation link", () => {
    const { container } = render(<LegalPage page="notices" />);
    const notices = within(container);
    expect(notices.getByRole("heading", { name: "Third-Party Notices" })).toBeTruthy();
    expect(notices.getByRole("link", { name: "Fairy-Stockfish" }).closest("p")?.textContent).toContain("GPL-3.0-or-later");
    expect(notices.getByRole("link", { name: "lila" }).closest("p")?.textContent).toContain("AGPL-3.0");
    expect(notices.getByRole("heading", { name: "Chess.com acknowledgment" }).nextElementSibling?.textContent).toContain("Chess.com trademarks, game records, and assets belong to Chess.com");
    expect(notices.getByRole("link", { name: "Notices" }).getAttribute("href")).toBe("/third-party-notices");
  });
});
