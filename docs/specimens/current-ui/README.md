# current-ui — the capture pack
Fixed-scale, labeled screenshots of the app AS IT CURRENTLY SHIPS, for redlining in Sketch/Photoshop.
Maintained by Claude (review gate). This folder is repopulated on request — owner says
"repopulate the pack" in the Claude thread and a fresh capture session replaces the set.

## Protocol
- Captures via any deterministic browser at the fixed viewport (1440×900, default zoom) against the latest merged build (local preview or production).
- Fixed width: component crops normalized to 1300px wide, JPEG q82 — redline overlays line up pixel-for-pixel across versions.
- Naming: `current-<nn>-<surface>.jpg` (e.g. current-01-entry, current-02-guest-list, current-03-review-stage,
  current-04-dock-moves, current-05-dock-info, current-06-quest-tab, current-07-moment-editor, current-08-library).
- Each repopulation OVERWRITES the set (git history preserves priors). Date recorded below.
- Owner redlines: exported images come back as `current-<nn>-<surface>-redline.<ext>` in this same folder,
  committed by Claude; redlines are the working spec for the skin pass (Task 7).

## Status
- v1 (2026-08-09): first full pack captured from merged main `8cc0622` (Task 5g). The production
  build matched the local build fingerprints (`index-DoJb7a2W.js`, `index-DRRLd_1Q.css`). Captures
  used headless Chrome at 1440×900, device scale 1, default zoom, reduced motion, and disabled
  screenshot-time animations. Component crops were normalized to 1300px wide at JPEG q82.
- v0 (2026-08-10): folder created; first full population scheduled immediately after Task 5g merges
  (guest list + dock are changing until then — capturing now would burn redline effort on stale UI).

## v1 capture manifest

| File | Surface and state |
|---|---|
| `current-01-entry.jpg` | Keyboard entry screen with Guest Spawn focused. |
| `current-02-guest-list.jpg` | Five-item live guest matchup list, regenerate control, and rationale disclosure. |
| `current-03-review-stage.jpg` | Selected guest replay at its initial position, staged board and controls. |
| `current-04-dock-moves.jpg` | Review dock with the synchronized First Board / Second Board move tracks. |
| `current-05-dock-info.jpg` | Review result, consolidated replay-limitations expander, and game metadata. |
| `current-06-quest-tab.jpg` | Locked quest preview at 0/3 learning moments with countdown and explanatory copy. |
| `current-07-moment-editor.jpg` | Learning-moment editor with an `!?` glyph and representative capture-only note. |
| `current-08-library.jpg` | Guest learning library containing that representative saved moment. |

The guest list and selected match reflect live production data at capture time. The representative
learning moment existed only in the ephemeral headless browser context; no capture state was written
to the application or backend.

## Starter redline list (from owner's own captures, pre-pack)
1. Info tab: 3 stacked warning boxes → consolidated to one expander (landing in 5g rider).
2. User-facing "175% zoom" note → removed (5g rider).
3. Dock header row crowded; "REVIEW WORKSPACE" label possibly redundant.
4. Empty DROPPERS wells = tall dead space; collapse-when-empty candidate.
5. Focus chip verbose ("GAME REVIEW · MOVE 0 · FIRST BOARD FOCUS" → "0/93 · First").
6. Wood/cream boards vs dark/cyan shell — the token unification IS Task 7.
