import re
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class WhatsAppAuthRequestCreate(BaseModel):
    client_id: UUID | None = None
    client_name: str
    client_phone: str
    requester_name: str
    description: str = "retiro de materiales"

    @field_validator("client_phone", mode="before")
    @classmethod
    def strip_non_digits(cls, v: str) -> str:
        return re.sub(r"\D", "", v)


class WhatsAppAuthRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_id: UUID
    client_id: UUID | None
    client_name: str
    client_phone: str
    requester_name: str
    description: str
    token: str
    jwt_token: str | None
    status: str
    whatsapp_instance: str | None
    evolution_message_id: str | None
    responded_at: datetime | None
    expires_at: datetime
    created_at: datetime


class WhatsAppAuthRequestUpdate(BaseModel):
    status: str


class WhatsAppWebhookPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    event: str | None = None
    instance: str | None = None
    data: dict[str, Any] | None = None
