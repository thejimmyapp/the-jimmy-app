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

Numbering registry: blocks 1–11 canonical, 12–16 Bv2, 17–21 curated. The next specimen number is 22.

## Storage boundary

- `docs/specimens/` is the source/provenance collection.
- `frontend/public/blocks/specimens/` is the standalone route's static copy.
- No specimen is imported by React, included under `frontend/src/components/`, or used by `/` or `/extraction`.
- Future components may copy structural lessons only and must use original project tokens and assets.
