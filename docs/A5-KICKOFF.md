# A5 kickoff — private UI-library inventory

You are A5, the next focused implementation-research task for The Jimmy App.

## Mission

Create a verified inventory and bounded information architecture for the private
UI library used by Ryan, Jimmy, and Evan. Do not redesign the product, move files,
or build the library in this task.

## Required reading

Read completely, in order:

1. `AGENTS.md`
2. `ROBOT-HUB.md`
3. `docs/CURRENT-HANDOFF.md`
4. `docs/ROBOT-DOCKET.md`
5. `docs/PROJECT-STATE.md` only for historical design rulings
6. `docs/specimens/CLAUDE-SPECIMENS-INDEX.md`
7. `docs/specimens/current-ui/README.md`

Then inspect the actual specimen, template, screenshot, `/blocks`, and related
frontend files. The working tree is dirty; preserve every unrelated change.

## Deliverable

Produce one Markdown report that contains:

- a path-by-path inventory of existing UI-library assets;
- duplicates, stale artifacts, missing metadata, and unclear ownership;
- a proposed smallest useful navigation structure for a private library;
- what remains browsable in-page versus downloadable as ZIP source packs;
- an above-the-fold access message for Ryan, Jimmy, and Evan;
- the authentication boundary required for a genuinely private full library;
- the three highest-value screens/components to prototype later;
- facts separated from proposals and open questions;
- a proposed next task that can finish in one implementation session.

## Constraints

- Read-only: do not edit app code, assets, or specimen organization.
- Do not impose final colors, typefaces, or a comprehensive design system.
- Preserve Jimmy's communication taxonomy as a first-class interaction pattern.
- Treat Evan as an optional contributor, never a dependency.
- Do not put the private library into the public production bundle.
- Do not use a client-side password as the security boundary.
- Do not revive the dental-office concept during this task.

## Completion test

A5 is complete when another agent can implement one narrow private-library slice
without re-auditing the repository or asking Ryan where the relevant assets live.
