import type { ReactNode } from "react";

interface AppShellProps {
  rail: ReactNode;
  stage: ReactNode;
  dock?: ReactNode;
  className?: string;
  boardTheme: string;
  pieceStyle: string;
  pieceSize: string;
  onboardingLocked?: boolean;
}

export function AppShell({ rail, stage, dock, className = "", boardTheme, pieceStyle, pieceSize, onboardingLocked = false }: AppShellProps) {
  return (
    <main className={`app-shell app-shell-rail-stage-dock ${className}`} data-board-theme={boardTheme} data-piece-style={pieceStyle} data-piece-size={pieceSize}>
      <div className="small-screen-message" role="status"><strong>Widen the window to at least 992px to use The Jimmy App.</strong><span>Board sizing is designed to work best at 175% browser zoom, matching the Chess.com Bughouse play page.</span></div>
      <aside className="app-rail" aria-label="Application navigation" inert={onboardingLocked || undefined} aria-hidden={onboardingLocked || undefined}>{rail}</aside>
      <section className="app-stage" aria-label="Primary task"><div className="app-stage-content">{stage}</div><div id="app-stage-panel" /></section>
      {dock && <aside className="app-dock" aria-label="Task tools" inert={onboardingLocked || undefined} aria-hidden={onboardingLocked || undefined}><div className="app-dock-content">{dock}</div><div id="app-dock-panel" /></aside>}
    </main>
  );
}
