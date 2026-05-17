"""
Tests para schemas de comprobantes.
Cubre CompilePreviewRequest y fiscal_client_id.
"""
from uuid import UUID, uuid4
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.voucher import CompilePreviewRequest


class TestCompilePreviewRequestFiscalClientId:
    """RED → CompilePreviewRequest acepta fiscal_client_id como UUID opcional."""

    def test_accepts_fiscal_client_id_as_uuid(self):
        """CompilePreviewRequest debe aceptar fiscal_client_id=UUID."""
        uid = uuid4()
        data = CompilePreviewRequest(
            quotation_ids=[uuid4()],
            fiscal_client_id=uid,
        )
        assert data.fiscal_client_id == uid

    def test_accepts_fiscal_client_id_as_none(self):
        """CompilePreviewRequest debe aceptar fiscal_client_id=None (default)."""
        data = CompilePreviewRequest(
            quotation_ids=[uuid4()],
        )
        assert data.fiscal_client_id is None

    def test_rejects_invalid_fiscal_client_id(self):
        """CompilePreviewRequest debe rechazar fiscal_client_id con string inválido."""
        with pytest.raises(ValidationError):
            CompilePreviewRequest(
                quotation_ids=[uuid4()],
                fiscal_client_id="not-a-uuid",  # type: ignore
            )

    def test_serialization_roundtrip(self):
        """model_dump() debe incluir fiscal_client_id en el dict serializado."""
        uid = uuid4()
        data = CompilePreviewRequest(
            quotation_ids=[uuid4()],
            fiscal_client_id=uid,
        )
        dumped = data.model_dump()
        assert dumped["fiscal_client_id"] == uid

    def test_serialization_none_roundtrip(self):
        """model_dump() debe incluir fiscal_client_id=None cuando no se provee."""
        data = CompilePreviewRequest(
            quotation_ids=[uuid4()],
        )
        dumped = data.model_dump()
        assert dumped["fiscal_client_id"] is None

    def test_existing_fields_still_work(self):
        """Asegura que agregar fiscal_client_id no rompe campos existentes."""
        qid = uuid4()
        data = CompilePreviewRequest(
            quotation_ids=[qid],
            general_discount=Decimal("10"),
            price_strategy="current",
        )
        assert data.quotation_ids == [qid]
        assert data.general_discount == Decimal("10")
        assert data.price_strategy == "current"
        assert data.fiscal_client_id is None

    def test_multiple_quotation_ids(self):
        """Mínimo 1 quotation_id sigue funcionando."""
        ids = [uuid4(), uuid4()]
        data = CompilePreviewRequest(quotation_ids=ids)
        assert len(data.quotation_ids) == 2

    def test_empty_quotation_ids_rejected(self):
        """Lista vacía de quotation_ids debe rechazarse (min_length=1)."""
        with pytest.raises(ValidationError):
            CompilePreviewRequest(quotation_ids=[])
