"""Shared contracts and helpers for report datasets."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Generic, Literal, Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel

from app.models.business import Business


FilterT = TypeVar("FilterT", bound=BaseModel | dict[str, Any])
ReportOrientation = Literal["portrait", "landscape"]


@dataclass(slots=True)
class ReportDataset:
    """Datos tabulares únicos que consumen PDF, Excel y CSV."""

    title: str
    headers: list[str]
    rows: list[dict[str, Any]]
    totals: dict[str, Any]
    filters: dict[str, Any]
    business: dict[str, Any]
    generated_at: str
    generated_by: str
    orientation: ReportOrientation = "portrait"
    subtitle: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Devuelve una representación serializable del dataset."""
        return {
            "title": self.title,
            "subtitle": self.subtitle,
            "headers": self.headers,
            "rows": self.rows,
            "totals": self.totals,
            "filters": self.filters,
            "business": self.business,
            "generated_at": self.generated_at,
            "generated_by": self.generated_by,
            "orientation": self.orientation,
            "metadata": self.metadata,
        }


@runtime_checkable
class ReportRowProvider(Protocol):
    """Contrato para servicios que construyen datasets de reportes."""

    async def build_dataset(
        self,
        business_id: Any,
        filters: BaseModel,
        generated_by: str | None = None,
    ) -> ReportDataset:
        """Construye el dataset desde filtros y contexto de negocio."""
        ...


class TabularReportDataset(ReportDataset):
    """Alias explícito para reportes tabulares."""


class BaseReportService(ABC, Generic[FilterT]):
    """Base helper para servicios que producen un dataset por reporte."""

    @abstractmethod
    async def build_dataset(
        self,
        business_id: Any,
        filters: FilterT,
        generated_by: str | None = None,
    ) -> ReportDataset:
        """Ejecuta la consulta del reporte y arma filas, totales y metadatos."""
        raise NotImplementedError

    def create_dataset(
        self,
        *,
        title: str,
        business: Business,
        filters: FilterT,
        headers: list[str],
        rows: list[dict[str, Any]],
        totals: dict[str, Any] | None = None,
        generated_by: str | None = None,
        orientation: ReportOrientation = "portrait",
        subtitle: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> TabularReportDataset:
        """Crea un dataset normalizado para render y exportación."""
        return TabularReportDataset(
            title=title,
            subtitle=subtitle,
            headers=headers,
            rows=rows,
            totals=totals or {},
            filters=self.filters_to_dict(filters),
            business=self.business_to_dict(business),
            generated_at=datetime.now().strftime("%d/%m/%Y %H:%M"),
            generated_by=generated_by or "Sistema",
            orientation=orientation,
            metadata=metadata or {},
        )

    @staticmethod
    def build_client_groups(
        rows: list[dict[str, Any]],
        client_field: str,
        total_fields: list[str],
    ) -> list[dict[str, Any]]:
        """Agrupa índices de filas por cliente para el árbol del PDF.

        Los clientes se ordenan por nombre ascendente y los índices dentro de
        cada grupo preservan el orden de aparición de las filas (el orden
        intra-grupo ya definido por cada reporte).
        """
        buckets: dict[str, list[int]] = {}
        for index, row in enumerate(rows):
            buckets.setdefault(str(row.get(client_field, "")), []).append(index)
        return [
            {
                "client": name,
                "row_indices": indices,
                "totals": {
                    field_name: round(
                        sum(float(rows[index].get(field_name, 0) or 0) for index in indices),
                        2,
                    )
                    for field_name in total_fields
                },
            }
            for name, indices in sorted(buckets.items())
        ]

    @staticmethod
    def business_to_dict(business: Business) -> dict[str, Any]:
        """Devuelve campos de membrete usados por los renderizadores."""
        return {
            "name": business.name,
            "cuit": business.cuit,
            "tax_condition": business.tax_condition,
            "address": business.address,
            "city": business.city,
            "province": business.province,
            "postal_code": business.postal_code,
            "phone": business.phone,
            "email": business.email,
            "logo_url": business.logo_url,
            "header_text": business.header_text,
            "hide_business_name_in_pdf": business.hide_business_name_in_pdf,
        }

    @staticmethod
    def filters_to_dict(filters: FilterT) -> dict[str, Any]:
        """Devuelve filtros como diccionario plano apto para impresión."""
        raw = filters.model_dump() if isinstance(filters, BaseModel) else dict(filters)
        return {key: value for key, value in raw.items() if value not in (None, "")}
