"""
OctopusTrack API - Sistema ERP para Sanitarios, Ferreterías y Corralones.
Punto de entrada de la aplicación FastAPI.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import close_db
from app.routers import (
    admin,
    ai,
    ai_config,
    arca,
    audit_logs,
    auth,
    billing,
    brands,
    business,
    cash,
    categories,
    client_authorizations,
    client_types,
    clients,
    dashboard,
    drafts,
    exchange_rate,
    feedback,
    payment_methods,
    pdf_test,
    price_update_drafts,
    product_lots,
    products,
    public,
    purchase_orders,
    reports,
    suppliers,
    stockpiles,
    vouchers,
    whatsapp,
)
from app.services.pdf_service import PdfService

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Maneja el ciclo de vida de la aplicación."""
    # Startup
    yield
    # Shutdown
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    description="Sistema ERP para gestión comercial de sanitarios, ferreterías y corralones",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,  # Evita 307 que consume el code de OAuth antes de procesarlo
)


# Logging de configuración CORS en startup
@app.on_event("startup")
async def log_cors_config():
    """Log CORS configuration on startup for debugging."""
    import logging

    logger = logging.getLogger("uvicorn")
    logger.info(f"CORS Origins configurados: {settings.CORS_ORIGINS}")


# CORS Middleware
# IMPORTANTE: El orden importa. Los middlewares se ejecutan en orden INVERSO.
# Este debe ser el ÚLTIMO add_middleware para ejecutarse PRIMERO.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    # Soporta desarrollo local con localhost/127.0.0.1 en cualquier puerto
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Routers
# Auth router se monta sin prefijo para coincidir con Google OAuth callback
app.include_router(auth.router)
app.include_router(products.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(product_lots.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(product_lots.lot_router, prefix=settings.API_TENANT_PREFIX)
app.include_router(clients.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(client_authorizations.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(client_types.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(suppliers.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(categories.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(brands.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(drafts.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(exchange_rate.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(pdf_test.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(vouchers.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(whatsapp.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(arca.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(business.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(payment_methods.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(price_update_drafts.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(cash.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(purchase_orders.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(ai.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(ai_config.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(feedback.tenant_router, prefix=settings.API_TENANT_PREFIX)
app.include_router(reports.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(stockpiles.internal_router, prefix=settings.API_TENANT_PREFIX)
app.include_router(stockpiles.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(audit_logs.router, prefix=settings.API_TENANT_PREFIX)
app.include_router(admin.router)  # /api/admin/* (prefijo interno)
app.include_router(feedback.admin_router)
app.include_router(billing.router)
app.include_router(public.router, prefix="/api/public")


@app.get("/health", tags=["Health"])
async def health_check():
    """Endpoint de salud para verificar que la API está funcionando."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": "1.0.0",
    }


@app.get("/", tags=["Root"])
async def root():
    """Endpoint raíz con información básica de la API."""
    return {
        "message": f"Bienvenido a {settings.APP_NAME} API",
        "docs": "/docs",
        "health": "/health",
    }
