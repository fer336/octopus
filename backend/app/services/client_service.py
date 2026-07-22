"""
Servicio de Clientes.
Contiene toda la lógica de negocio para clientes.
"""

import builtins
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.client import Client
from app.models.client_type import ClientType
from app.schemas.client import ClientCreate, ClientListParams, ClientUpdate
from app.services.client_type_service import ClientTypeService


class ClientService:
    """Servicio para gestión de clientes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _validate_current_account_rules(payload: dict) -> None:
        """Valida reglas básicas de modo/límite de cuenta corriente."""
        mode = payload.get("current_account_mode")
        credit_limit = payload.get("credit_limit")

        if mode == "limited" and (credit_limit is None):
            raise ValueError(
                "Para modo de cuenta corriente 'limited' debe informar credit_limit"
            )

    async def _ensure_business_allows_current_account(
        self,
        business_id: UUID,
        requested_mode: str | None,
    ) -> None:
        """Evita habilitar Cuenta Corriente en clientes si el CMS la deshabilitó."""
        if not requested_mode or requested_mode == "disabled":
            return

        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        if (business.current_account_mode or "disabled") == "disabled":
            raise ValueError(
                "Cuenta Corriente está deshabilitada para este negocio desde el CMS"
            )

    async def _resolve_client_type_id(
        self,
        business_id: UUID,
        client_type_id: UUID | None,
    ) -> UUID:
        """Resuelve y valida el tipo de cliente para el tenant actual."""
        if client_type_id:
            query = select(ClientType).where(
                ClientType.id == client_type_id,
                ClientType.business_id == business_id,
                ClientType.deleted_at.is_(None),
            )
            result = await self.db.execute(query)
            existing_type = result.scalar_one_or_none()
            if not existing_type:
                raise ValueError("Tipo de cliente no encontrado para este negocio")
            return client_type_id

        default_type = await ClientTypeService(self.db).ensure_default_type(business_id)
        return default_type.id

    async def create(self, business_id: UUID, data: ClientCreate) -> Client:
        """Crea un nuevo cliente."""
        resolved_client_type_id = await self._resolve_client_type_id(
            business_id=business_id,
            client_type_id=data.client_type_id,
        )

        payload = data.model_dump()
        payload["client_type_id"] = resolved_client_type_id
        self._validate_current_account_rules(payload)
        await self._ensure_business_allows_current_account(
            business_id=business_id,
            requested_mode=payload.get("current_account_mode"),
        )

        client = Client(
            business_id=business_id,
            **payload,
        )

        self.db.add(client)
        await self.db.commit()
        await self.db.refresh(client)
        return client

    async def get_by_id(
        self,
        client_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> Client | None:
        """Obtiene un cliente por ID."""
        query = select(Client).where(
            Client.id == client_id,
            Client.business_id == business_id,
        )
        if not include_deleted:
            query = query.where(Client.deleted_at.is_(None))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_document(
        self,
        document_number: str,
        business_id: UUID,
    ) -> Client | None:
        """Obtiene un cliente por número de documento."""
        query = select(Client).where(
            Client.document_number == document_number,
            Client.business_id == business_id,
            Client.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        business_id: UUID,
        params: ClientListParams,
    ) -> tuple[list[Client], int]:
        """Lista clientes con paginación, búsqueda y filtros."""
        base_conditions = [
            Client.business_id == business_id,
            Client.deleted_at.is_(None),
        ]

        if params.search:
            search_filter = or_(
                Client.name.ilike(f"%{params.search}%"),
                Client.document_number.ilike(f"%{params.search}%"),
            )
            base_conditions.append(search_filter)

        if params.tax_condition:
            base_conditions.append(Client.tax_condition == params.tax_condition)

        if params.client_type_id:
            base_conditions.append(Client.client_type_id == params.client_type_id)

        if params.current_account_mode:
            base_conditions.append(
                Client.current_account_mode == params.current_account_mode
            )

        if params.has_balance is True:
            base_conditions.append(Client.current_balance != Decimal("0"))
        elif params.has_balance is False:
            base_conditions.append(Client.current_balance == Decimal("0"))

        # Conteo
        count_query = select(func.count(Client.id)).where(*base_conditions)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Query paginada
        offset = (params.page - 1) * params.per_page
        query = (
            select(Client)
            .where(*base_conditions)
            .order_by(Client.name)
            .offset(offset)
            .limit(params.per_page)
        )

        result = await self.db.execute(query)
        clients = list(result.scalars().all())

        return clients, total

    async def update(
        self,
        client_id: UUID,
        business_id: UUID,
        data: ClientUpdate,
    ) -> Client | None:
        """Actualiza un cliente."""
        client = await self.get_by_id(client_id, business_id)
        if not client:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if "client_type_id" in update_data:
            update_data["client_type_id"] = await self._resolve_client_type_id(
                business_id=business_id,
                client_type_id=update_data["client_type_id"],
            )

        merged_payload = {
            "current_account_mode": client.current_account_mode,
            "credit_limit": client.credit_limit,
            **update_data,
        }
        self._validate_current_account_rules(merged_payload)
        if "current_account_mode" in update_data:
            await self._ensure_business_allows_current_account(
                business_id=business_id,
                requested_mode=update_data.get("current_account_mode"),
            )

        for field, value in update_data.items():
            setattr(client, field, value)

        await self.db.commit()
        await self.db.refresh(client)
        return client

    async def soft_delete(self, client_id: UUID, business_id: UUID) -> bool:
        """Elimina un cliente (soft delete)."""
        client = await self.get_by_id(client_id, business_id)
        if not client:
            return False

        client.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True

    async def bulk_delete(
        self,
        client_ids: builtins.list[UUID],
        business_id: UUID,
    ) -> tuple[int, int]:
        """
        Elimina múltiples clientes (soft delete).
        Replica el borrado individual: no bloquea por saldo ni movimientos.
        """
        unique_ids: builtins.list[UUID] = list(dict.fromkeys(client_ids))
        query = select(Client).where(
            Client.id.in_(unique_ids),
            Client.business_id == business_id,
            Client.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        clients = list(result.scalars().all())

        now = datetime.utcnow()
        for client in clients:
            client.deleted_at = now

        await self.db.commit()
        deleted = len(clients)
        return deleted, len(unique_ids) - deleted

    async def update_balance(
        self,
        client_id: UUID,
        amount: Decimal,
        is_debit: bool = True,
    ) -> Client | None:
        """
        Actualiza el saldo del cliente.
        is_debit=True: aumenta la deuda (factura)
        is_debit=False: disminuye la deuda (pago, nota de crédito)
        """
        query = select(Client).where(Client.id == client_id)
        result = await self.db.execute(query)
        client = result.scalar_one_or_none()

        if not client:
            return None

        if is_debit:
            client.current_balance += amount
        else:
            client.current_balance -= amount

        await self.db.commit()
        await self.db.refresh(client)
        return client
