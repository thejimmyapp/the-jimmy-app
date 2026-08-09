# `bmacho/bughouse-viewer` audit

Audit date: 2026-08-09 (America/Los_Angeles)

Audited revision: [`adfa1820859369d3376b8c41128b0ae82e9099b3`](https://github.com/bmacho/bughouse-viewer/tree/adfa1820859369d3376b8c41128b0ae82e9099b3)
Reference input: `https://www.chess.com/game/live/180565671769?username=fearingforfreddy`

The repository was cloned only to `scratch/bughouse-viewer`. No source, assets, or package from it were copied into the application or dependency tree.

## Facts

### 1. License: no repository-wide code-reuse grant was found

There is **no license file at the repository root**. The only license file is [`hy.js/LICENSE`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/hy.js/LICENSE#L1-L20), inside the `hy.js` subdirectory. It says, verbatim:

> MIT License
>
> Copyright (c) 2021 bmacho
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

What this plainly permits: code reuse of the software actually covered by that MIT license, with the copyright and permission notice preserved. What it does **not** establish: that the top-level files written to ingest Chess.com data—`view.html`, `chesscom_movelist_parse.js`, and `generate_bpgn.js`—are licensed under MIT. Those files sit outside the licensed subdirectory and no root license applies the MIT terms to the whole repository.

There is an additional rights warning in [`view.html:3-12`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/view.html#L3-L12): the older viewer code says it may be used/copied/modified/distributed, while bmacho says the pieces came from BughouseDB and writes, “No idea about the rights.” That is not a clean provenance chain for the assets.

**Conclusion:** treat the top-level ingestion/reconstruction code and visual assets as **techniques-only** unless the copyright owner supplies an explicit license covering them. This task reused no code.

### 2. Core trick: exact requests for the supplied URL

The page extracts the first digit sequence from pasted text and discards the rest ([`view.html:65-87`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/view.html#L65-L87)). Because `180565671769 > 7000000000`, it selects an ID distance of 2 and makes these three concurrent browser requests ([`view.html:96-116`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/view.html#L96-L116)):

```text
GET https://chess-com-proxy.bmacho.workers.dev/game/180565671769
GET https://chess-com-proxy.bmacho.workers.dev/game/180565671767
GET https://chess-com-proxy.bmacho.workers.dev/game/180565671771
```

There are no query parameters, request bodies, or authorization parameters. The relevant source fragment is:

```js
var game_id_diff = game_id > 7000000000 ? 2 : 1
var getgameA = $.getJSON(proxyurl + game_id)
var getgameBl = $.getJSON(proxyurl + (game_id - game_id_diff))
var getgameBu = $.getJSON(proxyurl + (game_id + game_id_diff))
```

The repository identifies the upstream source format as `https://www.chess.com/callback/live/game/GAME_ID` ([`chesscom_movelist_parse.js:2-4`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/chesscom_movelist_parse.js#L2-L4)), and `view.html` says the Worker exists because the callback endpoint cannot be read cross-origin in browser JavaScript ([`view.html:102-104`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/view.html#L102-L104)). The Worker implementation is not in this repository, so its upstream forwarding logic cannot be independently source-audited here. Its returned JSON matched the direct callback response in the fields inspected.

The Chess.com URL’s `username=fearingforfreddy` parameter is **not used at all**. It is neither forwarded nor used to select, orient, or label a board. The paste path takes only the first digit sequence. The userscript-generated viewer URL likewise contains `game_id`, with optional `flip` and `move`, but no username ([`BHV-links.user.js:97-108`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/BHV-links.user.js#L97-L108)).

### 3. Partner-board linkage: explicit UUID, then numeric-neighbor lookup

**The second board is linked by an explicit response field, not inferred from players or moves.**

The primary response contains:

```json
{
  "id": 180565671769,
  "uuid": "6a69035d-93b0-11f1-b6b5-6cfe54652c60",
  "partnerGameId": "6a69035c-93b0-11f1-b6b5-6cfe54652c60"
}
```

The `partnerGameId` name is misleading for this response: its value is the partner board’s **UUID**, not its numeric game ID. The `id - 2` response contains:

```json
{
  "id": 180565671767,
  "uuid": "6a69035c-93b0-11f1-b6b5-6cfe54652c60",
  "partnerGameId": "6a69035d-93b0-11f1-b6b5-6cfe54652c60"
}
```

The viewer compares the two prefetched neighbors’ `game.uuid` values to the primary `game.partnerGameId` and selects the match ([`view.html:119-137`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/view.html#L119-L137)):

```js
partnerid = json_replyA[0].game.partnerGameId
if (BL.game.uuid == partnerid) { /* use lower neighbor */ }
else if (BU.game.uuid == partnerid) { /* use upper neighbor */ }
```

Therefore the linkage is **explicit field + separate calls to guessed nearby numeric IDs**. The field tells the viewer which returned game is the partner, but does not provide the numeric URL it needs. The code to request `/game/<partner UUID>` is commented out as not working. If the actual partner is not at `±1` for old IDs or `±2` for newer IDs, the explicit field is present but this implementation cannot retrieve that board.

If `partnerGameId` is absent, the fallback is inference: inspect both numeric neighbors, prefer the only one whose `game.type` is `bughouse`, or choose the lower ID if both are bughouse ([`view.html:141-172`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/view.html#L141-L172)). That fallback can silently pair the wrong boards.

### 4. Real-response field inventory

The Worker and direct callback were fetched anonymously on 2026-08-09. For the linked pair `180565671769` / `180565671767`, the response has top-level `game` and `players` objects.

| Requested data | Present | Evidence and limits |
|---|---:|---|
| Moves | Yes | Each board has `moveList`, an opaque two-character-per-ply Chess.com encoding, plus `lastMove` and `plyCount`. It is not SAN/UCI/PGN. The viewer decodes normal moves, castling, en passant, promotion, and drops ([`chesscom_movelist_parse.js:14-40`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/chesscom_movelist_parse.js#L14-L40)). |
| Drops | Yes, encoded in `moveList` | Leading symbols `&-*+=` represent dropped Q/N/R/B/P respectively ([`chesscom_movelist_parse.js:21-24`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/chesscom_movelist_parse.js#L21-L24), [`:226-232`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/chesscom_movelist_parse.js#L226-L232)). There is no explicit per-ply pocket/hand snapshot. |
| Clocks | Yes | `moveTimestamps` is a comma-separated remaining-clock value per ply, in tenths of a second; `baseTime1`, `timeIncrement1`, and `timeControl.baseMs` are also present. For board A the first values are `1800,1800,1796,1797`; board B starts `1787,1799,1783,1795`. |
| Absolute move timestamps | No | The response gives remaining clocks, not a wall-clock timestamp for each move. The viewer derives elapsed move times from the clocks/increment and merges both lists ([`generate_bpgn.js:59-123`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/generate_bpgn.js#L59-L123)). Equal/lag-sensitive ordering is therefore reconstructed rather than supplied as one authoritative match event stream. |
| All four ratings | Yes | Board A headers: `ArchdukeShrimp` 2163, `FearingForFreddy` 2182. Board B: `sassystacks30` 1965, `Wakatakakagi` 2041. The same board-local values also appear under `players.top/bottom.rating`; rating changes (`±8`) are present. |
| Termination reason | Yes | Board A: `gameEndReason: "checkmated"`, `isCheckmate: true`, `colorOfWinner: "white"`, `resultMessage`/`pgnHeaders.Termination: "ArchdukeShrimp won by checkmate"`. Board B: `gameEndReason: "bughousepartnerlose"` and `"Wakatakakagi won with their bughouse partner"`. |
| Which seat caused match end | Derivable exactly for this game | The terminating event happened on board A: WhiteA `ArchdukeShrimp` checkmated BlackA `FearingForFreddy`. Board B merely records the linked partner loss. There is no literal `terminatingSeat: "WhiteA"` field; seat comes from board identity + color + headers. |
| Partner linkage | Yes | Reciprocal `partnerGameId` UUIDs as described above. |
| Starting position | Yes | `pgnHeaders.FEN` and `SetUp`; for this game it is the normal initial board. |
| Current/per-ply positions | No | No position history, per-ply FEN, explicit capture-transfer events, or pocket snapshots. Those must be reconstructed. |
| Match-level canonical record | No | Each response is one board. There is no single match object containing both numeric IDs, four seats, one global move sequence, or one canonical BPGN. |

The parser itself warns that it does not track promoted pieces and that its output lacks enough in-hand data to serve as a general new bughouse/crazyhouse viewer ([`chesscom_movelist_parse.js:38-40`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/chesscom_movelist_parse.js#L38-L40)). That is a limitation of this viewer’s conversion, not proof that the paired raw move streams are unreconstructable.

### 5. PGN/BPGN construction and export format

The viewer decodes each board’s `moveList`, derives one interleaved order from both boards’ clock arrays, and emits classic two-board BPGN notation. Board letters are uppercase/lowercase by side: for example `1A.`/`1a.` and `1B.`/`1b.`. Drops are written as `P@h6`; the remaining clock after each ply is placed in braces such as `{170.4}` ([`generate_bpgn.js:3-55`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/generate_bpgn.js#L3-L55)).

Headers are assembled from the two board responses ([`generate_bpgn.js:127-170`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/generate_bpgn.js#L127-L170)):

```bpgn
[Event "Live Chess - Bughouse"]
[Site "Chess.com"]
[Date "2026.08.09"]
[Time "5:10:33 GMT+0000"]
[WhiteA "ArchdukeShrimp"][WhiteAElo "2163"]
[BlackA "FearingForFreddy"][BlackAElo "2182"]
[WhiteB "sassystacks30"][WhiteBElo "1965"]
[BlackB "Wakatakakagi"][BlackBElo "2041"]
[TimeControl "180"]
[Result "1-0"]
```

It then adds a `{C:...}` comment naming the teams and giving both numeric board URLs, followed by the interleaved moves. A real generated fragment begins:

```bpgn
1A. d4 {180} 1a. d5 {180} 2A. Nb1c3 {179.6}
2a. Bc8f5 {179.7} 3A. e4 {179.3} 1B. d4 {178.7}
```

The end is emitted as `{ArchdukeShrimp won by checkmate} *`: the header carries `1-0`, but the movetext terminator is always `*` in this generator. The generated string is logged and handed to the embedded BPGN viewer ([`view.html:178-191`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/view.html#L178-L191)); the older viewer provides a “Generate download link of BPGN” path ([`hy.js/hy.js:419-420`](https://github.com/bmacho/bughouse-viewer/blob/adfa1820859369d3376b8c41128b0ae82e9099b3/hy.js/hy.js#L419-L420)).

### 6. API status, CORS, authentication, and stability risk

`/callback/live/game/{id}` is an internal web callback, not a documented Chess.com Published Data API endpoint. The live direct response identified its route internally with:

```text
x-chesscom-matched: web_callback_load_game_live_data
x-chesscom-server-pool: k8s-prod-fpm-callback
```

Chess.com’s documented PubAPI is under `https://api.chess.com/pub/...`; its [official overview](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it) does not document this callback route.

**CORS was verified with actual `GET` requests carrying `Origin: https://example.test`:**

```text
Direct https://www.chess.com/callback/live/game/180565671769
HTTP/2 200
(no Access-Control-Allow-Origin header)

Proxy https://chess-com-proxy.bmacho.workers.dev/game/180565671769
HTTP/2 200
access-control-allow-origin: *
```

Thus anonymous command-line/server-side access currently works for the direct endpoint, but unrelated browser JavaScript cannot read the direct response. The author’s Worker is browser-readable today. The same result was observed for both linked boards and the upper neighbor.

No request sent an authorization header or pre-existing cookie; all six low-rate validation requests returned `200`. The direct endpoint set visitor/session cookies in its response, but did not require them for these finished public games. Neither endpoint returned a rate-limit header, `Retry-After`, or `429` in this small sample. No stress test was performed, so the absence and threshold of rate limiting are unknown.

**Stability risk: high for a production dependency.** Any of the following breaks this approach:

- Chess.com removes or protects the internal callback route, changes the JSON shape, renames/removes `partnerGameId`, changes its UUID semantics, or changes the undocumented two-character move encoding.
- Numeric partner IDs stop being adjacent by exactly 1 or 2. The explicit UUID then identifies a partner the viewer still cannot fetch.
- Clock units/semantics change, breaking cross-board interleaving and BPGN order.
- The personal Cloudflare Worker is disabled, rate-limited, changes behavior, or becomes unavailable. It has no documented contract or repository here.
- Chess.com starts requiring auth, bot mitigation, a particular User-Agent, or server-side CORS policy incompatible with the proxy.

The most fragile element is not decoding; it is discovery of the partner’s numeric ID through adjacency plus dependence on an unaffiliated proxy.

### 7. Engine feasibility assessment (no engine or package added)

The audited viewer integrates **no engine**. Its top-level flow fetches, decodes, generates BPGN, and replays it; no Stockfish/Fairy-Stockfish module, worker, evaluation command, or engine dependency appears in the repository.

A browser-capable engine build does exist: [`fairy-stockfish-nnue.wasm`](https://www.npmjs.com/package/fairy-stockfish-nnue.wasm), a WebAssembly/SIMD port used for client-side analysis. The upstream [Fairy-Stockfish project](https://github.com/fairy-stockfish/Fairy-Stockfish#supported-games) explicitly lists both Crazyhouse and Bughouse, and its UCI variant mechanism supports selecting them. A separate package, [`ffish-es6`](https://www.npmjs.com/package/ffish-es6), provides WASM rules/bindings (FEN, legal moves, SAN, PGN parsing) and lists both variants, but it is not the search-engine worker itself.

The exact published engine package was downloaded to temporary scratch storage and inspected without installation. Its registry metadata was:

```json
{
  "name": "fairy-stockfish-nnue.wasm",
  "version": "1.1.11",
  "description": "WebAssembly port of Fairy-Stockfish with NNUE support, optimized via WASM SIMD",
  "license": "GPL-3.0",
  "dist": {
    "unpackedSize": 1705721,
    "fileCount": 5
  }
}
```

Measured package artifacts were:

```text
517,911 bytes  fairy-stockfish-nnue.wasm-1.1.11.tgz
 64,273 bytes  stockfish.js
1,636,483 bytes stockfish.wasm
  3,321 bytes  stockfish.worker.js
  1,117 bytes  uci.js
```

Variant support was also verified from the exact binary, rather than inferred only from upstream documentation. Running its UCI handshake produced a combo containing both variants:

```text
option name UCI_Variant type combo default chess ... var bughouse ... var crazyhouse ...
```

After `setoption name UCI_Variant value bughouse`, `position startpos`, and `go depth 1`, that binary returned:

```text
info string classical evaluation enabled
info depth 1 seldepth 1 multipv 1 score cp 100 nodes 39 nps 3000 tbhits 0 time 13 pv e2e3
bestmove e2e3
```

This substantiates a narrow fact: package `fairy-stockfish-nnue.wasm@1.1.11` can run a browser-targeted Fairy-Stockfish search with the `bughouse` variant selected, and the same binary advertises `crazyhouse`. It does **not** establish that feeding one board produces a fully coupled two-board match evaluation; that remains an engineering assessment described below.

Registry/package facts observed on 2026-08-09:

| Package | Version | Purpose | Package size | License |
|---|---:|---|---:|---|
| `fairy-stockfish-nnue.wasm` | 1.1.11 | UCI search engine, WASM SIMD/pthreads | 1,705,721 bytes unpacked; `stockfish.wasm` is 1,636,483 bytes; registry tarball 517,911 bytes | GPL-3.0 |
| `ffish-es6` | 0.7.9 | Rules/position library, not queued search | 1,105,264 bytes unpacked; `ffish.wasm` is 920,681 bytes | GPL-3.0 |

What a later implementation would need:

1. Correctly decode each raw board’s moves and replay both boards as one event stream, transferring captured pieces to the partner’s pocket. This viewer’s parser is not sufficient as-is because of its stated promoted-piece/hand limitation.
2. At each desired evaluation point, serialize the board plus its current pocket in variant FEN. Fairy-Stockfish’s Bughouse rules model pieces arriving from an external board (`twoBoards`); Crazyhouse instead returns captures to the same board’s pocket.
3. Run the engine off the UI thread and speak UCI: `setoption name UCI_Variant value bughouse`, `position fen <variant FEN>`, then a bounded `go depth N`, `go nodes N`, or `go movetime N`. Parse `info` lines until `bestmove`; issue `stop` before changing jobs.
4. Add an application-owned FIFO/priority queue with cancellation and a single active search per worker. Cache results by variant FEN + search budget. A full review should sample important positions rather than evaluate every ply unbounded.
5. Treat each board evaluation as a local conditional assessment. Fairy-Stockfish’s Bughouse support understands external piece flow, but one local FEN does not by itself express and jointly search the complete simultaneous state, clocks, and future decisions of both boards. A truly coupled match score would require orchestration/modeling beyond two independent engine calls.

Operational cost is material but feasible: roughly 1.7 MB of shipped engine assets before caching/compression, sustained CPU during search, memory for the WASM heap/hash, startup/compilation latency, and mobile battery/thermal impact. The distributed build uses pthreads/shared WASM memory, so deployment must provide cross-origin isolation (COOP/COEP); [Emscripten’s official pthread documentation](https://emscripten.org/docs/porting/pthreads.html) states that pthread builds will not work when those headers are absent. This can affect other cross-origin resources and popup behavior and must be tested at the site level.

Licensing is also a product constraint: Fairy-Stockfish and both packages are GPL-3.0. The upstream [terms of use](https://github.com/fairy-stockfish/Fairy-Stockfish#terms-of-use) require distributing the corresponding source—or a pointer to the source capable of producing the exact binary—and publishing engine modifications under GPL. This is an engineering assessment, not legal advice; distribution design should receive license review before adoption.

## Recommendations

1. **Do not copy the top-level viewer code or assets.** Reimplement the documented technique against independently written schemas/decoders if product/legal review approves use of the endpoint.
2. **Do not make the personal Worker a production dependency.** If this data source is approved, operate a controlled server-side fetch layer with timeouts, response-shape validation, caching, observability, and a kill switch. Confirm Chess.com’s terms/developer path first.
3. **Solve partner discovery before UI integration.** Adjacency is not a durable identifier-resolution strategy. Without an approved way to resolve the explicit partner UUID to a numeric game endpoint, imports will remain probabilistic.
4. **Preserve raw responses and reconstruction confidence.** A decoder should fail closed on unknown symbols/schema versions and record whether the global interleaving is exact or inferred.
5. **Prototype the engine separately only after data reconstruction is trustworthy.** Begin with a lazy-loaded single worker, short fixed budgets, sampled positions, and clearly label local-board evaluations as non-coupled.

## Assumptions and limits

- Live field claims are facts about the supplied match and the responses observed on 2026-08-09; undocumented responses can differ by game era, game state, or account state.
- The Worker’s upstream implementation is inferred from the audited repository comment and matching response content; its private Worker source was unavailable.
- Rate-limit conclusions are deliberately limited to “not observed in six low-rate requests.”
- License scope is a conservative reading of file placement, not a legal opinion.
- Engine integration details are feasibility recommendations only. No engine, WASM binary, worker, dependency, or package was added to the application.
