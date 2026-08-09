# Extraction showcase — Task B3 report

Verification date: 2026-08-09 (America/Los_Angeles)

## Delivered behavior

The standalone `/extraction` page now performs three frontend-only extraction flows.

### Normalized match flow

A Chess.com live-game URL, audited viewer URL, or positive numeric game ID issues:

```text
GET /api/chesscom/matches/{gameId}
Accept: application/json
```

The response is shape-checked in the extraction-only client before rendering. The page fails closed if any required game ID, seat, rating, ply count, decisive-board value, loser seat, action, highest-rated player, outcome, or relative-seat value is absent or outside the normalized contract.

The rendered collection contains:

- the block-5 summary without literal brackets: `vjbaker(2799) LOST — partner checkmated`;
- Team 1 as A-white + B-black and Team 2 as A-black + B-white;
- all four player names, ratings, and seat labels;
- decisive board, loser seat, and structured action;
- board A and B ply counts;
- both numeric board IDs;
- the complete normalized response in a collapsed `<details>` section.

The page does not parse free-form result text. It renders the backend's structured normalized fields.

### Moment-address flow

The accepted whole-token grammar is:

```text
^[1-9]\d*[AaBb]$
```

For a loaded game, `23b` produces:

```text
/extraction?game=180443871315&move=23b
```

The URL is displayed in a read-only input and can be copied as an absolute URL. The page rejects the permissive edge cases found in the viewer audit, including dotted forms, embedded substrings, suffixes, zero, and leading zeroes (`23.b`, `x23b`, `23b-extra`, `0b`, `00023b`).

On direct navigation, a positive `game` query parameter loads the match. A canonical `move` parameter pre-fills the moment field. An invalid `move` reports an inline grammar error but does not prevent the valid game ID from loading.

### Public username flow

The browser makes sequential public requests to:

```text
GET https://api.chess.com/pub/player/{username}
GET https://api.chess.com/pub/player/{username}/stats
GET https://api.chess.com/pub/leaderboards
```

The first two calls are the required profile and stats reads. The leaderboard call is necessary for a currently published Bughouse rating: sampled live `/stats` responses did not contain a Bughouse object, while the documented leaderboard payload exposes the current top-50 Bughouse rating at:

```text
live_bughouse[].score
```

The `/stats` response is still fetched and shape-checked as requested, but it did not expose a Bughouse stats object in live samples. The client therefore looks for the same username under `live_bughouse[]` and uses `score`. The page displays that JSON path. If the leaderboard does not contain the player, it says `Not published` rather than inventing or inferring a rating.

For `vjbaker`, the live browser result was:

```text
Name: Vincent Baker
Username: vjbaker
Bughouse rating: 2799
Rating JSON path: live_bughouse[].score
Archives: https://api.chess.com/pub/player/vjbaker/games/archives
```

An avatar is rendered only when the profile response contains one; otherwise the page uses a text placeholder. A public profile link and public archives link are included. Usernames are locally restricted to 2–25 letters, numbers, underscores, or hyphens. A live unknown-user check returned the clean inline message `Chess.com could not find that username.`

Chess.com's profile, stats, and leaderboard responses returned `access-control-allow-origin: *`. The complete username path also succeeded from the page running at `http://127.0.0.1:5173`, verifying browser CORS rather than inferring it. Chess.com's official PubAPI documentation describes the API as read-only, documents the profile/stats/archive endpoints, and warns that parallel requests may be rate-limited; the extraction client therefore performs its public requests serially: [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).

## Failure and loading behavior

- Match and player requests have separate visible loading states.
- HTTP error bodies are reduced to a readable `message` or FastAPI `detail.message`/`detail` string.
- A 404 profile response maps to the specific unknown-username message.
- Network failures have endpoint-specific readable messages.
- An unexpected match, profile, or leaderboard JSON shape is rejected rather than partially rendered.
- Starting one flow invalidates an older in-flight request from the other flow so a late response cannot replace the newer result.

## Scope and integration facts

- Changed application files are limited to `ExtractionPage.tsx`, `ExtractionPage.css`, `ExtractionPage.test.tsx`, `extractionInput.ts`, and the new extraction-only `extractionData.ts` module.
- No backend or main-app source file was modified.
- Vite already had a development proxy entry for `/api` targeting `http://127.0.0.1:8000`; no config edit was needed.
- Browser match verification used the read-only `GET /api/chesscom/matches/{id}` implementation in the parallel Task 4b worktree. That backend change is not part of this branch and must land before this branch can resolve live matches by itself.
- No dependency was added.
- No TCN/move-list decoding, board rendering, BFEN, engine handoff, BPGN, or fabricated position data was added.

## Browser walk

All checks used the actual local page and live endpoints rather than mocked browser data.

1. **Game URL:** submitting `https://www.chess.com/game/live/180443871315` rendered `vjbaker(2799) LOST — partner checkmated`, both team pairings, four seats, board B as decisive, `B-black` as loser, `checkmated`, 71/81 plies, and IDs `180443871315`/`180443871317`.
2. **Numeric ID:** submitting `180443871315` rendered the same normalized match card.
3. **Username:** submitting `vjbaker` rendered Vincent Baker, rating 2799 sourced from `live_bughouse[].score`, the no-avatar placeholder returned by the current profile payload, and profile/archive links. Submitting `no_such_user_zz98765` rendered the expected inline unknown-user error.
4. **Moment builder:** `23.b` was rejected; `23b` produced `/extraction?game=180443871315&move=23b`, and the Copy action reported `Copied shareable URL.`
5. **Query-param load:** direct navigation to `/extraction?game=180443871315&move=23b` loaded the match and pre-filled `23b`.
6. **Main app regression check:** direct navigation to `/` still rendered the existing `Jimmy App onboarding map`, including Start, Analyze a game, Learning library, locked partner-board instructions, and legal links.

## Verification output

```text
$ pnpm test
Test Files  19 passed (19)
Tests       72 passed (72)

$ pnpm run lint
$ eslint .

$ pnpm run build
$ tsc -b && vite build --configLoader runner
vite v6.4.3 building for production...
✓ 1654 modules transformed.
dist/index.html                   0.48 kB │ gzip:   0.32 kB
dist/assets/index-DNOsv6IG.css   76.08 kB │ gzip:  16.18 kB
dist/assets/index-DvwM_gfq.js   376.86 kB │ gzip: 114.14 kB
✓ built in 1.83s
```

## Assumptions and limitations

These are interpretations, not upstream guarantees:

1. `live_bughouse[].score` is factual for players currently present in the public top-50 leaderboard, but it cannot provide a rating for every valid username. `Not published` means only that the public leaderboard did not expose the value; it does not mean the player is unrated.
2. The public API can be stale because Chess.com caches its published data. The page makes no claim that a displayed rating matches an immediately completed game.
3. The extraction branch currently assumes Task 4b's normalized match route will be integrated unchanged. Runtime shape validation will fail closed if that contract changes.
