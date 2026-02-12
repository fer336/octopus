"""
Servicio de Clientes.
Contiene toda la lógica de negocio para clientes.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.schemas.client import ClientCreate, ClientListParams, ClientUpdate


class ClientService:
    """Servicio para gestión de clientes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, business_id: UUID, data: ClientCreate) -> Client:
        """Crea un nuevo cliente."""
        client = Client(
            business_id=business_id,
            **data.model_dump(),
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
    ) -> Optional[Client]:
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
    ) -> Optional[Client]:
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
    ) -> Optional[Client]:
        """Actualiza un cliente."""
        client = await self.get_by_id(client_id, business_id)
        if not client:
            return None

        update_data = data.model_dump(exclude_unset=True)
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

    async def update_balance(
        self,
        client_id: UUID,
        amount: Decimal,
        is_debit: bool = True,
    ) -> Optional[Client]:
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
