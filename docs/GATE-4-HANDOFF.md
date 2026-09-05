# GATE 4 — HANDOFF (night of 2026-09-04 → 05, autopilot)

Read with `docs/ROBOT-DOCKET.md`. Every claim below was verified against git or
against production by the gate, not taken from an executor report.

## 1. State of `main`

| Item | Value |
|---|---|
| `main` | `1c56971` = merge of `codex/flashcard-review-state` (`765acc5`) onto `a57dfdc`, `--no-ff` |
| Golden build on that tree | Ruff ok · pytest **186** (179 + 7) · vitest **205** (202 + 3) · ESLint ok · Vite build ok |
| Production | `https://thejimmyapp-production.up.railway.app` — `/health` ok; `/openapi.json` lists `/api/moments/{moment_id}/review` |
| Railway | project `thejimmyapp-ryan` (`65513c12-b3af-4d42-ac78-cdb3c34a9ae5`), env `production` (`2567c380-…`), service `thejimmyapp` (`ea408278-…`), region sfo, volume `thejimmyapp-volume` at `/app/data` |

The "lost" flashcard build was never lost: the worktree that was deleted was a
`git worktree` of the canonical repo, so its commit lived in the canonical `.git`
as an unpushed local branch. Lesson stays: **push the instant you commit.**

## 2. Production walk-through as a fresh guest (2026-09-05, guest #50)

| Step | Result |
|---|---|
| Landing → "Click me?" → matchup list | List took ~15 s cold (`partial: true`, `assembly_budget_exhausted`, 2 games not 5); cached on the next load |
| Enter on the list → game loads | OK (`/api/chesscom/matches/{id}/replay` 200) |
| Wizard ×3 (move → glyph → alternative on board → answer → save) | 3 × `POST /api/moments` OK |
| Session after the third save | `completed=true`, `completion_ordinal=1`, `completions_to_date=1` — first completion on this deployment |
| Library grade (`POST /api/moments/1/review good`) | `attempts=1`, `due=false`; badges update |
| Claim-identity form | Rendered, email input, not submitted (owner's call) |

**Defect LIBRARY-01 (P0 for the loop).** The library overlay renders, but every
control in it (Flip / Next / Grade / Claim / Close) is unreachable by mouse:
`document.elementFromPoint` over the "Grade good" button returns a board square.
`.app-stage > #app-stage-panel { pointer-events: none }` (styles.css:1534) and
`.guest-library-backdrop` (styles.css:1919) never restores it — unlike
`.moment-editor-backdrop`, which has `pointer-events: auto`. Fix is one
declaration; branch `codex/library-pointer-events` (frontend suites green).
Re-verify after deploy: open the library, run
`document.elementFromPoint(...)` over a grade button → must be the button.

Other observations (not acted on): matchup list cold-load time; `Regenerate
list` exists; local branch `claude/task-52-guest-list-warm` (`c7bdb43`,
unpushed, unmerged) claims to keep the list warm — verify before use.

## 3. Custom domain — BLOCKED, owner decision

`railway domain thejimmyapp.com --service thejimmyapp` fails with the generic
"Failed to create custom domain" (two attempts, CLI 5.27.2). Cause per the
August handoffs: the apex is still a custom domain on Jimmy's project
(`alfaswing's Projects` / `thorough-celebration`, domain id
`4e8df60a-db18-40b5-bece-d79daec5c129`), stuck in verification since July.
Public DNS: apex A → Railway edge (Railway fallback 404), `www` → Namecheap
forwarding, NS = `dns1/dns2.registrar-servers.com`.

Options (never touch Jimmy's project):
1. Jimmy deletes the custom domain from his project → re-run the CLI add →
   set the CNAME/ALIAS Railway returns at Namecheap.
2. Cut over to `www.thejimmyapp.com` on Ryan's service now (unclaimed
   hostname) and forward the apex; canonical-origin config (cookies, CORS,
   `VITE_PUBLIC_BASE_URL`, `TRUSTED_HOSTS`, `WEBSOCKET_ORIGINS`,
   `CHESSCOM_OAUTH_CALLBACK_URL`) must follow.

Hazard seen 2026-09-05 in the Railway dashboard tab inside Codex: a staged
"Apply 1 change — service will be deleted" on the **keeper** project. Owner
discarded it. Nobody applies staged dashboard changes without reading them.

## 4. Save-moment → account-unlock loop — what exists

| Piece | State |
|---|---|
| Guest identity cookie, `POST /api/guests`, `/api/guests/reset` | Live |
| Three-for-five completion (`guest_completions`, `completion_ordinal`) | Live, verified |
| `POST /api/accounts/claim` (email only, gated on completion) + account cookie | Live |
| `GET /api/accounts/me` | Live |
| Claim UI in the library panel (`completionRecorded`) | Live (behind LIBRARY-01) |
| Return path on another device / after cookie loss | **Missing** — this is the held credential-intake decision (P0, owner) |
| What an account unlocks beyond the label | **Undefined** — product decision |

Nothing in this loop should be built until LIBRARY-01 is merged and the owner
rules on credential intake.

## 5. Unpushed work in the canonical repo (push-only, no merge)

| Local branch | SHA | vs `main` | On origin |
|---|---|---|---|
| `claude/task-52-guest-list-warm` | `c7bdb43` | unmerged, +1 | no |
| `codex/review-layout-results` | `b0f96a8` | unmerged, +1 | no (remote branch was deleted) |
| `codex/task-14-guest-bridge` | `1efcfcb` | merged | no |
| `codex/task-26-headline-split` | `cb35370` | merged | no |

`origin/codex/url-first-exact-replay` (`eca86ff`) is on origin and unmerged.

## 6. Operating notes for the next gate

- Reads through the mounted worktree: `GIT_OPTIONAL_LOCKS=0` (or
  `--no-optional-locks`). The mount cannot unlink; a stray `index.lock` was
  created once tonight and moved out to `HARDCODE/gate4-work/_to_delete/`.
- Work clones live in `HARDCODE/gate4-work/` (persistent, delete permission
  granted per-folder mount — use the `mnt/HARDCODE` path, not `mnt/Documents/...`).
- The device VM has git + node 22 + python 3.10 (no `datetime.UTC` → backend
  tests need the cloud's 3.11), no railway/gh, no git credentials. Pushes go
  through a Codex lane (macOS keychain).
- Codex desktop control: background app tools work for typing into the open
  lane's composer (whole-field replace + return); switching lanes by clicking
  the sidebar does not register. One executor lane per night is enough.
- Executor reports are mirrored to `HARDCODE/gate4-work/reports/<TAG>.md`;
  read them there instead of scrolling the Codex window.
- Verify a deploy by `/openapi.json` (route list), not by GET on a POST route
  (the SPA catch-all returns `api_404` for any unknown `/api/*` GET).
- Prod e2e: the Claude built-in browser pane works; emulate ≥ 992 px wide
  (`resize_window`), drive keyboard-only controls with dispatched
  `KeyboardEvent`s, set React inputs through `form_input`.
