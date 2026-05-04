"""
Servicio de autorizaciones titular/subcliente para Cuenta Corriente.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.client import Client
from app.models.client_authorization import ClientAuthorization
from app.models.client_type import ClientType
from app.schemas.client_authorization import (
    ClientAuthorizationCreate,
    ClientAuthorizationListParams,
    ClientAuthorizationUpdate,
)


class ClientAuthorizationService:
    """Lógica de negocio para vínculos titular/subcliente."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _ensure_current_account_feature_enabled(self, business_id: UUID) -> None:
        """Bloquea autorizaciones de Cuenta Corriente si el CMS deshabilitó el módulo."""
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        if (business.current_account_mode or "disabled") == "disabled":
            raise ValueError(
                "Cuenta Corriente está deshabilitada para este negocio desde el CMS"
            )

    async def _get_client_or_raise(self, client_id: UUID, business_id: UUID) -> Client:
        query = select(Client).where(
            Client.id == client_id,
            Client.business_id == business_id,
            Client.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        client = result.scalar_one_or_none()
        if not client:
            raise ValueError("Cliente no encontrado para este negocio")
        return client

    async def _validate_pair(
        self,
        business_id: UUID,
        billing_client_id: UUID,
        operating_client_id: UUID,
    ) -> None:
        if billing_client_id == operating_client_id:
            raise ValueError("El cliente titular y el subcliente deben ser diferentes")

        await self._get_client_or_raise(billing_client_id, business_id)
        operating_client = await self._get_client_or_raise(
            operating_client_id, business_id
        )

        eligibility_query = select(ClientType.is_subclient_eligible).where(
            ClientType.id == operating_client.client_type_id,
            ClientType.business_id == business_id,
            ClientType.deleted_at.is_(None),
        )
        eligibility_result = await self.db.execute(eligibility_query)
        is_eligible = eligibility_result.scalar_one_or_none()

        if not is_eligible:
            raise ValueError(
                "El subcliente seleccionado no está habilitado para retiro por terceros"
            )

    async def create(
        self,
        business_id: UUID,
        data: ClientAuthorizationCreate,
    ) -> ClientAuthorization:
        """Crea una autorización titular/subcliente."""
        await self._ensure_current_account_feature_enabled(business_id)
        await self._validate_pair(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            operating_client_id=data.operating_client_id,
        )

        existing_query = select(ClientAuthorization).where(
            ClientAuthorization.business_id == business_id,
            ClientAuthorization.billing_client_id == data.billing_client_id,
            ClientAuthorization.operating_client_id == data.operating_client_id,
            ClientAuthorization.deleted_at.is_(None),
        )
        existing_result = await self.db.execute(existing_query)
        existing = existing_result.scalar_one_or_none()
        if existing:
            raise ValueError("Ya existe una autorización activa para este vínculo")

        item = ClientAuthorization(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            operating_client_id=data.operating_client_id,
            operating_credit_limit=data.operating_credit_limit,
            is_active=data.is_active,
            notes=data.notes,
        )

        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def list(
        self,
        business_id: UUID,
        params: ClientAuthorizationListParams,
    ) -> tuple[list[ClientAuthorization], int]:
        """Lista autorizaciones con filtros y paginación."""
        base_conditions = [
            ClientAuthorization.business_id == business_id,
            ClientAuthorization.deleted_at.is_(None),
        ]

        if params.billing_client_id:
            base_conditions.append(
                ClientAuthorization.billing_client_id == params.billing_client_id
            )

        if params.operating_client_id:
            base_conditions.append(
                ClientAuthorization.operating_client_id == params.operating_client_id
            )

        if params.is_active is not None:
            base_conditions.append(ClientAuthorization.is_active == params.is_active)

        count_query = select(func.count(ClientAuthorization.id)).where(*base_conditions)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        offset = (params.page - 1) * params.per_page
        query = (
            select(ClientAuthorization)
            .where(*base_conditions)
            .order_by(ClientAuthorization.created_at.desc())
            .offset(offset)
            .limit(params.per_page)
        )
        result = await self.db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def get_by_id(
        self,
        authorization_id: UUID,
        business_id: UUID,
    ) -> ClientAuthorization | None:
        """Obtiene autorización por ID."""
        query = select(ClientAuthorization).where(
            ClientAuthorization.id == authorization_id,
            ClientAuthorization.business_id == business_id,
            ClientAuthorization.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update(
        self,
        authorization_id: UUID,
        business_id: UUID,
        data: ClientAuthorizationUpdate,
    ) -> ClientAuthorization | None:
        """Actualiza sublímite/estado/notas de una autorización."""
        item = await self.get_by_id(authorization_id, business_id)
        if not item:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if update_data.get("is_active") is True:
            await self._ensure_current_account_feature_enabled(business_id)

        for field, value in update_data.items():
            setattr(item, field, value)

        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def soft_delete(self, authorization_id: UUID, business_id: UUID) -> bool:
        """Soft delete de la autorización."""
        item = await self.get_by_id(authorization_id, business_id)
        if not item:
            return False

        item.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True
