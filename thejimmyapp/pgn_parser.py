from __future__ import annotations

import re
import json
from dataclasses import dataclass
from typing import Any

from thejimmyapp.chesscom_api import parse_pgn_headers

try:
    import chess
    from chess_tcn import decode_tcn
except ImportError:  # pragma: no cover - surfaced in Streamlit warnings.
    chess = None
    decode_tcn = None


RESULT_TOKENS = {"1-0", "0-1", "1/2-1/2", "*"}
CLOCK_RE = re.compile(r"%clk\s+(?P<clock>\d+:\d{2}(?::\d{2})?(?:\.\d+)?)", re.IGNORECASE)
MOVE_NUMBER_RE = re.compile(r"^\d+\.(?:\.\.)?$")
NAG_RE = re.compile(r"^\$\d+$")


@dataclass(slots=True)
class MoveRecord:
    ply: int
    move_number: int
    color: str
    san: str
    comment: str | None = None
    clock_seconds: float | None = None
    time_spent_seconds: float | None = None
    elapsed_seconds: float | None = None
    is_capture: bool = False
    is_check: bool = False
    is_mate: bool = False
    is_drop: bool = False
    is_promotion: bool = False
    uci: str | None = None
    drop_piece: str | None = None

    @property
    def display_move(self) -> str:
        prefix = f"{self.move_number}." if self.color == "white" else f"{self.move_number}..."
        return f"{prefix} {self.san}"


@dataclass(slots=True)
class CriticalMoment:
    ply: int
    move_number: int
    color: str
    move: str
    reason: str
    confidence: str
    detail: str


@dataclass(slots=True)
class ParsedGame:
    headers: dict[str, str]
    moves: list[MoveRecord]
    result: str
    parse_warnings: list[str]
    source: str = "pgn"


def parse_pgn(pgn: str) -> ParsedGame:
    headers = parse_pgn_headers(pgn)
    move_text = _extract_move_text(pgn)
    tokens = _tokenize_move_text(move_text)
    moves: list[MoveRecord] = []
    warnings: list[str] = []
    current_move_number = 1
    next_color = "white"

    for token_type, value in tokens:
        if token_type == "comment":
            if moves:
                moves[-1].comment = value
                clock = _parse_clock_seconds(value)
                if clock is not None:
                    moves[-1].clock_seconds = clock
            continue

        token = value.strip()
        if not token or token in RESULT_TOKENS or NAG_RE.match(token):
            continue
        if token.startswith("$"):
            continue
        if MOVE_NUMBER_RE.match(token):
            current_move_number = int(token.split(".", 1)[0])
            next_color = "black" if token.endswith("...") else "white"
            continue
        if token.startswith(";"):
            continue

        san = _clean_move_token(token)
        if not san or san.lower() in {"e.p.", "e.p", "ep"}:
            continue
        if san in RESULT_TOKENS:
            continue

        moves.append(
            MoveRecord(
                ply=len(moves) + 1,
                move_number=current_move_number,
                color=next_color,
                san=san,
                is_capture="x" in san,
                is_check="+" in san or "#" in san,
                is_mate="#" in san,
                is_drop="@" in san,
                is_promotion="=" in san,
                drop_piece=san.split("@", 1)[0] if "@" in san else None,
            )
        )

        if next_color == "white":
            next_color = "black"
        else:
            current_move_number += 1
            next_color = "white"

    _attach_time_spent(moves, headers.get("TimeControl"))
    if not moves:
        warnings.append("No moves could be parsed from this PGN.")
    return ParsedGame(headers=headers, moves=moves, result=_detect_result(headers, move_text), parse_warnings=warnings)


def parse_game_data(pgn: str | None, raw_json: str | None = None) -> ParsedGame:
    if pgn and pgn.strip():
        return parse_pgn(pgn)

    if not raw_json:
        return ParsedGame(
            headers={},
            moves=[],
            result="*",
            parse_warnings=["No PGN was stored and no raw Chess.com JSON was available."],
            source="none",
        )

    try:
        raw = json.loads(raw_json)
    except json.JSONDecodeError:
        return ParsedGame(
            headers={},
            moves=[],
            result="*",
            parse_warnings=["No PGN was stored and raw Chess.com JSON could not be decoded."],
            source="raw_json",
        )

    if not isinstance(raw, dict):
        return ParsedGame(
            headers={},
            moves=[],
            result="*",
            parse_warnings=["No PGN was stored and raw Chess.com JSON had an unexpected shape."],
            source="raw_json",
        )

    tcn = raw.get("tcn")
    if not isinstance(tcn, str) or not tcn:
        return ParsedGame(
            headers=_headers_from_raw(raw),
            moves=[],
            result=_result_from_raw(raw),
            parse_warnings=["No PGN or TCN move list was available for this game."],
            source="raw_json",
        )
    return parse_tcn(tcn, raw)


