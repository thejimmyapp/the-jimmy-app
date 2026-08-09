import { Bell, BookOpen, Home, Search, Send, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type { SavedLesson } from "../guestProgress";
import { sendRoomEvent } from "../socket";
import { useCoachStore } from "../store";
import type { GameSummary } from "../types";
import { Timeline } from "./Timeline";

type PrimaryTab = "review" | "games" | "library" | "collaborate";
type ReviewTab = "moves" | "partner" | "info";
type CollaborateTab = "chat" | "notes";

interface Props {
  onSelectGame: (game: GameSummary) => void;
  loadingGame: boolean;
  partnerContent: ReactNode;
  infoContent: ReactNode;
  savedLessons: SavedLesson[];
  qualifyingGames: number;
  onOpenSavedLesson: (lesson: SavedLesson) => Promise<boolean>;
  onRemoveSavedLesson: (id: string) => void;
  onMap: () => void;
  initialTab?: PrimaryTab;
  dockActions?: ReactNode;
  dockPanel?: ReactNode;
}

export function SidePanel({ onSelectGame, loadingGame, partnerContent, infoContent, savedLessons, qualifyingGames, onOpenSavedLesson, onRemoveSavedLesson, onMap, initialTab = "review", dockActions, dockPanel }: Props) {
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>(initialTab);
  const [reviewTab, setReviewTab] = useState<ReviewTab>("partner");
  const [collaborateTab, setCollaborateTab] = useState<CollaborateTab>("chat");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("newest");
  const [unreadChat, setUnreadChat] = useState(0);
  const [lastNotice, setLastNotice] = useState("");
  const [unavailableLessons, setUnavailableLessons] = useState<string[]>([]);
  const { games, game, messages, addMessage, displayName, globalPly, participants, roomId } = useCoachStore();

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    return games
      .filter((item) => !query || `${item.opponent ?? ""} ${item.partner ?? ""} ${item.played_at ?? ""}`.toLowerCase().includes(query))
      .filter((item) => result === "all" || item.result === result)
      .filter((item) => !minRating || Number(item.opponent_rating ?? 0) >= minRating)
      .sort((a, b) => sort === "rating" ? Number(b.opponent_rating ?? 0) - Number(a.opponent_rating ?? 0) : String(b.played_at).localeCompare(String(a.played_at)));
  }, [games, minRating, result, search, sort]);

  useEffect(() => {
    if (game) {
      setPrimaryTab("review");
      setReviewTab("partner");
    }
  }, [game]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    const item = { id: crypto.randomUUID(), author: displayName, content: draft.trim(), ply: globalPly, timestamp: new Date().toISOString() };
    addMessage(item);
    sendRoomEvent(collaborateTab === "chat" ? "chat.message" : "note.create", item);
    setDraft("");
  };

  useEffect(() => {
    if (primaryTab === "collaborate" && collaborateTab === "chat") {
      setUnreadChat(0);
      setLastNotice("");
    }
  }, [collaborateTab, primaryTab]);

  useEffect(() => {
    const onIncomingChat = (event: Event) => {
      const item = (event as CustomEvent).detail as { author?: string; content?: string } | undefined;
      if (primaryTab !== "collaborate" || collaborateTab !== "chat") {
        setUnreadChat((current) => current + 1);
        setLastNotice(`${item?.author ?? "Partner"}: ${item?.content ?? "New message"}`);
      }
      if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
        new Notification("New Jimmy App chat message", { body: `${item?.author ?? "Partner"}: ${item?.content ?? ""}`.slice(0, 140) });
      }
    };
    window.addEventListener("thejimmyapp:chat-message", onIncomingChat);
    return () => window.removeEventListener("thejimmyapp:chat-message", onIncomingChat);
  }, [collaborateTab, primaryTab]);

  const enableBrowserNotifications = async () => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    await Notification.requestPermission();
  };

  const choosePrimary = (tab: PrimaryTab) => {
    setPrimaryTab(tab);
    if (tab === "collaborate" && collaborateTab === "chat") setUnreadChat(0);
  };

  return (
    <aside className="side-panel utility-panel" aria-label="Review utility panel">
      <div className="utility-titlebar"><span>REVIEW WORKSPACE</span><div className="utility-titlebar-actions">{dockActions}<button type="button" onClick={onMap}><Home size={13} /> Map</button></div></div>
      <div className="utility-primary-tabs" role="tablist" aria-label="Review tools">
        {(["review", "games", "library", "collaborate"] as PrimaryTab[]).map((tab) => <button key={tab} role="tab" aria-selected={primaryTab === tab} className={primaryTab === tab ? "active" : ""} onClick={() => choosePrimary(tab)}>{tab === "collaborate" ? <>Collaborate{unreadChat > 0 && <span className="chat-unread">{unreadChat}</span>}</> : tab[0].toUpperCase() + tab.slice(1)}</button>)}
      </div>

      {primaryTab === "review" && <div className="utility-secondary-tabs" role="tablist" aria-label="Review views">
        {(["moves", "partner", "info"] as ReviewTab[]).map((tab) => <button key={tab} role="tab" aria-selected={reviewTab === tab} className={reviewTab === tab ? "active" : ""} onClick={() => setReviewTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
      </div>}
      {primaryTab === "collaborate" && <div className="utility-secondary-tabs" role="tablist" aria-label="Collaboration views">
        {(["chat", "notes"] as CollaborateTab[]).map((tab) => <button key={tab} role="tab" aria-selected={collaborateTab === tab} className={collaborateTab === tab ? "active" : ""} onClick={() => setCollaborateTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}{tab === "chat" && unreadChat > 0 && <span className="chat-unread">{unreadChat}</span>}</button>)}
      </div>}

      <div className={`utility-pane partner-pane ${primaryTab === "review" && reviewTab === "partner" ? "active" : ""}`} aria-hidden={!(primaryTab === "review" && reviewTab === "partner")}>{partnerContent}</div>

      <div className={`utility-pane moves-pane ${primaryTab === "review" && reviewTab === "moves" ? "active" : "inactive"}`} aria-hidden={!(primaryTab === "review" && reviewTab === "moves")}><Timeline variant="panel" /></div>
      {primaryTab === "review" && reviewTab === "info" && <div className="utility-pane info-pane">{infoContent}</div>}

      {primaryTab === "games" && <div className="utility-pane games-pane">
        <div className="game-filters">
          <label className="sidebar-search"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Player, partner or date" /></label>
          <div className="filter-row">
            <select value={result} onChange={(event) => setResult(event.target.value)} aria-label="Game result"><option value="all">All results</option><option value="win">Wins</option><option value="loss">Losses</option><option value="draw">Draws</option></select>
            <select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))} aria-label="Minimum opponent rating"><option value={0}>Any Elo</option><option value={1600}>1600+</option><option value={1800}>1800+</option><option value={2000}>2000+</option><option value={2200}>2200+</option></select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Game sort"><option value="newest">Newest</option><option value="rating">Highest Elo</option></select>
          </div>
          <span>{filteredGames.length} games</span>
        </div>
        <div className="sidebar-game-list">
          {filteredGames.map((item) => <button className={game?.game.id === item.id ? "active" : ""} key={item.id} onClick={() => onSelectGame(item)} disabled={loadingGame}><span className={`result-dot ${item.result}`} /><span className="game-opponent"><strong>{item.opponent ?? "Unknown"}</strong><small>with {item.partner ?? "unknown partner"}</small></span><span className="game-meta"><strong>{item.opponent_rating ?? "—"}</strong><small>{item.played_at?.slice(0, 10)}</small></span></button>)}
          {!filteredGames.length && <div className="empty-panel">No imported games match these filters.</div>}
        </div>
      </div>}

      {primaryTab === "library" && <div className="utility-pane library-pane">
        <header className="library-header"><BookOpen size={17} /><div><strong>Guest learning library</strong><span>{qualifyingGames}/3 games toward partner-board instructions</span></div></header>
        <div className="unlock-progress"><span style={{ width: `${Math.min(3, qualifyingGames) / 3 * 100}%` }} /><strong>{qualifyingGames}/3 games</strong></div>
        <p className="library-boundary">Only medium- or high-confidence mistakes and blunders with a legal suggested move count. Saved here means stored in this browser.</p>
        <div className="library-list">
          {savedLessons.map((lesson) => <article key={lesson.id} className={unavailableLessons.includes(lesson.id) ? "unavailable" : ""}>
            <button type="button" className="library-open" onClick={async () => { const opened = await onOpenSavedLesson(lesson); setUnavailableLessons((items) => opened ? items.filter((id) => id !== lesson.id) : [...new Set([...items, lesson.id])]); }}><span>{lesson.severity.toUpperCase()} · GAME {lesson.gameId}</span><strong>{lesson.playedMove} → {lesson.bestMove}</strong><small>Global ply {lesson.globalPly} · {lesson.pattern}</small>{unavailableLessons.includes(lesson.id) && <em>This game is unavailable or has been reanalyzed.</em>}</button>
            <button type="button" className="library-remove" aria-label={`Remove saved lesson from game ${lesson.gameId}`} onClick={() => onRemoveSavedLesson(lesson.id)}><Trash2 size={14} /></button>
          </article>)}
          {!savedLessons.length && <div className="empty-panel">No saved learning moments yet. Open Review → Info when a game has an evidence-backed lesson.</div>}
        </div>
      </div>}

      {primaryTab === "collaborate" && <div className="utility-pane collaborate-pane">
        <div className="presence"><span className="presence-dot" />{roomId ? <span><strong>{participants.length || 1}</strong> watching · {(participants.length ? participants : [{ display_name: displayName, client_id: "local" }]).map((item) => item.display_name).join(", ")}</span> : <span>Solo review · <strong>Move {globalPly}</strong></span>}{collaborateTab === "chat" && "Notification" in window && Notification.permission === "default" && <button type="button" className="notification-enable" onClick={() => void enableBrowserNotifications()}><Bell size={12} /> Enable alerts</button>}</div>
        {lastNotice && collaborateTab !== "chat" && <div className="chat-toast" role="status"><Bell size={13} /> {lastNotice}</div>}
        <div className="message-list">{collaborateTab === "chat" ? messages.map((item) => <article key={item.id}><header><strong>{item.author}</strong><button title="Go to referenced move">A · {item.ply}</button></header><p>{item.content}</p></article>) : <div className="empty-panel">Notes attached to this room and move appear here.</div>}</div>
        <form className="composer" onSubmit={submit}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={collaborateTab === "chat" ? "Message your partner" : "Add a shared note"} maxLength={5000} /><button aria-label="Send"><Send size={17} /></button></form>
      </div>}
      {dockPanel && <div className="dock-panel-overlay">{dockPanel}</div>}
    </aside>
  );
}
