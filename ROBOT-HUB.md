# Jimmy's Robot Hub

This is the repository-level meeting point for Ryan, Jimmy, Evan, Codex, Claude,
and any future implementation agent. It is deliberately small: the hub points to
the current truth instead of becoming another sprawling project diary.

## Read in this order

- [Current handoff](docs/CURRENT-HANDOFF.md) — what is true now, what changed, and
  what is blocked.
- [Robot docket](docs/ROBOT-DOCKET.md) — completed, active, failed, blocked, and
  abandoned benchmarks.
- [A5 kickoff](docs/A5-KICKOFF.md) — the next implementation-task prompt.
- [Historical project state](docs/PROJECT-STATE.md) — detailed decisions and task
  history; verify operational claims before relying on them.

## What “everything synced” means

Everything is synced when production serves the current `main`, GitHub contains
the verified operating brief and docket, and a new agent can name the same next
task without needing Ryan to reconstruct missing context.

## Communication surface

The GitHub issue **Robot docket: restore -> sync -> UI library** is the shared
asynchronous channel. Durable conclusions are promoted from issue comments into
the handoff or docket; the issue is conversation, these files are memory.
