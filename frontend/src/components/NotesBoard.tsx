import { useEffect, useState } from "react";
import { StickyNote, ThumbsUp } from "lucide-react";
import { api, type PublicMomentRecord } from "../api";

export function NotesBoard() {
  const [moments, setMoments] = useState<PublicMomentRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pendingVoteIds, setPendingVoteIds] = useState<Set<number>>(() => new Set());
  const [voteErrorId, setVoteErrorId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void api.listPublicMoments().then(({ moments: publicMoments }) => {
      if (active) setMoments(publicMoments);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleVote = async (momentId: number) => {
    if (pendingVoteIds.has(momentId)) return;
    setPendingVoteIds((current) => new Set(current).add(momentId));
    setVoteErrorId(null);
    try {
      const result = await api.togglePublicMomentVote(momentId);
      setMoments((current) => current?.map((moment) => moment.id === momentId
        ? { ...moment, voted: result.voted, vote_count: result.vote_count }
        : moment) ?? null);
    } catch {
      setVoteErrorId(momentId);
    } finally {
      setPendingVoteIds((current) => {
        const next = new Set(current);
        next.delete(momentId);
        return next;
      });
    }
  };

  return (
    <section className="notes-board" aria-labelledby="notes-board-title">
      <header className="notes-board-header">
        <span><StickyNote size={16} aria-hidden="true" /> COMMUNITY NOTES</span>
        <h1 id="notes-board-title">Notes board</h1>
        <p>Frozen learning moments shared by every guest.</p>
      </header>
      {failed ? (
        <div className="notes-board-state" role="alert">
          <strong>Public moments could not be loaded.</strong>
          <span>Return to the notes board to try again.</span>
        </div>
      ) : moments === null ? (
        <div className="notes-board-state" aria-live="polite">Loading public moments…</div>
      ) : moments.length === 0 ? (
        <div className="notes-board-state">
          <strong>No public moments yet.</strong>
          <span>Saved learning moments will appear here.</span>
        </div>
      ) : (
        <div className="notes-board-grid" aria-label="Public learning moments">
          {moments.map((moment) => {
            const board = moment.move_token.at(-1)?.toUpperCase();
            return (
              <article key={moment.id} className="notes-board-card">
                <header>
                  <strong>{moment.move_token} · Board {board} · {moment.glyph}</strong>
                  <span>SirGuest#{moment.author_guest_number}</span>
                </header>
                <dl>
                  <div><dt>Alternative</dt><dd>{moment.alternative_move}</dd></div>
                  <div><dt>Because</dt><dd>{moment.written_answer}</dd></div>
                </dl>
                <footer>
                  {moment.engine_identity !== null && moment.engine_depth !== null && (
                    <span>{moment.engine_identity} · depth {moment.engine_depth}</span>
                  )}
                  <time dateTime={moment.created_at}>{moment.created_at}</time>
                </footer>
                <div className="notes-board-vote">
                  <button
                    type="button"
                    className={moment.voted ? "voted" : ""}
                    aria-pressed={moment.voted}
                    disabled={pendingVoteIds.has(moment.id)}
                    onClick={() => void toggleVote(moment.id)}
                  >
                    <ThumbsUp size={14} aria-hidden="true" /> Upvote · {moment.vote_count}
                  </button>
                  {voteErrorId === moment.id && <span role="alert">Vote could not be saved.</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
