"""Shared actor context for user and external-agent operations."""

from dataclasses import dataclass, field
from uuid import UUID


@dataclass(frozen=True)
class ActorContext:
    """First-class actor identity without synthetic users."""

    actor_type: str
    user_id: UUID | None = None
    agent_id: UUID | None = None
    business_id: UUID | None = None
    scopes: list[str] = field(default_factory=list)
    surface: str | None = None
    correlation_id: str | None = None
