# SPEC — Guest Annotation + Public Commentary (MVP)

Drafted by Spec-Drafter [#2] against `main @ f8f43cd`. For Gate [#1] to slice into executor prompts.
Bias: **placeholder MVP** — every mechanism below is the cheapest that holds the shape; each stub names
what it defers. Nothing in this file is a ruling; contradictions with R-series rulings are bugs in this
file, not amendments.

Copy conventions used throughout:
- `[COPY-PLACEHOLDER:<id>]` — awaiting owner copy. Ship the marker string literally in MVP UI.
- Quoted strings marked **SHIPS VERBATIM** are owner copy — typos included, never edited (brand rule).
- All user-facing copy says **GAME** (R41). Internal names (`matchup`, etc.) unchanged.

Placeholder constants (single config module, one place to change):

| Constant | Placeholder value | Source |
|---|---|---|
| `FEED_LIST_SIZE` | 3 | R48 ("3 new games") |
| `FEED_WINDOW_MIN` | 30, widening ×2 per retry, cap 1440 | R48 (widen only if it cannot fill) |
| `COLLAPSE_THRESHOLD` | score ≤ −3 | R47 (value is placeholder) |
| `DAILY_NOTE_CAP` | 10 per guest_N per rolling 24h | R47 (value is open question §8) |
| `GUEST_TOKEN_BITS` / `SHARE_TOKEN_BITS` | 128 (hex) | — |

---

## 0. TCN-risk void clause

The stored-game bridge (§1.2) assumes the callback's `boards.*.moveList` ("TCN-style") is byte-compatible
with what `parse_tcn` reads as `tcn`. Gate [#1] Task 12 is verifying this. **This spec assumes it passes.**

If it fails, the following are **void**: §1.2 (bridge), §2 endpoints 3, 6–9 as they touch stored games,
§5 (two-copy save — nothing durable to anchor to), and build slices 3, 4, 6, 8 (and 7, which depends
on 4). The failure mode is silent — stored games replay wrong, every `move_token` points at the wrong
position permanently — so no slice in the void set may ship before Task 12 reports.
**Survives regardless:** guest counter (§1.1), wizard UI shell against the in-memory replay
(§3, slice 5), board shell (slice 2), entry feed (§3.0, slice 9).

---

## 1. Data model

Engine-neutral SQL below; adapt to whatever store the existing `games` layer uses (engine identity was
not in the kickoff — see report). Timestamps ISO-8601 UTC text. All writes fail closed: any missing or
unrecognized field → reject, never guess.

### 1.1 Guests (R42)

```sql
CREATE TABLE guests (
  n          INTEGER PRIMARY KEY AUTOINCREMENT,  -- guest_N; true arrival count
  token      TEXT NOT NULL UNIQUE,               -- 128-bit hex; httpOnly cookie value
  created_at TEXT NOT NULL
);
```

- Assigned on landing by the server (see §2, endpoint 1). The guest performs no action (R42's "no
  action, no write required" constrains the *user*, not the server).
- Monotonic, never reused. Numbers burned by bots/bouncers are accepted per R42 — no reclamation logic.
- Identity survives the R28 session reset: the cookie persists; only the STAGE session dies (R43).
- Collision: `token` UNIQUE violation → regenerate, retry (bounded, 3 attempts, then 500).
- User-facing label format: `guest_4,317` (thousands separator in copy only; integer everywhere else).
- DEFERRED: sign-up migration (account claims a guest's collection). Keep-forever (R43) exists to serve
  it; no schema needed now beyond `guests.n` being stable.

### 1.2 Stored-game bridge (the TCN-risk surface)

No new table. First note saved against a guest game persists that game into the **existing** games store
via pure **key renaming** (verified contract, do not re-derive):

| flat `raw_json` key (what the parser wants) | guest payload key |
|---|---|
| `tcn` | `boards.A.moveList` |
| `moveTimestamps` | `boards.A.moveTimestamps` |
| `bughousePartnerTcnMoves` | `boards.B.moveList` |
| `bughousePartnerMoveTimestamps` | `boards.B.moveTimestamps` |
| `bughousePlayer1Name` / `2Name` / `bughousePartnerPlayer1Name` / `2Name` | `match.seats` |
| top-level `end_time` + terminal `white`/`black` | `match.end_time`, `match.action`, `match.decisive_board` |

- Store with `pgn = ""` — `parse_game_data` (`pgn_parser.py:131`) reads `raw["tcn"]` when pgn is empty.
- Validate the mapped dict with the existing completion predicate (`game_completion.py` path:
  `end_time` positive + terminal `white`/`black`) **before** insert; on failure → 409, nothing written.
- Idempotent: insert-if-absent keyed on `game_id`. Concurrent first-savers both proceed; one insert wins,
  the other no-ops.
- After the bridge, `GameService.snapshot()` (`services.py:120`) serves the game with zero new parse code.

### 1.3 Notes — two independent tables, no FK between them (R45)

The public copy is frozen at save; the private copy is editable forever. They are separate rows in
separate tables with **no reference to each other** — no-sync is enforced by construction, not by policy.

```sql
CREATE TABLE notes_public (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_n       INTEGER NOT NULL REFERENCES guests(n),
  game_id       INTEGER NOT NULL,                 -- bridged stored game
  move_token    TEXT NOT NULL,                    -- ^[1-9][0-9]{0,3}[AaBb]$ ; opaque beyond regex
  glyph         TEXT NOT NULL CHECK (glyph IN ('!','?','!!','??','!?','?!')),
  alt_move_uci  TEXT NOT NULL,                    -- UCI incl. drop syntax (e.g. P@e4)
  alt_move_san  TEXT NOT NULL,                    -- derived once at save; display only
  body          TEXT NOT NULL DEFAULT '',         -- text after the locked "Because" opener; may be empty
  score         INTEGER NOT NULL DEFAULT 0,       -- denormalized SUM(votes.direction)
  hidden_by_player TEXT,                          -- seat name that hid it; NULL = visible (R47)
  created_at    TEXT NOT NULL,
  UNIQUE (guest_n, game_id, move_token)           -- R47: one note per position per guest
);
CREATE INDEX idx_np_board ON notes_public (score DESC, created_at DESC);
CREATE INDEX idx_np_game  ON notes_public (game_id);
CREATE INDEX idx_np_cap   ON notes_public (guest_n, created_at);

CREATE TABLE notes_private (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_n       INTEGER NOT NULL REFERENCES guests(n),
  share_token   TEXT NOT NULL UNIQUE,             -- 128-bit hex capability URL; read-only access
  game_id       INTEGER NOT NULL,                 -- immutable after create
  move_token    TEXT NOT NULL,                    -- immutable after create
  glyph         TEXT NOT NULL CHECK (glyph IN ('!','?','!!','??','!?','?!')),
  alt_move_uci  TEXT NOT NULL,
  alt_move_san  TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (guest_n, game_id, move_token)
);
```

- `notes_public` deliberately has no `updated_at`, no history table, no edited flag (R45: no edit
  history, no sync, no "edited" badge). There is no UPDATE code path for its content columns; only
  `score` and `hidden_by_player` are ever written after insert.
- **Keep forever (R43): no TTL, no sweep, no cascade from session teardown, anywhere.** The only
  deletions permitted in the entire feature: owner deletes a `notes_public` row by hand (§6).
- `move_token` is the moment address (`game_id` + `{moveNumber}{A|a|B|b}`). Stored verbatim; validated
  by regex plus a bounds check against the stored game's move count (fail closed 422 if the count can't
  be determined). Token semantics beyond that are the replay layer's business — this feature never
  decodes it.
- R29 alignment: one game + one position + featured player's move (implied by the token) + glyph + ONE
  alternative line + written note. "A few related lines" beyond one is DEFERRED (R44: no variations in
  MVP).
- Collision: UNIQUE violation on save → 409 `NOTE_EXISTS` (both copies rolled back; save is one
  transaction). `share_token` collision → regenerate as in §1.1.

### 1.4 Votes (R46)

```sql
CREATE TABLE votes (
  note_id    INTEGER NOT NULL REFERENCES notes_public(id) ON DELETE CASCADE,
  guest_n    INTEGER NOT NULL REFERENCES guests(n),
  direction  INTEGER NOT NULL CHECK (direction IN (-1, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (note_id, guest_n)
);
```

- One vote per guest per note; re-vote upserts (collision = overwrite direction); direction 0 via the
  API deletes the row.
- After any vote write, recompute: `score = COALESCE(SUM(direction), 0)` for that note. No triggers, no
  async — note volume is small at MVP scale. DEFERRED: incremental/cached scoring.
- Self-vote: **allowed** in MVP (no check). One line to add later if the owner objects.

---

## 2. API surface

All new routes under `/api/commentary/*` plus one guest route. JSON in/out; unknown body fields → 422;
no guest cookie where required → 401 `NO_GUEST`. Guest identity always from the httpOnly cookie, never
from the body.

**Reused, unchanged:**
- `GET /api/chesscom/matches/{game_id}/replay` (`main.py:204`) — wizard board source for live (in-memory)
  games.
- `POST /api/analysis` + `GET /api/analysis/{job_id}` — NOT used in MVP. DEFERRED: engine enrichment of
  moment views. If a later slice displays analysis, the frontend formats the score itself
  (`score_label` does not survive `asdict`): `mate_in` → "mate N", else `score_cp/100` to 2dp, else
  "unknown".

**New:**

| # | Method + path | Purpose |
|---|---|---|
| 1 | `POST /api/guests` | Landing assignment (R42) |
| 2 | `GET /api/commentary/feed` | Entry list (R48) |
| 3 | `POST /api/commentary/notes` | Wizard save — two-copy write (R44/R45) |
| 4 | `GET /api/commentary/notes` | Public board feed (R46) |
| 5 | `POST /api/commentary/notes/{id}/vote` | Vote (R46) |
| 6 | `GET /api/commentary/collection` | Guest's private flashcards (R45) |
| 7 | `PATCH /api/commentary/collection/{id}` | Edit private copy (R45) |
| 8 | `GET /api/commentary/shared/{share_token}` | Read-only shared card (R45) |
| 9 | `GET /api/commentary/games/{game_id}/replay` | Stored-game replay via `GameService.snapshot()` |
| 10 | `POST /api/commentary/notes/{id}/hide` | Featured-player hide (R47) — ships dark |

1. **`POST /api/guests`** — no body. No valid cookie: create guest row, set cookie, `201 {guest_n}`.
   Valid cookie: `200 {guest_n}` (idempotent). Called by the frontend on first load; the factoid
   ("you are guest_4,317" — `[COPY-PLACEHOLDER:FACTOID]` for exact phrasing) renders from the response.
   Placeholder surface for the factoid: DOCK **Info** sub-tab (Info is first per R34).
2. **`GET /api/commentary/feed?exclude=<csv of game_ids>`** — returns
   `200 {games:[{game_id, seats, end_time}...], window_minutes, exhausted}`. Up to `FEED_LIST_SIZE`
   completed GAMES from the last `FEED_WINDOW_MIN`, newest first, widening the window ×2 only while it
   cannot fill (R48), `exhausted:true` when the cap can't fill it. Never returns an id in `exclude`;
   the client accumulates every id it has ever shown into `exclude`, so "gimme more choices" (button
   label — **SHIPS VERBATIM**) never repeats a shown game. Worthiness heuristic: **placeholder = any
   completed game**; real heuristic DEFERRED. Nothing is asked of the user (R48).
3. **`POST /api/commentary/notes`** — body
   `{game_id:int, move_token:str, glyph:str, alt_move_uci:str, body:str}`.
   Validation order, fail closed at each step:
   cookie → shape → game known (stored, else fetchable from `replay_source()`) → bridge persist (§1.2,
   idempotent) → completion predicate → `move_token` regex + bounds → glyph enum → `alt_move_uci`
   syntax. Server-side move *legality* is NOT checked in MVP (the played-on-board input in §3 step 3 is
   the enforcement; this is a named trust gap, DEFERRED).
   Effects: derive `alt_move_san`; insert `notes_public` + `notes_private` in **one transaction**.
   `201 {note_id, private_id, share_token, guest_label}`.
   Errors: `401 NO_GUEST` · `404 GAME_UNKNOWN` · `409 GAME_NOT_COMPLETE` · `409 NOTE_EXISTS` ·
   `422` invalid token/glyph/uci/shape · `429 DAILY_CAP` (+ `Retry-After`) when the guest has
   `DAILY_NOTE_CAP` notes in the rolling window (checked against `idx_np_cap`).
4. **`GET /api/commentary/notes?limit=50&offset=0`** — board feed. Excludes rows where
   `hidden_by_player IS NOT NULL`. Sort is fixed: `score DESC, created_at DESC` (only sort in MVP).
   Items: `{id, guest_label, game_id, move_token, glyph, alt_move_san, body, score, created_at,
   collapsed, your_vote}` where `collapsed = score <= COLLAPSE_THRESHOLD` (server-computed) and
   `your_vote ∈ {-1,0,1}` from the caller's cookie. Pagination params exist; MVP UI does not page
   (DEFERRED).
5. **`POST /api/commentary/notes/{id}/vote`** — body `{direction: -1|0|1}` (0 clears). Upsert per §1.4,
   recompute score. `200 {score, your_vote}`. `401/404/422`.
6. **`GET /api/commentary/collection`** — caller's private cards, `updated_at DESC`.
   `200 {cards:[...]}` (full card shape incl. `share_token`). `401`.
7. **`PATCH /api/commentary/collection/{id}`** — body: any of `{glyph, alt_move_uci, body}`.
   Immutable: `game_id`, `move_token`, `share_token`, `created_at`. Sets `updated_at`. **There is no
   code path from this handler to `notes_public`** (R45). `200` card · `401` · `403 NOT_YOURS` ·
   `404` · `422`. Edited `alt_move_uci` re-derives SAN; same syntax-only validation as save.
8. **`GET /api/commentary/shared/{share_token}`** — no auth; capability URL. `200 {card, game_id,
   move_token}` read-only · `404`. No enumeration risk at 128 bits. Room-invite review (R45) rides on
   this token via the existing invite/collab surface (R28) — integration DEFERRED; mechanics were not
   in the kickoff (see report).
9. **`GET /api/commentary/games/{game_id}/replay`** — serves bridged stored games via
   `GameService.snapshot()`. `200` snapshot · `404 NOT_STORED`. If the repo already exposes a
   stored-game replay route, **reuse it and delete this row** (repo wins; none was named in the
   kickoff).
10. **`POST /api/commentary/notes/{id}/hide`** — sets `hidden_by_player` when the caller is the
    connected FEATURED PLAYER of that note's game. MVP stub: **always `403 FORBIDDEN`** — the endpoint
    ships dark until account-connection exists (mechanism not in kickoff; see report). No unhide in MVP
    (DEFERRED). `200 {hidden:true}` once live.

---

## 3. The wizard (R44)

Lives on the STAGE (one primary task). Fiverr-style locked stems: each step is a fixed sentence with
exactly ONE blank; no skipping, no reordering, no early submit. The step's Next control renders locked
(R5: inert + `aria-hidden`, visibly present, never `display:none`) until the blank is filled. Keyboard
first throughout. UI reference is the lichess study annotation module — **AGPL-3.0: reimplement
patterns, never paste code** (R29).

Draft lifetime: in-memory only. Leaving the wizard discards the draft (survives step navigation, not
navigation away). Whether the R28 5:00 countdown runs during the wizard is open question §8-Q2; until
answered, build the wizard countdown-agnostic.

### 3.0 Entry (R48)

Autopopulated list of `FEED_LIST_SIZE` worthy GAMES from endpoint 2. **Nothing is asked of the user** —
the list is just there. Each row: seats + relative end time; selecting a row opens the wizard on that
game. Below the list, two controls:
- Button "gimme more choices" — **SHIPS VERBATIM** — replaces the list via endpoint 2 with accumulated
  `exclude`; never repeats a shown game. When `exhausted:true`: `[COPY-PLACEHOLDER:FEED-EXHAUSTED]`.
- Link "why can't I review my own game instead?" — **SHIPS VERBATIM** — opens **FAQ-1**, an instance of
  the REUSABLE FAQ card component: props `{question, answer}`, question rendered in the user's voice,
  answer in Jimmy's. FAQ-1 body: 160-char lorem ipsum placeholder (per R48, literal lorem).

### 3.1 Step 1 — pick the move

- On screen: board replay + move list for the chosen GAME; the step stem `[COPY-PLACEHOLDER:S1]`; steps
  2–4 chrome visible but locked (inert + a11y-hidden, R5). **Nothing else is interactive until a move
  is selected.**
- Input: click a move in the list or navigate the replay; selection = a concrete move token
  (`{moveNumber}{A|a|B|b}`).
- Keyboard: `←`/`→` step through moves; `Enter` selects the current move.
- Blocks advancing: no move selected. Back path: exit to the entry list (draft discarded — first step).

### 3.2 Step 2 — glyph (REQUIRED)

- On screen: chosen position pinned on the board (board now inert); stem `[COPY-PLACEHOLDER:S2]` with
  the glyph blank.
- Input: number keys map lichess NAGs — `1=!` `2=?` `3=!!` `4=??` `5=!?` `6=?!`; dropdown fallback for
  mouse users. Exactly these six; no "none" option (glyph is required).
- Blocks advancing: no glyph. Back: to step 1, selection retained.

### 3.3 Step 3 — one alternative move, played not typed

- Stem — owner copy, **SHIPS VERBATIM, typos included**:
  > "Interesting move for sure! Next you're required to give one relevant alternative move. Relax don't
  > overthink it you're halfway done."
- On screen: the board unlocks in move-entry mode at the selected position. The user PLAYS one legal
  move on the board — there is no text input for this step, ever.
- Exactly ONE: playing a second move replaces the first (visibly, board resets to the position with the
  new move shown). No variations, no continuation moves (R44 MVP).
- Keyboard: arrow-key square cursor + `Enter` to pick origin then destination (legal targets only);
  mouse drag/click also accepted. Drops (bughouse) enter via the piece tray with the same
  cursor+`Enter` pattern.
- Blocks advancing: no legal move played. Back: to step 2, glyph retained; a played alternative is
  retained too.

### 3.4 Step 4 — because

- On screen: locked opener **"Because"** (inert stem, not editable, not deletable) followed by a free
  text field. Stem framing copy `[COPY-PLACEHOLDER:S4]`.
- No minimum length — empty is a valid submission; the stored `body` is only the user's text (the
  opener is chrome, re-rendered on every display).
- Submit = save (§5). Back: to step 3, text retained.
- After save: confirmation `[COPY-PLACEHOLDER:SAVED]` showing the public note landed on the board, the
  private flashcard landed in the collection, and the share link. Then return to entry list.

Keyboard summary: `←/→` (move nav, step 1) · `Enter` (select/confirm) · `1–6` (glyphs, step 2) ·
arrows+`Enter` (move entry, step 3) · `Esc` (back one step; on step 1, exit). Locked stems are never in
the tab order (inert).

---

## 4. The public notes board (R46)

- **Reached by:** a RAIL button beside the easel. Icon `[COPY-PLACEHOLDER:RAIL-ICON]` (asset TBD —
  never a lichess/chess.com asset). Unlocked whenever the RAIL is interactive and guest assignment has
  completed; in locked-chrome contexts (R5/R34) it renders inert + a11y-hidden and visibly present,
  exactly like every other locked control — never hidden.
- **Scope (MVP):** ONE global board across all GAMES. Per-game boards are open question §8-Q1.
- **Layout:** reddit-style rows, opened on the STAGE. Each row: vote block (▲ score ▼) · glyph chip ·
  `GAME #<id> · move <token>` · `guest_4,317` · "Because <body>" preview (first ~140 chars) · relative
  time. Clicking a row opens the **moment view**: stored replay (endpoint 9) at the token's position
  with the full note; the alternative move renders as SAN text (board-arrow overlay DEFERRED).
- **Sort:** `score DESC, created_at DESC`. Fixed; no sort picker in MVP.
- **Votes:** ▲/▼ toggle (click again to clear). Optimistic UI, reconciled from the vote response.
  Keyboard: `↑/↓` moves row focus, `u`/`d` vote (bindings are placeholder).
- **Collapse (R47):** a row with `collapsed:true` renders as a single line —
  `[COPY-PLACEHOLDER:COLLAPSED]` (e.g. "collapsed — score −4") — expanding on click/`Enter` for that
  visit only. Nothing is deleted; collapse is pure presentation.
- **Empty state:** `[COPY-PLACEHOLDER:BOARD-EMPTY]` on the FAQ card component (reuse, zero new chrome).
- Hidden-by-player and owner-deleted notes simply never arrive (server-filtered, §2 endpoint 4).

---

## 5. The two-copy save (R45)

One transaction at wizard submit writes both rows:

| | PUBLIC copy (`notes_public`) | PRIVATE flashcard (`notes_private`) |
|---|---|---|
| Frozen at save | **Yes — forever.** No update path exists for content. | No — `glyph`, `alt_move`, `body` editable forever |
| Immutable fields | all content | `game_id`, `move_token`, `share_token`, `created_at` |
| Can be published | is the published copy | **Never** — no path from private to public |
| Deletable | owner by hand only (§6) | **No delete in MVP** (DEFERRED) |
| Visible on board | yes (unless hidden/deleted) | never |
| Shareable | via the board | read-only capability link (`share_token`) |
| Reviewable via room invite | — | yes, DEFERRED — rides the share link through the existing invite/collab surface |

Editing the private copy never mutates the public one — enforced by construction (§1.3: separate tables,
no FK, no sync code). No edit history, no "edited" badge, no diff view, anywhere.

---

## 6. Moderation (R47 — deliberately minimal)

- **No word filter.** None. Not a stub, not a TODO — its absence is the design.
- **Score collapse:** `COLLAPSE_THRESHOLD` constant; computed at read time (§2-4); presentation only
  (§4).
- **Featured-player hide:** endpoint 10, ships dark (403 until account-connection exists). When live:
  sets `hidden_by_player`, note vanishes from the board feed; the author's private flashcard is
  untouched. What the author sees of their hidden public copy is open question §8-Q3.
- **Rate limits:** (a) one note per position per guest — the UNIQUE constraint, surfaced as
  `409 NOTE_EXISTS` with `[COPY-PLACEHOLDER:DUPLICATE]`; (b) `DAILY_NOTE_CAP` per guest_N —
  `429 DAILY_CAP` with `[COPY-PLACEHOLDER:CAP]`.
- **Owner delete:** by hand, literally — a manual row `DELETE` on `notes_public` (votes cascade). No
  admin endpoint, no admin UI in MVP. Document the one-liner in ops notes when the slice lands. This is
  the sole deletion in the feature; R43's keep-forever bars TTL/sweep, not the owner's hand.

---

## 7. Build order

Independently shippable slices, smallest first. ⚠ = blocked on the TCN risk (§0): do not ship before
Task 12 reports.

1. **Guest counter** — endpoint 1 + cookie + factoid in DOCK Info. *See: a fresh browser says "you are
   guest_N"; a second tab keeps the same N.*
2. **Board shell** — RAIL button (locked + unlocked states) + empty board + FAQ-card empty state. *See:
   the button beside the easel opens an empty notes board.*
3. ⚠ **Storage bridge** — §1.2 + endpoint 9. *See: a guest GAME replays identically from storage after
   a backend restart.*
4. ⚠ **Notes core** — §1.3 tables + endpoints 3 (curl-only) and 4; board lists real rows. *See: a
   hand-seeded note appears on the board with glyph, token, and body.*
5. **Wizard steps 1–2** — entry via direct game URL (feed is slice 9); in-memory draft. *See: pick a
   move, pick a glyph by number key, watch Next unlock.*
6. ⚠ **Wizard 3–4 + two-copy save** — played-move input, verbatim step-3 copy, transaction, duplicate
   409. *See: a full annotation lands on the public board.*
7. ⚠ **Votes + sort + collapse** — endpoint 5 + §4 vote UI. *(depends on 4)* *See: arrows reorder the
   board; a sunk note collapses behind a click.*
8. ⚠ **Private collection** — endpoints 6/7/8 + collection view + share link. *See: edit the private
   card; the public copy provably does not change; the share URL opens read-only.*
9. **Entry feed** — endpoint 2 + §3.0 + FAQ card component + FAQ-1. *See: three GAMES appear unasked;
   "gimme more choices" never repeats; the FAQ card opens.*
10. **Moderation levers** — daily cap (429 surfaced) + hide endpoint dark + owner-delete ops note.
    *See: the (CAP+1)th note of the day is refused with the cap copy.*

Slices 1, 2, 5, 9 are safe to run in parallel with Task 12. If Task 12 fails, §0 lists what dies.

---

## 8. Open questions for the owner

1. **Board scope:** one global notes board sorted by score, or a per-game board opened from each GAME?
   (R46 does not say; MVP builds global.)
2. **Countdown:** does the R28 5:00 clock keep running during the annotation wizard (reset discards the
   draft), or is the wizard exempt from the session reset?
3. **Hidden-note author view:** when the featured player hides a note, does the author see it marked
   "hidden" in their collection, or does the public copy silently vanish for everyone including the
   author?
4. **Daily cap:** `DAILY_NOTE_CAP` — 5 or 10 notes per guest per day?
