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

## 🚧 Active

- [x] Reproduced the handoff's backend/frontend test counts from a clean worktree:
  179 backend tests and 42 files / 202 frontend tests passed.
- [x] Reproduced ESLint and the production Vite build.
- [x] Reproduced the repository's actual pinned Ruff CI gate; contradicted the
  handoff's broader unpinned Ruff command.
- [ ] Build and smoke-test one local Docker image with Qwen disabled.
- [ ] Prepare one fresh Ryan-owned, single-instance deployment with durable data.

## ⛔ Blocked

- [ ] Restore the public website on fresh Ryan-owned infrastructure.
  - Evidence: Jimmy declined to reactivate/transfer the old Railway project and
    supplied a source-reconstruction handoff instead.
  - Decision: do not revive or transfer Jimmy's Railway project.
  - Resume condition: Gate 2 local golden build passes, then create a new service.
- [ ] Verify `/health`, the new provider-generated URL, and `thejimmyapp.com`.
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

**A5 — Takeover and fresh deployment.** Verify Jimmy's reconstruction handoff,
prove a clean local golden build, and establish a fresh Ryan-owned single-instance
deployment with tested persistence. UI-library work remains parked until Gate 3.

## Update format

```text
ACTOR — YYYY-MM-DD HH:MM TZ
VERIFIED:
EVIDENCE:
BLOCKER/DECISION:
NEXT:
```
