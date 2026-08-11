import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { LogIn, UserRound, Volume2, VolumeX } from "lucide-react";
import { CLICK_ME_COPY, landingHeadline, landingSubcopy, SIGN_IN_COPY, SIGN_IN_NOTICE, SUB_CARD_COPY, type GuestSessionIdentity } from "../guestChrome";
import { formatWordVertigoCountdown, WORD_VERTIGO_BASE_CHARACTER_MS, WORD_VERTIGO_SECONDS, WORD_VERTIGO_SPEEDS, wordVertigoBlurb } from "../wordVertigo";

interface Props extends GuestSessionIdentity {
  onGuestSpawn: () => void;
  onWordVertigoActiveChange?: (active: boolean) => void;
  onWordVertigoUnmute: () => void | Promise<void>;
}

export function OnboardingMap({ guest_number, total_guests, completions_to_date, onGuestSpawn, onWordVertigoActiveChange, onWordVertigoUnmute }: Props) {
  const surfaceRef = useRef<HTMLElement>(null);
  const guestRef = useRef<HTMLButtonElement>(null);
  const wordInputRef = useRef<HTMLInputElement>(null);
  const revealRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(false);
  const [typedCharacter, setTypedCharacter] = useState("");
  const [blurb, setBlurb] = useState("");
  const [revealedCharacters, setRevealedCharacters] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(WORD_VERTIGO_SECONDS);
  const [escaping, setEscaping] = useState(false);
  const active = blurb.length > 0;
  const speed = WORD_VERTIGO_SPEEDS[speedIndex];
  activeRef.current = active;

  useLayoutEffect(() => {
    guestRef.current?.focus();
  }, []);

  useEffect(() => {
    onWordVertigoActiveChange?.(active);
  }, [active, onWordVertigoActiveChange]);

  useEffect(() => () => onWordVertigoActiveChange?.(false), [onWordVertigoActiveChange]);

  useEffect(() => {
    const keepFocusInside = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      const isVertigoControl = Boolean(target.closest("[data-word-vertigo-control]"));
      const isActiveChrome = Boolean(target.closest("[data-onboarding-active-rail], [data-onboarding-active-panel]"));
      if (surfaceRef.current?.contains(target) || isActiveChrome || (activeRef.current && isVertigoControl)) {
        lastFocusedRef.current = target;
        return;
      }
      (activeRef.current ? revealRef.current : lastFocusedRef.current ?? guestRef.current)?.focus();
    };
    document.addEventListener("focusin", keepFocusInside);
    return () => document.removeEventListener("focusin", keepFocusInside);
  }, []);

  useEffect(() => {
    if (!active || revealedCharacters >= blurb.length) return;
    const timeout = window.setTimeout(
      () => setRevealedCharacters((current) => Math.min(blurb.length, current + 1)),
      WORD_VERTIGO_BASE_CHARACTER_MS / speed,
    );
    return () => window.clearTimeout(timeout);
  }, [active, blurb, revealedCharacters, speed]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    if (active) revealRef.current?.focus();
  }, [active]);

  const resetSequence = useCallback(() => {
    setTypedCharacter("");
    setBlurb("");
    setRevealedCharacters(0);
    setSpeedIndex(0);
    setRemainingSeconds(WORD_VERTIGO_SECONDS);
    setEscaping(false);
    wordInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (active && remainingSeconds === 0) resetSequence();
  }, [active, remainingSeconds, resetSequence]);

  const focusOtherNode = (target: EventTarget | null) => {
    if (target === wordInputRef.current) guestRef.current?.focus();
    else wordInputRef.current?.focus();
  };

  const focusActiveRail = (last = false) => {
    const controls = Array.from(document.querySelectorAll<HTMLElement>("[data-onboarding-active-rail]"));
    const target = controls[last ? controls.length - 1 : 0];
    target?.focus();
    return Boolean(target);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (active) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      focusOtherNode(event.target);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey && event.target === guestRef.current) {
        if (!focusActiveRail(true)) wordInputRef.current?.focus();
      } else if (!event.shiftKey && event.target === wordInputRef.current) {
        if (!focusActiveRail()) guestRef.current?.focus();
      }
      else focusOtherNode(event.target);
      return;
    }
    if (event.key === "Enter" && event.target === guestRef.current) {
      event.preventDefault();
      onGuestSpawn();
    }
  };

  const beginSequence = (value: string) => {
    if (active) return;
    const firstCharacter = value.slice(0, 1);
    if (!firstCharacter) return;
    setTypedCharacter(firstCharacter);
    setBlurb(wordVertigoBlurb(firstCharacter));
    setRevealedCharacters(0);
    setSpeedIndex(0);
    setRemainingSeconds(WORD_VERTIGO_SECONDS);
  };

  const cycleSpeed = () => setSpeedIndex((current) => (current + 1) % WORD_VERTIGO_SPEEDS.length);

  const unmute = async () => {
    if (escaping) return;
    setEscaping(true);
    try {
      await onWordVertigoUnmute();
    } catch {
      // The existing selection path remains available for another activation.
    } finally {
      setEscaping(false);
    }
  };

  const dockTarget = active ? document.getElementById("app-dock-panel") : null;

  return (
    <section ref={surfaceRef} className={`onboarding-map-shell locked-shell-onboarding ${active ? "word-vertigo-active" : ""}`} aria-label="Choose how to enter The Jimmy App" onKeyDown={handleKeyDown}>
      <div className="onboarding-entry-copy" inert={active || undefined} aria-hidden={active || undefined}>
        <span>THE JIMMY APP</span>
        <h1>{landingHeadline({ guest_number, total_guests, completions_to_date })}</h1>
        <p>{landingSubcopy({ guest_number, total_guests, completions_to_date })}</p>
      </div>
      <div className="onboarding-entry-nodes">
        <button ref={guestRef} type="button" className="onboarding-entry-node guest-entry-node" onClick={onGuestSpawn} inert={active || undefined} aria-hidden={active || undefined}>
          <UserRound size={22} />
          <span><strong>Click me?</strong><small>{CLICK_ME_COPY}</small></span>
        </button>
        <div className={`onboarding-entry-node username-entry-node word-vertigo-entry-node ${active ? "active" : ""}`}>
          <LogIn size={22} aria-hidden="true" />
          <label htmlFor="onboarding-username"><strong>Sign in</strong><small>{SIGN_IN_COPY}</small><em>{SIGN_IN_NOTICE}</em></label>
          <input ref={wordInputRef} id="onboarding-username" value={typedCharacter} onChange={(event) => beginSequence(event.target.value)} maxLength={1} autoComplete="off" readOnly={active} aria-disabled={active || undefined} />
          {active && (
            <button ref={revealRef} type="button" className="word-vertigo-reveal" data-speed={speed} aria-label={blurb} onClick={cycleSpeed}>
              <span>{blurb.slice(0, revealedCharacters)}</span><i aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="onboarding-entry-status" role="status" inert={active || undefined} aria-hidden={active || undefined}>{SUB_CARD_COPY}</div>
      {dockTarget && createPortal(
        <section className="word-vertigo-dock-panel" data-word-vertigo-control>
          <div className="word-vertigo-timer" role="timer">{formatWordVertigoCountdown(remainingSeconds)}</div>
          <div className="word-vertigo-fake-audio" aria-hidden="true">
            <div className="word-vertigo-audio-bar"><VolumeX size={18} /><span><i /></span></div>
            <div className="word-vertigo-audio-bar"><VolumeX size={18} /><span><i /></span></div>
          </div>
          <button type="button" className="word-vertigo-unmute" onClick={() => void unmute()} disabled={escaping}><Volume2 size={16} aria-hidden="true" />unmute</button>
          <button type="button" className="word-vertigo-reset" onClick={resetSequence}>start over</button>
        </section>,
        dockTarget,
      )}
    </section>
  );
}
