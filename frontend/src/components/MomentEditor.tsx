import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { momentGlyphs, type MomentGlyph } from "../guestProgress";
import type { MomentCapture } from "../learningMoments";

interface Props {
  capture: MomentCapture;
  onSave: (glyph: MomentGlyph, note: string) => void;
  onCancel: () => void;
}

export function MomentEditor({ capture, onSave, onCancel }: Props) {
  const [glyph, setGlyph] = useState<MomentGlyph | null>(null);
  const [note, setNote] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const glyphButtons = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    glyphButtons.current[0]?.focus();
  }, []);

  const chooseWithArrow = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = (index + direction + momentGlyphs.length) % momentGlyphs.length;
    setGlyph(momentGlyphs[next]);
    glyphButtons.current[next]?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!glyph || !note.trim()) return;
    onSave(glyph, note);
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(formRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea") ?? []);
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0].focus();
    }
  };

  return (
    <div className="moment-editor-backdrop">
      <form ref={formRef} className="moment-editor" role="dialog" aria-modal="true" aria-labelledby="moment-editor-title" onSubmit={submit} onKeyDown={handleEditorKeyDown}>
        <span className="moment-editor-kicker">LEARNING MOMENT</span>
        <h2 id="moment-editor-title">Save this position</h2>
        <p>{capture.move} · {capture.seat} · global ply {capture.ply} · staged {capture.boardId}</p>
        <div className="moment-glyph-picker" role="radiogroup" aria-label="Move glyph">
          {momentGlyphs.map((item, index) => <button ref={(node) => { glyphButtons.current[index] = node; }} type="button" role="radio" aria-checked={glyph === item} className={glyph === item ? "active" : ""} key={item} onClick={() => setGlyph(item)} onKeyDown={(event) => chooseWithArrow(event, index)}>{item}</button>)}
        </div>
        <label htmlFor="moment-note">Note<textarea id="moment-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="what it does / why it stood out" maxLength={1000} required /></label>
        <div className="moment-editor-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={!glyph || !note.trim()}>Save moment</button>
        </div>
      </form>
    </div>
  );
}
