import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MomentGlyph } from "../guestProgress";
import { GlyphPicker } from "./GlyphPicker";

afterEach(cleanup);

function ControlledPicker({ disabled = false }: { disabled?: boolean }) {
  const [glyph, setGlyph] = useState<MomentGlyph | null>(null);
  return <GlyphPicker value={glyph} onChange={setGlyph} disabled={disabled} />;
}

describe("GlyphPicker", () => {
  it.each([
    ["1", "!", "good", 1],
    ["2", "?", "mistake", 2],
    ["3", "!!", "brilliant", 3],
    ["4", "??", "blunder", 4],
    ["5", "!?", "interesting", 5],
    ["6", "?!", "dubious", 6],
  ] as const)("maps key %s to %s", (key, glyph, name, nag) => {
    render(<ControlledPicker />);
    const picker = screen.getByRole("group", { name: "Move glyph" });
    expect(picker.getAttribute("aria-keyshortcuts")).toBe("1 2 3 4 5 6");
    fireEvent.keyDown(picker, { key });
    expect(screen.getByRole("status").textContent).toBe(`Selected ${key}: ${glyph} — ${name}, NAG $${nag}`);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(glyph);
  });

  it("offers a native dropdown as the pointer fallback", () => {
    render(<ControlledPicker />);
    fireEvent.change(screen.getByRole("combobox", { name: "Move glyph pointer fallback" }), { target: { value: "??" } });
    expect(screen.getByRole("status").textContent).toBe("Selected 4: ?? — blunder, NAG $4");
  });

  it("does not select while disabled", () => {
    const onChange = vi.fn();
    render(<GlyphPicker value={null} onChange={onChange} disabled />);
    const picker = screen.getByRole("group", { name: "Move glyph" });
    fireEvent.keyDown(picker, { key: "1" });
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(picker.getAttribute("tabindex")).toBe("-1");
  });
});
