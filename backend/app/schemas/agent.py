"""Schemas for external-agent credentials and errors."""

from datetime import datetime
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import BaseResponse, BaseSchema


class AgentCredentialCreate(BaseSchema):
    """Request for creating an external-agent credential."""

    name: str = Field(..., min_length=2, max_length=120)
    surface: str = Field(..., pattern="^(tenant|platform)$")
    business_id: UUID | None = None
    scopes: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None
    description: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def validate_surface_binding(self):
        if self.surface == "tenant" and self.business_id is None:
            raise ValueError("business_id es obligatorio para credenciales tenant")
        if self.surface == "platform" and self.business_id is not None:
            raise ValueError("business_id no se acepta para credenciales platform")
        return self


class AgentCredentialResponse(BaseResponse):
    """Credential metadata response. Never includes the raw secret."""

    name: str
    surface: str
    business_id: UUID | None
    scopes: list[str]
    status: str
    expires_at: datetime | None
    revoked_at: datetime | None
    last_used_at: datetime | None
    secret_last4: str
    description: str | None = None


class AgentCredentialCreateResponse(BaseSchema):
    """Create/rotate response where the raw secret is shown once."""

    credential: AgentCredentialResponse
    secret: str


class AgentCredentialListResponse(BaseSchema):
    """Paginated credential metadata."""

    items: list[AgentCredentialResponse]
    total: int
    page: int
    per_page: int


class AgentError(BaseSchema):
    """Standard agent error payload."""

    code: str
    message: str
    correlation_id: str
    details: dict | None = None


class AgentErrorResponse(BaseSchema):
    """Wrapper for standard agent errors."""

    error: AgentError
