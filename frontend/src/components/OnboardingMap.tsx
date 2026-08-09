import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { LogIn, UserRound } from "lucide-react";

interface Props {
  onGuestSpawn: () => void;
  onUsernameSubmit: (username: string) => void;
}

const validUsername = (value: string) => /^[A-Za-z0-9_-]{2,25}$/.test(value);

export function OnboardingMap({ onGuestSpawn, onUsernameSubmit }: Props) {
  const surfaceRef = useRef<HTMLElement>(null);
  const guestRef = useRef<HTMLButtonElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    guestRef.current?.focus();
  }, []);

  useEffect(() => {
    const keepFocusInside = (event: FocusEvent) => {
      if (surfaceRef.current?.contains(event.target as Node)) {
        lastFocusedRef.current = event.target as HTMLElement;
        return;
      }
      (lastFocusedRef.current ?? guestRef.current)?.focus();
    };
    document.addEventListener("focusin", keepFocusInside);
    return () => document.removeEventListener("focusin", keepFocusInside);
  }, []);

  const focusOtherNode = (target: EventTarget | null) => {
    if (target === usernameRef.current) guestRef.current?.focus();
    else usernameRef.current?.focus();
  };

  const submitUsername = () => {
    const clean = username.trim();
    if (!validUsername(clean)) {
      setError("Use 2–25 letters, numbers, underscores, or hyphens.");
      return;
    }
    setError("");
    onUsernameSubmit(clean);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      focusOtherNode(event.target);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      focusOtherNode(event.target);
      return;
    }
    if (event.key === "Enter" && event.target === usernameRef.current) {
      event.preventDefault();
      submitUsername();
      return;
    }
    if (event.key === "Enter" && event.target === guestRef.current) {
      event.preventDefault();
      onGuestSpawn();
    }
  };

  return (
    <section ref={surfaceRef} className="onboarding-map-shell locked-shell-onboarding" aria-label="Choose how to enter The Jimmy App" onKeyDown={handleKeyDown}>
      <div className="onboarding-entry-copy">
        <span>THE JIMMY APP</span>
        <h1>Choose your entry.</h1>
        <p>Use Arrow keys or Tab to move between the two nodes. Press Enter to commit.</p>
      </div>
      <div className="onboarding-entry-nodes">
        <button ref={guestRef} type="button" className="onboarding-entry-node guest-entry-node" onClick={onGuestSpawn}>
          <UserRound size={22} />
          <span><strong>Guest Spawn</strong><small>Enter without an account</small></span>
        </button>
        <label className="onboarding-entry-node username-entry-node" htmlFor="onboarding-username">
          <LogIn size={22} />
          <span><strong>Username</strong><small>Letters, numbers, _ or -</small></span>
          <input ref={usernameRef} id="onboarding-username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={25} autoComplete="username" aria-describedby={error ? "onboarding-username-error" : undefined} />
        </label>
      </div>
      {error && <div id="onboarding-username-error" className="onboarding-entry-error" role="alert">{error}</div>}
      <div className="onboarding-entry-status" role="status">Guest Spawn is focused by default.</div>
    </section>
  );
}
