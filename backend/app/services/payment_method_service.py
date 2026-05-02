"""
Servicio de métodos de pago.
"""

from __future__ import annotations

import re
import unicodedata
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment_method import PaymentMethodCatalog
from app.schemas.payment_method import PaymentMethodCreate, PaymentMethodUpdate


class PaymentMethodService:
    """Gestiona el catálogo de métodos de pago por negocio."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(
        self,
        business_id: UUID,
        *,
        active_only: bool = True,
    ) -> list[PaymentMethodCatalog]:
        query = select(PaymentMethodCatalog).where(
            PaymentMethodCatalog.business_id == business_id
        )

        if active_only:
            query = query.where(PaymentMethodCatalog.is_active.is_(True))

        query = query.order_by(
            PaymentMethodCatalog.is_active.desc(),
            PaymentMethodCatalog.name.asc(),
        )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_id(
        self,
        payment_method_id: UUID,
        business_id: UUID,
    ) -> PaymentMethodCatalog | None:
        result = await self.db.execute(
            select(PaymentMethodCatalog).where(
                PaymentMethodCatalog.id == payment_method_id,
                PaymentMethodCatalog.business_id == business_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        business_id: UUID,
        data: PaymentMethodCreate,
    ) -> PaymentMethodCatalog:
        normalized_name = data.name.strip()
        if not normalized_name:
            raise ValueError("El nombre del método de pago es obligatorio")

        await self._ensure_name_available(
            business_id=business_id,
            name=normalized_name,
            exclude_id=None,
        )

        code = await self._resolve_code(
            business_id=business_id,
            name=normalized_name,
            explicit_code=data.code,
            exclude_id=None,
        )

        payment_method = PaymentMethodCatalog(
            business_id=business_id,
            name=normalized_name,
            code=code,
            requires_reference=data.requires_reference,
            is_active=data.is_active,
        )
        self.db.add(payment_method)
        await self.db.commit()
        await self.db.refresh(payment_method)
        return payment_method

    async def update(
        self,
        payment_method_id: UUID,
        business_id: UUID,
        data: PaymentMethodUpdate,
    ) -> PaymentMethodCatalog | None:
        payment_method = await self.get_by_id(payment_method_id, business_id)
        if not payment_method:
            return None

        normalized_name = data.name.strip()
        if not normalized_name:
            raise ValueError("El nombre del método de pago es obligatorio")

        await self._ensure_name_available(
            business_id=business_id,
            name=normalized_name,
            exclude_id=payment_method_id,
        )

        code = await self._resolve_code(
            business_id=business_id,
            name=normalized_name,
            explicit_code=data.code,
            exclude_id=payment_method_id,
        )

        payment_method.name = normalized_name
        payment_method.code = code
        payment_method.requires_reference = data.requires_reference
        payment_method.is_active = data.is_active

        await self.db.commit()
        await self.db.refresh(payment_method)
        return payment_method

    async def update_status(
        self,
        payment_method_id: UUID,
        business_id: UUID,
        is_active: bool,
    ) -> PaymentMethodCatalog | None:
        payment_method = await self.get_by_id(payment_method_id, business_id)
        if not payment_method:
            return None

        payment_method.is_active = is_active
        await self.db.commit()
        await self.db.refresh(payment_method)
        return payment_method

    async def _ensure_name_available(
        self,
        *,
        business_id: UUID,
        name: str,
        exclude_id: UUID | None,
    ) -> None:
        existing_methods = await self.list(business_id, active_only=False)
        normalized_target = self._normalize_name_for_compare(name)

        for method in existing_methods:
            if exclude_id and method.id == exclude_id:
                continue
            if self._normalize_name_for_compare(method.name) == normalized_target:
                raise ValueError("Ya existe un método de pago con ese nombre")

    async def _resolve_code(
        self,
        *,
        business_id: UUID,
        name: str,
        explicit_code: str | None,
        exclude_id: UUID | None,
    ) -> str:
        if explicit_code and explicit_code.strip():
            normalized_code = self._normalize_code(explicit_code)
            if not normalized_code:
                raise ValueError("El código del método de pago no es válido")
            await self._ensure_code_available(
                business_id=business_id,
                code=normalized_code,
                exclude_id=exclude_id,
            )
            return normalized_code

        return await self._generate_unique_code(
            business_id=business_id,
            name=name,
            exclude_id=exclude_id,
        )

    async def _generate_unique_code(
        self,
        *,
        business_id: UUID,
        name: str,
        exclude_id: UUID | None,
    ) -> str:
        base_code = self._normalize_code(name)
        if not base_code:
            base_code = "PAYMENT"

        candidate = base_code[:20]
        suffix = 2

        while not await self._is_code_available(
            business_id=business_id,
            code=candidate,
            exclude_id=exclude_id,
        ):
            suffix_text = str(suffix)
            candidate = f"{base_code[: 20 - len(suffix_text) - 1]}_{suffix_text}"
            suffix += 1

        return candidate

    async def _ensure_code_available(
        self,
        *,
        business_id: UUID,
        code: str,
        exclude_id: UUID | None,
    ) -> None:
        if not await self._is_code_available(
            business_id=business_id,
            code=code,
            exclude_id=exclude_id,
        ):
            raise ValueError("Ya existe un método de pago con ese código")

    async def _is_code_available(
        self,
        *,
        business_id: UUID,
        code: str,
        exclude_id: UUID | None,
    ) -> bool:
        result = await self.db.execute(
            select(PaymentMethodCatalog).where(
                PaymentMethodCatalog.business_id == business_id,
                PaymentMethodCatalog.code == code,
            )
        )
        existing = result.scalar_one_or_none()
        if not existing:
            return True
        if exclude_id and existing.id == exclude_id:
            return True
        return False

    @staticmethod
    def _normalize_name_for_compare(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value)
        ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
        return re.sub(r"\s+", " ", ascii_value).strip().lower()

    @staticmethod
    def _normalize_code(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value)
        ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
        cleaned = re.sub(r"[^A-Za-z0-9]+", "_", ascii_value).strip("_")
        cleaned = re.sub(r"_+", "_", cleaned)
        return cleaned.upper()[:20]
