# `/blocks` temporary specimen sources

This inventory records the provenance and intended use of the literal screenshot references on the public `/blocks` page. Ruling R24 in [`PROJECT-STATE.md`](./PROJECT-STATE.md) is binding: these files are temporary build targets and must never be migrated into application components.

## Owner-supplied specimens

| Block | File | Source recorded by the canonical building-blocks artifact | Intended lesson |
|---|---|---|---|
| 12 | `specimen-12-eval-row.jpg` | [online-dropchess-stockfish](https://online-dropchess-stockfish.onrender.com/analysis.html) | Ranked engine line, depth, expand control, enable state, and drop-notation variation. |
| 13 | `specimen-13-flashcard.jpg` | [RyanTime — “Dear Lord, someone please explain this to me”](https://www.chess.com/blog/RyanTime/dear-lord-someone-please-explain-this-to-me-a-two-star-puzzle-rated-3600) | Board + move list + personal annotation + replay/share controls as a model for a saved moment card. |

## Bv2 captures

All three captures were taken on 2026-08-09 from public pages without authentication.

| Block | File | Exact source | Intended lesson |
|---|---|---|---|
| 14 | `specimen-14-lichess-analysis.png` | [Lichess Crazyhouse analysis](https://lichess.org/analysis/crazyhouse) | Modular analysis column, pocket rails, engine controls, content well, and compact navigation beside a primary board. |
| 15 | `specimen-15-chesscom-notification-settings.png` | [Chess.com Help Center: How do I manage my notifications?](https://support.chess.com/en/articles/8618508-how-do-i-manage-my-notifications) | Collapsible notification categories, expanded state, per-event toggles, and delivery-channel choices. |
| 16 | `specimen-16-lichess-typography-h1-h2.png` | [About lichess.org](https://lichess.org/about) | Sentence-case H1/H2 scale, weight, spacing, and relationship to body copy. |

## Curated specimens

The owner-curated registry is recorded in [`CLAUDE-SPECIMENS-INDEX.md`](./specimens/CLAUDE-SPECIMENS-INDEX.md). These continue the shared numbering without renumbering earlier blocks.

| Block | File | Exact source | Intended lesson |
|---|---|---|---|
| 17 | `specimen-17-archive-favorites-rows.jpg` | [Chess.com Favorites archive](https://www.chess.com/member/fearingforfreddy/games?activeTab=favorites) | Archive row anatomy, favorite/bookmark state, review action, filters, and selection. |
| 18 | `specimen-18-stats-table.jpg` | [Chess.com member stats](https://www.chess.com/member/fearingforfreddy/stats) | Dense rating table, deltas, disclosure, and visible premium depth. |
| 19 | `specimen-19-clock-top.jpg` | [Chess.com game analysis](https://www.chess.com/analysis/game/live/172758001776/analysis) | Inactive player clock with reduced contrast. |
| 20 | `specimen-20-clock-bottom-active.jpg` | [Chess.com game analysis](https://www.chess.com/analysis/game/live/172758001776/analysis) | Active player clock with a bright face; paired with block 19. |
| 21 | `specimen-21-analysis-panel.jpg` | [Chess.com game analysis](https://www.chess.com/analysis/game/live/172758001776/analysis) | Full analysis dock hierarchy, eval lines, classified moves, time bars, and footer actions. |

## Bv2 targeted Lichess study annotations

These captures are intentionally limited to the three study-annotation behaviors requested for design research. They are historical visual references, not claims about the current pixel styling of Lichess. All were collected on 2026-08-09.

| Block | File | Exact source | Intended lesson |
|---|---|---|---|
| 22 | `specimen-22-lichess-position-comments.png` | [Official Lichess study article](https://lichess.org/@/lichess/blog/study-chess-the-lichess-way/V0KrLSkA); [exact image asset](https://image.lichess1.org/display?h=0&op=resize&path=lichess:ublog:V0KrLSkA:mCmtVUyF7u02:dochdTaC.png&w=800&sig=b66e182153e8367768a0a58a54a9bdc5487af7b2) | Author-attributed prose attached to the selected position, with edit/delete affordances. |
| 23 | `specimen-23-lichess-glyph-picker.png` | [Official Lichess study article](https://lichess.org/@/lichess/blog/study-chess-the-lichess-way/V0KrLSkA); [exact image asset](https://image.lichess1.org/display?h=0&op=resize&path=lichess:ublog:V0KrLSkA:3tK73MEvpZ4L:F7R4Wkq2.png&w=800&sig=84e9dcfd188a05e9960b2484973e8a0a47f2d5cd) | Named move glyph choices, including `!`, `?`, `!!`, `??`, and `!?`, plus position/observation annotations. |
| 24 | `specimen-24-lichess-position-variations.png` | [Lichess forum source page](https://lichess.org/forum/lichess-feedback/showing-of-possible-options-gone-from-studies); [original community screenshot](https://i.imgur.com/1JOtKQS.png) | Alternate continuations shown as sibling choices at the current study path. The stored image is a lossless crop to the move panel and fork control; no pixels were otherwise altered. |

## Bv2 paired-viewer capture

Specimen 25 was captured on 2026-08-09 from the public viewer with the requested match loaded and
both linked boards visible.

| Block | File | Exact source | Intended lesson |
|---|---|---|---|
| 25 | `specimen-25-bmacho-loaded-match.jpg` | [bmacho Bughouse Viewer — match 180616071971](https://bmacho.github.io/bughouse-viewer/view.html?game_id=180616071971) | Preserve both boards, four player identities and ratings, clocks, pockets, paired navigation, position addressing, variations, and a position comment around one learning moment. Viewer piece graphics have unclear provenance and remain reference-only. |

## Design backlog

block 13 to be redesigned as lichess-study × chess.com hybrid card (owner redline era).

### AGPL source-code boundary

The narrowly selected upstream excerpts are stored only in [`LICHESS-STUDY-ANNOTATION-AGPL-REFERENCE.md`](./specimens/LICHESS-STUDY-ANNOTATION-AGPL-REFERENCE.md). They are pinned to Lichess `lila` revision [`9d0e1761e0841b1018a0b2b19e08fc9b397f5689`](https://github.com/lichess-org/lila/tree/9d0e1761e0841b1018a0b2b19e08fc9b397f5689), whose repository license is [GNU Affero General Public License v3](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/LICENSE).

Every excerpt in that file is headed **AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP**. It records only:

- glyph selection and position-bound toggling;
- comment identity, position path, and textarea behavior;
- sibling-variation rendering and adding a continuation at a selected tree path.

It intentionally omits unrelated Lichess study modules and infrastructure.

Numbering registry: blocks 1–11 canonical, 12–16 Bv2, 17–21 curated, 22–24 Bv2 annotation, 25 Bv2 paired viewer. The next specimen number is 26.

## Storage boundary

- `docs/specimens/` is the source/provenance collection.
- `frontend/public/blocks/specimens/` is the standalone route's static copy.
- Lichess AGPL-3.0 source excerpts exist only in `docs/specimens/LICHESS-STUDY-ANNOTATION-AGPL-REFERENCE.md`; the public route contains links and behavioral descriptions, not source code.
- No specimen is imported by React, included under `frontend/src/components/`, or used by `/` or `/extraction`.
- Future components may copy structural lessons only and must use original project tokens and assets.
