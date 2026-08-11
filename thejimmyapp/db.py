from __future__ import annotations

import json
import secrets
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from thejimmyapp.chesscom_api import parse_pgn_headers
from thejimmyapp.versioning import ANALYSIS_VERSION


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        return conn

    def initialize(self) -> None:
        try:
            with closing(self.connect()) as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS games (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    url TEXT NOT NULL,
                    uuid TEXT,
                    end_time INTEGER,
                    rated INTEGER,
                    rules TEXT,
                    time_class TEXT,
                    time_control TEXT,
                    result TEXT NOT NULL DEFAULT 'unknown',
                    user_color TEXT,
                    opponent TEXT,
                    opponent_rating INTEGER,
                    partner TEXT,
                    white_username TEXT,
                    black_username TEXT,
                    white_result TEXT,
                    black_result TEXT,
                    pgn TEXT,
                    raw_json TEXT NOT NULL,
                    imported_at TEXT NOT NULL,
                    UNIQUE(username, url)
                );

                CREATE INDEX IF NOT EXISTS idx_games_username_end_time
                    ON games(username, end_time DESC);
                CREATE INDEX IF NOT EXISTS idx_games_url
                    ON games(url);
                CREATE INDEX IF NOT EXISTS idx_games_username_result
                    ON games(username, result);

                CREATE TABLE IF NOT EXISTS guest_identities (
                    guest_number INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS import_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    archive_count INTEGER NOT NULL,
                    imported_count INTEGER NOT NULL,
                    duplicate_count INTEGER NOT NULL,
                    skipped_count INTEGER NOT NULL,
                    error_count INTEGER NOT NULL,
                    errors_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS engine_cache (
                    cache_key TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS full_data_discovery (
                    game_id INTEGER PRIMARY KEY,
                    conclusion TEXT NOT NULL,
                    partner_found TEXT,
                    second_board_url TEXT,
                    report_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS mistakes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER NOT NULL,
                    username TEXT NOT NULL,
                    ply INTEGER NOT NULL,
                    move TEXT NOT NULL,
                    side TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    category TEXT NOT NULL,
                    tactical_motif TEXT NOT NULL DEFAULT 'unknown',
                    severity TEXT NOT NULL,
                    estimated_loss_cp INTEGER NOT NULL,
                    bestmove TEXT,
                    score_before TEXT NOT NULL,
                    score_after TEXT NOT NULL,
                    depth INTEGER,
                    confidence TEXT NOT NULL,
                    note TEXT NOT NULL,
                    before_fen TEXT,
                    after_fen TEXT,
                    clock_seconds REAL,
                    time_spent_seconds REAL,
                    partner_ply INTEGER,
                    partner_fen TEXT,
                    partner_score_before TEXT,
                    partner_mate_in INTEGER,
                    partner_danger TEXT,
                    analysis_version TEXT NOT NULL DEFAULT 'timeline-v2',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
                    UNIQUE(game_id, ply, depth)
                );

                CREATE INDEX IF NOT EXISTS idx_mistakes_username_loss
                    ON mistakes(username, estimated_loss_cp DESC);
                CREATE INDEX IF NOT EXISTS idx_mistakes_game
                    ON mistakes(game_id, ply);

                CREATE TABLE IF NOT EXISTS game_analysis_runs (
                    game_id INTEGER NOT NULL,
                    username TEXT NOT NULL,
                    depth INTEGER NOT NULL,
                    max_positions INTEGER NOT NULL,
                    critical_positions INTEGER NOT NULL,
                    mistakes_found INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    analysis_version TEXT NOT NULL DEFAULT 'timeline-v2',
                    analyzed_at TEXT NOT NULL,
                    FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
                    PRIMARY KEY(game_id, depth)
                );

                CREATE INDEX IF NOT EXISTS idx_game_analysis_runs_username
                    ON game_analysis_runs(username, depth, analyzed_at DESC);

                CREATE TABLE IF NOT EXISTS drill_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mistake_id INTEGER NOT NULL,
                    username TEXT NOT NULL,
                    category TEXT NOT NULL,
                    expected_move TEXT,
                    attempted_move TEXT NOT NULL,
                    score TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(mistake_id) REFERENCES mistakes(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_drill_attempts_username
                    ON drill_attempts(username, created_at DESC);

                CREATE TABLE IF NOT EXISTS opening_move_analysis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER NOT NULL,
                    username TEXT NOT NULL,
                    ply INTEGER NOT NULL,
                    move_number INTEGER NOT NULL,
                    color TEXT NOT NULL,
                    played_move TEXT NOT NULL,
                    line_key TEXT NOT NULL,
                    line_label TEXT NOT NULL,
                    before_fen TEXT,
                    after_fen TEXT,
                    bestmove TEXT,
                    score_before TEXT NOT NULL,
                    score_after TEXT NOT NULL,
                    estimated_loss_cp INTEGER,
                    quality TEXT NOT NULL,
                    depth INTEGER NOT NULL,
                    analysis_version TEXT NOT NULL DEFAULT 'timeline-v2',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
                    UNIQUE(game_id, ply, depth)
                );

                CREATE INDEX IF NOT EXISTS idx_opening_move_analysis_username
                    ON opening_move_analysis(username, depth, line_key);

                CREATE TABLE IF NOT EXISTS pattern_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    puzzle_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    motif TEXT NOT NULL,
                    attempted_move TEXT NOT NULL,
                    expected_move TEXT NOT NULL,
                    score TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_pattern_attempts_username
                    ON pattern_attempts(username, created_at DESC);

                CREATE TABLE IF NOT EXISTS pattern_progress (
                    username TEXT NOT NULL,
                    puzzle_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    motif TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    correct INTEGER NOT NULL DEFAULT 0,
                    streak INTEGER NOT NULL DEFAULT 0,
                    mastery INTEGER NOT NULL DEFAULT 0,
                    next_due TEXT NOT NULL,
                    last_score TEXT,
                    last_attempt_at TEXT,
                    PRIMARY KEY(username, puzzle_id)
                );
                    """
                )
                _ensure_columns(
                    conn,
                    "mistakes",
                    {
                        "clock_seconds": "REAL",
                        "time_spent_seconds": "REAL",
                        "partner_ply": "INTEGER",
                        "partner_fen": "TEXT",
                        "partner_score_before": "TEXT",
                        "partner_mate_in": "INTEGER",
                        "partner_danger": "TEXT",
                        "tactical_motif": "TEXT NOT NULL DEFAULT 'unknown'",
                        "analysis_version": "TEXT NOT NULL DEFAULT 'legacy'",
                    },
                )
                _ensure_columns(
                    conn,
                    "game_analysis_runs",
                    {"analysis_version": "TEXT NOT NULL DEFAULT 'legacy'"},
                )
                _ensure_columns(
                    conn,
                    "opening_move_analysis",
                    {"analysis_version": "TEXT NOT NULL DEFAULT 'legacy'"},
                )
                conn.execute("PRAGMA journal_mode = WAL")
                conn.executescript(
                    f"""
                    DROP VIEW IF EXISTS current_mistakes;
                    DROP VIEW IF EXISTS current_game_analysis_runs;
                    DROP VIEW IF EXISTS current_opening_move_analysis;
                    CREATE VIEW current_mistakes AS
                        SELECT * FROM mistakes WHERE analysis_version = '{ANALYSIS_VERSION}';
                    CREATE VIEW current_game_analysis_runs AS
                        SELECT * FROM game_analysis_runs WHERE analysis_version = '{ANALYSIS_VERSION}';
                    CREATE VIEW current_opening_move_analysis AS
                        SELECT * FROM opening_move_analysis WHERE analysis_version = '{ANALYSIS_VERSION}';
                    """
                )
                conn.commit()
        except sqlite3.OperationalError as exc:
            if self.path.exists() and "disk is full" in str(exc).lower():
                return
            raise

    def record_pattern_attempt(
        self,
        username: str,
        puzzle_id: str,
        category: str,
        motif: str,
        attempted_move: str,
        expected_move: str,
        score: str,
    ) -> None:
        normalized = username.lower()
        now = _utc_now()
        with closing(self.connect()) as conn:
            current = conn.execute(
                """
                SELECT attempts, correct, streak, mastery
                FROM pattern_progress
                WHERE username = ? AND puzzle_id = ?
                """,
                (normalized, puzzle_id),
            ).fetchone()
            attempts = int(current["attempts"] or 0) + 1 if current else 1
            correct = int(current["correct"] or 0) + (1 if score == "correct" else 0) if current else (1 if score == "correct" else 0)
            previous_streak = int(current["streak"] or 0) if current else 0
            previous_mastery = int(current["mastery"] or 0) if current else 0
            if score == "correct":
                streak = previous_streak + 1
                mastery = min(5, previous_mastery + 1)
                days = [1, 3, 7, 14, 30][mastery - 1]
            elif score == "close":
                streak = 0
                mastery = max(0, previous_mastery - 1)
                days = 1
            else:
                streak = 0
                mastery = max(0, previous_mastery - 2)
                days = 0
            conn.execute(
                """
                INSERT INTO pattern_attempts (
                    username, puzzle_id, category, motif, attempted_move,
                    expected_move, score, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (normalized, puzzle_id, category, motif, attempted_move, expected_move, score, now),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO pattern_progress (
                    username, puzzle_id, category, motif, attempts, correct,
                    streak, mastery, next_due, last_score, last_attempt_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(?, '+' || ? || ' days'), ?, ?)
                """,
                (
                    normalized,
                    puzzle_id,
                    category,
                    motif,
                    attempts,
                    correct,
                    streak,
                    mastery,
                    now,
                    days,
                    score,
                    now,
                ),
            )
            conn.commit()

    def get_pattern_progress(self, username: str) -> dict[str, dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM pattern_progress
                WHERE username = ?
                """,
                (username.lower(),),
            ).fetchall()
        return {str(row["puzzle_id"]): dict(row) for row in rows}

    def get_pattern_summary(self, username: str) -> dict[str, object]:
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT
                    COUNT(*) AS studied,
                    SUM(attempts) AS attempts,
                    SUM(correct) AS correct,
                    SUM(CASE WHEN mastery >= 4 THEN 1 ELSE 0 END) AS mastered,
                    SUM(CASE WHEN datetime(next_due) <= datetime('now') THEN 1 ELSE 0 END) AS due
                FROM pattern_progress
                WHERE username = ?
                """,
                (username.lower(),),
            ).fetchone()
        attempts = int(row["attempts"] or 0)
        correct = int(row["correct"] or 0)
        return {
            "studied": int(row["studied"] or 0),
            "attempts": attempts,
            "correct": correct,
            "mastered": int(row["mastered"] or 0),
            "due": int(row["due"] or 0),
            "accuracy": None if attempts == 0 else round(correct * 100 / attempts, 1),
        }

    def get_pattern_motif_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    motif,
                    COUNT(*) AS puzzles,
                    SUM(attempts) AS attempts,
                    SUM(correct) AS correct,
                    ROUND(100.0 * SUM(correct) / NULLIF(SUM(attempts), 0), 1) AS accuracy,
                    ROUND(AVG(mastery), 1) AS avg_mastery
                FROM pattern_progress
                WHERE username = ?
                GROUP BY motif
                ORDER BY avg_mastery ASC, attempts DESC
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_games_for_opening_analysis(
        self,
        username: str,
        limit: int = 20,
        depth: int | None = None,
        only_unanalyzed: bool = True,
        only_two_board: bool = True,
        selection: str = "recent",
    ) -> list[dict[str, object]]:
        clauses = ["username = ?", "result IN ('win', 'loss', 'draw')"]
        values: list[object] = [username.lower()]
        if only_two_board:
            clauses.append("raw_json LIKE '%bughousePartnerTcnMoves%'")
        if only_unanalyzed and depth is not None:
            clauses.append(
                """
                NOT EXISTS (
                    SELECT 1
                    FROM current_opening_move_analysis oma
                    WHERE oma.game_id = games.id
                        AND oma.depth = ?
                )
                """
            )
            values.append(depth)
        values.append(limit)
        order_by = {
            "oldest": "end_time ASC",
            "random": "RANDOM()",
        }.get(selection, "end_time DESC")
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                SELECT
                    id,
                    username,
                    url,
                    datetime(end_time, 'unixepoch') AS played_at,
                    end_time,
                    result,
                    user_color,
                    opponent,
                    opponent_rating,
                    partner,
                    pgn,
                    raw_json
                FROM games
                WHERE {" AND ".join(clauses)}
                ORDER BY {order_by}
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [dict(row) for row in rows]

    def replace_opening_move_analysis(self, game_id: int, depth: int, rows: list[dict[str, Any]]) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                "DELETE FROM opening_move_analysis WHERE game_id = ? AND depth = ? AND analysis_version = ?",
                (game_id, depth, ANALYSIS_VERSION),
            )
            for row in rows:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO opening_move_analysis (
                        game_id, username, ply, move_number, color, played_move,
                        line_key, line_label, before_fen, after_fen, bestmove,
                        score_before, score_after, estimated_loss_cp, quality,
                        depth, analysis_version, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        game_id,
                        row["username"],
                        row["ply"],
                        row["move_number"],
                        row["color"],
                        row["played_move"],
                        row["line_key"],
                        row["line_label"],
                        row.get("before_fen"),
                        row.get("after_fen"),
                        row.get("bestmove"),
                        row["score_before"],
                        row["score_after"],
                        row.get("estimated_loss_cp"),
                        row["quality"],
                        depth,
                        ANALYSIS_VERSION,
                        _utc_now(),
                    ),
                )
            conn.commit()

    def get_opening_coverage(self, username: str, depth: int) -> dict[str, object]:
        normalized = username.lower()
        with closing(self.connect()) as conn:
            total = conn.execute(
                "SELECT COUNT(*) AS count FROM games WHERE username = ?",
                (normalized,),
            ).fetchone()["count"]
            analyzed = conn.execute(
                """
                SELECT COUNT(DISTINCT game_id) AS count
                FROM current_opening_move_analysis
                WHERE username = ? AND depth = ?
                """,
                (normalized, depth),
            ).fetchone()["count"]
            moves = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM current_opening_move_analysis
                WHERE username = ? AND depth = ?
                """,
                (normalized, depth),
            ).fetchone()["count"]
        return {"total_games": total, "analyzed_games": analyzed, "analyzed_moves": moves}

    def get_opening_opponents(self, username: str, depth: int, min_positions: int = 3) -> list[str]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT COALESCE(NULLIF(g.opponent, ''), 'Unknown') AS opponent, COUNT(*) AS positions
                FROM current_opening_move_analysis oma
                JOIN games g ON g.id = oma.game_id
                WHERE oma.username = ? AND oma.depth = ?
                GROUP BY COALESCE(NULLIF(g.opponent, ''), 'Unknown')
                HAVING COUNT(*) >= ?
                ORDER BY positions DESC, opponent ASC
                """,
                (username.lower(), depth, min_positions),
            ).fetchall()
        return [str(row["opponent"]) for row in rows]

    def get_opening_partners(self, username: str, depth: int, min_positions: int = 3) -> list[str]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT COALESCE(NULLIF(g.partner, ''), 'Unknown') AS partner, COUNT(*) AS positions
                FROM current_opening_move_analysis oma
                JOIN games g ON g.id = oma.game_id
                WHERE oma.username = ? AND oma.depth = ?
                GROUP BY COALESCE(NULLIF(g.partner, ''), 'Unknown')
                HAVING COUNT(*) >= ?
                ORDER BY positions DESC, partner ASC
                """,
                (username.lower(), depth, min_positions),
            ).fetchall()
        return [str(row["partner"]) for row in rows]

    def get_opening_line_stats(
        self,
        username: str,
        depth: int,
        limit: int = 30,
        opponent: str | None = None,
        partner: str | None = None,
        min_opponent_rating: int | None = None,
        max_opponent_rating: int | None = None,
    ) -> list[dict[str, object]]:
        clauses = ["oma.username = ?", "oma.depth = ?"]
        values: list[object] = [username.lower(), depth]
        if opponent and opponent != "All opponents":
            clauses.append("LOWER(COALESCE(g.opponent, 'Unknown')) = LOWER(?)")
            values.append(opponent)
        if partner and partner != "All partners":
            clauses.append("LOWER(COALESCE(g.partner, 'Unknown')) = LOWER(?)")
            values.append(partner)
        if min_opponent_rating is not None:
            clauses.append("g.opponent_rating >= ?")
            values.append(min_opponent_rating)
        if max_opponent_rating is not None:
            clauses.append("g.opponent_rating <= ?")
            values.append(max_opponent_rating)
        values.append(limit)
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                SELECT
                    oma.line_key,
                    oma.line_label,
                    COUNT(*) AS positions,
                    COUNT(DISTINCT oma.game_id) AS games,
                    ROUND(AVG(g.opponent_rating), 0) AS avg_rating,
                    ROUND(AVG(COALESCE(oma.estimated_loss_cp, 0)), 1) AS avg_loss,
                    SUM(CASE WHEN oma.quality IN ('mistake', 'blunder') THEN 1 ELSE 0 END) AS mistakes,
                    MIN(oma.before_fen) AS sample_fen,
                    MIN(oma.game_id) AS sample_game_id,
                    MIN(oma.ply) AS sample_ply,
                    ROUND(100.0 * SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS winrate
                FROM current_opening_move_analysis
                oma JOIN games g ON g.id = oma.game_id
                WHERE {" AND ".join(clauses)}
                GROUP BY oma.line_key, oma.line_label
                ORDER BY positions DESC, mistakes DESC, avg_loss DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [dict(row) for row in rows]

    def get_opening_move_stats(
        self,
        username: str,
        depth: int,
        line_key: str | None = None,
        limit: int = 100,
        opponent: str | None = None,
        partner: str | None = None,
        min_opponent_rating: int | None = None,
        max_opponent_rating: int | None = None,
    ) -> list[dict[str, object]]:
        clauses = ["oma.username = ?", "oma.depth = ?"]
        values: list[object] = [username.lower(), depth]
        if line_key:
            clauses.append("oma.line_key = ?")
            values.append(line_key)
        if opponent and opponent != "All opponents":
            clauses.append("LOWER(COALESCE(g.opponent, 'Unknown')) = LOWER(?)")
            values.append(opponent)
        if partner and partner != "All partners":
            clauses.append("LOWER(COALESCE(g.partner, 'Unknown')) = LOWER(?)")
            values.append(partner)
        if min_opponent_rating is not None:
            clauses.append("g.opponent_rating >= ?")
            values.append(min_opponent_rating)
        if max_opponent_rating is not None:
            clauses.append("g.opponent_rating <= ?")
            values.append(max_opponent_rating)
        values.append(limit)
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                SELECT
                    oma.line_key,
                    oma.line_label,
                    oma.played_move,
                    COUNT(*) AS games,
                    ROUND(AVG(g.opponent_rating), 0) AS avg_rating,
                    ROUND(AVG(COALESCE(oma.estimated_loss_cp, 0)), 1) AS avg_loss,
                    SUM(CASE WHEN oma.quality = 'best' THEN 1 ELSE 0 END) AS best_count,
                    SUM(CASE WHEN oma.quality = 'good' THEN 1 ELSE 0 END) AS good_count,
                    SUM(CASE WHEN oma.quality = 'inaccuracy' THEN 1 ELSE 0 END) AS inaccuracies,
                    SUM(CASE WHEN oma.quality = 'mistake' THEN 1 ELSE 0 END) AS mistakes,
                    SUM(CASE WHEN oma.quality = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    oma.bestmove AS engine_bestmove,
                    ROUND(100.0 * SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS winrate,
                    MIN(oma.game_id) AS sample_game_id,
                    MIN(oma.ply) AS sample_ply
                FROM current_opening_move_analysis oma
                JOIN games g ON g.id = oma.game_id
                WHERE {" AND ".join(clauses)}
                GROUP BY oma.line_key, oma.line_label, oma.played_move, oma.bestmove
                ORDER BY games DESC, blunders DESC, mistakes DESC, avg_loss DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [dict(row) for row in rows]

    def get_opening_position_summary(
        self,
        username: str,
        depth: int,
        line_key: str,
    ) -> dict[str, object]:
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT
                    COUNT(*) AS positions,
                    COUNT(DISTINCT game_id) AS games,
                    MIN(line_label) AS line_label,
                    MIN(before_fen) AS sample_fen,
                    MIN(game_id) AS sample_game_id,
                    MIN(ply) AS sample_ply,
                    ROUND(AVG(COALESCE(estimated_loss_cp, 0)), 1) AS avg_loss,
                    SUM(CASE WHEN quality = 'best' THEN 1 ELSE 0 END) AS best_count,
                    SUM(CASE WHEN quality IN ('mistake', 'blunder') THEN 1 ELSE 0 END) AS mistakes
                FROM current_opening_move_analysis
                WHERE username = ? AND depth = ? AND line_key = ?
                """,
                (username.lower(), depth, line_key),
            ).fetchone()
            bestmove = conn.execute(
                """
                SELECT bestmove, COUNT(*) AS count
                FROM current_opening_move_analysis
                WHERE username = ? AND depth = ? AND line_key = ? AND bestmove IS NOT NULL AND bestmove != ''
                GROUP BY bestmove
                ORDER BY count DESC, bestmove ASC
                LIMIT 1
                """,
                (username.lower(), depth, line_key),
            ).fetchone()
        data = dict(row) if row else {}
        data["engine_bestmove"] = None if not bestmove else bestmove["bestmove"]
        data["engine_bestmove_count"] = 0 if not bestmove else bestmove["count"]
        return data

    def get_opening_benchmark_moves(
        self,
        depth: int,
        line_key: str,
        min_opponent_rating: int = 2200,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    oma.played_move,
                    COUNT(*) AS games,
                    ROUND(AVG(g.opponent_rating), 0) AS avg_rating,
                    ROUND(100.0 * SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS winrate,
                    ROUND(AVG(COALESCE(oma.estimated_loss_cp, 0)), 1) AS avg_loss,
                    SUM(CASE WHEN oma.quality = 'best' THEN 1 ELSE 0 END) AS best_count,
                    SUM(CASE WHEN oma.quality IN ('mistake', 'blunder') THEN 1 ELSE 0 END) AS mistakes
                FROM current_opening_move_analysis oma
                JOIN games g ON g.id = oma.game_id
                WHERE oma.depth = ?
                    AND oma.line_key = ?
                    AND g.opponent_rating >= ?
                GROUP BY oma.played_move
                ORDER BY games DESC, winrate DESC, avg_loss ASC
                LIMIT ?
                """,
                (depth, line_key, min_opponent_rating, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_opening_position_games(
        self,
        username: str,
        depth: int,
        line_key: str,
        opponent: str | None = None,
        partner: str | None = None,
        min_opponent_rating: int | None = None,
        max_opponent_rating: int | None = None,
        limit: int = 50,
    ) -> list[dict[str, object]]:
        clauses = ["oma.username = ?", "oma.depth = ?", "oma.line_key = ?"]
        values: list[object] = [username.lower(), depth, line_key]
        if opponent and opponent != "All opponents":
            clauses.append("LOWER(COALESCE(g.opponent, 'Unknown')) = LOWER(?)")
            values.append(opponent)
        if partner and partner != "All partners":
            clauses.append("LOWER(COALESCE(g.partner, 'Unknown')) = LOWER(?)")
            values.append(partner)
        if min_opponent_rating is not None:
            clauses.append("g.opponent_rating >= ?")
            values.append(min_opponent_rating)
        if max_opponent_rating is not None:
            clauses.append("g.opponent_rating <= ?")
            values.append(max_opponent_rating)
        values.append(limit)
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                SELECT
                    g.id,
                    datetime(g.end_time, 'unixepoch') AS played_at,
                    g.result,
                    g.user_color,
                    g.opponent,
                    g.opponent_rating,
                    g.partner,
                    g.time_control,
                    oma.ply,
                    oma.played_move,
                    oma.bestmove,
                    oma.quality,
                    oma.estimated_loss_cp,
                    g.url
                FROM current_opening_move_analysis oma
                JOIN games g ON g.id = oma.game_id
                WHERE {" AND ".join(clauses)}
                ORDER BY g.end_time DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [dict(row) for row in rows]

    def get_opening_game_suggestions(
        self,
        game_id: int,
        username: str,
        depth: int,
    ) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT ply, played_move, bestmove, quality, estimated_loss_cp
                FROM current_opening_move_analysis
                WHERE game_id = ? AND username = ? AND depth = ?
                ORDER BY ply ASC
                """,
                (game_id, username.lower(), depth),
            ).fetchall()
        return [dict(row) for row in rows]

    def upsert_game(self, username: str, game: dict[str, Any]) -> bool:
        record = self._game_to_record(username, game)
        columns = list(record)
        placeholders = ", ".join("?" for _ in columns)
        sql = f"""
            INSERT OR IGNORE INTO games ({", ".join(columns)})
            VALUES ({placeholders})
        """
        with closing(self.connect()) as conn:
            existing = conn.execute(
                "SELECT raw_json FROM games WHERE username = ? AND url = ?",
                (record["username"], record["url"]),
            ).fetchone()
            if existing is not None:
                existing_raw = _json_object(str(existing["raw_json"] or ""))
                new_raw = _json_object(str(record["raw_json"] or ""))
                if has_partner_board_data(new_raw) or not has_partner_board_data(existing_raw):
                    update_columns = [column for column in columns if column not in {"username", "url", "imported_at"}]
                    assignments = ", ".join(f"{column} = ?" for column in update_columns)
                    conn.execute(
                        f"UPDATE games SET {assignments} WHERE username = ? AND url = ?",
                        [record[column] for column in update_columns] + [record["username"], record["url"]],
                    )
                    conn.commit()
                return False
            cursor = conn.execute(sql, [record[column] for column in columns])
            conn.commit()
            return cursor.rowcount > 0

    def create_guest_identity(self) -> tuple[int, str]:
        token = secrets.token_urlsafe(32)
        with closing(self.connect()) as conn:
            cursor = conn.execute(
                "INSERT INTO guest_identities (token, created_at) VALUES (?, ?)",
                (token, _utc_now()),
            )
            conn.commit()
        if cursor.lastrowid is None:
            raise RuntimeError("guest identity allocation failed")
        return int(cursor.lastrowid), token

    def guest_number_for_token(self, token: str) -> int | None:
        if not token:
            return None
        with closing(self.connect()) as conn:
            row = conn.execute(
                "SELECT guest_number FROM guest_identities WHERE token = ?",
                (token,),
            ).fetchone()
        return int(row["guest_number"]) if row else None

    def guest_identity_count(self) -> int:
        with closing(self.connect()) as conn:
            row = conn.execute("SELECT COUNT(*) AS total FROM guest_identities").fetchone()
        return int(row["total"]) if row else 0

    def record_import(
        self,
        username: str,
        archive_count: int,
        imported_count: int,
        duplicate_count: int,
        skipped_count: int,
        errors: list[str],
    ) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                """
                INSERT INTO import_runs (
                    username, archive_count, imported_count, duplicate_count,
                    skipped_count, error_count, errors_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    username.lower(),
                    archive_count,
                    imported_count,
                    duplicate_count,
                    skipped_count,
                    len(errors),
                    json.dumps(errors, ensure_ascii=False),
                    _utc_now(),
                ),
            )
            conn.commit()

    def get_dashboard_stats(self, username: str) -> dict[str, object]:
        normalized = username.lower()
        with closing(self.connect()) as conn:
            total = conn.execute(
                "SELECT COUNT(*) AS count FROM games WHERE username = ?",
                (normalized,),
            ).fetchone()["count"]
            wins = conn.execute(
                "SELECT COUNT(*) AS count FROM games WHERE username = ? AND result = 'win'",
                (normalized,),
            ).fetchone()["count"]
            partner_boards = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM games
                WHERE username = ?
                    AND raw_json LIKE '%bughousePartnerTcnMoves%'
                """,
                (normalized,),
            ).fetchone()["count"]
            most_common_miss = conn.execute(
                """
                SELECT category, COUNT(*) AS count
                FROM current_mistakes
                WHERE username = ?
                GROUP BY category
                ORDER BY count DESC
                LIMIT 1
                """,
                (normalized,),
            ).fetchone()
            losing_pattern = conn.execute(
                """
                SELECT m.category, COUNT(*) AS count
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE m.username = ?
                    AND g.result = 'loss'
                GROUP BY m.category
                ORDER BY count DESC
                LIMIT 1
                """,
                (normalized,),
            ).fetchone()
            time_rows = conn.execute(
                """
                SELECT
                    COUNT(DISTINCT g.id) AS games_with_clocks,
                    COUNT(DISTINCT CASE WHEN m.clock_seconds <= 30 THEN g.id END) AS games_with_time_trouble
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE m.username = ?
                    AND m.clock_seconds IS NOT NULL
                """,
                (normalized,),
            ).fetchone()
        return {
            "total_games": total,
            "winrate": None if total == 0 else (wins / total) * 100,
            "average_blunders_per_game": None,
            "most_common_losing_pattern": (
                None if not losing_pattern else f"{losing_pattern['category']} ({losing_pattern['count']})"
            ),
            "most_common_tactical_miss": (
                None if not most_common_miss else f"{most_common_miss['category']} ({most_common_miss['count']})"
            ),
            "time_trouble_frequency": _format_frequency(
                time_rows["games_with_time_trouble"] if time_rows else 0,
                time_rows["games_with_clocks"] if time_rows else 0,
            ),
            "partner_boards": partner_boards,
        }

    def count_games_to_enrich(self, username: str) -> int:
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM games
                WHERE username = ?
                    AND uuid IS NOT NULL
                    AND uuid != ''
                    AND (
                        partner IS NULL
                        OR partner = ''
                        OR raw_json NOT LIKE '%bughousePartnerTcnMoves%'
                    )
                """,
                (username.lower(),),
            ).fetchone()
        return int(row["count"] if row else 0)

    def list_games_for_pgn_info_enrichment(self, username: str, limit: int = 500) -> list[dict[str, Any]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT id, username, url, uuid, raw_json
                FROM games
                WHERE username = ?
                    AND uuid IS NOT NULL
                    AND uuid != ''
                    AND (
                        partner IS NULL
                        OR partner = ''
                        OR raw_json NOT LIKE '%bughousePartnerTcnMoves%'
                    )
                ORDER BY end_time DESC
                LIMIT ?
                """,
                (username.lower(), limit),
            ).fetchall()
        games: list[dict[str, Any]] = []
        for row in rows:
            raw = _json_object(str(row["raw_json"] or ""))
            if not raw:
                continue
            raw.setdefault("url", row["url"])
            raw.setdefault("uuid", row["uuid"])
            games.append(raw)
        return games

    def get_color_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    COALESCE(NULLIF(user_color, ''), 'unknown') AS color,
                    COUNT(*) AS games,
                    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
                    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses
                FROM games
                WHERE username = ?
                GROUP BY COALESCE(NULLIF(user_color, ''), 'unknown')
                ORDER BY color ASC
                """,
                (username.lower(),),
            ).fetchall()
        return [
            {
                "color": row["color"],
                "games": row["games"],
                "wins": row["wins"],
                "losses": row["losses"],
                "winrate": None if row["games"] == 0 else round((row["wins"] / row["games"]) * 100, 1),
            }
            for row in rows
        ]

    def get_partner_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    COALESCE(NULLIF(partner, ''), 'Unknown') AS partner,
                    COUNT(*) AS games,
                    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins
                FROM games
                WHERE username = ?
                GROUP BY COALESCE(NULLIF(partner, ''), 'Unknown')
                ORDER BY games DESC, partner ASC
                """,
                (username.lower(),),
            ).fetchall()
        return [
            {
                "partner": row["partner"],
                "games": row["games"],
                "wins": row["wins"],
                "winrate": None if row["games"] == 0 else round((row["wins"] / row["games"]) * 100, 1),
            }
            for row in rows
        ]

    def get_opponent_stats(self, username: str, min_games: int = 1) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    COALESCE(NULLIF(opponent, ''), 'Unknown') AS opponent,
                    COUNT(*) AS games,
                    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
                    ROUND(AVG(opponent_rating), 0) AS avg_rating,
                    MIN(opponent_rating) AS min_rating,
                    MAX(opponent_rating) AS max_rating
                FROM games
                WHERE username = ?
                GROUP BY COALESCE(NULLIF(opponent, ''), 'Unknown')
                HAVING COUNT(*) >= ?
                ORDER BY games DESC, opponent ASC
                """,
                (username.lower(), min_games),
            ).fetchall()
        return [
            {
                "opponent": row["opponent"],
                "games": row["games"],
                "wins": row["wins"],
                "winrate": None if row["games"] == 0 else round((row["wins"] / row["games"]) * 100, 1),
                "avg_rating": None if row["avg_rating"] is None else int(row["avg_rating"]),
                "min_rating": row["min_rating"],
                "max_rating": row["max_rating"],
            }
            for row in rows
        ]

    def list_games(
        self,
        username: str,
        opponent: str | None = None,
        partner: str | None = None,
        min_opponent_rating: int | None = None,
        max_opponent_rating: int | None = None,
        result: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, object]]:
        clauses = ["username = ?", "result IN ('win', 'loss', 'draw')"]
        values: list[object] = [username.lower()]
        if opponent:
            clauses.append("LOWER(COALESCE(opponent, '')) LIKE ?")
            values.append(f"%{opponent.lower()}%")
        if partner:
            clauses.append("LOWER(COALESCE(partner, '')) LIKE ?")
            values.append(f"%{partner.lower()}%")
        if min_opponent_rating is not None:
            clauses.append("opponent_rating >= ?")
            values.append(min_opponent_rating)
        if max_opponent_rating is not None:
            clauses.append("opponent_rating <= ?")
            values.append(max_opponent_rating)
        if result:
            clauses.append("result = ?")
            values.append(result)
        values.append(limit)

        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                SELECT
                    id,
                    datetime(end_time, 'unixepoch') AS played_at,
                    result,
                    user_color,
                    opponent,
                    opponent_rating,
                    partner,
                    time_class,
                    time_control,
                    rated,
                    url
                FROM games
                WHERE {" AND ".join(clauses)}
                ORDER BY end_time DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [dict(row) for row in rows]

    def get_game(self, game_id: int) -> dict[str, object] | None:
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT
                    id,
                    username,
                    url,
                    uuid,
                    datetime(end_time, 'unixepoch') AS played_at,
                    end_time,
                    rated,
                    rules,
                    time_class,
                    time_control,
                    result,
                    user_color,
                    opponent,
                    opponent_rating,
                    partner,
                    white_username,
                    black_username,
                    white_result,
                    black_result,
                    pgn,
                    raw_json,
                    imported_at
                FROM games
                WHERE id = ?
                """,
                (game_id,),
            ).fetchone()
        return dict(row) if row else None

    def find_games_by_urls(self, urls: tuple[str, ...]) -> list[dict[str, object]]:
        if not urls:
            return []
        placeholders = ", ".join("?" for _ in urls)
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"SELECT id FROM games WHERE url IN ({placeholders})",
                urls,
            ).fetchall()
        return [game for row in rows if (game := self.get_game(int(row["id"]))) is not None]

    def get_game_by_username_url(self, username: str, url: str) -> dict[str, object] | None:
        with closing(self.connect()) as conn:
            row = conn.execute(
                "SELECT id FROM games WHERE username = ? AND url = ?",
                (username.lower(), url),
            ).fetchone()
        return self.get_game(int(row["id"])) if row else None

    def list_game_pgns(self, username: str, limit: int = 1000) -> list[str]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT pgn
                FROM games
                WHERE username = ? AND pgn IS NOT NULL AND pgn != ''
                ORDER BY end_time DESC
                LIMIT ?
                """,
                (username.lower(), limit),
            ).fetchall()
        return [str(row["pgn"]) for row in rows]

    def get_engine_cache(self, cache_key: str) -> str | None:
        with closing(self.connect()) as conn:
            row = conn.execute(
                "SELECT payload_json FROM engine_cache WHERE cache_key = ?",
                (cache_key,),
            ).fetchone()
        return str(row["payload_json"]) if row else None

    def set_engine_cache(self, cache_key: str, payload_json: str) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO engine_cache (cache_key, payload_json, created_at)
                VALUES (?, ?, ?)
                """,
                (cache_key, payload_json, _utc_now()),
            )
            conn.commit()

    def get_full_data_discovery(self, game_id: int) -> dict[str, object] | None:
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT game_id, conclusion, partner_found, second_board_url, report_json, created_at
                FROM full_data_discovery
                WHERE game_id = ?
                """,
                (game_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_games_for_mistake_analysis(
        self,
        username: str,
        limit: int = 20,
        only_two_board: bool = True,
        depth: int | None = None,
        only_unanalyzed: bool = True,
        selection: str = "recent",
    ) -> list[dict[str, object]]:
        clauses = ["username = ?"]
        values: list[object] = [username.lower()]
        if only_two_board:
            clauses.append("raw_json LIKE '%bughousePartnerTcnMoves%'")
        if only_unanalyzed and depth is not None:
            clauses.append(
                """
                NOT EXISTS (
                    SELECT 1
                    FROM current_game_analysis_runs gar
                    WHERE gar.game_id = games.id
                        AND gar.depth = ?
                        AND gar.status = 'complete'
                )
                """
            )
            values.append(depth)
        values.append(limit)
        order_by = {
            "oldest": "end_time ASC",
            "random": "RANDOM()",
        }.get(selection, "end_time DESC")
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                SELECT
                    id,
                    username,
                    url,
                    datetime(end_time, 'unixepoch') AS played_at,
                    end_time,
                    result,
                    user_color,
                    opponent,
                    opponent_rating,
                    partner,
                    pgn,
                    raw_json
                FROM games
                WHERE {" AND ".join(clauses)}
                ORDER BY {order_by}
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [dict(row) for row in rows]

    def record_game_analysis_run(
        self,
        game_id: int,
        username: str,
        depth: int,
        max_positions: int,
        critical_positions: int,
        mistakes_found: int,
        status: str,
    ) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO game_analysis_runs (
                    game_id, username, depth, max_positions, critical_positions,
                    mistakes_found, status, analysis_version, analyzed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    game_id,
                    username.lower(),
                    depth,
                    max_positions,
                    critical_positions,
                    mistakes_found,
                    status,
                    ANALYSIS_VERSION,
                    _utc_now(),
                ),
            )
            conn.commit()

    def get_analysis_coverage(self, username: str, depth: int) -> dict[str, object]:
        normalized = username.lower()
        with closing(self.connect()) as conn:
            total = conn.execute(
                "SELECT COUNT(*) AS count FROM games WHERE username = ?",
                (normalized,),
            ).fetchone()["count"]
            two_board = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM games
                WHERE username = ? AND raw_json LIKE '%bughousePartnerTcnMoves%'
                """,
                (normalized,),
            ).fetchone()["count"]
            analyzed = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM current_game_analysis_runs
                WHERE username = ? AND depth = ? AND status = 'complete'
                """,
                (normalized, depth),
            ).fetchone()["count"]
        return {
            "total_games": total,
            "two_board_games": two_board,
            "analyzed_at_depth": analyzed,
        }

    def reset_coach_analysis(self, username: str | None = None) -> dict[str, int]:
        clauses = []
        values: list[object] = []
        if username:
            clauses.append("username = ?")
            values.append(username.lower())
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with closing(self.connect()) as conn:
            mistake_count = conn.execute(f"SELECT COUNT(*) AS count FROM mistakes {where}", values).fetchone()["count"]
            run_count = conn.execute(f"SELECT COUNT(*) AS count FROM game_analysis_runs {where}", values).fetchone()["count"]
            cache_count = conn.execute("SELECT COUNT(*) AS count FROM engine_cache").fetchone()["count"]
            conn.execute(f"DELETE FROM mistakes {where}", values)
            conn.execute(f"DELETE FROM game_analysis_runs {where}", values)
            conn.execute("DELETE FROM engine_cache")
            conn.commit()
        return {
            "mistakes_deleted": int(mistake_count),
            "analysis_runs_deleted": int(run_count),
            "engine_cache_deleted": int(cache_count),
        }

    def replace_game_mistakes(self, game_id: int, depth: int | None, mistakes: list[dict[str, Any]]) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                "DELETE FROM mistakes WHERE game_id = ? AND COALESCE(depth, -1) = COALESCE(?, -1) AND analysis_version = ?",
                (game_id, depth, ANALYSIS_VERSION),
            )
            for item in mistakes:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO mistakes (
                        game_id, username, ply, move, side, reason, category, tactical_motif, severity,
                        estimated_loss_cp, bestmove, score_before, score_after, depth,
                        confidence, note, before_fen, after_fen, clock_seconds,
                        time_spent_seconds, partner_ply, partner_fen,
                        partner_score_before, partner_mate_in, partner_danger,
                        analysis_version, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        game_id,
                        item["username"],
                        item["ply"],
                        item["move"],
                        item["side"],
                        item["reason"],
                        item["category"],
                        item.get("tactical_motif") or "unknown",
                        item["severity"],
                        item["estimated_loss_cp"],
                        item.get("bestmove"),
                        item["score_before"],
                        item["score_after"],
                        item.get("depth"),
                        item["confidence"],
                        item["note"],
                        item.get("before_fen"),
                        item.get("after_fen"),
                        item.get("clock_seconds"),
                        item.get("time_spent_seconds"),
                        item.get("partner_ply"),
                        item.get("partner_fen"),
                        item.get("partner_score_before"),
                        item.get("partner_mate_in"),
                        item.get("partner_danger"),
                        ANALYSIS_VERSION,
                        _utc_now(),
                    ),
                )
            conn.commit()

    def get_mistake_summary(self, username: str) -> dict[str, object]:
        with closing(self.connect()) as conn:
            total = conn.execute(
                "SELECT COUNT(*) AS count FROM current_mistakes WHERE username = ?",
                (username.lower(),),
            ).fetchone()["count"]
            blunders = conn.execute(
                "SELECT COUNT(*) AS count FROM current_mistakes WHERE username = ? AND severity = 'blunder'",
                (username.lower(),),
            ).fetchone()["count"]
            avg_loss = conn.execute(
                "SELECT ROUND(AVG(estimated_loss_cp), 1) AS avg_loss FROM current_mistakes WHERE username = ?",
                (username.lower(),),
            ).fetchone()["avg_loss"]
        return {"mistakes": total, "blunders": blunders, "avg_loss": avg_loss}

    def get_mistake_rows(self, username: str, limit: int = 100) -> list[dict[str, object]]:
        return self.search_mistakes(username=username, limit=limit)

    def get_primary_mistake_for_game(self, game_id: int) -> dict[str, object] | None:
        """Return the strongest current, review-safe engine finding for a game."""
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT
                    id,
                    game_id,
                    ply,
                    move,
                    category,
                    tactical_motif,
                    severity,
                    estimated_loss_cp,
                    bestmove,
                    confidence,
                    depth,
                    partner_danger
                FROM current_mistakes
                WHERE game_id = ?
                  AND confidence IN ('high', 'medium')
                  AND bestmove IS NOT NULL
                  AND TRIM(bestmove) != ''
                ORDER BY
                    CASE confidence WHEN 'high' THEN 0 ELSE 1 END,
                    estimated_loss_cp DESC,
                    COALESCE(depth, 0) DESC,
                    id ASC
                LIMIT 1
                """,
                (game_id,),
            ).fetchone()
        return dict(row) if row else None

    def search_mistakes(
        self,
        username: str,
        limit: int = 100,
        category: str | None = None,
        tactical_motif: str | None = None,
        partner: str | None = None,
        min_rating: int | None = None,
        max_clock_seconds: int | None = None,
    ) -> list[dict[str, object]]:
        clauses = ["m.username = ?"]
        values: list[object] = [username.lower()]
        if category and category != "All":
            clauses.append("m.category = ?")
            values.append(category)
        if tactical_motif and tactical_motif != "All":
            clauses.append("m.tactical_motif = ?")
            values.append(tactical_motif)
        if partner:
            clauses.append("LOWER(COALESCE(g.partner, '')) LIKE ?")
            values.append(f"%{partner.lower()}%")
        if min_rating is not None:
            clauses.append("g.opponent_rating >= ?")
            values.append(min_rating)
        if max_clock_seconds is not None:
            clauses.append("m.clock_seconds IS NOT NULL AND m.clock_seconds <= ?")
            values.append(max_clock_seconds)
        values.append(limit)
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    m.id,
                    m.username,
                    m.game_id,
                    datetime(g.end_time, 'unixepoch') AS played_at,
                    g.result,
                    g.opponent,
                    g.opponent_rating,
                    g.partner,
                    m.ply,
                    m.move,
                    m.side,
                    m.category,
                    m.tactical_motif,
                    m.severity,
                    m.estimated_loss_cp,
                    m.bestmove,
                    m.reason,
                    m.confidence,
                    m.depth,
                    m.clock_seconds,
                    m.time_spent_seconds,
                    m.partner_ply,
                    m.partner_score_before,
                    m.partner_mate_in,
                    m.partner_danger
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE """ + " AND ".join(clauses) + """
                ORDER BY m.estimated_loss_cp DESC, g.end_time DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [dict(row) for row in rows]

    def get_mistake_categories(self, username: str) -> list[str]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT category
                FROM current_mistakes
                WHERE username = ?
                ORDER BY category
                """,
                (username.lower(),),
            ).fetchall()
        return [str(row["category"]) for row in rows]

    def get_tactical_motifs(self, username: str) -> list[str]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT tactical_motif
                FROM current_mistakes
                WHERE username = ? AND tactical_motif IS NOT NULL AND tactical_motif != ''
                ORDER BY tactical_motif
                """,
                (username.lower(),),
            ).fetchall()
        return [str(row["tactical_motif"]) for row in rows]

    def get_mistake_partner_stats(self, username: str) -> list[dict[str, object]]:
        return self._grouped_mistake_stats(
            username=username,
            label_sql="COALESCE(NULLIF(g.partner, ''), 'Unknown')",
            label_name="partner",
        )

    def get_mistake_opponent_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    COALESCE(NULLIF(g.opponent, ''), 'Unknown') AS opponent,
                    COUNT(*) AS mistakes,
                    SUM(CASE WHEN m.severity = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    ROUND(AVG(m.estimated_loss_cp), 1) AS avg_loss,
                    MAX(m.estimated_loss_cp) AS max_loss,
                    ROUND(AVG(g.opponent_rating), 0) AS avg_rating,
                    COUNT(DISTINCT m.game_id) AS games_with_mistakes
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE m.username = ?
                GROUP BY COALESCE(NULLIF(g.opponent, ''), 'Unknown')
                ORDER BY mistakes DESC, avg_loss DESC
                """,
                (username.lower(),),
            ).fetchall()
        return [
            {
                **dict(row),
                "avg_rating": None if row["avg_rating"] is None else int(row["avg_rating"]),
            }
            for row in rows
        ]

    def get_mistake_result_stats(self, username: str) -> list[dict[str, object]]:
        return self._grouped_mistake_stats(
            username=username,
            label_sql="COALESCE(NULLIF(g.result, ''), 'unknown')",
            label_name="result",
        )

    def get_mistake_rating_bucket_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    CASE
                        WHEN g.opponent_rating IS NULL THEN 'unknown'
                        WHEN g.opponent_rating < 1600 THEN '<1600'
                        WHEN g.opponent_rating < 1800 THEN '1600-1799'
                        WHEN g.opponent_rating < 2000 THEN '1800-1999'
                        WHEN g.opponent_rating < 2200 THEN '2000-2199'
                        WHEN g.opponent_rating < 2400 THEN '2200-2399'
                        ELSE '2400+'
                    END AS rating_range,
                    COUNT(*) AS mistakes,
                    SUM(CASE WHEN m.severity = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    ROUND(AVG(m.estimated_loss_cp), 1) AS avg_loss,
                    MAX(m.estimated_loss_cp) AS max_loss,
                    COUNT(DISTINCT m.game_id) AS games_with_mistakes
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE m.username = ?
                GROUP BY rating_range
                ORDER BY
                    CASE rating_range
                        WHEN '<1600' THEN 1
                        WHEN '1600-1799' THEN 2
                        WHEN '1800-1999' THEN 3
                        WHEN '2000-2199' THEN 4
                        WHEN '2200-2399' THEN 5
                        WHEN '2400+' THEN 6
                        ELSE 7
                    END
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_mistake_clock_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    CASE
                        WHEN m.clock_seconds IS NULL THEN 'unknown'
                        WHEN m.clock_seconds <= 10 THEN '<=10s'
                        WHEN m.clock_seconds <= 30 THEN '11-30s'
                        WHEN m.clock_seconds <= 60 THEN '31-60s'
                        WHEN m.clock_seconds <= 120 THEN '1-2m'
                        ELSE '>2m'
                    END AS clock_bucket,
                    COUNT(*) AS mistakes,
                    SUM(CASE WHEN m.severity = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    ROUND(AVG(m.estimated_loss_cp), 1) AS avg_loss,
                    MAX(m.estimated_loss_cp) AS max_loss,
                    ROUND(AVG(m.time_spent_seconds), 1) AS avg_spent_seconds
                FROM current_mistakes m
                WHERE m.username = ?
                GROUP BY clock_bucket
                ORDER BY
                    CASE clock_bucket
                        WHEN '<=10s' THEN 1
                        WHEN '11-30s' THEN 2
                        WHEN '31-60s' THEN 3
                        WHEN '1-2m' THEN 4
                        WHEN '>2m' THEN 5
                        ELSE 6
                    END
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def _grouped_mistake_stats(
        self,
        username: str,
        label_sql: str,
        label_name: str,
    ) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                SELECT
                    {label_sql} AS {label_name},
                    COUNT(*) AS mistakes,
                    SUM(CASE WHEN m.severity = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    ROUND(AVG(m.estimated_loss_cp), 1) AS avg_loss,
                    MAX(m.estimated_loss_cp) AS max_loss,
                    COUNT(DISTINCT m.game_id) AS games_with_mistakes
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE m.username = ?
                GROUP BY {label_sql}
                ORDER BY mistakes DESC, avg_loss DESC
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_mistake(self, mistake_id: int) -> dict[str, object] | None:
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT
                    m.*,
                    datetime(g.end_time, 'unixepoch') AS played_at,
                    g.result,
                    g.user_color,
                    g.opponent,
                    g.opponent_rating,
                    g.partner,
                    g.pgn,
                    g.raw_json,
                    g.url
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE m.id = ?
                """,
                (mistake_id,),
            ).fetchone()
        return dict(row) if row else None

    def get_mistake_category_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    category,
                    severity,
                    COUNT(*) AS count,
                    ROUND(AVG(estimated_loss_cp), 1) AS avg_loss,
                    MAX(estimated_loss_cp) AS max_loss
                FROM current_mistakes
                WHERE username = ?
                GROUP BY category, severity
                ORDER BY count DESC, avg_loss DESC
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_tactical_motif_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    tactical_motif,
                    severity,
                    COUNT(*) AS count,
                    ROUND(AVG(estimated_loss_cp), 1) AS avg_loss,
                    MAX(estimated_loss_cp) AS max_loss
                FROM current_mistakes
                WHERE username = ?
                GROUP BY tactical_motif, severity
                ORDER BY count DESC, avg_loss DESC
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_mistakes_for_category_refresh(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    id, move, bestmove, reason, category, before_fen,
                    clock_seconds, time_spent_seconds, partner_danger
                FROM current_mistakes
                WHERE username = ?
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def update_mistake_category(self, mistake_id: int, category: str) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                "UPDATE mistakes SET category = ? WHERE id = ?",
                (category, mistake_id),
            )
            conn.commit()

    def update_mistake_labels(self, mistake_id: int, category: str, tactical_motif: str) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                "UPDATE mistakes SET category = ?, tactical_motif = ? WHERE id = ?",
                (category, tactical_motif, mistake_id),
            )
            conn.commit()

    def get_coaching_priorities(self, username: str) -> list[dict[str, object]]:
        normalized = username.lower()
        priorities: list[dict[str, object]] = []
        with closing(self.connect()) as conn:
            overall = conn.execute(
                """
                SELECT
                    category,
                    COUNT(*) AS mistakes,
                    SUM(CASE WHEN severity = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    ROUND(AVG(estimated_loss_cp), 1) AS avg_loss,
                    MAX(estimated_loss_cp) AS max_loss
                FROM current_mistakes
                WHERE username = ?
                GROUP BY category
                ORDER BY blunders DESC, mistakes DESC, avg_loss DESC
                LIMIT 1
                """,
                (normalized,),
            ).fetchone()
            if overall:
                priorities.append(
                    {
                        "priority": "Main leak",
                        "focus": overall["category"],
                        "context": "all games",
                        "evidence": f"{overall['mistakes']} mistakes, {overall['blunders']} blunders, avg {overall['avg_loss']} cp",
                        "max_loss": overall["max_loss"],
                    }
                )

            partner = conn.execute(
                """
                SELECT
                    COALESCE(NULLIF(g.partner, ''), 'Unknown') AS partner,
                    m.category,
                    COUNT(*) AS mistakes,
                    SUM(CASE WHEN m.severity = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    ROUND(AVG(m.estimated_loss_cp), 1) AS avg_loss,
                    MAX(m.estimated_loss_cp) AS max_loss
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                WHERE m.username = ?
                GROUP BY COALESCE(NULLIF(g.partner, ''), 'Unknown'), m.category
                HAVING COUNT(*) >= 2
                ORDER BY blunders DESC, mistakes DESC, avg_loss DESC
                LIMIT 1
                """,
                (normalized,),
            ).fetchone()
            if partner:
                priorities.append(
                    {
                        "priority": "Partner pattern",
                        "focus": partner["category"],
                        "context": f"with {partner['partner']}",
                        "evidence": f"{partner['mistakes']} mistakes, {partner['blunders']} blunders, avg {partner['avg_loss']} cp",
                        "max_loss": partner["max_loss"],
                    }
                )

            rating = conn.execute(
                """
                WITH bucketed AS (
                    SELECT
                        CASE
                            WHEN g.opponent_rating IS NULL THEN 'unknown'
                            WHEN g.opponent_rating < 1600 THEN '<1600'
                            WHEN g.opponent_rating < 1800 THEN '1600-1799'
                            WHEN g.opponent_rating < 2000 THEN '1800-1999'
                            WHEN g.opponent_rating < 2200 THEN '2000-2199'
                            WHEN g.opponent_rating < 2400 THEN '2200-2399'
                            ELSE '2400+'
                        END AS rating_range,
                        m.category,
                        m.severity,
                        m.estimated_loss_cp
                    FROM current_mistakes m
                    JOIN games g ON g.id = m.game_id
                    WHERE m.username = ?
                )
                SELECT
                    rating_range,
                    category,
                    COUNT(*) AS mistakes,
                    SUM(CASE WHEN severity = 'blunder' THEN 1 ELSE 0 END) AS blunders,
                    ROUND(AVG(estimated_loss_cp), 1) AS avg_loss,
                    MAX(estimated_loss_cp) AS max_loss
                FROM bucketed
                GROUP BY rating_range, category
                HAVING COUNT(*) >= 2
                ORDER BY blunders DESC, mistakes DESC, avg_loss DESC
                LIMIT 1
                """,
                (normalized,),
            ).fetchone()
            if rating:
                priorities.append(
                    {
                        "priority": "Rating-range leak",
                        "focus": rating["category"],
                        "context": f"vs {rating['rating_range']}",
                        "evidence": f"{rating['mistakes']} mistakes, {rating['blunders']} blunders, avg {rating['avg_loss']} cp",
                        "max_loss": rating["max_loss"],
                    }
                )
        return priorities

    def record_drill_attempt(
        self,
        mistake_id: int,
        username: str,
        category: str,
        expected_move: str | None,
        attempted_move: str,
        score: str,
    ) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                """
                INSERT INTO drill_attempts (
                    mistake_id, username, category, expected_move, attempted_move, score, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mistake_id,
                    username.lower(),
                    category,
                    expected_move,
                    attempted_move,
                    score,
                    _utc_now(),
                ),
            )
            conn.commit()

    def get_drill_summary(self, username: str) -> dict[str, object]:
        with closing(self.connect()) as conn:
            row = conn.execute(
                """
                SELECT
                    COUNT(*) AS attempts,
                    SUM(CASE WHEN score = 'correct' THEN 1 ELSE 0 END) AS correct,
                    SUM(CASE WHEN score = 'close' THEN 1 ELSE 0 END) AS close_count
                FROM drill_attempts
                WHERE username = ?
                """,
                (username.lower(),),
            ).fetchone()
        attempts = int(row["attempts"] or 0)
        correct = int(row["correct"] or 0)
        close = int(row["close_count"] or 0)
        return {
            "attempts": attempts,
            "correct": correct,
            "close": close,
            "accuracy": None if attempts == 0 else round((correct / attempts) * 100, 1),
        }

    def get_drill_category_stats(self, username: str) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    category,
                    COUNT(*) AS attempts,
                    SUM(CASE WHEN score = 'correct' THEN 1 ELSE 0 END) AS correct,
                    SUM(CASE WHEN score = 'close' THEN 1 ELSE 0 END) AS close_count,
                    ROUND(AVG(CASE WHEN score = 'correct' THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy
                FROM drill_attempts
                WHERE username = ?
                GROUP BY category
                ORDER BY attempts DESC, accuracy ASC
                """,
                (username.lower(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_recent_drill_attempts(self, username: str, limit: int = 20) -> list[dict[str, object]]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    created_at,
                    category,
                    expected_move,
                    attempted_move,
                    score,
                    mistake_id
                FROM drill_attempts
                WHERE username = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (username.lower(), limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_training_queue(
        self,
        username: str,
        limit: int = 100,
        mode: str = "smart",
        category: str | None = None,
        tactical_motif: str | None = None,
        partner: str | None = None,
        min_rating: int | None = None,
        max_clock_seconds: int | None = None,
    ) -> list[dict[str, object]]:
        extra_where = ""
        if mode == "missed before":
            extra_where = "AND COALESCE(a.missed_attempts, 0) > 0"
        filters = []
        filter_values: list[object] = []
        if category and category != "All":
            filters.append("m.category = ?")
            filter_values.append(category)
        if tactical_motif and tactical_motif != "All":
            filters.append("m.tactical_motif = ?")
            filter_values.append(tactical_motif)
        if partner:
            filters.append("LOWER(COALESCE(g.partner, '')) LIKE ?")
            filter_values.append(f"%{partner.lower()}%")
        if min_rating is not None:
            filters.append("g.opponent_rating >= ?")
            filter_values.append(min_rating)
        if max_clock_seconds is not None:
            filters.append("m.clock_seconds IS NOT NULL AND m.clock_seconds <= ?")
            filter_values.append(max_clock_seconds)
        extra_filter_sql = (" AND " + " AND ".join(filters)) if filters else ""
        order_by = {
            "largest mistakes": "m.estimated_loss_cp DESC, g.end_time DESC",
            "recent mistakes": "g.end_time DESC, m.estimated_loss_cp DESC",
            "weak categories": "category_accuracy ASC, category_attempts DESC, m.estimated_loss_cp DESC",
            "missed before": "missed_attempts DESC, last_attempt_at ASC, m.estimated_loss_cp DESC",
        }.get(
            mode,
            """
            (
                CASE WHEN attempts = 0 THEN 80 ELSE 0 END
                + CASE WHEN missed_attempts > 0 THEN 100 ELSE 0 END
                + CASE WHEN category_accuracy IS NOT NULL THEN (100 - category_accuracy) ELSE 40 END
                + CASE WHEN m.estimated_loss_cp / 50 > 100 THEN 100 ELSE m.estimated_loss_cp / 50 END
                + CASE WHEN julianday('now') - julianday(g.end_time, 'unixepoch') <= 7 THEN 25 ELSE 0 END
            ) DESC,
            COALESCE(last_attempt_at, '1970-01-01') ASC,
            m.estimated_loss_cp DESC
            """,
        )
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""
                WITH attempt_stats AS (
                    SELECT
                        mistake_id,
                        COUNT(*) AS attempts,
                        SUM(CASE WHEN score != 'correct' THEN 1 ELSE 0 END) AS missed_attempts,
                        MAX(created_at) AS last_attempt_at
                    FROM drill_attempts
                    WHERE username = ?
                    GROUP BY mistake_id
                ),
                category_stats AS (
                    SELECT
                        category,
                        COUNT(*) AS category_attempts,
                        ROUND(AVG(CASE WHEN score = 'correct' THEN 1.0 ELSE 0.0 END) * 100, 1) AS category_accuracy
                    FROM drill_attempts
                    WHERE username = ?
                    GROUP BY category
                )
                SELECT
                    m.id,
                    m.username,
                    m.game_id,
                    datetime(g.end_time, 'unixepoch') AS played_at,
                    g.result,
                    g.opponent,
                    g.opponent_rating,
                    g.partner,
                    m.ply,
                    m.move,
                    m.side,
                    m.category,
                    m.tactical_motif,
                    m.severity,
                    m.estimated_loss_cp,
                    m.bestmove,
                    m.reason,
                    m.confidence,
                    m.depth,
                    m.clock_seconds,
                    m.time_spent_seconds,
                    m.partner_ply,
                    m.partner_score_before,
                    m.partner_mate_in,
                    m.partner_danger,
                    COALESCE(a.attempts, 0) AS attempts,
                    COALESCE(a.missed_attempts, 0) AS missed_attempts,
                    a.last_attempt_at,
                    COALESCE(c.category_attempts, 0) AS category_attempts,
                    c.category_accuracy
                FROM current_mistakes m
                JOIN games g ON g.id = m.game_id
                LEFT JOIN attempt_stats a ON a.mistake_id = m.id
                LEFT JOIN category_stats c ON c.category = m.category
                WHERE m.username = ?
                    {extra_where}
                    {extra_filter_sql}
                ORDER BY {order_by}
                LIMIT ?
                """,
                (username.lower(), username.lower(), username.lower(), *filter_values, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_session_report(self, username: str) -> dict[str, object]:
        return {
            "top_leaks": self.get_mistake_category_stats(username)[:3],
            "review_positions": self.get_mistake_rows(username, limit=5),
            "priorities": self.get_coaching_priorities(username),
        }

    def set_full_data_discovery(
        self,
        game_id: int,
        conclusion: str,
        partner_found: str | None,
        second_board_url: str | None,
        report_json: str,
    ) -> None:
        with closing(self.connect()) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO full_data_discovery (
                    game_id, conclusion, partner_found, second_board_url, report_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (game_id, conclusion, partner_found, second_board_url, report_json, _utc_now()),
            )
            conn.commit()

    def _game_to_record(self, username: str, game: dict[str, Any]) -> dict[str, Any]:
        normalized = username.lower()
        pgn = str(game.get("pgn") or "")
        headers = parse_pgn_headers(pgn)
        white = _player(game.get("white"))
        black = _player(game.get("black"))
        user_color = _detect_user_color(normalized, white.get("username"), black.get("username"))
        user_player = white if user_color == "white" else black if user_color == "black" else {}
        opponent_player = black if user_color == "white" else white if user_color == "black" else {}

        return {
            "username": normalized,
            "url": str(game.get("url") or headers.get("Link") or game.get("uuid") or ""),
            "uuid": _optional_str(game.get("uuid")),
            "end_time": _optional_int(game.get("end_time")),
            "rated": _bool_to_int(game.get("rated")),
            "rules": _optional_str(game.get("rules") or headers.get("Rules") or headers.get("Variant")),
            "time_class": _optional_str(game.get("time_class")),
            "time_control": _optional_str(game.get("time_control") or headers.get("TimeControl")),
            "result": _normalize_result(user_player.get("result")),
            "user_color": user_color,
            "opponent": _optional_str(opponent_player.get("username")),
            "opponent_rating": _optional_int(opponent_player.get("rating")),
            "partner": _detect_partner(headers, normalized, game),
            "white_username": _optional_str(white.get("username")),
            "black_username": _optional_str(black.get("username")),
            "white_result": _optional_str(white.get("result")),
            "black_result": _optional_str(black.get("result")),
            "pgn": pgn,
            "raw_json": json.dumps(game, ensure_ascii=False),
            "imported_at": _utc_now(),
        }


def has_partner_board_data(game: dict[str, Any]) -> bool:
    return bool(
        game.get("bughousePartnerTcnMoves")
        or game.get("bughouse_partner_tcn_moves")
        or game.get("bughousePartnerPgn")
        or game.get("bughouse_partner_pgn")
    )


def _player(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _detect_user_color(username: str, white_name: object, black_name: object) -> str | None:
    if isinstance(white_name, str) and white_name.lower() == username:
        return "white"
    if isinstance(black_name, str) and black_name.lower() == username:
        return "black"
    return None


def _detect_partner(headers: dict[str, str], username: str, raw: dict[str, Any] | None = None) -> str | None:
    raw = raw or {}
    player1 = _optional_str(raw.get("bughousePlayer1Name"))
    player2 = _optional_str(raw.get("bughousePlayer2Name"))
    partner1 = _optional_str(raw.get("bughousePartnerPlayer1Name"))
    partner2 = _optional_str(raw.get("bughousePartnerPlayer2Name"))
    # Bughouse partners play opposite colors across the two boards.
    if player1 and player1.lower() == username and partner2:
        return partner2
    if player2 and player2.lower() == username and partner1:
        return partner1

    candidates = [
        headers.get("WhitePartner"),
        headers.get("BlackPartner"),
        headers.get("Partner"),
        headers.get("TeamMate"),
        headers.get("Teammate"),
    ]
    for candidate in candidates:
        if candidate and candidate.lower() != username:
            return candidate
    return None


def _normalize_result(result: object) -> str:
    if not isinstance(result, str):
        return "unknown"
    normalized = result.lower()
    if normalized == "win":
        return "win"
    if normalized in {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}:
        return "draw"
    if normalized in {"checkmated", "resigned", "timeout", "abandoned", "lose", "kingofthehill", "threecheck"}:
        return "loss"
    return "unknown"


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text or None


def _optional_int(value: object) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _bool_to_int(value: object) -> int | None:
    if value is None:
        return None
    return 1 if bool(value) else 0


def _format_frequency(count: object, total: object) -> str | None:
    try:
        count_int = int(count or 0)
        total_int = int(total or 0)
    except (TypeError, ValueError):
        return None
    if total_int <= 0:
        return None
    return f"{(count_int / total_int) * 100:.1f}% ({count_int}/{total_int})"


def _json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {
        str(row["name"])
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def _utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")
