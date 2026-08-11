# thejimmyapp — PROJECT STATE
Maintained by Claude (manager/filter). Updated at each review gate. Last update: 2026-08-10 (Claude Gate [#1]).
Drop this file in the repo at `docs/PROJECT-STATE.md`. It is the canonical decision record.

## Operating model
- **Ryan** — owner. Routes messages between threads. Makes product decisions.
- **Claude** — manager/filter/state-holder ("Claude Gate [#1]", Opus 5 / High). Reviews all Codex reports before new tasks go out. Writes all Codex prompts. Maintains this file and docs/START-HERE.md.
- **Counsel** — a MODE of the gate thread, not a session (separate Counsel session retired 2026-08-10). Ritual: gate flags a Counsel-tier decision → owner flips picker to Fable 5 / Extra and says "deliberate" → gate returns verdict + mandatory dissent + falsifiers in-thread and logs the outcome as a ruling. Constitution: docs/COUNSEL-KICKOFF.md.
- **Codex Thread A ("general")** — executor: app shell, funnel, backend.
- **Codex Thread B ("scraping")** — executor: `/extraction` page + research. Write scope: `/extraction` files, `scratch/`, `docs/`. NEVER main-app files.
- **Claude support agent** — independent verifier (audited bughouse-viewer; baseline for cross-checks).

### Protocol (standing rules)
1. One task per prompt, one deliverable. One in-flight task per thread.
2. Recon before diff on anything structural.
3. Every prompt states explicit out-of-scope ("do not touch") lists.
4. Fixed vocabulary: RAIL / STAGE / DOCK; building-blocks block numbers; seat terms (below).
5. No self-reported completion — reports separate facts (verified) from assumptions.
6. Reports come to Claude before any new prompt goes out. Label every paste with thread name.
7. Codex never receives Claude's analysis prose — only the quoted prompt blocks.
8. No commit/merge/publish without explicit green light.

## Product vision
Bughouse game-review app. Landing page: ONE obvious action (keyboard-only onboarding).
Everything else visible but locked; features un-grey as users complete milestones (capability map).
Funnel: guest browses strong players' recent matches (low ego-load) → username path → personal
archive → pre-selected game review → growing collection of self-saved tactical flashcards.
Look: chess.com-familiar skeleton, own skin (dark navy + cyan). Blocks catalog: building-blocks.html
(11 blocks — canonical UI vocabulary, registered with both threads).

## Zones
- **RAIL** — persistent left icon column. Contents: brand/home, mode switcher (review/stats), map,
  board settings, chess.com connect, bottom cluster; legal behind overflow chevron only.
- **STAGE** — center canvas, exactly one primary task.
- **DOCK** — right tabbed panel (Analysis/New Game/Games/Players; sub-tabs Moves/Partner/Info/Openings).

## Decision log (rulings)
| # | Ruling |
|---|---|
| R1 | STAGE holds only the current primary task; all else RAIL or DOCK. |
| R2 | Sub-992px guard page: KEEP (not extraneous UI). |
| R3 | Modal stays blocking ONLY if proceeding without a decision yields a wrong result (analysis acknowledgement qualifies; settings/connect do not — they are DOCK panels). |
| R4 | Statistics = STAGE mode selected from RAIL (mutually exclusive with review). |
| R5 | Onboarding: RAIL + DOCK render in LOCKED state (inert, a11y-hidden) — amended from "hidden". Locked is a first-class state. |
| R6 | Board B = DOCK "Partner" tab (chess.com convention; status quo). |
| R7 | Onboarding is keyboard-only: two nodes (Guest Spawn default-focused, username input), arrows + Enter, focus-trapped, zero pointer targets. Only exits: type or close tab. No Esc handler specced. |
| R8 | Build order: guest pipeline first, username path second. (User-facing: both nodes visible day one.) |
| R9 | Username failure: live validation + close-match suggestions; suggestion dictionary = player-name corpus collected by guest pipeline. |
| R10 | First unlock on entering first review: Moves tab ONLY. |
| R11 | Username path's first unlock target: one pre-selected game review. v1 picker heuristic: most recent completed bughouse win — deliberately dumb; "legitimate victory" ranking deferred. |
| R12 | Skin: one dedicated task AFTER funnel works. Tokens in block 11 are the contract (swap values, not components). |
| R13 | chess.com imitation: skeleton yes, assets no (icons/palette/graphics never copied). Viewer piece graphics: rights unknown — never touch. |
| R14 | Card format brackets are spec delimiters, NOT rendered characters. |
| R15 | Guest list filter: plyCount ≥ 20 on EACH board ("10 moves" = 10 full moves). Draws/repetition excluded silently. Unknown result codes: exclude, fail closed. |
| R16 | Card: `{highest-rated}({rating}) WON|LOST — {seat} {action}`. Seat = loser of decisive board, relative to highest-rated player: oppo / partner / diag oppo / omitted-if-self. Actions from structured codes only (checkmated/resigned/timeout→flagged/abandoned). NEVER parse resultMessage. |
| R17 | Rating tie-break: winning team first, then A-white, A-black, B-white, B-black. |
| R18 | Proxy = route on existing backend (not third-party Worker). Requirements: timeouts, fail-closed shape validation, cache, kill switch, sequential upstream requests. |
| R19 | Queue Engine: locked. v0 = link-out to external drop-chess site with BFEN. WASM Fairy-Stockfish deferred (GPL-3.0 obligations + COOP/COEP headers site-wide). |
| R20 | bughouse-viewer code reuse: hy.js subdirectory is MIT (reusable with notice, incl. BFEN serializer); top-level glue (view.html, TCN decoder, BPGN generator) = techniques only, reimplement. |
| R21 | AMENDED 2026-08-09: continuous deploys — push + deploy regularly after each merge; showing work-in-progress is desired ("link and show off"), forgetting-to-finish is the real fear (mitigated by this ledger). Original 4c gate voided. Deploy pipeline recon needed (domain issues in output/handoffs unresolved). |
| R23 | Guest-list sampling: curated "players of interest" config list (Ryan supplies usernames) with per-player cap of 2; leaderboard top-50 as fallback seed. Friend-list-as-source = recon item (public API likely lacks friends endpoint — verify, don't assume). |
| R24 | Placeholder mockups (engine eval card, flashcard card, future modules): literal screenshots, clearly labeled temporary, living on the building-blocks page until replaced by real components. Building-blocks page ports into the repo as a linkable public page (Bv2 task). Screenshot specimens never migrate into app components. |
| R25 | (provisional) Username-path rating display: derive from the player's own most recent game headers, labeled "as of last game" — revisit at Task 5; question didn't land with Ryan, decided by default. |

## Rulings R26–R31 (2026-08-10, from Jimmy feedback session)
| # | Ruling |
|---|---|
| R26 | Featured player's board always renders as Board A, oriented to their perspective (featured player at bottom regardless of color). |
| R27 | With Partner board concealed, ArrowRight advances the GLOBAL interleaved timeline (hidden board progresses too); Tab toggles which board arrow keys drive, with visible focus highlight. |
| R28 | Quest = "negative accessibility" soft gate: guest freely views suggested games (+refresh for 5 more); a dedicated DOCK TAB shows a 5:00 countdown + 0/3 moment progress + plain-language logic ("this tab-slot unlocks on quest completion; Jimmy is a real person, not charging money"). Understated/concealable but timer visible at tab top. Guest session is ephemeral: at 0:00 everything resets; room invitees are told "everything resets in mm:ss — help guest_1 complete their quest." ASSUMPTION to confirm: completing the quest persists the session (stops the nuke). |
| R29 | Learning-moment data model (lichess-study-derived): ONE game + ONE position + the featured player's move + annotation glyph (?!/! lichess-style) + a few related lines/combinations + written note (what it does, why it stood out). UI reference: lichess study annotation module. |
| R30 | Dock typography: globally increase scale ("zoom in for the user"). |
| R31 | Hide until later unlock: Fairy-Stockfish button + Team Coach launcher. Invite/collab STAYS visible (it's part of the quest design per R28). |
| ⚠ | LICENSE WARNING attached to R29: lichess is AGPL-3.0. Design patterns and reference excerpts in the specimen library = fine. Verbatim lichess code in the app = AGPL contamination (stronger than GPL — network use triggers source obligations). Reimplement, never paste. |

## Rulings R32–R33 (2026-08-10, word-vertigo feature)
| # | Ruling |
|---|---|
| R32 | The entry screen's right node is repurposed as the **word-vertigo bluff card** (not a real sign-in). The real username funnel relocates to a later unlock (placement TBD). Owner-directed, shipped exactly as written including copy that mocks the user. |
| R33 | Word-vertigo spec: first typed character → obscure word from `docs/word-vertigo-content.json` (Claude-authored; owner's "anhemabiaophoia" = A slot + fallback) → blurb typewriter-reveals at 0.4x; clicking the text cycles speed 0.4→0.6→0.75→1.9→(back to 0.4), advancing per click mod 4. During the sequence: rest of page inert + greyed; card slowly scales UP while the rest of the site scales DOWN (deliberate vertigo). Right-dock "microwave" countdown 01:30 gates retry; refresh/leave resets it to full 01:30 by design (no persistence); visible "start over" button. Two fake out-of-sync audio players render (NO real audio ever — the bluff is that users think they're muted); the **unmute button is the secret escape hatch**: activating it immediately loads a random game from the guest list, bypassing the timer. Feature is fully keyboard-accessible; prefers-reduced-motion users get the sequence without the zoom animation. Copy says "ninety-nine seconds," timer is 01:30 — mismatch stands as part of the bluff unless owner objects. |

## Rulings R34–R35 (2026-08-10 evening)
| # | Ruling |
|---|---|
| R34 | Review-dock refinements: (a) locked onboarding dock shows NO preselected/highlighted sub-tab and NO placeholder text ("Complete onboarding…" removed — blank is implied); (b) sub-tab order puts **Info first**; (c) "Partner" terminology retired → boards are **First Board / Second Board**, where Second Board = the board where the two lower-rated players face each other; (d) the staged board is NEVER visibly labeled (header like "BOARD A · FEATURED PLAYER" removed — redundant); the dock tab is dynamically labeled with the OTHER board's name (staged Second Board → tab reads "First Board"); (e) add a ↹⇄ swap button that flips staged board ↔ dock board. R26 (featured player's board staged, their perspective) STANDS as the default; owner mused "second board by default" but did not overrule — flag open. |
| R35 | /blocks guest peek: easel is ACTIVE (not inert) even during onboarding — the one exception to the inert rail. Visiting /blocks as a guest starts an **84.5-second** leave-timer overlay: seconds counter + a millisecond counter that runs 3× faster than real and has NO relationship to displayed time; any click −25s and accelerates the timer to 4.5×; scroll-wheel use −15s and RE-SYNCHRONIZES the ms counter to the seconds. ASSUMPTIONS (owner may correct): at 0 the guest is returned to the app entry screen; each discrete click −25s; scroll gestures debounced so momentum doesn't drain the timer instantly. |

## Ruling R36 (2026-08-10, fresh guest list — Task 5g; tabulated 2026-08-10 per owner order)
| # | Ruling |
|---|---|
| R36 | Fresh-list rules: prefer matches from the last hour; progressively widen the window 3h → 12h → 48h until the list fills; display honest ages (never fudge recency); regenerate excludes already-shown matches; each entry carries a why-expander explaining its inclusion. |

## Ruling R38 (2026-08-10, Counsel-mode verdict — engine strategy; SUPERSEDES provisional R22)
| # | Ruling |
|---|---|
| R38 | (a) Server-side Fairy-Stockfish is the SOLE engine delivery path; R19's WASM deferral becomes a standing bar, liftable only after professional legal review. (b) Portable-app distribution is RETIRED: `-IncludeEngine` hard-stopped in the build script; no ZIP distribution of engine binaries or .venv, ever. (c) The GitHub repo flips PRIVATE after issue #13 closes (shares the GH-Pages-retirement prerequisite with domain closure); the living-docs commit lands only after the flip, so decision-record admissions never enter public history. (d) THIRD-PARTY-NOTICES.md + in-product attribution ship regardless: Fairy-Stockfish (GPL-3.0), python-chess (GPL-3.0-or-later, in-process), llama.cpp (MIT), chess-tcn (MIT), Qwen3.5-4B weights (Apache-2.0). (e) No license is chosen for our own code while the repo is private; going public again would be its own deliberation (dissent branch: public + GPLv3 + docs relocated). (f) Working assumption A1 (GPLv3 has no network-use clause; hosted service conveys nothing) adopted as operating posture — revisit only on professional advice. (g) Open branch: if any `-IncludeEngine` ZIP ever left the owner's machine, a retroactive corresponding-source step is added — owner to state if so, default assumption no. Full deliberation (verdict/dissent/falsifiers) in the gate thread, 2026-08-10; evidence record: R22-ESCALATION-COUNSEL.md. |

## Data architecture (verified facts)
- Full match data ONLY via undocumented `www.chess.com/callback/live/game/{id}` — CORS-blocked
  in browsers → our backend proxy required (R18). Anonymous server-side GETs work for finished games.
- `partnerGameId` = partner board's **UUID**; the callback endpoint ACCEPTS the UUID directly and
  returns board B with its numeric id → partner discovery is deterministic (2 requests/match).
- Callback fields: moveList (TCN-style 2-char encoding, drops `&-*+=`→Q/N/R/B/P), moveTimestamps
  (remaining clock, tenths), plyCount, pgnHeaders (names+elos), gameEndReason, resultMessage, uuid.
- Public API (`api.chess.com/pub`, CORS-open): leaderboards has `live_bughouse` (50 players, field
  is `score`); archives per player; bughouse game objects have `tcn`, ratings, per-player result
  codes, NO pgn, NO partner reference. Numeric id = terminal digits of game URL.
- Observed result codes: win, bughousepartnerlose, checkmated, resigned, timeout, abandoned, repetition.
- `?username=` on game URLs = perspective only; carries no data.
- Moment address (flashcard primitive): `game_id` + move token `{moveNumber}{A|a|B|b}` (viewer's
  `move` param; regex is unanchored, no dotted forms; invalid token silently lands at end position).
- BFEN (engine handoff): position + `~` promoted markers + `[pocket]` + side to move.
- ToS note: scraping the internal callback endpoint at scale is an unreviewed ToS question (flagged 2026-08-09).

## Task history
| Task | Thread | Status |
|---|---|---|
| 1 Inventory/zone mapping | A | ✅ accepted |
| 2 AppShell + header migration | A | ✅ accepted (Timeline kept mounted for global shortcuts) |
| 3 Locked shell + keyboard onboarding + capability map | A | ✅ accepted (PoC unlock = rail_statistics, to be replaced in 4b) |
| B1 bughouse-viewer audit | B | ✅ accepted; cross-checked vs independent Claude audit — zero contradictions |
| 4a Public-API recon + callback verification | A | ✅ accepted |
| B2 Moment-addressing + BFEN + games-row catalog + /extraction parser | B | ✅ accepted (report: docs/moment-addressing-engine-handoff.md; 59 tests) |
| B3 Extraction showcase (proxy consumer + public-API paths + moment links) | B | ✅ accepted — scope verified against git by Claude (only extraction files touched; 72 tests). Facts logged: bughouse rating is public ONLY via top-50 leaderboard (`live_bughouse[].score`); `/stats` omits bughouse — Task 5 must not assume a personal public rating. Depends on 4b merge (fails closed until then). |
| B4 Retirement: handoff doc + final commits | B | ✅ Thread Bv1 RETIRED. B3 @ bc8dde6, B4 @ 3db116f verified against git. Handoff: docs/extraction-lab-handoff.md. |
| Bv2 charter | Bv2 | Successor thread "Scraping Continued". Starts AFTER main merge. Scope: /extraction, /blocks public route, scratch/, docs/. Backlog: port building-blocks page to /blocks; capture specimens (lichess modules, chess.com notifications, typography H1/H2); eval-card + flashcard mockups from blocks 12–13. |
| 4b.1+merge+push | A | ✅ VERIFIED against git: main @ 21d80b7 == origin/main, zero conflict markers, merge 938033d, curated seed 21d80b7, 122 backend + 74 frontend tests pass. Thread Av1 RETIRED after this (5-task arc, tasks 1–4b). |
| 4c TCN decoder + match reconstruction | A2 | 🔄 issued to fresh Thread A2 — the milestone task: guest match replays on real boards. |
| Bv2-1 /blocks port + specimens | Bv2 | 🔄 green-lit after merge verification. |
| 4b Backend proxy + guest matchup list | A | ✅ accepted; one micro-revision pending (sampling diversity: cap 2 matches per player) then commit |

## Repo facts (verified against git 2026-08-09)
- Remote: https://github.com/thejimmyapp/The-jimmy-app.git · main @ ff5cf02 (PR #18 merge).
- Main checkout `/Users/user/Documents/thejimmyapp` (Finder "Jimmys-App" = alias to it) is currently
  checked out on `extraction-lab` — **switch back to main before any merging**.
- **~10 unmerged prior `codex/*` branches** exist from earlier work arcs, including:
  `railway-fairy-binary` (official Fairy-Stockfish binary in Railway build — SERVER-SIDE engine
  precedent), `review-layout-results` (queue Fairy-Stockfish analysis), `ryantime-puzzle`
  (two-board puzzle player), Qwen coach/stats branches, `url-first-exact-replay`.
  Branch triage is a queued task — some of this may overlap or conflict with the current arc.
- Deployment surface: Railway (backend) + gh-pages + custom-domain recovery handoffs in
  `output/handoffs/` (untracked). Domain issues appear unresolved.
- Untracked clutter in main checkout: AUDIT.md, AUDIT-2.md, output/handoffs/*, output/pdf/,
  data/.fuse_hidden*, scratch/ — repo-level triage queued, nothing deleted yet.
- R22 (provisional): server-side Fairy-Stockfish on Railway may supersede R19's WASM deferral —
  server-side use avoids GPL distribution triggers AND COOP/COEP entirely. Verify the prior
  branch's actual state before ruling.

## Working copies (IMPORTANT for commits)
Thread A works in `/Users/user/.codex/worktrees/217a/thejimmyapp`; Thread B's B2 landed in
`/Users/user/Documents/Jimmys-App` (main checkout). Commit protocol: each thread commits its own
accepted tasks as separate per-task commits on its own branch; merge A first, then B (write scopes
are disjoint — /extraction+docs vs shell/funnel — conflicts should be zero; investigate any that appear).

## Roadmap
4c — TCN decoder + match reconstruction into review workspace (fail closed; hardest engineering task)
5 — Username path (live validation, close-match corpus, archive fetch)
6 — Pre-selected game picker (dumb heuristic)
7 — Skin pass (token swap)
Backlog: top-12 legitimate victories ranking · flashcards (moment addresses + saved-learning library)
· engine WASM (GPL/COOP-COEP review first) · dock tab taxonomy (8 tabs/2 rows) · legal links out of
Board Settings into real settings · guard-page copy · onboarding kicker copy ("puny human" = placeholder)

## FINAL — night closed 2026-08-10
All threads retired except Cv2 (domain watcher, recheck 21:40 UTC; Jimmy Railway click pending).
Final hashes on main: 5g @ 8cc0622 → Bv2 final @ 91d176a (easel→/blocks/index.html, bmacho specimen 25,
hybrid-13 backlog) → Av3 6a @ f8f43cd (in-app placeholder mockups, R37). Production verified serving
final build; /blocks catalog live and publicly shareable at /blocks/index.html. Capture pack v1 complete
(8 surfaces). R37: specimens may render in-app as marked placeholders until real components ship.
Av3 (Sol Ultra) live under max-economy directive — it is the standing executor; Claude review-gate
thread retired after this commit; successor gate cold-starts from this file + RECOVERY.md.
Ops debts: .venv rebuild (py3.12) · cache warming · kill-switch env var · issues #6–#10 open w/ status.

## Session close 2026-08-10 (late): FULL PRODUCT LOOP BUILT
5e moments+library (b866bae) · rainbow removed (43cb63c) · 5f quest shell (386167d, merge a688dcc)
all landed. 5g fresh guest list EXTERNALLY VERIFIED (ages 0–14 min, curated seeds live, regenerate,
why-expander, Info consolidation) — green-lit for commit/merge/push. After 5g merge: Bv2-6 populates
docs/specimens/current-ui (capture pack; protocol in its README; "repopulate the pack" = refresh ritual).
Design library = 3 shelves: external specimens / current-ui pack / owner redlines → Task 7 skin.
Open tickets: cache warming (44s cold assembly) · Railway apex routing (Jimmy dashboard check, deferred
~16h; my vantage valid cert, sjc1 edge x-railway-fallback) · engine wiring (store guest match → existing
Fairy-Stockfish route) · username path (Task 6 era) · top-12 ranking · Photoshop redline round.
Finder shortcut: Documents/4robots/design-specimens → repo specimen library.

## MILESTONE 2026-08-10: thejimmyapp.com LIVE
Apex DNS = ALIAS → Railway (verified: resolves identically to target); HTTPS cert issued and valid
(externally verified via TLS handshake). Remaining: disable GH Pages, close issue #13 (Cv2).
Tasks 5b (corny copy + rainbow, 7f99b14) · 5c (word vertigo, 55ca466) · Bv2-5 (blocks leave-timer)
all merged to main and auto-deployed. 5d (dock refinements/First-Second Board/swap) externally
verified and green-lit; 5e (learning moments + library) issued; 5f (quest timer shell) queued.

## Deployment (verified 2026-08-10)
- **LIVE URL: https://jimmyapp-production.up.railway.app/** — pushes to main auto-deploy via Railway.
  Externally verified serving the current locked-shell app; production API smokes (guest list, paired replay) 200.
- thejimmyapp.com: broken — points to GH Pages (temporary redirect only), apex cert excluded, Railway CNAME missing/cert ISSUING. Owner DNS decision pending; recommendation = single Railway origin. Recon: docs/DEPLOY-RECON.md.
- Ops debts: /blocks falls through to SPA on production (works only at /blocks/index.html); kill switch env absent from live Railway vars and .env.example.
- Task ledger updates: Bv2 merged to main @ c7294eb (auto-deployed) · Bv2-4 deploy recon ✅ @ 66fc905 · 4c.1 ✅ merged @ 557d4d6 · 5a implemented, visual pass BLOCKED on preview backend (5175 frontend up, API unreachable — "Matchups unavailable").

## Gate note 2026-08-10 — Claude Gate [#1] cold-start + R22 verification
Successor gate booted from NEXT-GATE-KICKOFF; ground truth re-verified (main @ f8f43cd; production
serving current build). R22's mandated verification performed, three findings: (1) the Fairy-Stockfish
GPLv3 binary is ALREADY in the production image via the Dockerfile on main — R22's "may supersede"
framing is stale; it describes the deployed status quo, not an option. (2) python-chess
(GPL-3.0-or-later) is imported IN-PROCESS by backend/exploration.py and backend/coupled_analysis.py —
a stronger fact pattern than the arm's-length engine subprocess, unexamined by any ruling.
(3) The public repo carries NO license file, and scripts/build_portable_zip.ps1 -IncludeEngine
(tracked on main) would bundle the GPL binary into a distributable ZIP — PORTABLE_APP.md's own
redistribution caution was never resolved. Escalation brief drafted (R22-ESCALATION-COUNSEL.md, held
in the gate thread) — HELD for Counsel-mode deliberation. R22 stays provisional; do not make binding
until the deliberation rules. Open factual gap: whether an -IncludeEngine ZIP was ever given to anyone
(owner to answer at deliberation). Housekeeping: stale 217a worktree pending prune; stale .git/index.lock
cleared to tmp/.
UPDATE, same day: Counsel-mode deliberation ran (Fable 5; effort tier unverified from gate side) →
R38 issued, R22 superseded. Task 8 split: steps 1–4 (branch sync/switch/prune) go now; docs-commit
half held until the repo is private. Repo-private flip queued behind issue #13 closure. Next executor
task after Task 8 clears: -IncludeEngine hard-stop + THIRD-PARTY-NOTICES.md + legal-page attribution.

## Known debts / watch items
- Legal links temporarily inside Board Settings (category mismatch).
- Thread B hit context auto-compaction twice → rotate after B2 (fresh thread, briefed from this file).
- 4b leaves review boards empty after match selection (by design; 4c fills them).
- No safe sustained request rate established for callback endpoint (only 6-request sample).

## Ruling R39 (2026-08-10, Claude Gate [#1] — Counsel invocation)
| # | Ruling |
|---|---|
| R39 | Owner set the model picker to **Opus 5 / Extra permanently**. The Counsel invocation ritual is amended: Counsel-tier deliberation is now invoked by the owner typing **"deliberate"** with NO model flip, at the standing Opus/Extra tier. COUNSEL-KICKOFF step 2 (gate must verify the flip registered) is VOID — unsatisfiable and removed. Everything else in COUNSEL-KICKOFF stands unchanged: gate flags a decision as Counsel-tier, returns verdict + mandatory dissent + falsifiers in-thread, logs the outcome as a ruling, scope stays "hardest calls only, invoked per question." R38 was produced under the retired Fable-5 ritual and is unaffected. |

## Gate note 2026-08-10 09:10 UTC — Claude Gate [#1] visual pass + corrections
Chrome bridge restored (extension reconnected); first visual verification of production entry screen done.
VERIFIED BY EYE against live prod: R5 (rail/dock locked, dock body blank) · R7 (left node default-focused,
keyboard-only copy) · R31 (Games/Library/Collaborate/Quest visible-but-locked; Collaborate retained) ·
R32 (right node = bluff "Sign in" card, real funnel absent from entry) · R33 ("ninety-nine seconds" copy
live against 01:30 timer, mismatch intact as ruled) · R34(a) no sub-tab preselected, no placeholder text ·
R34(b) Info first · R34(c) "Partner" retired, "Second Board" present · R35 rail easel is the sole
non-inert item (cyan border) — carve-out confirmed.
TWO AMENDMENT FLAGS (open, not violations):
 (1) R34(a) is written about SUB-tabs; the parent "Review" tab IS highlighted during locked onboarding.
     Defensible (marks which parent owns the visible sub-tab row). Owner to confirm intent.
 (2) R7's "zero pointer targets" is STALE — R32's bluff card ships a clickable text input. Amend R7
     when docs become committable.
CORRECTION TO THE RECORD: the MILESTONE block's claim that thejimmyapp.com has a valid apex cert is
FALSE as of 08:55 UTC — TLS fails with hostname mismatch (cert not valid for thejimmyapp.com), i.e. the
sjc1 wildcard fallback, independently reproduced from a second vantage. Jimmy's Railway click still pending.
OPS ROOT CAUSE FOUND: `.git/index.lock` is not stale debris — it REGENERATES whenever a gate runs an
index-refreshing git command through the mounted folder, which cannot unlink the lock afterward. Gates
must use `GIT_OPTIONAL_LOCKS=0` for all read-only git through the mount. Lock cleared to tmp/stale-locks/.
Minor: 217a worktree registration marker still present against codex/task-5g-fresh-guest-list (Task 8
prune incomplete, cosmetic).
Owner deleted the dead Gate #1 conversation; docs/GATE-HANDOFF-ADDENDUM.md survives on disk and was read
in full by this gate — no memory lost.

## Ruling R40 (2026-08-10, Claude Gate [#1] — publication gate widened)
| # | Ruling |
|---|---|
| R40 | R38(c)'s "no decision-record admissions in public history" bar is NOT limited to the living-docs commit. It extends to **any commit whose message, code comments, or user-facing strings state or imply a past compliance exposure**. Concretely: Task 9 (`-IncludeEngine` hard-stop) is committed and verified on branch `codex/task-9-engine-zip-hardstop` @ afbaa5f but is HELD from main until the repo flips private, because its throw string ("triggers corresponding-source obligations") and commit message are self-authored admissions. Merge order after the flip: docs commit, then Task 9, then the notices task. Gate error acknowledged: this constraint should have been in the Task 9 prompt and was not. Future task prompts touching license/compliance MUST state whether their strings are publication-safe. |

## Task ledger update 2026-08-10 09:20 UTC
| Task | Thread | Status |
|---|---|---|
| 9 -IncludeEngine hard-stop | Av3 | ✅ COMPLETE, EXTERNALLY VERIFIED by gate against git (commit afbaa5f55dae4c82584a9656adba737416b2ef41, parent f8f43cd == main, 2 files, +9/-19, no surviving engine-copy path — verified by independent grep of the committed blob, not by executor claim). 🔒 HELD from main per R40 until repo is private. Av3 idle again. |

## Correction + Task 10 issue 2026-08-10 09:30 UTC (Claude Gate [#1])
CORRECTION TO REPO FACTS: the long-standing "~10 unmerged prior codex/* branches" figure is WRONG.
Measured against main @ f8f43cd: 21 local codex/* branches exist, **18 are fully merged** (0 ahead,
0 file diff) and 3 remote-only branches never appeared in any prior list (merge-local-into-railway,
qwen-coupled-coach-stats, restore-pgn-info-chat-notifications — all merged). Remote: 13 codex/*, 12 merged.
ONLY TWO branches carry unmerged work:
 · codex/review-layout-results — 1 commit, 13 files, +575/-51; redesigns review AND queues
   Fairy-Stockfish analysis; local only (no remote); 77 behind main; touches backend/main.py,
   services.py, schemas.py, App.tsx — all rewritten since. UNMERGEABLE as-is. Status: HARVEST-ONLY
   prior art for the queued engine-wiring item. Never merge.
 · codex/url-first-exact-replay — 1 commit, 18 files, +992/-48; adds backend/game_resolution.py,
   frontend ReviewStart.tsx, chesscomGameUrl.ts; local + remote; 46 behind. Same verdict:
   HARVEST-ONLY reference for the picker/username era.
STATE HYGIENE FINDING: the Documents checkout was left on codex/task-9-engine-zip-hardstop @ afbaa5f
(Av3 worked there, not in the 217a worktree, contra the working-copies note). Nothing pushed. 217a
worktree now flagged prunable. Task 10 step 0 returns the checkout to main and prunes.
TASK 10 ISSUED to Av3: delete 18 merged local + 12 merged remote codex/* branches using lowercase
`git branch -d` (self-validating: refuses unmerged refs), preserve the three named survivors, no
merges/pushes of content. Publication-safe under R40 — branch deletion emits no message and admits
nothing; every deleted commit remains reachable from main.

## Task 10 CLOSED 2026-08-10 09:45 UTC (Claude Gate [#1]) — branch triage complete
Executed by Av3 in two passes (10, 10b). Gate-verified against git, not accepted on report.
FINAL STATE: HEAD = main @ f8f43cd == origin/main. Local codex/* = 3. Remote-tracking codex/* = 1.
Worktrees = 1 (the Documents checkout); the stale 217a worktree was removed and pruned by Av3 after
passing both dirty-checks.
SURVIVORS (do not delete):
 · codex/review-layout-results   @ b0f96a8 — harvest-only prior art, engine queueing (local only)
 · codex/url-first-exact-replay  @ eca86ff — harvest-only prior art, URL-first replay (local + remote)
 · codex/task-9-engine-zip-hardstop @ afbaa5f — held from main by R40 until repo is private
DELETED: 18 local + 12 remote, all fully merged. NO WORK LOST — verified by ancestry, not by ref count:
spot-checked tips a0e808d, 386167d, 43cb63c, 8fa4880, 55ca466, d30fcc1, 8840d77 are all still ancestors
of main. Future gates should verify deletions this way (merge-base --is-ancestor), never by counting refs.
UNVERIFIED (stated as such): the 12 REMOTE deletions could not be confirmed live — device shell has no
network, and the cloud sandbox proxy blocks github.com and api.github.com (403 / robots-disallowed).
Local remote-tracking refs updated, which normally implies the pushes succeeded. Owner to eyeball the
GitHub branches page if certainty is wanted.
SANDBOX ARTIFACT — IMPORTANT FOR FUTURE GATES: `git worktree list` run from the mounted checkout reported
the 217a worktree "prunable" and `ls` reported its directory missing, purely because the gate sandbox
mounts only Documents/4robots and cannot see /Users/user/.codex. Both signals were FALSE. The executor's
vantage (real filesystem) is authoritative for anything outside the mount. Do not conclude a path is
absent from a gate-side stat.
GATE ERROR LOGGED: Task 10's "STOP and report" on first refusal cost a full round-trip; correct pattern
for bulk mechanical work is "skip, note, continue" with a report of skips. Applied in 10b.

## Gate note 2026-08-11 — domain diagnosis REVISED + engine-wiring recon (Claude Gate [#1])
DOMAIN — STANDING ASSUMPTION WAS WRONG. Cv2's 16h recheck: DNS 69.46.46.124 (correct), cert
`*.up.railway.app`, strict TLS fails, Railway sjc1 returns `404 Application not found`,
`x-railway-fallback: true`. Gate independently re-verified TLS hostname mismatch. Gate then found a
documented Railway case with the IDENTICAL signature where the cause was NOT owner misconfiguration:
Railway support found "the edge traffic routes were never installed for either hostname" and had to
trigger a server-side routing repair. DNS + certs were correct throughout.
(https://station.railway.com/questions/custom-domains-are-verified-and-propagat-69569c8c)
=> TWO hypotheses, previously collapsed into one:
   H1 domain never attached to the production service -> Jimmy re-adds (dashboard shows missing/errored)
   H2 attached but Railway never installed edge routes -> RAILWAY SUPPORT TICKET, no click helps
      (dashboard shows attached/verified/healthy)
The discriminator is what the Railway dashboard SHOWS, a question no prior handoff asked — every
handoff said "confirm attached, re-add if stuck", which yields "looks fine" and another cycle.
Owner-to-Jimmy decision-tree message issued 2026-08-11 incl. draft support-ticket text.
16+ hours were spent waiting on a click that may never have been the fix. Issue #13 remains open.
DNS at Namecheap is CORRECT and must not be touched under either hypothesis.

ENGINE WIRING — GAP LOCATED (gate recon, no executor tokens spent):
The engine is NOT unwired. POST /api/analysis (main.py:406) + GET /api/analysis/{job_id} (main.py:426)
work: AnalysisJobs (services.py:170) runs Fairy-Stockfish, caches by position key, bounds concurrency
(semaphore 2), honours JobCapacityError -> 429 + Retry-After. Binary ships in the production image.
THE SINGLE BREAK: /api/analysis requires an INTERNAL DB game_id and calls games.snapshot(game_id,
global_ply) for a variant_fen. Guest matches are served in-memory by chesscom_matchups.replay_source()
(route main.py:204) and are NEVER STORED — so a guest replay has no game_id analysis will accept.
Nearest precedent: /api/games/resolve (main.py:226) upserts via db.upsert_game (thejimmyapp/db.py:799)
and returns an internal id, but uses the public-archive path and REQUIRES A USERNAME, which guests lack.
ENGINE RESULT SHAPE (for the later eval-card task): job result = asdict(EngineAnalysis) =
fen, bestmove, score_cp, mate_in, pv, depth, variant_supported, engine_name. NOTE score_label is a
@property and does NOT survive asdict — the FRONTEND must format (mate_in -> "mate N", else
score_cp/100 to 2dp, else "unknown"). Block 12 target: ranked line, engine identity, depth, expand
affordance, enable toggle, drop-notation variation, in a grouped DOCK stack.
SPLIT (protocol rule 1 + rule 2): Task 11 = RECON ONLY (field map, snapshot viability, username
problem, is_completed_game gate, smallest bridge) — issued to Av3, read-only, no commits.
Task 12 = implement the bridge. Task 13 = eval card UI. Do not merge 11 into 12.

## Gate actions 2026-08-11 — GH Pages RETIRED + private-flip pre-flight CLEARED (Claude Gate [#1])
Performed by the gate in the owner's browser, with owner's explicit in-chat authorization.
1. PRE-FLIGHT CLEARED: **Railway App IS installed as a GitHub App on thejimmyapp/the-jimmy-app**
   (repo Settings -> Integrations -> GitHub Apps lists "Railway App, developed by railwayapp").
   The private flip should therefore NOT sever Railway's repo access. Step 5 of the flip sequence
   (verify a deploy after flipping) still stands as confirmation — do not skip it.
2. **GITHUB PAGES FULLY RETIRED.** Was live at https://thejimmyapp.github.io/the-jimmy-app/ (last
   deployed 19h prior from branch gh-pages by Knackerman). Gate clicked Unpublish site, then set
   source Branch = None and saved ("GitHub Pages source saved"). Both steps were needed: GitHub's own
   dialog states unpublishing alone does not prevent a rebuild. REVERSIBLE — the gh-pages branch is
   untouched; republishing = set source back to gh-pages.
3. **STALE FACT CORRECTED — the Deployment section's claim that thejimmyapp.com "points to GH Pages
   (temporary redirect only)" is WRONG.** The Pages Custom domain field was EMPTY. GitHub Pages never
   held a claim on thejimmyapp.com, was never in that domain's request path, and retiring it cannot
   and did not affect the Railway 404. The apex failure is entirely Railway-side (see H1/H2 above).
4. **REMOTE BRANCH DELETIONS CONFIRMED LIVE** (the verification unavailable yesterday — sandbox proxy
   blocks github.com). GitHub's Pages branch picker enumerated the real remote branch list:
   main · agent/codex-chesscom-connector · codex/url-first-exact-replay · extraction-lab · gh-pages.
   Exactly one codex/* remains => all 12 remote deletions landed.
5. **GATE ERROR — TRIAGE WAS INCOMPLETE.** Task 10 scoped to `codex/*` only. Three remote branches
   fall outside that prefix and were never triaged: `agent/codex-chesscom-connector`, `extraction-lab`,
   and `gh-pages` (now inert but still present). Queue a follow-up triage covering ALL branches, not a
   prefix. extraction-lab is historically significant (the main checkout sat on it during the Bv1 era).

## Rulings R41–R48 (2026-08-11, guest identity + commentary — owner-directed, gate-specced)
| # | Ruling |
|---|---|
| R41 | VOCABULARY: user-facing copy says **GAME**, never "match"/"matchup". Internal API names (/api/chesscom/guest-matchups) unchanged — renaming endpoints is churn. Supersedes casual use of "match" in owner-facing surfaces only. |
| R42 | GUEST IDENTITY: **guest_N, assigned on landing** — no action, no write required. N is a true count of arrivals and is surfaced as a factoid ("you are guest_4,317"). Numbers burned by bouncers are accepted; honest arrivals beat a contributor count. Replaces the sentinel-username proposal. |
| R43 | RETENTION: **keep forever, forced not preferred.** Guest commentary anchors to stored games; deleting a row destroys a note, and the sign-up discovery mechanic requires notes to outlive sessions by months. TTL/sweep is now PROHIBITED. R28's ephemerality stands and is reframed: the SESSION dies, the commentary does not ("you are temporary, your commentary is not"). |
| R44 | ANNOTATION WIZARD: Fiverr-style locked stems, one blank per step, no skipping/reordering/early submit. Step 1 pick move (nothing else interactive until selected) · Step 2 glyph REQUIRED, lichess NAG mapping on number keys 1=! 2=? 3=!! 4=?? 5=!? 6=?! with dropdown fallback · Step 3 exactly ONE alternative move, played on the board not typed, no variations in MVP · Step 4 free text behind a locked "Because" opener, no minimum. Owner copy for step 3 ships verbatim: "Interesting move for sure! Next you're required to give one relevant alternative move. Relax don't overthink it you're halfway done." Steps 1/2/4 prompts are gate PLACEHOLDERS awaiting owner copy. |
| R45 | TWO-COPY SAVE: saving writes (a) a PRIVATE flashcard in the guest's own collection — editable forever, CANNOT be published from there, shareable by link, reviewable via room invite (reuses 5e library + R28 rooms); and (b) a PUBLIC copy FROZEN at save time. Editing the private copy never mutates the public one. No edit history, no sync, no "edited" badge — gate call, MVP. |
| R46 | PUBLIC NOTES BOARD: reddit-style, reached by a button beside the easel in the RAIL. Sorted by score. Upvote/downvote only — NO threading, NO replies in MVP. |
| R47 | MODERATION (deliberately minimal): no word filter — typed and entered means posted. Vote-score threshold auto-collapses a note behind a click (gate call: cheapest defence needing no human). The FEATURED PLAYER may hide any note on their own game once their account is connected. Rate limit: one note per position per guest + small daily cap per guest_N (gate call, anti-flood). Owner deletes by hand; sufficient at current traffic and chosen, not defaulted. |
| R48 | ENTRY FLOW: autopopulated list of worthy GAMES from the last 30 minutes, widening per R36 only if it cannot fill. NOTHING is asked of the user — no username, no filter. "gimme more choices" replaces the list with 3 new games, never repeating one already shown. "why can't I review my own game instead?" opens **FAQ-1**, an instance of a REUSABLE FAQ card component (user's question in their voice, answered in Jimmy's). FAQ-1 answer body is a 160-char lorem placeholder so real copy of that length drops in without reflow. |

Design surface (mocks + field map + risk): Claude artifact `guest-identity-commentary`, updated 2026-08-11.
GATING RISK RESTATED: callback `moveList` is documented "TCN-STYLE" while the parser reads plain `tcn`
(pgn_parser.py:131 -> parse_tcn). If encodings differ, stored games replay WRONG SILENTLY and every note
anchored to a move number points at the wrong position permanently. Task 12 verifies this before any build.

## Task 12 CLOSED + Task 13 issued 2026-08-11 (Claude Gate [#1]) — TCN verified, POCKET HAZARD FOUND
TASK 12 VERDICT (Av3, gate-verified against source): **COMPATIBLE-WITH-CAVEATS**. Callback `moveList`
feeds `parse_tcn` 1:1 unchanged — sample game 180731271553 / partner 180731271555, Board A 51/51 moves
vs plyCount, Board B 39/39, no raises, no empty/impossible tokens. First 10 A: d4 d5 Nf3 Nf6 Bg5 Ne4 e3
Nxf2 Kxf2 N@e4+. => THE STORAGE BRIDGE IS UNBLOCKED; key-renaming plan stands. Limit stated by executor
and accepted: one live sample proves this payload, not every historical callback variant. Existing tests
mock decode_tcn; none exercise a real callback encoding (test-coverage debt logged).
TWO CAVEATS, BOTH GATE-VERIFIED IN SOURCE:
1. **initialFen SILENT FAIL-OPEN.** `_initial_tcn_board` (thejimmyapp/pgn_parser.py:475) reads only
   `initial_setup`/`initialSetup`; the replay payload supplies `initialFen`. A non-standard start would be
   silently ignored and every subsequent move would decode against the wrong board. Rare in bughouse but
   it FAILS OPEN, violating the standing fail-closed non-negotiable. Fix must REFUSE the game, not default.
2. **POCKET INFERENCE FEEDS THE ENGINE — now the top correctness item, ahead of the eval card.**
   pgn_parser.py:215-218 back-fills a piece into the pocket whenever a drop would otherwise be illegal,
   counts it as `inferred_pockets`, and warns at :250 that pocket confidence can be low. It NEVER consults
   the partner board although both are parsed. Three inferred arrivals per board in the sample => fires
   constantly, not rarely. Pockets are part of the position; the `variant_fen` from snapshot() carries them
   into POST /api/analysis -> Fairy-Stockfish. Inference only back-fills AT THE MOMENT OF A DROP, so pieces
   transferred but not yet dropped are ABSENT from the pocket — an eval on an empty pocket vs one holding a
   queen is a different number entirely. Net: the eval card would present confident evaluations of positions
   the app itself flagged low-confidence. Same hazard downstream of the commentary feature — a note anchored
   to a moment address must point at the true position.
   Gating analysis on "no inference occurred" is NOT viable: it would refuse nearly every position worth
   analyzing, since drops are the game. Correct fix is coupled derivation — every capture on one board
   transfers that piece to the partner's pocket on the other, deterministic given payload["timeline"],
   which already interleaves both boards.
TASK 13 ISSUED to Av3: recon + numeric PROOF (per-parser vs coupled-derived pocket table at three plies on
the same sample), engine-impact statement, derivation-layer recommendation, and the fail-closed initialFen
change. Read-only, no commits. Protocol rule 2 (recon before diff on anything structural).
SEQUENCING CHANGE: coupled pockets now precede the eval card (block 12) and precede the guest-commentary
build. Spec-Drafter [#2] is drafting docs/SPEC-guest-commentary.md in parallel; its output is a DRAFT with
NO ruling authority and must be re-checked against this finding before any of it is built.

## Thread registry update 2026-08-11 (Claude Gate [#1])
- **Claude Gate [#1]** (Opus 5 / Extra, permanent) — sole ruling authority; writes all executor prompts.
  Counsel is a MODE invoked by the owner typing "deliberate", no model flip (R39).
- **Av3 — General** (Sol Ultra, max-economy) — standing executor. Task 14 (guest storage bridge +
  fail-closed initialFen) IN FLIGHT on branch codex/task-14-guest-bridge. ⚠ WATCH: Av3 reported
  "Context automatically compacted" mid-Task-14. Per RECOVERY, repeated compaction is the rotation
  signal — if it recurs, retire Av3 and brief a fresh Av4 from this file rather than letting it degrade.
- **Spec-Drafter [#2]** (Opus 5 / Extra) — TERMINATING thread, NO ruling authority, now DONE. Produced
  docs/SPEC-guest-commentary.md (24,675 bytes, 2026-08-11 03:20): 4 tables (public/private copies share
  no FK so R45's no-sync is structural), 10 endpoints, R44 wizard with copy marked [COPY-PLACEHOLDER:*],
  10-slice build order, §0 TCN void clause. Its §8 open questions are UNDECIDED and await the gate.
  ⚠ Its spec predates the Task 13 tie-break finding and must be re-checked against it before any build.
- **Codex S — Specimens** (Sol / Low / Fast) — NEW, kickoff issued 2026-08-11. Owns docs/specimens/ only.
  Jobs: repopulate the current-ui pack, redline intake, index upkeep. No design decisions, no app code,
  no before/after narrative (that stays with the gate). PROTOCOL CHANGE it must apply: captures keep the
  1300px UI region but pad RIGHT to 1800px total with a #080d16 gutter, so owner redline notes sit BESIDE
  the UI rather than on it — UI pixels stay comparable across versions and notes stay legible.
  Redline loop: owner edits in Sketch -> exports back into current-ui/ as
  `current-<nn>-<surface>-redline.<ext>` with ALL explanation inside the image -> gate reads the image
  directly. No companion text files.
- **Thread Z (Jimmy's Codex)** — holds the Railway domain repair end-to-end per the owner-issued
  jimmyrailwaydomainrepair.md decision tree (Branch A = re-add, Branch D = support ticket). Issue #13
  remains the coordination record.
- Retired, never message: Av1/Av2/Bv1/Bv2/Cv1/Cv2, and the separate Counsel session.

## MILESTONE 2026-08-11 — thejimmyapp.com FIXED (gate-verified) + Task 14 complete
DOMAIN CLOSED. Thread Z (Jimmy's Codex, running the jimmyrailwaydomainrepair.md decision tree) resolved
the apex. GATE-VERIFIED INDEPENDENTLY: https://thejimmyapp.com/ now serves the real app shell — title
"The Jimmy App — Collaborative Bughouse Coach", theme-color #080d16, no fallback page, TLS no longer
mismatched. The 16+ hour H1/H2 ambiguity is resolved in the field. Thread Z retired. Correct the earlier
Deployment-section claims accordingly; the record's "points to GH Pages" line was already disproven.
=> THE PRIVATE-FLIP SEQUENCE IS UNBLOCKED. Pre-flight already cleared by the gate: Railway App is an
installed GitHub App on the repo, and GitHub Pages was fully retired (unpublished + source=None).
Remaining owner steps: confirm #13 closed -> flip repo PRIVATE -> REDEPLOY FROM RAILWAY AND CONFIRM IT
BUILDS (do not skip; this is the only unproven link) -> then the gate issues the merge train:
docs commit -> Task 9 (afbaa5f) -> Task 14 (1efcfcb) -> notices task.

TASK 14 COMPLETE — gate-verified against git, not accepted on report. Branch
codex/task-14-guest-bridge @ 1efcfcb7ca771c35f5a4f595846a211dce93024b, parent f8f43cd == main.
5 files, +505/-13: backend/main.py, backend/services.py, tests/test_guest_game_bridge.py,
thejimmyapp/db.py, thejimmyapp/pgn_parser.py. Route POST /api/chesscom/matches/{game_id}/store ->
{"game_id": int} at main.py:213. Guest identity = SQLite guest_identities.guest_number INTEGER PRIMARY
KEY AUTOINCREMENT bound to an opaque server-issued cookie (GUEST_IDENTITY_COOKIE "jimmy_guest_identity");
clearing cookies mints a new guest number — ACCEPTED, correct semantics for an arrivals counter (R42).
Backend 132 passed / frontend 111 passed / production build passed. Live sample 180731271553: no mapped
fields absent. HELD from main per R40 until the repo is private.
WATCH ITEM (new, low priority): guest identity is now a first-party functional cookie and the app has no
consent surface. Not blocking; revisit if the product ever targets EU traffic deliberately.

## Rulings R49–R52 (2026-08-11, gate calls on SPEC-guest-commentary §8 open questions)
| # | Ruling |
|---|---|
| R49 | BOARD SCOPE — the spec's global-vs-per-game framing is a FALSE either/or. BOTH surfaces, one data source: notes always render in-context in that game's Moments dock panel (surface already exists from Task 5e), AND the RAIL button (R46) opens the GLOBAL score-sorted board. R46 placed the button in the RAIL, which is persistent and not game-scoped, so global was already implied. |
| R50 | COUNTDOWN — the R28 session clock KEEPS RUNNING during the annotation wizard; no exemption (exempting it defuses the quest). Mitigation: the note is PERSISTED when wizard step 3 completes (move + glyph + alternative already constitutes a valid note); step 4's free text updates the existing row. A session reset therefore costs at most the sentence in progress, never finished work. Reversible one-line change if the owner prefers the crueller version. |
| R51 | HIDDEN NOTES — when the featured player hides a note, the author sees it marked "hidden by the player" in their PRIVATE collection. No silent disappearance. The private copy remains theirs and editable per R45. |
| R52 | DAILY CAP — DAILY_NOTE_CAP = 10 notes per guest per day. The cap exists to stop a bot, not a person. |

## Thread rotation 2026-08-11 — Av3 RETIRED, Av4 briefed
Av3 reported "Context automatically compacted" during Task 14 and is retired at that clean seam rather
than carrying a degraded context into the merge train. Av4 kicked off from RECOVERY's executor template,
briefed from this file, told Task 14 is held at 1efcfcb and not to touch it. Retired, never message:
Av1/Av2/Av3/Bv1/Bv2/Cv1/Cv2, Thread Z, Spec-Drafter [#2] (terminated on delivery), and the separate
Counsel session. Live: Claude Gate [#1] · Av4 · Codex S — Specimens.
