# Extraction Lab handoff

This is the cold-start brief for any future AI thread continuing the standalone `/extraction` lab. Read [`PROJECT-STATE.md`](./PROJECT-STATE.md) first: it is the canonical rulings record. This handoff points to those rulings and the lab's evidence; it does not restate the project-wide decision log.

## Current surface

`/extraction` is a standalone, keyboard-first frontend route titled **Data Extraction & UI Element Gathering.** It does not render inside the main application shell and uses only styles scoped under `.extraction-page`.

Its primary input accepts:

1. A Chess.com live-game URL, for example `https://www.chess.com/game/live/180443871315`.
2. A positive numeric game ID, for example `180443871315`.
3. A Bughouse Viewer URL, for example `https://bmacho.github.io/bughouse-viewer/view.html?game_id=180443871315&move=23b`.
4. A Chess.com username, restricted at request time to 2–25 letters, numbers, underscores, or hyphens.
5. A standalone canonical move token after a match is loaded, for example `23b`.

The page also supports direct moment links:

```text
/extraction?game={positiveNumericId}&move={canonicalMoveToken}
```

A valid `game` query parameter loads the normalized match. A valid `move` parameter pre-fills the moment field. An invalid move reports an inline error without preventing a valid game from loading.

## Match extraction and labels

Game inputs call the existing read-only route:

```text
GET /api/chesscom/matches/{gameId}
```

The extraction client validates the complete normalized response before rendering. Its current contract contains:

- board IDs A and B;
- four named/rated seats: A-white, A-black, B-white, B-black;
- board A and B ply counts;
- decisive board;
- loser seat;
- structured action: `checkmated`, `resigned`, `flagged`, or `abandoned`;
- highest-rated player's name, rating, seat, and `WON`/`LOST` outcome;
- loser seat relative to the highest-rated player: `oppo`, `partner`, `diag oppo`, or null when the highest-rated player is the loser.

The block-5 label is rendered without literal brackets:

```text
{highest-rated}({rating}) WON|LOST — {relative-seat-if-any} {action}
```

Example:

```text
vjbaker(2799) LOST — partner checkmated
```

Team pairing is fixed as A-white + B-black versus A-black + B-white. The page shows the block-5 card, two team groups, four seats and ratings, decisive board, loser seat, action, both ply counts, both numeric IDs, and the complete normalized JSON in a collapsed disclosure.

All malformed JSON, unknown enumerated values, HTTP failures, and network failures fail closed with readable inline messages. No result is derived by parsing free-form `resultMessage` text.

## Username extraction and source labels

Username input performs these public, browser-side requests sequentially:

```text
GET https://api.chess.com/pub/player/{username}
GET https://api.chess.com/pub/player/{username}/stats
GET https://api.chess.com/pub/leaderboards
```

The page renders the public name, username, avatar when present, profile link, archives link, and Bughouse rating. The standing rating rule is:

- Bughouse rating is public only when the player is present in the top-50 leaderboard at `live_bughouse[].score`.
- The UI labels the source exactly as `live_bughouse[].score`.
- If the username is valid but absent from that list, display **Not published**. Do not infer a rating from archives, normalized matches, or other game data.
- `/stats` is still fetched and shape-checked because it is part of the profile showcase, but verified live responses do not expose a Bughouse rating.

The PubAPI endpoints are CORS-readable in browser JavaScript. A 404 profile is labeled `Chess.com could not find that username.` Other response/shape/network failures fail closed.

## Moment addressing: strict application rule

The lab accepts only this whole-token grammar:

```text
^[1-9]\d*[AaBb]$
```

Semantics:

- `A`: White's numbered move on board A.
- `a`: Black's numbered move on board A.
- `B`: White's numbered move on board B.
- `b`: Black's numbered move on board B.

Thus `23b` addresses the position after Black's 23rd move on board B.

This strict application grammar is intentionally narrower than the audited viewer implementation. The viewer uses an unanchored `/(\d+)([aAbB])/` search and therefore accidentally accepts prefixes, suffixes, leading zeroes, and move zero; its comments incorrectly suggest dotted forms work. The lab rejects `x23b`, `23b-extra`, `00023b`, `0b`, `23.b`, and unknown letters. Do not loosen this rule to imitate viewer edge cases.

For a loaded game, the moment builder displays:

```text
/extraction?game={loadedGameId}&move={token}
```

