# GATE-HANDOFF-ADDENDUM — in-flight state of the FIRST Gate session (died 2026-08-10 ~01:45 PDT)
Read this IMMEDIATELY AFTER NEXT-GATE-KICKOFF.md. It reconstructs decisions the previous Gate
made that are not yet in PROJECT-STATE.md (it was barred from committing them by its own R38).
Source: owner-relayed fragments of the dead session, verified against executor reports.

## Rulings made by Gate #1 (adopt as binding, tabulate into PROJECT-STATE when committing becomes legal)
- **R38 — docs-commit deferral:** the living docs (PROJECT-STATE.md, RECOVERY.md, kickoffs, indexes,
  this file) must NOT be committed to git while the repo is PUBLIC. Rationale (reconstructed, verify):
  they contain personal information — full local paths, usernames, personal names, workflow details.
  Sequence: repo flips private FIRST, then the docs-commit block goes to Av3.
- **Planned sequence (pre-staged by dead Gate):**
  1. Cv2 closes issue #13 (domain clean) →
  2. Owner flips the GitHub repo to PRIVATE (path was written into START-HERE by the dead Gate's
     plan — if absent there, it's GitHub → repo Settings → General → Danger Zone → Change visibility)
  3. Gate hands Av3 the docs-commit block →
  4. **Notices task** to Av3: add THIRD-PARTY-NOTICES, legal-page attribution, and an
     `-IncludeEngine` hard-stop (license-compliance work re: Fairy-Stockfish/GPL distribution).
- **ZIP question:** left as a passive branch with the owner; default assumption is NO.

## Executor status at handoff
- **Av3 Task 8 (repo hygiene, reduced scope): COMPLETE and verified** — capture branch pushed,
  checkout on main @ f8f43cd matching origin, worktree pruned, zero mismatches. Av3 idle, holding.
- **Cv2:** manual recheck 08:44 UTC still shows sjc1 edge fallback (wildcard cert,
  x-railway-fallback). Scheduled strict recheck 21:40 UTC / 2:40 PM PDT stands. Jimmy's Railway
  click still the pending fix. Issues #6–#10 statused and open; #13 documented.
- **There is no Codex thread B.** All executor work routes to Av3 until /blocks-scope work resumes
  (then the Gate may birth a Bv3 per NEXT-GATE-KICKOFF's hiring pattern).

## Counsel-mode reminder (owner decision, supersedes the separate-Counsel design)
One Claude conversation only. Counsel is a MODE: Gate flags a Counsel-tier question → owner flips
the model picker to Fable 5 / Extra → says "deliberate" → verdict + dissent + falsifiers in-thread
→ flip back to Opus 5 / High. The R22 (engine strategy) brief drafted by the dead Gate should be
re-derived or re-drafted when the topic next arises — do not guess at its contents.

## First actions for the rebooted Gate
1. Complete NEXT-GATE-KICKOFF first-actions (verify main, production, docs).
2. Adopt this addendum. Confirm Task 8 outcome yourself via git (main @ f8f43cd, clean).
3. Await the owner's "status" or next item. The near-term line: Jimmy's click → #13 closes →
   repo private → docs commit → notices task.
