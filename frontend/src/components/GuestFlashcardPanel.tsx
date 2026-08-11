import { useEffect, useRef, type KeyboardEvent } from "react";
import { BookOpen, X } from "lucide-react";
import { formatQuestCountdown, QUEST_DURATION_MS } from "../quest";

interface Props {
  guestNumber: number;
  remainingSeconds: number | null;
  questCompleted: boolean;
  onClose: () => void;
}

export function GuestFlashcardPanel({ guestNumber, remainingSeconds, questCompleted, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
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
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []);
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
      </section>
    </div>
  );
}
