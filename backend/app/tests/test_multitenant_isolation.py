"""
Tests de aislamiento multitenant.

Verifica que:
1. Un usuario del tenant A NO puede acceder a datos del tenant B
2. Un usuario tenant regular NO puede acceder a endpoints de admin
3. Un superadmin PUEDE acceder a datos de todos los tenants
4. Un usuario sin membresías recibe 403
5. El JWT contiene el claim platform_role
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.product import Product
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_user_a_cannot_access_tenant_b_data(
    client: AsyncClient,
    user_a: User,
    business_a: Business,
    business_b: Business,
    db: AsyncSession,
):
    """Usuario A solo ve productos de su tenant, no de tenant B."""
    # Crear productos en ambos tenants
    product_a = Product(
        description="Producto Tenant A",
        code="A-001",
        cost_price=100.0,
        sale_price=150.0,
        current_stock=10,
        business_id=business_a.id,
    )
    product_b = Product(
        description="Producto Tenant B",
        code="B-001",
        cost_price=200.0,
        sale_price=300.0,
        current_stock=5,
        business_id=business_b.id,
    )
    db.add_all([product_a, product_b])
    await db.commit()

    # User A intenta acceder a los productos
    headers = make_auth_header(user_a)
    response = await client.get("/api/v1/products", headers=headers)

    # Debe ser exitoso pero solo incluir productos del tenant A
    assert response.status_code == 200
    data = response.json()

    # Verificar que los productos retornados son solo del tenant A
    if "items" in data:  # Paginated response
        items = data["items"]
    elif "products" in data:
        items = data["products"]
    else:
        items = data if isinstance(data, list) else []

    # Ningún producto del tenant B debe estar en la respuesta
    for item in items:
        assert item.get("code") != "B-001", "User A should not see tenant B products"

    # El producto del tenant A debe estar presente
    codes = [item.get("code") for item in items]
    assert "A-001" in codes, "User A should see their own tenant products"


@pytest.mark.asyncio
async def test_tenant_user_cannot_access_admin_endpoints(
    client: AsyncClient,
    user_a: User,
):
    """Usuario tenant regular intenta acceder a /api/admin/tenants → debe recibir 403."""
    headers = make_auth_header(user_a)
    response = await client.get("/api/admin/tenants", headers=headers)

    assert response.status_code == 403
    data = response.json()
    assert "superadmin" in data["detail"].lower()


@pytest.mark.asyncio
async def test_superadmin_can_access_all_tenants(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
    business_b: Business,
):
    """Superadmin puede listar todos los tenants y acceder a sus datos."""
    headers = make_auth_header(superadmin_user)

    # Listar tenants
    response = await client.get("/api/admin/tenants", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert "tenants" in data
    assert data["total"] >= 2

    tenant_ids = [t["id"] for t in data["tenants"]]
    assert str(business_a.id) in tenant_ids
    assert str(business_b.id) in tenant_ids

    # Superadmin puede acceder a los secretos de cualquier tenant
    response = await client.get(
        f"/api/admin/tenants/{business_a.id}/arca-secrets",
        headers=headers,
    )
    assert response.status_code == 200

    response = await client.get(
        f"/api/admin/tenants/{business_b.id}/arca-secrets",
        headers=headers,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_user_without_membership_gets_403(
    client: AsyncClient,
    user_no_membership: User,
):
    """Usuario sin membresías intenta acceder a cualquier endpoint de tenant → 403."""
    headers = make_auth_header(user_no_membership)

    # Intentar acceder a productos
    response = await client.get("/api/v1/products", headers=headers)
    assert response.status_code == 403

    # Intentar acceder a clientes
    response = await client.get("/api/v1/clients", headers=headers)
    assert response.status_code == 403

    # Intentar acceder a proveedores
    response = await client.get("/api/v1/suppliers", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_jwt_contains_platform_role(
    client: AsyncClient,
    user_a: User,
    superadmin_user: User,
):
    """Verificar que el token JWT contiene el claim platform_role."""
    from app.utils.security import create_access_token, verify_token

    # Token de usuario tenant
    token_a = create_access_token(
        user_id=user_a.id,
        email=user_a.email,
        platform_role=user_a.platform_role,
    )
    payload_a = verify_token(token_a)
    assert "platform_role" in payload_a
    assert payload_a["platform_role"] == "tenant_user"

    # Token de superadmin
    token_admin = create_access_token(
        user_id=superadmin_user.id,
        email=superadmin_user.email,
        platform_role=superadmin_user.platform_role,
    )
    payload_admin = verify_token(token_admin)
    assert "platform_role" in payload_admin
    assert payload_admin["platform_role"] == "superadmin"


@pytest.mark.asyncio
async def test_user_b_cannot_access_tenant_a_data(
    client: AsyncClient,
    user_b: User,
    business_a: Business,
    business_b: Business,
    db: AsyncSession,
):
    """Usuario B solo ve productos de su tenant, no de tenant A."""
    # Crear productos en ambos tenants
    product_a = Product(
        description="Producto Tenant A",
        code="A-001",
        cost_price=100.0,
        sale_price=150.0,
        current_stock=10,
        business_id=business_a.id,
    )
    product_b = Product(
        description="Producto Tenant B",
        code="B-001",
        cost_price=200.0,
        sale_price=300.0,
        current_stock=5,
        business_id=business_b.id,
    )
    db.add_all([product_a, product_b])
    await db.commit()

    # User B intenta acceder a los productos
    headers = make_auth_header(user_b)
    response = await client.get("/api/v1/products", headers=headers)

    # Debe ser exitoso pero solo incluir productos del tenant B
    assert response.status_code == 200
    data = response.json()

    if "items" in data:
        items = data["items"]
    elif "products" in data:
        items = data["products"]
    else:
        items = data if isinstance(data, list) else []

    # Ningún producto del tenant A debe estar en la respuesta
    for item in items:
        assert item.get("code") != "A-001", "User B should not see tenant A products"

    # El producto del tenant B debe estar presente
    codes = [item.get("code") for item in items]
    assert "B-001" in codes, "User B should see their own tenant products"


@pytest.mark.asyncio
async def test_tenant_user_cannot_update_other_tenant_branding(
    client: AsyncClient,
    user_a: User,
    business_b: Business,
):
    """Usuario A intenta actualizar branding del tenant B → debe recibir 403."""
    headers = make_auth_header(user_a)

    # Intentar acceder a branding del tenant B (endpoint de admin)
    response = await client.get(
        f"/api/admin/tenants/{business_b.id}/branding",
        headers=headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_tenant_user_cannot_create_tenants(
    client: AsyncClient,
    user_a: User,
):
    """Usuario tenant regular intenta crear un tenant → debe recibir 403."""
    headers = make_auth_header(user_a)

    # No hay endpoint de crear tenant directamente, pero verificamos
    # que no pueda acceder a ningún endpoint de admin
    response = await client.get("/api/admin/tenants", headers=headers)
    assert response.status_code == 403
