"""
Servicio común para renderizar reportes en PDF.
"""

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML


class ReportPdfService:
    """Orquestador común para render de templates de reportes."""

    def __init__(self):
        template_dir = Path(__file__).parents[2] / "templates" / "pdf" / "reports"
        self._template_dir = template_dir
        self._env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(["html", "xml"]),
        )

    def render(self, template_name: str, context: dict[str, Any]) -> bytes:
        template = self._env.get_template(template_name)
        html_content = template.render(**context)
        return HTML(string=html_content, base_url=str(self._template_dir)).write_pdf()


report_pdf_service = ReportPdfService()
