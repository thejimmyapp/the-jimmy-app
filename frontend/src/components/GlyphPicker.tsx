import type { KeyboardEvent } from "react";
import type { MomentGlyph } from "../guestProgress";

interface GlyphOption {
  key: string;
  glyph: MomentGlyph;
  name: string;
  nag: number;
}

const glyphOptions: GlyphOption[] = [
  { key: "1", glyph: "!", name: "good", nag: 1 },
  { key: "2", glyph: "?", name: "mistake", nag: 2 },
  { key: "3", glyph: "!!", name: "brilliant", nag: 3 },
  { key: "4", glyph: "??", name: "blunder", nag: 4 },
  { key: "5", glyph: "!?", name: "interesting", nag: 5 },
  { key: "6", glyph: "?!", name: "dubious", nag: 6 },
];

export interface GlyphPickerProps {
  value: MomentGlyph | null;
  onChange: (glyph: MomentGlyph) => void;
  disabled?: boolean;
  label?: string;
}

export function GlyphPicker({ value, onChange, disabled = false, label = "Move glyph" }: GlyphPickerProps) {
  const selected = glyphOptions.find((option) => option.glyph === value) ?? null;

  const selectFromNumberKey = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const option = glyphOptions.find((candidate) => candidate.key === event.key);
    if (!option) return;
    event.preventDefault();
    onChange(option.glyph);
  };

  return (
    <fieldset
      className="glyph-picker"
      aria-label={label}
      aria-disabled={disabled}
      aria-keyshortcuts="1 2 3 4 5 6"
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={selectFromNumberKey}
    >
      <legend>{label}</legend>
      <p className="glyph-picker__instruction">Press a number key</p>
      <ol className="glyph-picker__key-map" aria-label="Number key glyph map">
        {glyphOptions.map((option) => (
          <li className={value === option.glyph ? "is-selected" : ""} key={option.key}>
            <kbd>{option.key}</kbd>
            <strong>{option.glyph}</strong>
            <span>{option.name}</span>
            <code>NAG ${option.nag}</code>
          </li>
        ))}
      </ol>
      <label className="glyph-picker__fallback">
        Pointer fallback
        <select
          aria-label={`${label} pointer fallback`}
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => {
            if (event.currentTarget.value) onChange(event.currentTarget.value as MomentGlyph);
          }}
        >
          <option value="">Choose a glyph</option>
          {glyphOptions.map((option) => (
            <option value={option.glyph} key={option.key}>{option.key} · {option.glyph} · {option.name} · NAG ${option.nag}</option>
          ))}
        </select>
      </label>
      <p className="glyph-picker__status" role="status" aria-live="polite">
        {selected ? `Selected ${selected.key}: ${selected.glyph} — ${selected.name}, NAG $${selected.nag}` : "No glyph selected"}
      </p>
    </fieldset>
  );
}
