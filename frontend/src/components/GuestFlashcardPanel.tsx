import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, X } from "lucide-react";
import { ApiError, type AccountSummary } from "../api";
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
  const displayedAccount = claimedAccount ?? account;
  const countdown = questCompleted
    ? "Complete"
    : formatQuestCountdown(remainingSeconds ?? QUEST_DURATION_MS / 1_000);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
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
        <div className="guest-library-empty">
          <BookOpen size={30} aria-hidden="true" />
          <strong>No flashcards yet.</strong>
          <span>Saved flashcards will appear here.</span>
        </div>
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
