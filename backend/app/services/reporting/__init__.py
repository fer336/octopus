"""Servicios compartidos de reporting."""

from app.services.reporting.base_report_service import (
    BaseReportService,
    ReportDataset,
    ReportRowProvider,
    TabularReportDataset,
)

__all__ = [
    "BaseReportService",
    "ReportDataset",
    "ReportRowProvider",
    "TabularReportDataset",
]
