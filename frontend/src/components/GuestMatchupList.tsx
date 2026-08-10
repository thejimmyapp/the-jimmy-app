import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { guestMatchupsQuery } from "../guestMatchupsQuery";
import type { NormalizedMatch } from "../types";

interface Props {
  onSelect: (match: NormalizedMatch) => void | Promise<void>;
}

const cardText = (match: NormalizedMatch) => {
  const highest = match.highest_rated;
  const relative = match.loser_relative_to_highest ? `${match.loser_relative_to_highest} ` : "";
  return `${highest.name}(${highest.rating}) ${highest.outcome} — ${relative}${match.action}`;
};

export function GuestMatchupList({ onSelect }: Props) {
  const surfaceRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const query = useQuery({ ...guestMatchupsQuery, retry: false });
  const matches = query.data?.matches ?? [];

  useLayoutEffect(() => {
    (matches.length ? listRef.current : surfaceRef.current)?.focus();
  }, [matches.length, query.isError]);

  useEffect(() => {
    const keepFocusInside = (event: FocusEvent) => {
      if (surfaceRef.current?.contains(event.target as Node)) return;
      (matches.length ? listRef.current : surfaceRef.current)?.focus();
    };
    document.addEventListener("focusin", keepFocusInside);
    return () => document.removeEventListener("focusin", keepFocusInside);
  }, [matches.length]);

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      listRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter" && matches[activeIndex] && !selecting) {
      event.preventDefault();
      setSelecting(true);
      setSelectionError("");
      void Promise.resolve(onSelect(matches[activeIndex])).catch((error: unknown) => {
        const typedDecoderFailure = error instanceof Error && (error.name === "MoveListDecodeError" || error.name === "MatchReconstructionError");
        setSelectionError(typedDecoderFailure
          ? "This match uses replay data the decoder cannot verify. It was refused."
          : "This match could not be loaded. Press Enter to try again.");
      }).finally(() => setSelecting(false));
    }
  };

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab") event.preventDefault();
    if (event.key === "Enter" && query.isError) {
      event.preventDefault();
      void query.refetch();
    }
  };

  return (
    <section
      ref={surfaceRef}
      className="onboarding-map-shell locked-shell-onboarding guest-matchup-surface"
      aria-label="Choose a guest matchup"
      tabIndex={-1}
      onKeyDown={handleSurfaceKeyDown}
    >
      <div className="onboarding-entry-copy">
        <span>GUEST MATCHUPS</span>
        <h1>Choose a game to review.</h1>
        <p>Use Arrow Up or Arrow Down to move. Press Enter to select.</p>
      </div>
      {query.isPending && <div className="guest-matchup-status" role="status">Loading matchups…</div>}
      {query.isError && <div className="guest-matchup-status guest-matchup-error" role="alert">Matchups unavailable. Press Enter to retry.</div>}
      {selecting && <div className="guest-matchup-status" role="status">Verifying both boards…</div>}
      {selectionError && <div className="guest-matchup-status guest-matchup-error" role="alert">{selectionError}</div>}
      {matches.length > 0 && (
        <div
          ref={listRef}
          className="guest-matchup-list"
          role="listbox"
          aria-label="Guest matchups"
          aria-activedescendant={`guest-matchup-${activeIndex}`}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
        >
          {matches.map((match, index) => (
            <article
              id={`guest-matchup-${index}`}
              key={`${match.game_ids.A}-${match.game_ids.B}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`guest-matchup-card ${index === activeIndex ? "active" : ""}`}
            >
              <strong>{cardText(match)}</strong>
              <small>Boards {match.game_ids.A} / {match.game_ids.B} · {match.ply_counts.A}/{match.ply_counts.B} plies</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
