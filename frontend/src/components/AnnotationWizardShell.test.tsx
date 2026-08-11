import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnotationWizardShell } from "./AnnotationWizardShell";

const moves = [
  { token: "16B", move: "N@h6" },
  { token: "17A", move: "Nxf7" },
  { token: "17B", move: "Q@h4" },
];
const alternativeMoves = ["Q@h5", "N@g5", "Bxf7+"];

const renderWizard = () => render(
  <AnnotationWizardShell move_options={moves} alternative_move_options={alternativeMoves} />,
);

afterEach(cleanup);

describe("AnnotationWizardShell", () => {
  it("keeps every step inert until its predecessor is complete", () => {
    const { container } = renderWizard();
    const glyphStep = container.querySelector(".wizard-step--glyph") as HTMLElement;
    const alternativeStep = container.querySelector(".wizard-step--alternative") as HTMLElement;
    const answerStep = container.querySelector(".wizard-step--answer") as HTMLElement;

    expect(glyphStep.hasAttribute("inert")).toBe(true);
    expect(glyphStep.getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByRole("combobox", { hidden: true }) as HTMLSelectElement).disabled).toBe(true);
    expect(alternativeStep.hasAttribute("inert")).toBe(true);
    expect(answerStep.hasAttribute("inert")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    expect(glyphStep.hasAttribute("inert")).toBe(false);
    expect(alternativeStep.hasAttribute("inert")).toBe(true);
    expect(answerStep.hasAttribute("inert")).toBe(true);

    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "1" });
    expect(alternativeStep.hasAttribute("inert")).toBe(false);
    expect(answerStep.hasAttribute("inert")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Q@h5" }));
    expect(answerStep.hasAttribute("inert")).toBe(false);
    expect(screen.queryByRole("button", { name: /submit|save|next/i })).toBeNull();
  });

  it("unlocks the required glyph step after move selection", () => {
    const { container } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));

    const glyphStep = container.querySelector(".wizard-step--glyph") as HTMLElement;
    expect(screen.getByRole("heading", { name: "At move 17A" })).toBeTruthy();
    expect(glyphStep.hasAttribute("inert")).toBe(false);
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "6" });
    expect(screen.getByRole("heading", { name: "This move is ?!" })).toBeTruthy();
  });

  it("clears the glyph when the user goes back to change the move", () => {
    const { container } = renderWizard();
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

  it("ships the owner copy verbatim and accepts exactly one board-played alternative", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "2" });

    expect(screen.getByText("Interesting move for sure! Next you're required to give one relevant alternative move. Relax don't overthink it you're halfway done.").textContent).toBe(
      "Interesting move for sure! Next you're required to give one relevant alternative move. Relax don't overthink it you're halfway done.",
    );
    expect(screen.queryByRole("textbox", { name: /alternative/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Q@h5" }));
    expect(screen.getByRole("heading", { name: "Instead, play Q@h5" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "N@g5" }));
    expect(screen.getByRole("heading", { name: "Instead, play N@g5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Q@h5" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "N@g5" }).getAttribute("aria-pressed")).toBe("true");
  });

  it.each([
    ["1", "!", "Show a move you might have played instead — and why it's worse."],
    ["2", "?", "What should they have played, and what did they miss?"],
    ["3", "!!", "What makes this one hard to find?"],
    ["4", "??", "What's the punishment?"],
    ["5", "!?", "What risk did they accept?"],
    ["6", "?!", "What's the safer option?"],
  ])("maps key %s and glyph %s to the correct step-4 prompt", (key, glyph, prompt) => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key });
    fireEvent.click(screen.getByRole("button", { name: "Q@h5" }));

    expect(screen.getByText(`[COPY-PLACEHOLDER] ${prompt}`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: `This move is ${glyph}` })).toBeTruthy();
  });

  it("keeps the alternative when the glyph changes and exposes Because as an immutable opener", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    const picker = screen.getByRole("group", { name: "Required move glyph" });
    fireEvent.keyDown(picker, { key: "1" });
    fireEvent.click(screen.getByRole("button", { name: "Bxf7+" }));
    fireEvent.keyDown(picker, { key: "5" });

    expect(screen.getByRole("heading", { name: "Instead, play Bxf7+" })).toBeTruthy();
    expect(screen.getByText("[COPY-PLACEHOLDER] What risk did they accept?")).toBeTruthy();
    const answer = screen.getByRole("textbox", { name: "Written answer after Because" }) as HTMLTextAreaElement;
    expect(answer.getAttribute("minlength")).toBe("1");
    fireEvent.change(answer, { target: { value: "the drop leaves the king exposed" } });
    expect(answer.value).toBe("the drop leaves the king exposed");
    expect(answer.parentElement?.querySelector("span")?.textContent).toBe("Because");
  });

  it("clears downstream selections when the chosen move changes", () => {
    const { container } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "4" });
    fireEvent.click(screen.getByRole("button", { name: "Q@h5" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Written answer after Because" }), { target: { value: "mate follows" } });

    fireEvent.click(screen.getByRole("button", { name: "Change move" }));
    expect(screen.getByRole("heading", { name: "This move is ___", hidden: true })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Instead, play ___", hidden: true })).toBeTruthy();
    expect((container.querySelector(".wizard-step--answer") as HTMLElement).hasAttribute("inert")).toBe(true);
    expect(screen.getByText("[COPY-PLACEHOLDER] Select a glyph to see this prompt.", { selector: "p" })).toBeTruthy();
  });

  it("refuses an empty answer and submits one real word with the locked Because opener", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AnnotationWizardShell
        move_options={moves}
        render_alternative_board={(onMovePlayed) => <button type="button" onClick={() => onMovePlayed("Q@h5")}>Play Q@h5 on board</button>}
        onSave={onSave}
      />,
    );
    expect(screen.queryByRole("button", { name: "Save moment" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "1" });
    expect(screen.queryByRole("button", { name: "Save moment" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play Q@h5 on board" }));
    const saveButton = screen.getByRole("button", { name: "Save moment" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Written answer after Because" }), { target: { value: "   " } });
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Written answer after Because" }), { target: { value: "Timing" } });
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith({
      moveToken: "17A",
      glyph: "!",
      alternativeMove: "Q@h5",
      writtenAnswer: "Because Timing",
    });
  });

  it("reveals a validated engine candidate only when step 3 becomes reachable", () => {
    render(
      <AnnotationWizardShell
        move_options={moves}
        initial_alternative_move="Q@h5"
        render_alternative_board={(onMovePlayed) => <button type="button" onClick={() => onMovePlayed("N@g5")}>Play N@g5 on board</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Instead, play ___", hidden: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "17A Nxf7" }));
    expect(screen.getByRole("heading", { name: "Instead, play ___", hidden: true })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("group", { name: "Required move glyph" }), { key: "1" });
    expect(screen.getByRole("heading", { name: "Instead, play Q@h5" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play N@g5 on board" }));
    expect(screen.getByRole("heading", { name: "Instead, play N@g5" })).toBeTruthy();
  });
});
