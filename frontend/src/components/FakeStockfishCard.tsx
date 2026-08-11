/* eslint-disable react-refresh/only-export-components */
import { type ReactNode, useEffect, useState } from "react";
import { EvalCard } from "./EvalCard";

export const FAKE_STOCKFISH_HEADER = "have no fear! stockfish is here!";
export const FAKE_STOCKFISH_PULSE_SECONDS = 13;
export const FAKE_STOCKFISH_PULSE_INTERVAL_MS = 2_000;

export const fakeStockfishRefusalCopy = (guestNumber: number) => `PSYCH! You fell for that? Ha! No you can't use stockfish until you have 10 learning moments saved. The feature is NOT a paywall. You gotsta finish yer quest, SirGuest#${guestNumber}. Hop to it!`;

type FakePhase = "resting" | "refusing" | "loop";

interface FakeStockfishCardProps {
  guestNumber: number;
  savedMomentCount: number;
}

interface FakeStockfishGateProps extends FakeStockfishCardProps {
  isGuest: boolean;
  children: ReactNode;
}

const debtReadout = (debtSeconds: number) => (
  <div className="fake-stockfish__debt" role="status">
    <strong>Accumulated quest-clock debt: {debtSeconds} seconds.</strong>
    <span>Recorded in client state; pending real quest-clock wiring.</span>
  </div>
);

export function FakeStockfishCard({ guestNumber, savedMomentCount }: FakeStockfishCardProps) {
  const [phase, setPhase] = useState<FakePhase>("resting");
  const [debtSeconds, setDebtSeconds] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [loopStartMomentCount, setLoopStartMomentCount] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== "refusing") return;
    const timer = window.setInterval(() => {
      setDebtSeconds((current) => current + FAKE_STOCKFISH_PULSE_SECONDS);
      setPulse((current) => current + 1);
    }, FAKE_STOCKFISH_PULSE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "loop" && loopStartMomentCount !== null && savedMomentCount > loopStartMomentCount) {
      setPhase("resting");
      setLoopStartMomentCount(null);
    }
  }, [loopStartMomentCount, phase, savedMomentCount]);

  const changeEnabled = (enabled: boolean) => {
    if (enabled && phase === "resting") {
      setPhase("refusing");
      return;
    }
    if (!enabled && phase === "refusing") {
      setLoopStartMomentCount(savedMomentCount);
      setPhase("loop");
    }
  };

  const refusalBody = phase === "refusing" ? (
    <div className="fake-stockfish__refusal">
      <p>{fakeStockfishRefusalCopy(guestNumber)}</p>
      <div className="fake-stockfish__pulse-slot" aria-live="polite">
        {pulse > 0 && <strong className="fake-stockfish__pulse" key={pulse}>−13</strong>}
      </div>
      {debtReadout(debtSeconds)}
    </div>
  ) : undefined;

  const loopControl = phase === "loop" ? (
    <div className="fake-stockfish__loop" role="status" aria-label="Placeholder distracting loop">
      <span className="fake-stockfish__loop-trail" aria-hidden="true" />
      <strong>[PLACEHOLDER: distracting loop]</strong>
    </div>
  ) : undefined;

  return (
    <EvalCard
      engine_identity={FAKE_STOCKFISH_HEADER}
      depth={18}
      status="complete"
      enabled={phase === "refusing"}
      score_cp={84}
      principal_lines={[
        { rank: 1, moves: ["N@e5+", "Kh8", "Q@h6", "Rg8"] },
        { rank: 2, moves: ["P@f7+", "Rxf7", "B@c4"] },
      ]}
      white_pocket="PNQ"
      black_pocket="br"
      header_control={loopControl}
      body_override={refusalBody}
      body_after={phase !== "refusing" && debtSeconds > 0 ? debtReadout(debtSeconds) : undefined}
      onEnabledChange={changeEnabled}
    />
  );
}

export function FakeStockfishGate({ isGuest, savedMomentCount, guestNumber, children }: FakeStockfishGateProps) {
  if (!isGuest || savedMomentCount >= 10) return <>{children}</>;
  return <FakeStockfishCard guestNumber={guestNumber} savedMomentCount={savedMomentCount} />;
}
