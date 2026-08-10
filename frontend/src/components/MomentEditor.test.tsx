import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentEditor } from "./MomentEditor";

const capture = { matchIds: { A: 101, B: 102 }, ply: 24, boardId: "B" as const, move: "N@h6", seat: "A-black" as const };

describe("moment editor", () => {
  afterEach(cleanup);

  it("selects glyphs by arrow key and commits a note", () => {
    const onSave = vi.fn();
    const escapedKey = vi.fn();
    window.addEventListener("keydown", escapedKey);
    render(<MomentEditor capture={capture} onSave={onSave} onCancel={vi.fn()} />);
    const first = screen.getByRole("radio", { name: "!!" });
    expect(document.activeElement).toBe(first);
    const placeholder = screen.getByText("PLACEHOLDER · future richer annotations · see /blocks").closest("figure");
    expect(placeholder?.getAttribute("aria-disabled")).toBe("true");
    expect(within(placeholder as HTMLElement).getByText("RICHER ANNOTATIONS COMING")).toBeTruthy();
    expect(placeholder?.querySelectorAll("button, input, textarea, a, [tabindex]")).toHaveLength(0);

    fireEvent.keyDown(first, { key: "ArrowRight" });
    const selected = screen.getByRole("radio", { name: "!" });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(selected);
    expect(escapedKey).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("what it does / why it stood out"), { target: { value: "Stops the incoming drop." } });
    fireEvent.click(screen.getByRole("button", { name: "Save moment" }));
    expect(onSave).toHaveBeenCalledWith("!", "Stops the incoming drop.");
    window.removeEventListener("keydown", escapedKey);
  });

  it("cancels with Escape", () => {
    const onCancel = vi.fn();
    render(<MomentEditor capture={capture} onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
