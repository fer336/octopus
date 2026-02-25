"""
OctopusTrack API - Sistema ERP para Sanitarios, Ferreterías y Corralones.
Punto de entrada de la aplicación FastAPI.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import close_db
from app.routers import auth, categories, clients, products, suppliers, dashboard, pdf_test, vouchers, arca, business, payment_methods, price_update_drafts, cash, purchase_orders

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
# Auth router se monta sin prefijo /api/v1 para coincidir con Google OAuth callback
app.include_router(auth.router)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(clients.router, prefix=settings.API_V1_PREFIX)
app.include_router(suppliers.router, prefix=settings.API_V1_PREFIX)
app.include_router(categories.router, prefix=settings.API_V1_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)
app.include_router(pdf_test.router, prefix=settings.API_V1_PREFIX)
app.include_router(vouchers.router, prefix=settings.API_V1_PREFIX)
app.include_router(arca.router, prefix=settings.API_V1_PREFIX)
app.include_router(business.router, prefix=settings.API_V1_PREFIX)
app.include_router(payment_methods.router, prefix=settings.API_V1_PREFIX)
app.include_router(price_update_drafts.router, prefix=settings.API_V1_PREFIX)
app.include_router(cash.router, prefix=settings.API_V1_PREFIX)
app.include_router(purchase_orders.router, prefix=settings.API_V1_PREFIX)


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
