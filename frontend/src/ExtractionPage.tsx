import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./ExtractionPage.css";
import {
  fetchNormalizedMatch,
  fetchPublicPlayer,
  matchupCardText,
} from "./extractionData";
import type { MatchSeat, NormalizedMatch, PublicPlayer } from "./extractionData";
import {
  buildExtractionSnapshot,
  downloadExtractionSnapshot,
} from "./extractionDownload";
import type { ExtractionDownloadFormat } from "./extractionDownload";
import {
  extractionSharePath,
  isMoveAddress,
  parseExtractionInput,
} from "./extractionInput";

const TEAM_ONE: MatchSeat[] = ["A-white", "B-black"];
const TEAM_TWO: MatchSeat[] = ["A-black", "B-white"];

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function SeatCard({ match, seat }: { match: NormalizedMatch; seat: MatchSeat }) {
  const player = match.seats[seat];
  const isLoser = seat === match.loser_seat;
  return (
    <article className={`extraction-seat ${isLoser ? "is-loser" : ""}`}>
      <span>{seat.replace("-", " · ")}</span>
      <strong>{player.name}</strong>
      <small>{player.rating}</small>
      {isLoser && <em>decisive loss</em>}
    </article>
  );
}

function TeamCard({
  label,
  match,
  seats,
}: {
  label: string;
  match: NormalizedMatch;
  seats: MatchSeat[];
}) {
  return (
    <section className="extraction-team" aria-label={label}>
      <h3>{label}</h3>
      <div className="extraction-team__seats">
        {seats.map((seat) => <SeatCard key={seat} match={match} seat={seat} />)}
      </div>
    </section>
  );
}

