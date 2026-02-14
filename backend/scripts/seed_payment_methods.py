"""
Script para seedear métodos de pago por defecto.
Ejecutar una sola vez por negocio.
"""
import asyncio
import sys
from pathlib import Path

# Agregar el directorio raíz al path
sys.path.append(str(Path(__file__).parent.parent))

from app.database import async_session_maker
from app.models.payment_method import PaymentMethodCatalog
from app.models.business import Business
from sqlalchemy import select
from uuid import uuid4


DEFAULT_PAYMENT_METHODS = [
    {"name": "Efectivo", "code": "CASH", "requires_reference": False},
    {"name": "Débito", "code": "DEBIT", "requires_reference": False},
    {"name": "Crédito", "code": "CREDIT", "requires_reference": False},
    {"name": "Transferencia", "code": "TRANSFER", "requires_reference": True},
    {"name": "Mercado Pago", "code": "MP", "requires_reference": True},
    {"name": "Cheque", "code": "CHECK", "requires_reference": True},
]


async def seed_payment_methods():
    """Crear métodos de pago por defecto para todos los negocios."""
    async with async_session_maker() as db:
        # Obtener todos los negocios
        result = await db.execute(select(Business))
        businesses = result.scalars().all()
        
        print(f"Encontrados {len(businesses)} negocios")
        
        for business in businesses:
            print(f"\nProcesando negocio: {business.name}")
            
            # Verificar qué métodos ya existen
            result = await db.execute(
                select(PaymentMethodCatalog).where(PaymentMethodCatalog.business_id == business.id)
            )
            existing_methods = result.scalars().all()
            existing_codes = {m.code for m in existing_methods}
            
            # Crear métodos que no existan
            created = 0
            for method_data in DEFAULT_PAYMENT_METHODS:
                if method_data["code"] not in existing_codes:
                    payment_method = PaymentMethodCatalog(
                        id=uuid4(),
                        business_id=business.id,
                        name=method_data["name"],
                        code=method_data["code"],
                        is_active=True,
                        requires_reference=method_data["requires_reference"],
                    )
                    db.add(payment_method)
                    created += 1
                    print(f"  ✓ Creado: {method_data['name']} ({method_data['code']})")
                else:
                    print(f"  - Ya existe: {method_data['name']}")
            
            if created > 0:
                await db.commit()
                print(f"  ✅ {created} métodos creados para {business.name}")
            else:
                print(f"  ℹ️  Todos los métodos ya existían")
        
        print("\n✅ Seed completado!")


if __name__ == "__main__":
    asyncio.run(seed_payment_methods())
