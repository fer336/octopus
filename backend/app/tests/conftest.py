"""
Fixtures compartidas para tests del backend.
"""

import asyncio
from typing import AsyncGenerator
from uuid import UUID

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.models.business import Business
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.utils.security import create_access_token

# Test database URL (SQLite in-memory para tests rápidos)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Engine de test
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_maker = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="session")
def event_loop():
    """Crear un event loop para la sesión de tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Crear tablas antes de cada test y limpiar después."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def get_test_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency override para usar la DB de test."""
    async with test_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


# Override de la dependency de DB
app.dependency_overrides[get_db] = get_test_db


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    """Retorna una sesión de test para manipulación directa de datos."""
    async with test_session_maker() as session:
        yield session
        await session.close()


@pytest_asyncio.fixture
async def business_a(db: AsyncSession) -> Business:
    """Crear primer negocio/tenant."""
    b = Business(
        name="Tenant A",
        cuit="30-11111111-1",
        tax_condition="Responsable Inscripto",
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return b


@pytest_asyncio.fixture
async def business_b(db: AsyncSession) -> Business:
    """Crear segundo negocio/tenant."""
    b = Business(
        name="Tenant B",
        cuit="30-22222222-2",
        tax_condition="Monotributista",
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return b


@pytest_asyncio.fixture
async def user_a(db: AsyncSession, business_a: Business) -> User:
    """Usuario perteneciente al tenant A."""
    u = User(
        email="user_a@test.com",
        name="User A",
        google_id="google_a_123",
        platform_role="tenant_user",
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)

    m = TenantMembership(user_id=u.id, business_id=business_a.id, role="owner")
    db.add(m)
    await db.commit()
    return u


@pytest_asyncio.fixture
async def user_b(db: AsyncSession, business_b: Business) -> User:
    """Usuario perteneciente al tenant B."""
    u = User(
        email="user_b@test.com",
        name="User B",
        google_id="google_b_456",
        platform_role="tenant_user",
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)

    m = TenantMembership(user_id=u.id, business_id=business_b.id, role="owner")
    db.add(m)
    await db.commit()
    return u


@pytest_asyncio.fixture
async def superadmin_user(db: AsyncSession) -> User:
    """Usuario superadmin."""
    u = User(
        email="admin@test.com",
        name="Super Admin",
        google_id="google_admin_789",
        platform_role="superadmin",
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture
async def user_no_membership(db: AsyncSession) -> User:
    """Usuario sin membresías en ningún negocio."""
    u = User(
        email="orphan@test.com",
        name="Orphan User",
        google_id="google_orphan_000",
        platform_role="tenant_user",
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


def make_auth_header(user: User) -> dict[str, str]:
    """Genera headers de autenticación con JWT para un usuario."""
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        platform_role=user.platform_role,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Cliente HTTP async para tests de endpoints."""
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
