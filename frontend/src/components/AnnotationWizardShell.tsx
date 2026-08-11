import { useState } from "react";
import type { MomentGlyph } from "../guestProgress";
import { GlyphPicker } from "./GlyphPicker";

export interface WizardMoveOption {
  token: string;
  move: string;
}

export interface AnnotationWizardShellProps {
  move_options: WizardMoveOption[];
}

export function AnnotationWizardShell({ move_options }: AnnotationWizardShellProps) {
  const [selectedMove, setSelectedMove] = useState<WizardMoveOption | null>(null);
  const [glyph, setGlyph] = useState<MomentGlyph | null>(null);

  const chooseMove = (move: WizardMoveOption) => {
    setSelectedMove(move);
    setGlyph(null);
  };

  const changeMove = () => {
    setSelectedMove(null);
    setGlyph(null);
  };

  return (
    <article className="annotation-wizard" aria-label="Learning moment wizard steps 1 and 2">
      <header className="annotation-wizard__header">
        <span>LEARNING MOMENT WIZARD</span>
        <strong>{glyph ? "2" : selectedMove ? "2" : "1"} of 4</strong>
      </header>

      <section className={`wizard-step wizard-step--move ${selectedMove ? "is-complete" : "is-active"}`} aria-labelledby="wizard-step-1-title">
        <span className="wizard-step__number">step 1 of 4</span>
        {selectedMove ? (
          <>
            <h3 id="wizard-step-1-title">At move {selectedMove.token}</h3>
            <p className="wizard-step__selection">{selectedMove.move}</p>
            <button type="button" className="wizard-step__back" onClick={changeMove}>Change move</button>
          </>
        ) : (
          <>
            <h3 id="wizard-step-1-title">Pick the move</h3>
            <p data-copy-placeholder="true">[COPY-PLACEHOLDER] Pick a move. Any move. You've seen chess before.</p>
            <div className="wizard-step__moves" aria-label="Moves at this position">
              {move_options.map((move) => (
                <button type="button" onClick={() => chooseMove(move)} key={move.token}>
                  <span>{move.token}</span><strong>{move.move}</strong>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section
        className={`wizard-step wizard-step--glyph ${selectedMove ? "is-active" : "is-locked"}`}
        aria-labelledby="wizard-step-2-title"
        aria-disabled={!selectedMove}
        inert={!selectedMove || undefined}
      >
        <span className="wizard-step__number">step 2 of 4 · required</span>
        <h3 id="wizard-step-2-title">This move is {glyph ?? "___"}</h3>
        <GlyphPicker value={glyph} onChange={setGlyph} disabled={!selectedMove} label="Required move glyph" />
      </section>

      <section className="wizard-step wizard-step--future is-locked" aria-disabled="true" inert>
        <span className="wizard-step__number">step 3 of 4</span>
        <h3>Alternative move</h3>
        <p>Placeholder — not available in this shell.</p>
      </section>

      <section className="wizard-step wizard-step--future is-locked" aria-disabled="true" inert>
        <span className="wizard-step__number">step 4 of 4</span>
        <h3>Written answer</h3>
        <p>Placeholder — not available in this shell.</p>
      </section>
    </article>
  );
}
