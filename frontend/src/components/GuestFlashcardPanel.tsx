import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, X } from "lucide-react";
import { api, ApiError, type AccountSummary, type MomentRecord } from "../api";
import { formatQuestCountdown, QUEST_DURATION_MS } from "../quest";

interface Props {
  guestNumber: number;
  remainingSeconds: number | null;
  questCompleted: boolean;
  completionRecorded: boolean;
  account: AccountSummary | null;
  accountLoading: boolean;
  onClaimAccount: (email: string) => Promise<AccountSummary>;
  onAccountClaimed: (account: AccountSummary) => void;
  onClose: () => void;
}

export function GuestFlashcardPanel({ guestNumber, remainingSeconds, questCompleted, completionRecorded, account, accountLoading, onClaimAccount, onAccountClaimed, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [claimPending, setClaimPending] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimedAccount, setClaimedAccount] = useState<AccountSummary | null>(null);
  const [moments, setMoments] = useState<MomentRecord[] | null>(null);
  const [momentsError, setMomentsError] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const displayedAccount = claimedAccount ?? account;
  const countdown = questCompleted
    ? "Complete"
    : formatQuestCountdown(remainingSeconds ?? QUEST_DURATION_MS / 1_000);

  useEffect(() => {
    closeRef.current?.focus();
    let active = true;
    void api.listMyMoments().then(({ moments: loadedMoments }) => {
      if (!active) return;
      setMoments(loadedMoments);
      setCardIndex(0);
      setCardFlipped(false);
    }).catch(() => {
      if (active) setMomentsError(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const moveCard = (offset: number) => {
    if (!moments?.length) return;
    setCardIndex((current) => (current + offset + moments.length) % moments.length);
    setCardFlipped(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveCard(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveCard(1);
      return;
    }
    const target = event.target as HTMLElement;
    const interactiveTarget = ["BUTTON", "A", "INPUT"].includes(target.tagName) || target.isContentEditable;
    if ((event.key === " " || event.key === "Enter") && !interactiveTarget && moments?.length) {
      event.preventDefault();
      setCardFlipped((flipped) => !flipped);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button, a[href], input") ?? []);
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

  const activeMoment = moments?.[cardIndex];
  const activeBoard = activeMoment?.move_token.at(-1)?.toUpperCase();

  const submitClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (claimPending) return;
    setClaimPending(true);
    setClaimError(null);
    try {
      const claimed = await onClaimAccount(email);
      setClaimedAccount(claimed);
      onAccountClaimed(claimed);
    } catch (error) {
      setClaimError(error instanceof ApiError && error.status === 422 ? "enter a valid email" : "Identity claim failed.");
    } finally {
      setClaimPending(false);
    }
  };

  return (
    <div className="guest-library-backdrop" data-onboarding-active-panel>
      <section ref={panelRef} className="guest-library-panel" role="dialog" aria-modal="true" aria-labelledby="guest-library-title" onKeyDown={handleKeyDown}>
        <button ref={closeRef} type="button" className="guest-library-close" aria-label="Close flashcard library" onClick={onClose}><X size={18} /></button>
        <span className="guest-library-kicker"><BookOpen size={15} /> FLASHCARD LIBRARY</span>
        <h1 id="guest-library-title">SirGuest#{guestNumber} Flashcard library</h1>
        <div className="guest-library-countdown">
          <span>SESSION COUNTDOWN</span>
          <strong role="timer" aria-label="Session countdown">{countdown}</strong>
        </div>
        {momentsError ? (
          <div className="guest-library-empty" role="alert">
            <BookOpen size={30} aria-hidden="true" />
            <strong>Flashcards could not be loaded.</strong>
            <span>Close the library and try again.</span>
          </div>
        ) : moments === null ? (
          <div className="guest-library-empty" aria-live="polite">Loading flashcards…</div>
        ) : !activeMoment ? (
          <div className="guest-library-empty">
            <BookOpen size={30} aria-hidden="true" />
            <strong>No flashcards yet.</strong>
            <span>Saved flashcards will appear here.</span>
          </div>
        ) : (
          <section className="guest-flashcard-deck" aria-label="Saved moment flashcards">
            <article className={`guest-flashcard ${cardFlipped ? "is-flipped" : ""}`} aria-live="polite">
              {!cardFlipped ? (
                <div className="guest-flashcard-face">
                  <span className="guest-flashcard-label">FRONT</span>
                  <strong>{activeMoment.move_token} · Board {activeBoard} · {activeMoment.glyph}</strong>
                  <p>What's the stronger idea here?</p>
                </div>
              ) : (
                <div className="guest-flashcard-face">
                  <span className="guest-flashcard-label">BACK</span>
                  <strong>{activeMoment.alternative_move}</strong>
                  <p>{activeMoment.written_answer}</p>
                  {activeMoment.engine_identity !== null && activeMoment.engine_depth !== null && (
                    <small>{activeMoment.engine_identity} · depth {activeMoment.engine_depth}</small>
                  )}
                </div>
              )}
            </article>
            <div className="guest-flashcard-controls">
              <button type="button" onClick={() => moveCard(-1)}>Previous</button>
              <span aria-label="Flashcard position">{cardIndex + 1} of {moments.length}</span>
              <button type="button" onClick={() => setCardFlipped((flipped) => !flipped)}>{cardFlipped ? "Show front" : "Flip"}</button>
              <button type="button" onClick={() => moveCard(1)}>Next</button>
            </div>
          </section>
        )}
        {completionRecorded && <section className="guest-account-claim" aria-label="Claim your identity">
          {accountLoading && !displayedAccount ? <span role="status">Checking account…</span> : displayedAccount ? (
            <strong role="status">{displayedAccount.founder_eligible ? `Claimed — Founder #${displayedAccount.completion_ordinal}` : `Identity claimed (#${displayedAccount.completion_ordinal})`}</strong>
          ) : (
            <form noValidate onSubmit={submitClaim}>
              <strong>Claim your identity</strong>
              <label htmlFor="guest-account-email">Email</label>
              <input id="guest-account-email" type="email" inputMode="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
              <button type="submit" disabled={claimPending}>{claimPending ? "Claiming…" : "Claim your identity"}</button>
              {claimError && <span role="alert">{claimError}</span>}
            </form>
          )}
        </section>}
      </section>
    </div>
  );
}
