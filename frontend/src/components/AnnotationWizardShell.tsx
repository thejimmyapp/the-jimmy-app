import { useState, type ReactNode } from "react";
import type { MomentGlyph } from "../guestProgress";
import { GlyphPicker } from "./GlyphPicker";

export interface WizardMoveOption {
  token: string;
  move: string;
}

export interface AnnotationWizardShellProps {
  move_options: WizardMoveOption[];
  alternative_move_options?: string[];
  initial_alternative_move?: string;
  render_alternative_board?: (onMovePlayed: (notation: string) => void) => ReactNode;
  onSave?: (moment: { moveToken: string; glyph: MomentGlyph; alternativeMove: string; writtenAnswer: string }) => Promise<void>;
  onCancel?: () => void;
  saving?: boolean;
  saveError?: string | null;
}

const STEP_FOUR_PROMPTS: Record<MomentGlyph, string> = {
  "!": "Show a move you might have played instead — and why it's worse.",
  "?": "What should they have played, and what did they miss?",
  "!!": "What makes this one hard to find?",
  "??": "What's the punishment?",
  "!?": "What risk did they accept?",
  "?!": "What's the safer option?",
};

export function AnnotationWizardShell({ move_options, alternative_move_options = [], initial_alternative_move, render_alternative_board, onSave, onCancel, saving = false, saveError = null }: AnnotationWizardShellProps) {
  const [selectedMove, setSelectedMove] = useState<WizardMoveOption | null>(null);
  const [glyph, setGlyph] = useState<MomentGlyph | null>(null);
  const [alternativeMove, setAlternativeMove] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const chooseMove = (move: WizardMoveOption) => {
    setSelectedMove(move);
    setGlyph(null);
    setAlternativeMove(null);
    setAnswer("");
  };

  const changeMove = () => {
    setSelectedMove(null);
    setGlyph(null);
    setAlternativeMove(null);
    setAnswer("");
  };

  const chooseGlyph = (nextGlyph: MomentGlyph) => {
    setGlyph(nextGlyph);
    setAlternativeMove((current) => current ?? initial_alternative_move ?? null);
  };

  const currentStep = alternativeMove ? 4 : glyph ? 3 : selectedMove ? 2 : 1;
  const hasWrittenAnswer = answer.trim().length >= 1;
  const save = async () => {
    if (!onSave || !selectedMove || !glyph || !alternativeMove || !hasWrittenAnswer || saving) return;
    const writtenAnswer = `Because ${answer.trim()}`;
    await onSave({ moveToken: selectedMove.token, glyph, alternativeMove, writtenAnswer });
  };

  return (
    <article className="annotation-wizard" aria-label="Learning moment wizard steps 1 through 4">
      <header className="annotation-wizard__header">
        <span>LEARNING MOMENT WIZARD</span>
        <strong>{currentStep} of 4</strong>
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
        aria-hidden={!selectedMove}
        inert={!selectedMove || undefined}
      >
        <span className="wizard-step__number">step 2 of 4 · required</span>
        <h3 id="wizard-step-2-title">This move is {glyph ?? "___"}</h3>
        <GlyphPicker value={glyph} onChange={chooseGlyph} disabled={!selectedMove} label="Required move glyph" />
      </section>

      <section
        className={`wizard-step wizard-step--alternative ${glyph ? (alternativeMove ? "is-complete" : "is-active") : "is-locked"}`}
        aria-labelledby="wizard-step-3-title"
        aria-disabled={!glyph}
        aria-hidden={!glyph}
        inert={!glyph || undefined}
      >
        <span className="wizard-step__number">step 3 of 4 · required</span>
        <h3 id="wizard-step-3-title">Instead, play {alternativeMove ?? "___"}</h3>
        <p>Interesting move for sure! Next you're required to give one relevant alternative move. Relax don't overthink it you're halfway done.</p>
        <div className="wizard-step__board-moves" role="group" aria-label="Play one alternative move on the board">
          {render_alternative_board?.(setAlternativeMove)}
          {!render_alternative_board && alternative_move_options.map((move) => (
            <button
              type="button"
              className={alternativeMove === move ? "is-selected" : undefined}
              aria-pressed={alternativeMove === move}
              onClick={() => setAlternativeMove(move)}
              key={move}
            >
              <span aria-hidden="true">BOARD</span>
              <strong>{move}</strong>
            </button>
          ))}
        </div>
      </section>

      <section
        className={`wizard-step wizard-step--answer ${alternativeMove ? "is-active" : "is-locked"}`}
        aria-labelledby="wizard-step-4-title"
        aria-disabled={!alternativeMove}
        aria-hidden={!alternativeMove}
        inert={!alternativeMove || undefined}
      >
        <span className="wizard-step__number">step 4 of 4</span>
        <h3 id="wizard-step-4-title">Written answer</h3>
        <p data-copy-placeholder="true">[COPY-PLACEHOLDER] {glyph ? STEP_FOUR_PROMPTS[glyph] : "Select a glyph to see this prompt."}</p>
        <label className="wizard-step__answer-field">
          <span>Because</span>
          <textarea
            aria-label="Written answer after Because"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            minLength={1}
            required
          />
        </label>
        {onSave && (
          <div className="wizard-step__actions">
            {onCancel && <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>}
            <button type="button" className="primary" onClick={() => void save()} disabled={!selectedMove || !glyph || !alternativeMove || !hasWrittenAnswer || saving}>
              {saving ? "Saving…" : "Save moment"}
            </button>
          </div>
        )}
        {saveError && <p className="wizard-step__error" role="alert">{saveError}</p>}
      </section>
    </article>
  );
}
