# `/blocks` temporary specimen sources

This inventory records the provenance and intended use of the literal screenshot references on the public `/blocks` page. Ruling R24 in [`PROJECT-STATE.md`](./PROJECT-STATE.md) is binding: these files are temporary build targets and must never be migrated into application components.

## Owner-supplied specimens

| Block | File | Source recorded by the canonical building-blocks artifact | Intended lesson |
|---|---|---|---|
| 12 | `specimen-12-eval-row.jpg` | [online-dropchess-stockfish](https://online-dropchess-stockfish.onrender.com/analysis.html) | Ranked engine line, depth, expand control, enable state, and drop-notation variation. |
| 13 | `specimen-13-flashcard.jpg` | ChessTempo-style study embed from the owner's Chess.com blog | Board + move list + personal annotation + replay/share controls as a model for a saved moment card. |

The exact public URL for block 13 was not present in the supplied artifact or image metadata, so the page does not invent one.

## Bv2 captures

All three captures were taken on 2026-08-09 from public pages without authentication.

| Block | File | Exact source | Intended lesson |
|---|---|---|---|
| 14 | `specimen-14-lichess-analysis.png` | [Lichess Crazyhouse analysis](https://lichess.org/analysis/crazyhouse) | Modular analysis column, pocket rails, engine controls, content well, and compact navigation beside a primary board. |
| 15 | `specimen-15-chesscom-notification-settings.png` | [Chess.com Help Center: How do I manage my notifications?](https://support.chess.com/en/articles/8618508-how-do-i-manage-my-notifications) | Collapsible notification categories, expanded state, per-event toggles, and delivery-channel choices. |
| 16 | `specimen-16-lichess-typography-h1-h2.png` | [About lichess.org](https://lichess.org/about) | Sentence-case H1/H2 scale, weight, spacing, and relationship to body copy. |

## Storage boundary

- `docs/specimens/` is the source/provenance collection.
- `frontend/public/blocks/specimens/` is the standalone route's static copy.
- No specimen is imported by React, included under `frontend/src/components/`, or used by `/` or `/extraction`.
- Future components may copy structural lessons only and must use original project tokens and assets.
