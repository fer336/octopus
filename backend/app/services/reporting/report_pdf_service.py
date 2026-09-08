"""
Servicio común para renderizar reportes en PDF.
"""

from pathlib import Path
from typing import Any

from jinja2 import ChoiceLoader, Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from app.services.reporting.base_report_service import ReportDataset


class ReportPdfService:
    """Orquestador común para render de templates de reportes."""

    def __init__(self):
        template_dir = Path(__file__).parents[2] / "templates" / "pdf" / "reports"
        pdf_template_dir = template_dir.parent
        self._template_dir = template_dir
        self._env = Environment(
            loader=ChoiceLoader(
                [
                    FileSystemLoader(str(template_dir)),
                    FileSystemLoader(str(pdf_template_dir)),
                ]
            ),
            autoescape=select_autoescape(["html", "xml"]),
        )

    def render(self, template_name: str, context: dict[str, Any]) -> bytes:
        template = self._env.get_template(template_name)
        html_content = template.render(**context)
        return HTML(string=html_content, base_url=str(self._template_dir)).write_pdf()

    def render_dataset(self, template_name: str, dataset: ReportDataset) -> bytes:
        """Renderiza un dataset compartido con el contexto estándar de reportes."""
        template = self._env.get_template(template_name)
        html_content = template.render(**dataset.to_dict())
        return HTML(string=html_content, base_url=str(self._template_dir)).write_pdf()


report_pdf_service = ReportPdfService()
