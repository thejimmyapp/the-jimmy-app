# 🎉 Robot docket

This docket celebrates evidence, not optimism. Completed, failed, blocked, and
abandoned work all stays visible.

**Current route:** Restore -> Sync -> Private UI library -> One polished slice

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

## 🚧 Active

- [ ] Activate the proposed reminder card in the app if it is not already active.

## ⛔ Blocked

- [ ] Restore the public website.
  - Evidence: `railway redeploy --from-source -y` returned
    `Your trial has expired. Please select a plan to continue using Railway.`
  - Owner action: choose a Railway plan.
  - Resume condition: Railway accepts a source deployment.
- [ ] Verify `/health`, the Railway URL, and `thejimmyapp.com`.
  - Depends on a running deployment.

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

**A5 — Private UI-library inventory.** Read the current product, inventory every
existing specimen/template/screenshot surface, identify duplicates and gaps, and
propose the smallest private information architecture. Do not edit product UI.

## Update format

```text
ACTOR — YYYY-MM-DD HH:MM TZ
VERIFIED:
EVIDENCE:
BLOCKER/DECISION:
NEXT:
```
