import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnnotationWizardShell } from "./AnnotationWizardShell";

const moves = [
  { token: "16B", move: "N@h6" },
  { token: "17A", move: "Nxf7" },
  { token: "17B", move: "Q@h4" },
];

afterEach(cleanup);

describe("AnnotationWizardShell", () => {
  it("keeps step 2 inert and all future steps locked until a move is chosen", () => {
    const { container } = render(<AnnotationWizardShell move_options={moves} />);
    const glyphStep = container.querySelector(".wizard-step--glyph") as HTMLElement;
    const futureSteps = container.querySelectorAll(".wizard-step--future");

    expect(glyphStep.hasAttribute("inert")).toBe(true);
    expect(glyphStep.getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByRole("combobox", { hidden: true }) as HTMLSelectElement).disabled).toBe(true);
    expect(futureSteps).toHaveLength(2);
    expect(Array.from(futureSteps).every((step) => step.hasAttribute("inert"))).toBe(true);
    expect(screen.queryByRole("button", { name: /submit|save|next/i })).toBeNull();
  });

  it("unlocks the required glyph step after move selection", () => {
    const { container } = render(<AnnotationWizardShell move_options={moves} />);
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));

    const glyphStep = container.querySelector(".wizard-step--glyph") as HTMLElement;
    expect(screen.getByRole("heading", { name: "At move 17A" })).toBeTruthy();
    expect(glyphStep.hasAttribute("inert")).toBe(false);
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "6" });
    expect(screen.getByRole("heading", { name: "This move is ?!" })).toBeTruthy();
  });

  it("clears the glyph when the user goes back to change the move", () => {
    const { container } = render(<AnnotationWizardShell move_options={moves} />);
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "3" });
    expect(screen.getByRole("heading", { name: "This move is !!" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Change move" }));
    const glyphStep = container.querySelector(".wizard-step--glyph") as HTMLElement;
    expect(glyphStep.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("heading", { name: "This move is ___", hidden: true })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "16B N@h6" }));
    expect(screen.getByRole("heading", { name: "At move 16B" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("No glyph selected");
  });
});
