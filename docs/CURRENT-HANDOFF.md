# The Jimmy App — current handoff

**Status date:** 2026-08-31 (America/Los_Angeles)<br>
**Audience:** Ryan, Jimmy, Evan, Codex, Claude, and implementation agents<br>
**Purpose:** a current, evidence-aware handoff that can be read by Claude or Codex
without reconstructing weeks of chat history.

## Executive state

The product has substantial implemented work, but its public website is down.
The immediate cause is operational: Railway refused a source redeploy because the
project trial expired and a paid plan must be selected. This is not evidence of a
new application-code defect.

The repository's historical state documents are useful but inconsistent with the
current environment. This handoff is the short current layer; verify anything
time-sensitive against GitHub, Railway, DNS, and the running app.

## What “everything synced” means

Everything is synced when production serves the current `main`, GitHub contains
the verified operating brief and docket, and a new agent can name the same next
task without needing Ryan to reconstruct missing context.

## Timeline that matters

- **2026-08-12:** GitHub `main` reached commit `bbd7d8b`.
- **2026-08-14 to 2026-08-15:** Jimmy continued messaging Ryan about recovery,
  chess, and a redesigned communication interface.
- **After 2026-08-15:** Ryan stopped replying unexpectedly.
- **2026-08-31:** Ryan returned, requested a factual catch-up, asked for a durable
  bot-to-bot communication surface, authorized GitHub/Railway work, and asked that
  decisions no longer wait on perfect certainty.
- **2026-08-31:** A Railway source redeploy was attempted and refused with:
  `Your trial has expired. Please select a plan to continue using Railway.`

## Verified repository and deployment facts

### GitHub

- Repository: `thejimmyapp/the-jimmy-app`.
- Local `main` and `origin/main` both pointed to `bbd7d8b` before this coordination
  update.
- The GitHub API reported the repository as **public** on 2026-08-31. Older notes
  saying it is private are stale or describe a state that was later reversed.
- The working copy already contains numerous modified and untracked files from
  other work. They must not be swept into unrelated commits.

### Railway

- Project: `thorough-celebration`.
- Service: `TheJimmyapp`.
- Custom domain and Railway domain are still configured as active, but requests
  return Railway's `Application not found` fallback because no deployment is
  running.
- Recent application builds had succeeded and later became `REMOVED`. Railway's
  current service status fell back to an older failed deployment.
- A safe `--from-source` redeploy was selected so local uncommitted files would
  not be uploaded. Railway stopped it before deployment because the trial expired.
- **Required owner action:** select an acceptable Railway plan. After that, rerun
  `railway redeploy --from-source -y`, verify `/health`, then verify both the
  Railway domain and `https://thejimmyapp.com/`.

## Product in one paragraph

The Jimmy App is a collaborative Bughouse review workspace. It reconstructs two
synchronized boards, supports replay and exploration, stores learning moments,
and layers deterministic chess evidence with optional local-model commentary.
Its current visual model is a dark, chess-familiar workspace organized around a
persistent rail, a single primary stage, and a contextual dock. The unusual
onboarding, timer, locked capabilities, and playful antagonism are intentional
product behavior, not generic SaaS decoration.

## Current UI language and constraint

The strongest existing design idea is not a color palette. It is **compressed,
contextual action under time pressure**. Jimmy's recent board screenshot expresses
that well: communication phrases are grouped by intent—coordination, timing,
piece feed, defense, and attack—and given restrained category accents. That is a
real interaction system, not a skin.

What deserves praise and further questioning:

- the phrase taxonomy turns vague chat into one-tap team decisions;
- groups live beside the board and clocks, where decisions happen;
- accent colors indicate intent without repainting the whole interface;
- the dense layout accepts the reality of Bughouse instead of pretending it is a
  calm dashboard;
- the system could generate useful structured events, not only chat text.

Questions for Jimmy: Did he invent the category taxonomy and phrase set? Which
phrases came from actual games, and which were guesses? Did he test the panel at
real time controls? Those answers matter more than the exact font or hex values.

## Bridge: A -> B -> C

### A — current position

- Product code and extensive historical documentation exist.
- The public service is stopped by Railway billing.
- State is distributed across chats, stale ledgers, local files, and infrastructure.
- The private UI-library concept is not yet a secure product surface.

### B — synchronized operating state

- Production runs the current GitHub `main`.
- The hub, current handoff, docket, and GitHub discussion agree.
- A fresh agent can verify facts and identify the single next task.
- Blockers are visible rather than buried in chat.

### C — private UI library

- A separate internal surface for Ryan, Jimmy, and Evan only.
- Above the fold: a plain statement of what the library is and who it serves.
- The full library requires real server-side authentication or a private hosting
  boundary; a password prompt implemented only in browser code is insufficient.
- Large source packs may be downloadable ZIP artifacts, but the index itself
  should remain fast and searchable. A ZIP is distribution, not navigation.
- Do not bolt the full private library onto the public production bundle.

## Evan: useful without becoming a dependency

Evan should be invited into bounded, portfolio-grade work. The product must keep
moving if he does none of it. Five credible options:

1. **45–90 minute interface redline:** annotate one current review screen and
   explain the three highest-impact hierarchy problems.
2. **Two-hour type and spacing specimen:** define a compact scale against real
   dock, board, timer, and annotation content—not an abstract brand board.
3. **Two-to-four-hour communication-panel pass:** turn Jimmy's semantic phrase
   groups into one polished responsive component and document the decisions.
4. **Four-to-six-hour private-library landing concept:** design the above-fold
   explanation, access state, search/filter structure, and one specimen detail.
5. **One-hour portfolio case-study frame:** capture constraint, intervention,
   elapsed time, and measurable before/after outcome.

Ownership or investment language is intentionally absent from the working brief.
The useful offer is simpler: Evan can make a small, visually strong artifact,
honestly state that it took 45 minutes or six hours, and use it in a portfolio.

## Decisions now in force

- Repository-local agent memory replaces the idea of invisible global memory.
- The GitHub docket issue is the conversation channel; checked-in Markdown is the
  durable record.
- Restore and synchronize before beginning a broad visual redesign.
- The UI library is private and separate from the public app bundle.
- The communication taxonomy is a product feature worth preserving; exact color
  and type choices remain intentionally flexible.
- No deliverable depends on Evan.
- The dental-office website-service idea is parked for one week, not activated.

## Immediate next actions

1. Ryan selects a Railway plan he is comfortable paying for.
2. An agent redeploys from GitHub source and verifies health plus both domains.
3. A5 performs a read-only UI-library inventory and produces a bounded structure
   proposal; it does not redesign the application or move specimen files.
4. Jimmy answers the three communication-panel questions above when convenient.
5. Evan receives one bounded option only after the current UI and library inventory
   are coherent enough to show him.
