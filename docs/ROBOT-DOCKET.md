# 🎉 Robot docket

This docket celebrates evidence, not optimism. Completed, failed, blocked, and
abandoned work all stays visible.

**Current route:** Preserve -> Verify handoff -> Golden build -> Fresh Ryan-owned
deployment -> Backup/domain -> Private UI library

## 🥳 Benchmarks completed

- [x] Located the canonical repository and current `main`.
- [x] Reconciled the public-domain failure with Railway service state.
- [x] Chose a safe source redeploy that excludes local uncommitted work.
- [x] Defined “everything synced” as an observable finish line.
- [x] Established repository-local instructions for future agents.
- [x] Created a current Claude/Codex-readable handoff.
- [x] Separated the UI library from the public application bundle.
- [x] Converted Evan's role into optional, bounded portfolio opportunities.
- [x] Opened and pinned GitHub issue #19 as the robot communication channel.
- [x] Proposed a one-time dental-office concept reminder for 2026-09-07.
- [x] Received and hash-preserved Jimmy's reconstruction handoff and archaeology.
- [x] Validated the archaeology JSON, all cited commits, and all cited source/test
  paths against commit `7bf611c`.
- [x] Classified the supplied `message.txt` as an older Railway audit rather than
  the advertised takeover prompt.
- [x] Replaced the active UI-library task with the A5 takeover sequence.
- [x] FLASHCARD-01 added private saved-moment review state, an author-scoped
  grading endpoint, the documented scheduler stub, and accessible grading
  controls without modifying frozen public moments.

## 🚧 Active

- [x] Reproduced the handoff's backend/frontend test counts from a clean worktree:
  179 backend tests and 42 files / 202 frontend tests passed.
- [x] Reproduced ESLint and the production Vite build.
- [x] Reproduced the repository's actual pinned Ruff CI gate; contradicted the
  handoff's broader unpinned Ruff command.
- [ ] Build and smoke-test one local Docker image with Qwen disabled.
- [x] Prepare one fresh Ryan-owned, single-instance deployment with durable data.
  - Evidence (Gate 4, 2026-09-05): Railway project `thejimmyapp-ryan`
    (`65513c12-b3af-4d42-ac78-cdb3c34a9ae5`), service `thejimmyapp`, volume
    `/app/data`, GitHub-connected to `main`; `/health` = `ok`, database and
    Fairy-Stockfish available, Qwen disabled.
- [x] FLASHCARD-01 recovered and shipped. The "lost" build survived as an unpushed
  local branch (`codex/flashcard-review-state` @ `765acc5`); pushed, merged
  `--no-ff` as `1c56971`, auto-deployed, `/api/moments/{id}/review` live.
- [x] Three-for-five loop verified on production as a fresh guest: three moments
  saved inside the window, `completed=true`, `completion_ordinal=1`, review
  grading persisted (`attempts=1`, `due=false`).
- [x] LIBRARY-01: the flashcard library overlay was visible but unclickable by mouse
  (`#app-stage-panel` is `pointer-events: none`; `.guest-library-backdrop` never
  restored it). One-line CSS fix merged as `adb2989`; re-verified on production
  with a real click: "Grade hard" -> `Review recorded: hard`, `attempts=2`.
- [x] Task 52 (guest list warm-up) merged as `a843dd6`. Production before: 2 games,
  `partial=true`, ~15 s cold. After: 5 games in ~114 ms, `cached=true`,
  `pool_size=23`, background build 25 s at startup with 110 upstream requests.

## ⛔ Blocked

- [x] Restore the public website on fresh Ryan-owned infrastructure.
  - Resolved 2026-09-02..05: live at `https://thejimmyapp-production.up.railway.app`.
- [ ] Point `thejimmyapp.com` at the Ryan-owned service.
  - Evidence (2026-09-05): `railway domain thejimmyapp.com --service thejimmyapp`
    fails twice with the generic "Failed to create custom domain". The apex is
    still a custom domain on Jimmy's project (`alfaswing's Projects` /
    `thorough-celebration`, domain id `4e8df60a-db18-40b5-bece-d79daec5c129`,
    stuck in verification since July). Public DNS: apex A -> Railway edge
    (fallback 404), NS = Namecheap.
  - Decision: never touch Jimmy's project. Owner call: (a) ask Jimmy to delete the
    custom domain from his project, then re-run the CLI add; or (b) cut over to
    `www.thejimmyapp.com` on Ryan's service and forward the apex.

## 🧯 Failed attempts

- [x] 2026-08-31 source redeploy stopped before build by expired Railway trial.
  No local files were uploaded and no deployment was changed.

## 🪦 Abandoned or deliberately parked

- [x] Invisible “global Codex memory” as the coordination mechanism.
  - Reason: it is not repository-scoped, auditable, or reliably shared across agents.
- [x] Shipping the private UI library inside the public application bundle.
  - Reason: performance and access-control boundaries belong outside the public app.
- [x] Diverting active work into a dental-office website service this week.
  - Revisit after one week; do not let it fragment the recovery effort now.
- [x] Making progress dependent on Evan.
  - Evan's work is optional and bounded.

## 🔭 Next benchmark

**A6 — Return path.** A new user can now land, load a game in under a second,
save three moments, grade them, and reach the claim form with a mouse. What is
missing is the way back (credential intake, held P0) and a definition of what an
account unlocks (see `docs/GATE-4-HANDOFF.md` §4). Nothing to build until the
owner rules.

## Update format

```text
ACTOR — YYYY-MM-DD HH:MM TZ
VERIFIED:
EVIDENCE:
BLOCKER/DECISION:
NEXT:
```
