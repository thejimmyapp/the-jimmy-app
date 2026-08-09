# Run The Jimmy App locally

These commands run the Python API on `127.0.0.1:8000` and the Vite frontend on `127.0.0.1:5173`. The Vite development server proxies `/api`, `/health`, the puzzle routes, and `/ws` to the API.

## One-time setup

Open Terminal in any folder inside this repository, then run:

```bash
JIMMY_REPO="$(git rev-parse --show-toplevel)"
cd "$JIMMY_REPO"
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
corepack pnpm --dir frontend install --frozen-lockfile
```

If `corepack` is unavailable but `pnpm` is already installed, use:

```bash
pnpm --dir frontend install --frozen-lockfile
```

## Start the backend — Terminal 1

```bash
JIMMY_REPO="$(git rev-parse --show-toplevel)"
cd "$JIMMY_REPO"
.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Confirm the API is responding:

```bash
curl --fail http://127.0.0.1:8000/health
```

## Start the frontend — Terminal 2

```bash
JIMMY_REPO="$(git rev-parse --show-toplevel)"
cd "$JIMMY_REPO"
corepack pnpm --dir frontend dev
```

If using a separately installed `pnpm`, run `pnpm --dir frontend dev` instead.

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Choose **Guest Spawn**, use Arrow Up/Arrow Down to choose a matchup, and press Enter. The selected match opens at the starting position; Arrow Left/Arrow Right steps the synchronized two-board replay.

Stop each server with `Ctrl+C` in its terminal.

## Verification commands

From the repository root:

```bash
.venv/bin/python -m pytest
corepack pnpm --dir frontend test
corepack pnpm --dir frontend run build
```

The callback decoder's focused 10-board validation harness is:

```bash
corepack pnpm --dir frontend exec vitest run src/bughouseDecoder.test.ts
```

Guest callback fetching is enabled by default for local development. To exercise the backend kill switch, start Terminal 1 with `CHESSCOM_MATCH_PROXY_ENABLED=false` before the Python command.
