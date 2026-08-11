# RECOVERY — if this Claude thread is lost or disconnected
Keep next to PROJECT-STATE.md (repo: `docs/`). Written 2026-08-09.

## What the Claude thread does
Claude = manager/filter. It writes every Codex prompt, reviews every Codex report BEFORE a new
task goes out, holds the decision log, and asks Ryan multiple-choice questions at decision gates.
Codex threads are executors only; they never receive Claude's analysis, only quoted prompt blocks.

## Cold-start a replacement Claude thread
1. New Cowork/Claude Code session. Attach or paste `docs/PROJECT-STATE.md` in the first message.
2. First message template:
   > You are my manager/filter for thejimmyapp, coordinating Codex executor threads.
   > PROJECT-STATE.md attached is the canonical decision record — adopt its rulings, protocol,
   > vocabulary (RAIL/STAGE/DOCK, building-blocks blocks, seat terms), and registry as binding.
   > Current in-flight state: [paste last known task status]. Resume by reviewing the next
   > Codex report I paste. Ask clarifying questions via multiple choice at decision gates.
3. Also attach `building-blocks.html` (11-block UI vocabulary) if the thread will touch UI.

## Cold-start a replacement Codex thread
Rotate threads when their context degrades (sign: repeated auto-compaction notices).
Kickoff template:
   > Thread kickoff — you are Thread [A|B] for thejimmyapp. Read docs/PROJECT-STATE.md and treat
   > its rulings as binding. Claude-relayed decisions are the review gate: concise reports, facts
   > vs assumptions separated, no commit/merge/publish without green light, one task per prompt,
   > stop when the deliverable is done. Your write scope: [A: shell/funnel/backend | B: /extraction,
   > scratch/, docs/ — never main-app files]. First task follows.

## Where things live
- Repo (main checkout): /Users/user/Documents/Jimmys-App
- Thread A worktree: /Users/user/.codex/worktrees/217a/thejimmyapp
- Canonical docs: docs/PROJECT-STATE.md · docs/moment-addressing-engine-handoff.md (B2 report)
- UI vocabulary: building-blocks.html (Downloads + Claude artifact "ui-building-blocks")
- Prior-art audit baseline: bughouse-viewer @ adfa182 (independently audited twice, findings in PROJECT-STATE)

## Non-negotiables that must survive any restart
- Fail-closed data handling (unknown result codes / schema drift → exclude, never guess).
- Techniques-only from bughouse-viewer glue code; hy.js is MIT (notice required); assets never.
- resultMessage is never parsed; structured result codes only.
- Keyboard-only onboarding; locked (inert) chrome, not hidden chrome.
- Deploy gate = first review renders (Task 4c), not before.
