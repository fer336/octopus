"""
Servicio de Tipos de Cliente.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.client_type import ClientType
from app.schemas.client_type import (
    ClientTypeCreate,
    ClientTypeListParams,
    ClientTypeUpdate,
)


class ClientTypeService:
    """Servicio para gestión de tipos de cliente por tenant."""

    DEFAULT_TYPE_NAME = "Sin clasificar"

    def __init__(self, db: AsyncSession):
        self.db = db

    async def ensure_default_type(self, business_id: UUID) -> ClientType:
        """Obtiene o crea el tipo por defecto para mantener compatibilidad."""
        existing = await self.get_by_name(self.DEFAULT_TYPE_NAME, business_id)
        if existing:
            return existing

        default_type = ClientType(
            business_id=business_id,
            name=self.DEFAULT_TYPE_NAME,
            is_subclient_eligible=False,
        )
        self.db.add(default_type)
        await self.db.commit()
        await self.db.refresh(default_type)
        return default_type

    async def get_by_id(
        self,
        client_type_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> Optional[ClientType]:
        """Obtiene un tipo de cliente por ID."""
        query = select(ClientType).where(
            ClientType.id == client_type_id,
            ClientType.business_id == business_id,
        )
        if not include_deleted:
            query = query.where(ClientType.deleted_at.is_(None))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str, business_id: UUID) -> Optional[ClientType]:
        """Busca por nombre (case-insensitive) dentro del tenant."""
        query = select(ClientType).where(
            ClientType.business_id == business_id,
            ClientType.deleted_at.is_(None),
            func.lower(ClientType.name) == name.strip().lower(),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        business_id: UUID,
        params: ClientTypeListParams,
    ) -> tuple[list[ClientType], int]:
        """Lista tipos de cliente con paginación."""
        base_conditions = [
            ClientType.business_id == business_id,
            ClientType.deleted_at.is_(None),
        ]

        if params.search:
            base_conditions.append(ClientType.name.ilike(f"%{params.search}%"))

        count_query = select(func.count(ClientType.id)).where(*base_conditions)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        offset = (params.page - 1) * params.per_page
        query = (
            select(ClientType)
            .where(*base_conditions)
            .order_by(ClientType.name.asc())
            .offset(offset)
            .limit(params.per_page)
        )
        result = await self.db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def create(self, business_id: UUID, data: ClientTypeCreate) -> ClientType:
        """Crea un tipo de cliente validando nombre único por tenant."""
        existing = await self.get_by_name(data.name, business_id)
        if existing:
            raise ValueError(f"Ya existe un tipo de cliente con nombre '{data.name}'")

        item = ClientType(
            business_id=business_id,
            name=data.name.strip(),
            is_subclient_eligible=data.is_subclient_eligible,
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def update(
        self,
        client_type_id: UUID,
        business_id: UUID,
        data: ClientTypeUpdate,
    ) -> Optional[ClientType]:
        """Actualiza tipo de cliente existente."""
        item = await self.get_by_id(client_type_id, business_id)
        if not item:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if "name" in update_data and update_data["name"]:
            normalized_name = update_data["name"].strip()
            existing = await self.get_by_name(normalized_name, business_id)
            if existing and existing.id != item.id:
                raise ValueError(
                    f"Ya existe un tipo de cliente con nombre '{normalized_name}'"
                )
            update_data["name"] = normalized_name

        for field, value in update_data.items():
            setattr(item, field, value)

        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def soft_delete(self, client_type_id: UUID, business_id: UUID) -> bool:
        """Elimina tipo de cliente si no tiene clientes activos asociados."""
        item = await self.get_by_id(client_type_id, business_id)
        if not item:
            return False

        if item.name.strip().lower() == self.DEFAULT_TYPE_NAME.lower():
            raise ValueError("No se puede eliminar el tipo de cliente por defecto")

        usage_query = select(func.count(Client.id)).where(
            Client.business_id == business_id,
            Client.client_type_id == client_type_id,
            Client.deleted_at.is_(None),
        )
        usage_result = await self.db.execute(usage_query)
        usage_count = usage_result.scalar() or 0
        if usage_count > 0:
            raise ValueError(
                "No se puede eliminar el tipo porque tiene clientes activos asociados"
            )

        item.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True