def parse_tcn(tcn: str, raw: dict[str, Any] | None = None) -> ParsedGame:
    headers = _headers_from_raw(raw or {})
    warnings: list[str] = []
    if decode_tcn is None:
        return ParsedGame(
            headers=headers,
            moves=[],
            result=_result_from_raw(raw or {}),
            parse_warnings=["Install chess-tcn to decode Chess.com TCN move lists."],
            source="tcn",
        )

    try:
        decoded = decode_tcn(tcn)
    except Exception as exc:
        return ParsedGame(
            headers=headers,
            moves=[],
            result=_result_from_raw(raw or {}),
            parse_warnings=[f"Chess.com TCN move list could not be decoded: {exc}"],
            source="tcn",
        )

    try:
        board = _initial_tcn_board(raw or {})
    except (TypeError, ValueError) as exc:
        return ParsedGame(
            headers=headers,
            moves=[],
            result=_result_from_raw(raw or {}),
            parse_warnings=[f"Initial setup could not be initialized: {exc}"],
            source="tcn",
        )
    moves: list[MoveRecord] = []
    inferred_pockets = 0
    for item in decoded:
        if not isinstance(item, dict):
            continue
        color = "white" if len(moves) % 2 == 0 else "black"
        move_number = (len(moves) // 2) + 1
        uci = _tcn_item_to_uci(item)
        san = _tcn_item_to_notation(item, board, False)
        is_capture = False
        is_check = False
        is_mate = False
        if board is not None and uci:
            try:
                chess_move = chess.Move.from_uci(uci if "@" in uci else uci.lower())
                if "drop" in item and chess_move not in board.legal_moves:
                    piece_type = chess.Piece.from_symbol(_drop_piece_symbol(str(item.get("drop", "")))).piece_type
                    board.pockets[board.turn].add(piece_type)
                    inferred_pockets += 1
                if chess_move not in board.legal_moves:
                    raise ValueError("decoded move is not legal in the reconstructed position")
                san = board.san(chess_move)
                is_capture = board.is_capture(chess_move)
                board.push(chess_move)
                is_check = board.is_check()
                is_mate = board.is_checkmate()
            except (TypeError, ValueError):
                warnings.append(f"Could not validate decoded move {uci}; notation confidence is low.")
        moves.append(
            MoveRecord(
                ply=len(moves) + 1,
                move_number=move_number,
                color=color,
                san=san,
                is_capture=is_capture or "x" in san,
                is_check=is_check or "+" in san or "#" in san,
                is_mate=is_mate or "#" in san,
                is_drop="@" in san,
                is_promotion="=" in san or bool(item.get("promotion")),
                uci=uci,
                drop_piece=_drop_piece_symbol(str(item.get("drop", ""))) if "drop" in item else None,
            )
        )

    _attach_tcn_clocks(moves, raw or {})
    if not moves:
        warnings.append("TCN was present but no moves could be decoded.")
    if any(move.is_drop for move in moves):
        warnings.append(
            "This Chess.com Bughouse game used TCN instead of PGN. Moves and drops are decoded. "
            "Partner-board pocket sources are inferred when needed, so pocket confidence can be low."
        )
    if inferred_pockets:
        warnings.append(
            f"Inferred {inferred_pockets} pocket arrival(s) while decoding this board in isolation. "
            "The paired replay rebuilds them from the global two-board timeline."
        )
    return ParsedGame(headers=headers, moves=moves, result=_result_from_raw(raw or {}), parse_warnings=warnings, source="tcn")


def parse_partner_game_data(raw_json: str | None) -> ParsedGame | None:
    if not raw_json:
        return None
    try:
        raw = json.loads(raw_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(raw, dict):
        return None
    partner_pgn = raw.get("bughousePartnerPgn") or raw.get("bughouse_partner_pgn")
    if isinstance(partner_pgn, str) and partner_pgn.strip():
        return parse_pgn(partner_pgn)
    tcn = raw.get("bughousePartnerTcnMoves") or raw.get("bughouse_partner_tcn_moves")
    if not isinstance(tcn, str) or not tcn:
        return None
    partner_raw = dict(raw)
    partner_raw["tcn"] = tcn
    if raw.get("bughousePartnerMoveTimestamps"):
        partner_raw["moveTimestamps"] = raw.get("bughousePartnerMoveTimestamps")
    if "bughousePartnerInitialFen" in raw:
        partner_raw["initialFen"] = raw["bughousePartnerInitialFen"]
    elif "bughouse_partner_initial_fen" in raw:
        partner_raw["initialFen"] = raw["bughouse_partner_initial_fen"]
    return parse_tcn(tcn, partner_raw)


def parse_partner_tcn(raw_json: str | None) -> ParsedGame | None:
    """Backward-compatible partner parser used by the legacy Streamlit app."""
    return parse_partner_game_data(raw_json)


def extract_critical_moments(parsed: ParsedGame) -> list[CriticalMoment]:
    moments: list[CriticalMoment] = []
    previous_by_color: dict[str, MoveRecord] = {}

    for move in parsed.moves:
        reasons: list[str] = []
        if move.is_mate:
            reasons.append("mate marker")
        elif move.is_check:
            reasons.append("check")
        if move.is_drop:
            reasons.append("piece drop")
        if move.is_capture and _is_major_piece_trade(move.san):
            reasons.append("major-piece capture")
        if move.clock_seconds is not None and move.clock_seconds <= 10:
            reasons.append("severe time trouble")
        elif move.clock_seconds is not None and move.clock_seconds <= 30:
            reasons.append("time trouble")
        if move.time_spent_seconds is not None and move.time_spent_seconds >= 15:
            reasons.append("long think")

        previous = previous_by_color.get(move.color)
        if (
            previous
            and previous.clock_seconds is not None
            and move.clock_seconds is not None
            and previous.clock_seconds - move.clock_seconds >= 20
        ):
            reasons.append("large clock drop")

        previous_by_color[move.color] = move
        if not reasons:
            continue

        detail_bits = []
        if move.clock_seconds is not None:
            detail_bits.append(f"clock {format_seconds(move.clock_seconds)}")
        if move.time_spent_seconds is not None:
            detail_bits.append(f"spent about {format_seconds(move.time_spent_seconds)}")

        moments.append(
            CriticalMoment(
                ply=move.ply,
                move_number=move.move_number,
                color=move.color,
                move=move.display_move,
                reason=", ".join(dict.fromkeys(reasons)),
                confidence="medium" if move.is_mate or move.is_check or move.is_drop else "low",
                detail="; ".join(detail_bits) or "PGN heuristic only; run Coach Analysis for engine evaluation.",
            )
        )

    return moments


def format_seconds(value: float) -> str:
    total = max(0, int(round(value)))
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def _extract_move_text(pgn: str) -> str:
    lines = pgn.splitlines()
    move_lines: list[str] = []
    in_headers = True
    for line in lines:
        stripped = line.strip()
        if in_headers and stripped.startswith("["):
            continue
        if in_headers and not stripped:
            in_headers = False
            continue
        in_headers = False
        move_lines.append(line)
    return "\n".join(move_lines)


def _tokenize_move_text(move_text: str) -> list[tuple[str, str]]:
    text = _remove_variations(move_text)
    tokens: list[tuple[str, str]] = []
    idx = 0
    while idx < len(text):
        char = text[idx]
        if char.isspace():
            idx += 1
            continue
        if char == "{":
            end = text.find("}", idx + 1)
            if end == -1:
                tokens.append(("comment", text[idx + 1 :].strip()))
                break
            tokens.append(("comment", text[idx + 1 : end].strip()))
            idx = end + 1
            continue
        end = idx + 1
        while end < len(text) and not text[end].isspace() and text[end] != "{":
            end += 1
        tokens.append(("token", text[idx:end]))
        idx = end
    return tokens


def _remove_variations(text: str) -> str:
    output: list[str] = []
    depth = 0
    for char in text:
        if char == "(":
            depth += 1
            continue
        if char == ")" and depth:
            depth -= 1
            continue
        if depth == 0:
            output.append(char)
    return "".join(output)


def _clean_move_token(token: str) -> str:
    cleaned = token.strip()
    cleaned = cleaned.rstrip("!?")
    cleaned = cleaned.replace("\u200b", "")
    return cleaned


def _parse_clock_seconds(comment: str) -> float | None:
    match = CLOCK_RE.search(comment)
    if not match:
        return None
    parts = match.group("clock").split(":")
    try:
        if len(parts) == 2:
            minutes = int(parts[0])
            seconds = float(parts[1])
            return minutes * 60 + seconds
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    except (TypeError, ValueError):
        return None


def _attach_time_spent(moves: list[MoveRecord], time_control: str | None = None) -> None:
    initial_clock, increment = _parse_time_control(time_control)
    clocks = [move.clock_seconds for move in moves if move.clock_seconds is not None]
    if initial_clock is None and clocks:
        initial_clock = max(clocks)
    previous_by_color: dict[str, float] = {}
    elapsed = 0.0
    for move in moves:
        if move.clock_seconds is None:
            continue
        previous = previous_by_color.get(move.color, initial_clock)
        if previous is not None:
            spent = previous + increment - move.clock_seconds
            if spent >= -0.05:
                move.time_spent_seconds = max(0.0, spent)
                elapsed += move.time_spent_seconds
                move.elapsed_seconds = elapsed
        previous_by_color[move.color] = move.clock_seconds


def _attach_tcn_clocks(moves: list[MoveRecord], raw: dict[str, Any]) -> None:
    timestamps = raw.get("moveTimestamps") or raw.get("move_timestamps")
    if not isinstance(timestamps, str) or not timestamps:
        return
    values: list[float] = []
    for token in timestamps.split(","):
        try:
            values.append(float(token) / 10.0)
        except ValueError:
            values.append(0.0)
    for move, clock in zip(moves, values):
        move.clock_seconds = clock
    _attach_time_spent(moves, str(raw.get("time_control") or raw.get("timeControl") or ""))


def _parse_time_control(value: str | None) -> tuple[float | None, float]:
    text = str(value or "").strip()
    match = re.fullmatch(r"(?P<initial>\d+(?:\.\d+)?)(?:\+(?P<increment>\d+(?:\.\d+)?))?", text)
    if not match:
        return None, 0.0
    return float(match.group("initial")), float(match.group("increment") or 0.0)


def _initial_tcn_board(raw: dict[str, Any]) -> Any:
    setup_found = False
    initial: object = None
    for key in ("initial_setup", "initialSetup", "initialFen"):
        if key in raw:
            setup_found = True
            initial = raw[key]
            break

    if not setup_found:
        return chess.variant.CrazyhouseBoard() if chess is not None else None
    if not isinstance(initial, str) or not initial.strip():
        raise ValueError("initial setup must be a non-empty string")

    setup = initial.strip()
    if setup.lower() in {"startpos", "standard"}:
        return chess.variant.CrazyhouseBoard() if chess is not None else None
    if chess is None:
        raise ValueError("python-chess is unavailable for a non-standard initial setup")
    try:
        return chess.variant.CrazyhouseBoard(setup)
    except (TypeError, ValueError) as exc:
        raise ValueError("non-standard initial setup is invalid") from exc


def _detect_result(headers: dict[str, str], move_text: str) -> str:
    if "Result" in headers:
        return headers["Result"]
    for token in reversed(move_text.split()):
        if token in RESULT_TOKENS:
            return token
    return "*"


def _is_major_piece_trade(san: str) -> bool:
    return san.startswith("Qx") or san.startswith("Rx") or "xQ" in san or "xR" in san


def _headers_from_raw(raw: dict[str, Any]) -> dict[str, str]:
    white = raw.get("white") if isinstance(raw.get("white"), dict) else {}
    black = raw.get("black") if isinstance(raw.get("black"), dict) else {}
    headers: dict[str, str] = {}
    if raw.get("url"):
        headers["Link"] = str(raw["url"])
    if raw.get("rules"):
        headers["Variant"] = str(raw["rules"])
    if raw.get("time_control"):
        headers["TimeControl"] = str(raw["time_control"])
    if white.get("username"):
        headers["White"] = str(white["username"])
    if black.get("username"):
        headers["Black"] = str(black["username"])
    headers["Result"] = _result_from_raw(raw)
    return headers


def _result_from_raw(raw: dict[str, Any]) -> str:
    white = raw.get("white") if isinstance(raw.get("white"), dict) else {}
    black = raw.get("black") if isinstance(raw.get("black"), dict) else {}
    white_result = str(white.get("result", "")).lower()
    black_result = str(black.get("result", "")).lower()
    if white_result == "win":
        return "1-0"
    if black_result == "win":
        return "0-1"
    if white_result in {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}:
        return "1/2-1/2"
    return "*"


def _tcn_item_to_notation(item: dict[str, Any], board: Any, san_confidence: bool) -> str:
    if "drop" in item:
        piece = _drop_piece_symbol(str(item.get("drop", "")))
        return f"{piece}@{item.get('to', '')}"

    from_square = str(item.get("from", ""))
    to_square = str(item.get("to", ""))
    promotion = str(item.get("promotion", ""))
    if board is not None and san_confidence and from_square and to_square:
        try:
            move = chess.Move.from_uci(f"{from_square}{to_square}{promotion}")
            return board.san(move)
        except Exception:
            pass
    suffix = f"={promotion.upper()}" if promotion else ""
    return f"{from_square}-{to_square}{suffix}"


def _tcn_item_to_uci(item: dict[str, Any]) -> str | None:
    if "drop" in item:
        piece = _drop_piece_symbol(str(item.get("drop", "")))
        to_square = str(item.get("to", ""))
        return f"{piece}@{to_square}" if piece and to_square else None
    from_square = str(item.get("from", ""))
    to_square = str(item.get("to", ""))
    promotion = str(item.get("promotion", ""))
    if from_square and to_square:
        return f"{from_square}{to_square}{promotion}"
    return None


def _drop_piece_symbol(value: str) -> str:
    if value.lower() == "p":
        return "P"
    return value.upper() if value else "?"
