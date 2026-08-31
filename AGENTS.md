# Agent operating contract

This file applies to the entire repository.

## Start here

Before planning or editing, read these files in order:

1. `ROBOT-HUB.md`
2. `docs/CURRENT-HANDOFF.md`
3. `docs/ROBOT-DOCKET.md`
4. The relevant source files and tests

`docs/PROJECT-STATE.md` is a valuable historical decision ledger, but it contains
stale operational claims. When it conflicts with `docs/CURRENT-HANDOFF.md`, verify
the fact directly and update the handoff rather than silently choosing a version.

## Working rules

- Ryan is the product owner and final decision-maker.
- Jimmy, Codex, Claude, and future agents are collaborators, not separate sources
  of truth. Durable decisions belong in the repository.
- Separate verified facts, decisions, assumptions, and proposals.
- Inspect before editing. Preserve unrelated and uncommitted work.
- Do not claim a deploy, test, or UI state was verified unless it was checked.
- Never put secrets, cookies, tokens, private game data, or credentials in Git.
- Do not make the public app depend on Evan contributing.
- Treat the internal UI library as private. A client-side password alone is not
  access control.
- Prefer a narrow finished slice over a broad speculative redesign.
- Update `docs/ROBOT-DOCKET.md` when a benchmark completes, fails, is blocked, or
  is abandoned. Record all four outcomes; do not erase inconvenient history.

## Communication protocol

Use the pinned GitHub issue named **Robot docket: restore -> sync -> UI library**
as the asynchronous channel. Each update should contain:

1. actor and timestamp;
2. verified change or finding;
3. evidence (commit, test, screenshot, URL, or log);
4. blocker or decision needed;
5. next action.

Do not paste long private conversations into GitHub. Condense them into decisions
and evidence.

## Change authority

Read-only inspection is always allowed. Code changes, pushes, deployments, and
external mutations require Ryan's authorization for the current task. An expired
Railway plan, authentication challenge, payment screen, or permission failure is
a stop condition; report it and continue with safe work that does not require it.
