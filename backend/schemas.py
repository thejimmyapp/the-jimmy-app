from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ChessComConnectRequest(BaseModel):
    username: str = Field(min_length=2, max_length=25, pattern=r"^[A-Za-z0-9_-]+$")


class ChessComEnrichRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=2, max_length=25, pattern=r"^[A-Za-z0-9_-]+$")
    curl_text: str = Field(min_length=40, max_length=100_000)
    limit: int = Field(default=5000, ge=1, le=20_000)


class ChessComGameResolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=500)
    username: str | None = Field(default=None, min_length=2, max_length=25, pattern=r"^[A-Za-z0-9_-]+$")


class PgnImportRequest(BaseModel):
    username: str = Field(min_length=2, max_length=25, pattern=r"^[A-Za-z0-9_-]+$")
    pgn: str = Field(min_length=8, max_length=2_000_000)
    second_board_pgn: str | None = Field(default=None, max_length=2_000_000)


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    game_id: int = Field(gt=0)
    global_ply: int = Field(ge=0)
    board: Literal["A", "B"] = "A"
    depth: int = Field(default=10, ge=4, le=24)


class MomentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    game_id: int = Field(gt=0, strict=True)
    move_token: str = Field(pattern=r"^[1-9]\d*[AaBb]$", max_length=20)
    glyph: Literal["!", "?", "!!", "??", "!?", "?!"]
    alternative_move: str = Field(min_length=1, max_length=64)
    written_answer: str = Field(min_length=1, max_length=5000)
    engine_identity: str | None = Field(default=None, min_length=1, max_length=200)
    engine_depth: int | None = Field(default=None, ge=4, le=24, strict=True)

    @field_validator("alternative_move")
    @classmethod
    def require_board_move(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("alternative move is required")
        return value

    @field_validator("written_answer")
    @classmethod
    def require_written_answer(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or cleaned == "Because":
            raise ValueError("written answer is required")
        return value

    @field_validator("engine_identity")
    @classmethod
    def require_engine_identity(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("engine identity cannot be blank")
        return value

    @model_validator(mode="after")
    def require_complete_engine_provenance(self) -> "MomentCreateRequest":
        if (self.engine_identity is None) != (self.engine_depth is None):
            raise ValueError("engine identity and depth must be supplied together")
        return self


class AccountClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=1, max_length=254)

    @field_validator("email")
    @classmethod
    def require_valid_email(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned.count("@") != 1 or any(character.isspace() for character in cleaned):
            raise ValueError("email must contain exactly one @ and no whitespace")
        local_part, domain = cleaned.split("@")
        if not local_part or not domain:
            raise ValueError("email local and domain parts are required")
        return cleaned


class CoachAnnotationInput(BaseModel):
    board: Literal["A", "B"]
    type: Literal["arrow", "highlight"]
    from_square: str = Field(pattern=r"^[a-h][1-8]$", alias="from")
    to_square: str | None = Field(default=None, pattern=r"^[a-h][1-8]$", alias="to")
    color: str = Field(default="cyan", max_length=20)


class CoachPrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    game_id: int = Field(gt=0)
    global_ply: int = Field(ge=0)
    question: str = Field(min_length=3, max_length=1000)
    annotations: list[CoachAnnotationInput] = Field(default_factory=list, max_length=80)


class LeakMapAnalysisRequest(BaseModel):
    username: str = Field(min_length=2, max_length=25, pattern=r"^[A-Za-z0-9_-]+$")
    game_limit: int = Field(default=10, ge=1, le=50)
    max_positions_per_game: int = Field(default=6, ge=1, le=12)


class ExplorationMoveRequest(BaseModel):
    board_a_fen: str = Field(min_length=10, max_length=200)
    board_b_fen: str | None = Field(default=None, min_length=10, max_length=200)
    board: Literal["A", "B"]
    from_square: str | None = Field(default=None, pattern=r"^[a-h][1-8]$")
    to_square: str = Field(pattern=r"^[a-h][1-8]$")
    drop_piece: Literal["P", "N", "B", "R", "Q"] | None = None
    promotion: Literal["q", "r", "b", "n"] | None = None
    dry_run: bool = False


class ExplorationSanMoveRequest(BaseModel):
    board_a_fen: str = Field(min_length=10, max_length=200)
    board_b_fen: str | None = Field(default=None, min_length=10, max_length=200)
    board: Literal["A", "B"]
    san: str = Field(min_length=2, max_length=24)


class PuzzleMove(BaseModel):
    board: Literal["A", "B"]
    san: str = Field(min_length=2, max_length=24)


class PuzzleHistoryRequest(BaseModel):
    moves: list[PuzzleMove] = Field(default_factory=list, max_length=80)

class RoomCreateRequest(BaseModel):
    game_id: int | None = Field(default=None, gt=0)


class RoomJoinRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return " ".join(value.split())


class NoteCreateRequest(BaseModel):
    author: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=1, max_length=5000)
    board: Literal["A", "B"] | None = None
    global_ply: int | None = Field(default=None, ge=0)
    variation_id: UUID | None = None


class SocketEvent(BaseModel):
    version: Literal[1] = 1
    event_id: UUID
    room_id: UUID
    sender_id: str = Field(min_length=1, max_length=80)
    timestamp: datetime
    type: Literal[
        "room.join",
        "room.leave",
        "presence.update",
        "game.select",
        "timeline.seek",
        "board.move",
        "variation.create",
        "variation.update",
        "variation.return_to_game",
        "annotation.create",
        "annotation.delete",
        "chat.message",
        "note.create",
        "note.update",
        "quest.status",
    ]
    payload: dict[str, Any] = Field(default_factory=dict)
