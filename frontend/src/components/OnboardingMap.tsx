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
        <h1>Greetings small children</h1>
        <p>as well as those who are not small children. Basically check out what I made using nothing but dirt and junk food and intermittent bursts of unchaperoned AI. That's right. I use AI. And I used it for this.</p>
      </div>
      <div className="onboarding-entry-nodes">
        <button ref={guestRef} type="button" className="onboarding-entry-node guest-entry-node" onClick={onGuestSpawn}>
          <UserRound size={22} />
          <span><strong>Click me?</strong><small>Do not click me. Use the keyboard you've infested with your hoomanness and goopey goop disgusting clumps and dirt. Your keyboard hates you. Now tap that keyboard, tap that ← or → and ⏎ buttons.</small></span>
        </button>
        <label className="onboarding-entry-node username-entry-node" htmlFor="onboarding-username">
          <LogIn size={22} />
          <span><strong>Sign in</strong><small>Do not sign in but be amazed by an obscure long word starting with the first letter you typed. You will be given ninety-nine seconds to reflect on why you are a hooman while AI automatically reads the proper pronunciation, and highly optimistic predictions of what people would think about you if you tried using that word with your friends; should you hypothetically decide to casually in conversation inject it like it's a normal part of your new and growing vocabulary.</small></span>
          <input ref={usernameRef} id="onboarding-username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={25} autoComplete="username" aria-describedby={error ? "onboarding-username-error" : undefined} />
        </label>
      </div>
      {error && <div id="onboarding-username-error" className="onboarding-entry-error" role="alert">{error}</div>}
      <div className="onboarding-entry-status" role="status">The timer has started. You shouldn't be clicking still. Are you clicking? No more clicking.</div>
    </section>
  );
}
