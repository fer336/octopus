"""
Servicio común para renderizar reportes en PDF.
"""

from pathlib import Path
from typing import Any, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape


class ReportPdfService:
    """Orquestador común para render de templates de reportes."""

    def __init__(self):
        template_dir = Path(__file__).parents[2] / "templates" / "pdf" / "reports"
        self._template_dir = template_dir
        self._env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(["html", "xml"]),
        )
        self._weasyprint_html: Optional[type] = None

    def _get_weasyprint(self):
        """Lazy load de WeasyPrint para evitar errores de importación."""
        if self._weasyprint_html is None:
            try:
                from weasyprint import HTML

                self._weasyprint_html = HTML
            except ImportError as e:
                raise RuntimeError(
                    "WeasyPrint no está disponible. "
                    "Instala las dependencias: pip install weasyprint"
                ) from e
        return self._weasyprint_html

    def render(self, template_name: str, context: dict[str, Any]) -> bytes:
        template = self._env.get_template(template_name)
        html_content = template.render(**context)
        HTML = self._get_weasyprint()
        return HTML(string=html_content, base_url=str(self._template_dir)).write_pdf()


report_pdf_service = ReportPdfService()
