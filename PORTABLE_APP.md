# The Jimmy App Portable Setup

This folder is a local Windows app.

It is not a static website and it does not run on Netlify Drop. It runs with Python and Streamlit.

## Quick Start

1. Install Python 3.11 or newer:
   https://www.python.org/downloads/windows/

2. Double-click:

```text
start_thejimmyapp.bat
```

The launcher will:

- create a local `.venv` folder if needed;
- install Python dependencies from `requirements.txt`;
- create runtime folders;
- start Streamlit;
- open `http://localhost:8501`.

## Fairy-Stockfish

Engine analysis needs Fairy-Stockfish.

Put the executable here:

```text
engines/fairy-stockfish.exe
```

The app can open without it, but engine analysis and coaching batches will not work until this file exists.

## Chess.com Two-Board Import

Basic public imports work with a Chess.com username.

For a full synchronized Bughouse replay, use the paired-PGN import and provide
completed PGNs for both boards, or use Advanced pgn-info enrichment with a
one-time cURL copied from your own logged-in Chess.com browser session.

The application does not accept Chess.com passwords and does not store copied
cURL requests, cookies, CSRF tokens, or reusable session credentials.

## What Is Stored Locally

The app stores imported games and analysis here:

```text
data/bughouse.db
```

Logs are stored here:

```text
logs/app.log
```

## Sharing This App

Use the portable ZIP builder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_portable_zip.ps1
```

This creates:

```text
reports/thejimmyapp-portable.zip
```

By default, the ZIP does not include:

- `.venv/`
- `data/bughouse.db`
- `secrets/`
- logs
- videos
- local reports
- Fairy-Stockfish executable

The ZIP never includes the Fairy-Stockfish executable. That binary is GPL-3.0 and
redistributing it would carry corresponding-source obligations we do not meet.
Recipients install their own engine at `engines/fairy-stockfish.exe` per the
Fairy-Stockfish section above.

## Troubleshooting

If the launcher closes immediately:

1. Open PowerShell in this folder.
2. Run:

```powershell
.\start_thejimmyapp.bat
```

3. Read the error message.

Common issues:

- Python is not installed.
- Python was installed without PATH support.
- Internet is unavailable for dependency installation.
- Fairy-Stockfish is missing.
- The copied Chess.com pgn-info cURL is missing, expired, or was not copied from your own logged-in browser session.