The read-only field is manually copyable, and the Copy button writes the corresponding absolute URL to the clipboard.

## Evidence map

Use these reports instead of relying on memory:

- [`bughouse-viewer-audit.md`](./bughouse-viewer-audit.md): license audit, Chess.com callback/proxy requests, explicit partner UUID linkage, real response field inventory, generated BPGN behavior, endpoint/CORS risk, and Fairy-Stockfish feasibility assessment.
- [`moment-addressing-engine-handoff.md`](./moment-addressing-engine-handoff.md): exact move-address parsing/application, BFEN grammar, Online Drophouse handoff contract, Chess.com games-row anatomy, and the original strict extraction parser ruling.
- [`extraction-showcase.md`](./extraction-showcase.md): B3 implementation contract, username rating-source finding, failure behavior, live browser walk, build/test output, and integration assumptions.
- [`PROJECT-STATE.md`](./PROJECT-STATE.md): canonical product rulings and current cross-thread state. Do not copy its decision table into a successor report; link to it.

## License and reuse boundaries

- `hy.js` is MIT-licensed. Covered code may be used, copied, modified, merged, published, distributed, sublicensed, and sold only while preserving its copyright and permission notice in copies or substantial portions.
- The repository has no root license granting those terms to the top-level ingestion and reconstruction glue (`view.html`, `chesscom_movelist_parse.js`, `generate_bpgn.js`). Treat that code as techniques-only unless the owner supplies an explicit license.
- Viewer piece graphics and other assets have unclear provenance. Never copy them.
- Chess.com assets, icons, palettes, glyphs, sounds, CSS, and markup are not part of this lab. Structural observations may inform an original implementation; assets and skin may not be copied.
- The current extraction implementation was written independently and contains no viewer code or assets.

## Deliberately not built

Do not imply that the lab currently has position data. These capabilities are deferred:

- **TCN/move-list decoding:** normalized matches expose metadata, not decoded positions. The audited top-level decoder is not licensed for reuse, so any decoder must be an independent implementation backed by fixtures and provenance-aware tests.
- **Board rendering:** without a verified decoder and position sequence, a board would be fabricated or misleading.
- **BFEN generation:** BFEN serialization is meaningful only after the exact selected board position, pockets, promoted markers, and side-to-move are known. `hy.js` contains an MIT-covered reference technique, but no serializer should be wired to invented data.
- **Engine link-out:** Online Drophouse accepts single-board Crazyhouse BFEN, not a coupled Bughouse state. Do not add the link until a real selected position can be serialized. Preserve third-party labeling and a non-fatal fallback when it is eventually added.
- **BPGN export:** the viewer reconstructs inter-board order from clocks and uses top-level techniques-only glue. Export requires an independently implemented decoder/interleaver and explicit confidence/ordering rules.
- **In-browser or server engine installation:** explicitly outside this lab's current scope and license/bundle decisions.

## Task 4b dependency

The match showcase intentionally depends on the parallel Task 4b backend merge. That work supplies `GET /api/chesscom/matches/{gameId}` and the normalized shape consumed here. The B3 browser walk used that route read-only from the Task 4b worktree.

Until Task 4b is merged into the branch containing the lab, game extraction will show a closed, readable failure. Do not work around the dependency with the unaffiliated Worker, direct browser calls to Chess.com's CORS-blocked callback, guessed partner IDs, fixtures in production, or frontend reconstruction. Once 4b lands, re-run the live URL, numeric-ID, and query-param browser checks against the integrated route.

The Vite development configuration already proxies `/api` to `http://127.0.0.1:8000`; B3 required no config change.

## Successor write scope

A successor extraction-lab thread may write only:

```text
frontend/src/ExtractionPage.tsx
frontend/src/ExtractionPage.css
frontend/src/ExtractionPage.test.tsx
frontend/src/extractionInput.ts
frontend/src/extractionData.ts
other new modules/tests used exclusively by /extraction
scratch/
docs/
```

It must not modify main-app files, `main.tsx`, `App.tsx`, `AppShell.tsx`, anything under `components/`, the Zustand store, sockets, query mutations, shared `styles.css`, backend files, or dependencies. A future task must explicitly broaden scope before touching any of those surfaces.

Continue to keep scratch clones and downloaded inspection packages out of commits and the dependency tree. Do not publish, push, merge, or commit unless the task explicitly authorizes it.
