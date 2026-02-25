"""
Genera el archivo database/schema.sql con la DDL completa del sistema.

Uso:
    cd backend
    source venv/bin/activate
    python scripts/generate_schema.py

El archivo resultante se escribe en: ../database/schema.sql
"""
import importlib
import pkgutil
import sys
from pathlib import Path

# Agregar el backend al path para importar los modelos
sys.path.insert(0, str(Path(__file__).parent.parent))

import app.models as pkg
from app.models.base import Base
from sqlalchemy.schema import CreateTable, CreateIndex
from sqlalchemy.dialects import postgresql


def generate_schema() -> str:
    """Importa todos los modelos y genera el DDL completo en PostgreSQL."""
    # Importar todos los módulos de modelos para registrarlos en Base.metadata
    for importer, modname, ispkg in pkgutil.iter_modules(pkg.__path__):
        importlib.import_module(f"app.models.{modname}")

    dialect = postgresql.dialect()
    lines = []

    lines.append("-- ============================================================")
    lines.append("-- OctopusTrack — Script de creación de base de datos")
    lines.append("-- Generado automáticamente desde los modelos SQLAlchemy")
    lines.append("-- PostgreSQL 13+")
    lines.append("-- ============================================================")
    lines.append("")
    lines.append("-- Extensión necesaria para UUID")
    lines.append('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
    lines.append("")

    tables = list(Base.metadata.sorted_tables)

    for table in tables:
        lines.append(f"-- Tabla: {table.name}")
        ddl = str(CreateTable(table).compile(dialect=dialect)).strip()
        lines.append(ddl + ";")
        lines.append("")

        # Índices no inline
        for idx in table.indexes:
            try:
                idx_ddl = str(CreateIndex(idx).compile(dialect=dialect)).strip()
                lines.append(idx_ddl + ";")
            except Exception:
                pass
        lines.append("")

    return "\n".join(lines)


def main():
    output_path = Path(__file__).parent.parent.parent / "database" / "schema.sql"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sql = generate_schema()
    output_path.write_text(sql, encoding="utf-8")

    # Contar tablas generadas
    table_count = sum(1 for line in sql.splitlines() if line.startswith("-- Tabla:"))
    print(f"✅ Schema generado: {output_path}")
    print(f"   Tablas incluidas: {table_count}")
    print(f"   Líneas totales:   {len(sql.splitlines())}")


if __name__ == "__main__":
    main()