export function ExtractionPage() {
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [match, setMatch] = useState<NormalizedMatch | null>(null);
  const [loadedGameId, setLoadedGameId] = useState<string | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [moveAddress, setMoveAddress] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const matchRequest = useRef(0);
  const playerRequest = useRef(0);

  const loadGame = useCallback(async (gameId: string) => {
    const request = ++matchRequest.current;
    playerRequest.current += 1;
    setMatchLoading(true);
    setMatchError(null);
    setMatch(null);
    setPlayer(null);
    setPlayerLoading(false);
    setPlayerError(null);
    setLoadedGameId(gameId);
    try {
      const result = await fetchNormalizedMatch(gameId);
      if (matchRequest.current === request) setMatch(result);
    } catch (error) {
      if (matchRequest.current === request) {
        setMatchError(messageFrom(error, "Match data is unavailable."));
      }
    } finally {
      if (matchRequest.current === request) setMatchLoading(false);
    }
  }, []);

  const loadPlayer = useCallback(async (username: string) => {
    const request = ++playerRequest.current;
    matchRequest.current += 1;
    setPlayerLoading(true);
    setPlayerError(null);
    setPlayer(null);
    setMatch(null);
    setMatchLoading(false);
    setMatchError(null);
    setLoadedGameId(null);
    try {
      const result = await fetchPublicPlayer(username);
      if (playerRequest.current === request) setPlayer(result);
    } catch (error) {
      if (playerRequest.current === request) {
        setPlayerError(messageFrom(error, "Player data is unavailable."));
      }
    } finally {
      if (playerRequest.current === request) setPlayerLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Data Extraction & UI Element Gathering.";
    const params = new URLSearchParams(window.location.search);
    const gameParam = params.get("game")?.trim() ?? "";
    const moveParam = params.get("move")?.trim() ?? "";

    if (!gameParam && !moveParam) return;
    if (!/^[1-9]\d*$/.test(gameParam)) {
      setInputError("The game query parameter must be a positive numeric id.");
      return;
    }

    setInput(gameParam);
    if (moveParam) {
      setMoveAddress(moveParam);
      if (!isMoveAddress(moveParam)) {
        setMoveError("Use a whole token such as 23b: positive move number followed by A, a, B, or b.");
      }
    }
    void loadGame(gameParam);
  }, [loadGame]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInputError(null);
    setSharePath(null);
    setCopyStatus(null);
    setDownloadStatus(null);
    const recognized = parseExtractionInput(input);

    if (recognized.kind === "game") {
      setMoveAddress("");
      setMoveError(null);
      void loadGame(recognized.gameId);
      return;
    }
    if (recognized.kind === "viewer") {
      setMoveAddress(recognized.moveAddress ?? "");
      setMoveError(null);
      void loadGame(recognized.gameId);
      return;
    }
    if (recognized.kind === "username") {
      setMoveAddress("");
      setMoveError(null);
      void loadPlayer(recognized.username);
      return;
    }
    if (recognized.kind === "move") {
      setMoveAddress(recognized.moveAddress);
      if (!match || !loadedGameId) {
        setMoveError("Load a game before building a moment address.");
      } else {
        setMoveError(null);
      }
      return;
    }
    setInputError("Enter a Chess.com username, live game URL, viewer URL, or positive numeric game id.");
  };

  const handleMomentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = moveAddress.trim();
    setCopyStatus(null);
    if (!match || !loadedGameId) {
      setMoveError("Load a game before building a moment address.");
      setSharePath(null);
      return;
    }
    if (!isMoveAddress(token)) {
      setMoveError("Use a whole token such as 23b: positive move number followed by A, a, B, or b.");
      setSharePath(null);
      return;
    }
    setMoveAddress(token);
    setMoveError(null);
    setSharePath(extractionSharePath(loadedGameId, token));
  };

  const copyShareUrl = async () => {
    if (!sharePath) return;
    try {
      await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).toString());
      setCopyStatus("Copied shareable URL.");
    } catch {
      setCopyStatus("Copy failed. Select the URL and copy it manually.");
    }
  };

  const handleDownload = (format: ExtractionDownloadFormat) => {
    if (!match && !player) return;
    const snapshot = buildExtractionSnapshot({
      sourceInput: input,
      origin: window.location.origin,
      match,
      loadedGameId,
      moveAddress,
      sharePath,
      player,
    });
    downloadExtractionSnapshot(snapshot, format);
    setDownloadStatus(`Prepared the complete .${format} download.`);
  };

  return (
    <main className="extraction-page">
      <section className="extraction-page__content" aria-labelledby="extraction-title">
        <header className="extraction-hero">
          <span className="extraction-kicker">EXTRACTION LAB · FRONTEND SHOWCASE</span>
          <h1 id="extraction-title">Data Extraction &amp; UI Element Gathering.</h1>
          <p>Inspect a normalized Bughouse match or a Chess.com public profile. No position decoding is performed here.</p>
        </header>

        <section className="extraction-t-chart" aria-label="Input and download everything">
          <form className="extraction-search" onSubmit={handleSubmit}>
            <span className="extraction-t-chart__label">EXISTING INPUT</span>
            <label htmlFor="extraction-input">Username, game URL, viewer URL, or numeric game id</label>
            <div className="extraction-search__row">
              <input
                id="extraction-input"
                autoFocus
                onChange={(event) => setInput(event.target.value)}
                placeholder="e.g. https://www.chess.com/game/live/180443871315 or vjbaker"
                type="text"
                value={input}
              />
              <button type="submit">Extract</button>
            </div>
          </form>
          <aside className="extraction-download" aria-labelledby="download-everything-heading">
            <span className="extraction-t-chart__label">DOWNLOAD EVERYTHING</span>
            <h2 id="download-everything-heading">Keep every available fact</h2>
            <p>Normalized match, seats, ratings, results, ply counts, moment URL, and public profile/stats.</p>
            <p className="extraction-capability"><strong>moves:</strong> pending decoder</p>
            <div className="extraction-download__buttons">
              <button type="button" disabled={!match && !player} onClick={() => handleDownload("json")}>Download .json</button>
              <button type="button" disabled={!match && !player} onClick={() => handleDownload("txt")}>Download .txt</button>
            </div>
            {downloadStatus && <p className="extraction-download__status" role="status">{downloadStatus}</p>}
          </aside>
        </section>
        {inputError && <p className="extraction-message is-error" role="alert">{inputError}</p>}
        {matchLoading && <p className="extraction-message" role="status">Loading normalized match…</p>}
        {playerLoading && <p className="extraction-message" role="status">Loading Chess.com profile and stats…</p>}
        {matchError && <p className="extraction-message is-error" role="alert">{matchError}</p>}
        {playerError && <p className="extraction-message is-error" role="alert">{playerError}</p>}

        {match && (
          <section className="extraction-result" aria-labelledby="match-heading">
            <div className="extraction-section-heading">
              <span>NORMALIZED MATCH</span>
              <h2 id="match-heading">Everything the match endpoint knows</h2>
            </div>

            <article className="extraction-matchup-card" aria-label="Matchup summary">
              {matchupCardText(match)}
            </article>

            <div className="extraction-teams">
              <TeamCard label="Team 1 · A-white + B-black" match={match} seats={TEAM_ONE} />
              <TeamCard label="Team 2 · A-black + B-white" match={match} seats={TEAM_TWO} />
            </div>

            <dl className="extraction-facts">
              <div><dt>Decisive board</dt><dd>{match.decisive_board}</dd></div>
              <div><dt>Loser seat</dt><dd>{match.loser_seat}</dd></div>
              <div><dt>Action</dt><dd>{match.action}</dd></div>
              <div><dt>Board A plies</dt><dd>{match.ply_counts.A}</dd></div>
              <div><dt>Board B plies</dt><dd>{match.ply_counts.B}</dd></div>
              <div><dt>Board A id</dt><dd>{match.game_ids.A}</dd></div>
              <div><dt>Board B id</dt><dd>{match.game_ids.B}</dd></div>
            </dl>

            <section className="extraction-moment" aria-labelledby="moment-heading">
              <div>
                <span>MOMENT ADDRESS</span>
                <h3 id="moment-heading">Build a strict move deep link</h3>
                <p>Positive move number immediately followed by A, a, B, or b.</p>
              </div>
              <form onSubmit={handleMomentSubmit}>
                <label htmlFor="move-address">Move token</label>
                <div className="extraction-moment__row">
                  <input
                    id="move-address"
                    onChange={(event) => {
                      setMoveAddress(event.target.value);
                      setMoveError(null);
                      setSharePath(null);
                    }}
                    placeholder="23b"
                    type="text"
                    value={moveAddress}
                  />
                  <button type="submit">Build URL</button>
                </div>
              </form>
              {moveError && <p className="extraction-message is-error" role="alert">{moveError}</p>}
              {sharePath && (
                <div className="extraction-share">
                  <label htmlFor="share-url">Shareable URL</label>
                  <div className="extraction-share__row">
                    <input id="share-url" readOnly value={sharePath} />
                    <button type="button" onClick={() => void copyShareUrl()}>Copy</button>
                  </div>
                  {copyStatus && <p role="status">{copyStatus}</p>}
                </div>
              )}
            </section>

            <details className="extraction-json">
              <summary>Raw normalized JSON</summary>
              <pre>{JSON.stringify(match, null, 2)}</pre>
            </details>
          </section>
        )}

        {player && (
          <section className="extraction-result extraction-player" aria-labelledby="player-heading">
            <div className="extraction-section-heading">
              <span>CHESS.COM PUBLIC DATA</span>
              <h2 id="player-heading">{player.displayName}</h2>
              <p>@{player.username}</p>
            </div>
            <div className="extraction-player__body">
              {player.avatar ? (
                <img src={player.avatar} alt={`${player.username} avatar`} />
              ) : (
                <div className="extraction-avatar-placeholder" aria-label="No public avatar">{player.username.slice(0, 1).toUpperCase()}</div>
              )}
              <dl className="extraction-player__facts">
                <div>
                  <dt>Bughouse rating</dt>
                  <dd>{player.bughouseRating ?? "Not published"}</dd>
                </div>
                <div>
                  <dt>Rating JSON path</dt>
                  <dd>{player.bughouseRatingPath ?? "Absent from public stats and current top 50"}</dd>
                </div>
              </dl>
            </div>
            <nav className="extraction-player__links" aria-label="Player data links">
              <a href={player.profileUrl} target="_blank" rel="noreferrer">Open Chess.com profile</a>
              <a href={player.archivesUrl} target="_blank" rel="noreferrer">Open public game archives</a>
            </nav>
          </section>
        )}
      </section>
    </main>
  );
}
