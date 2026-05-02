"""
Router de configuración de proveedores IA — OctopusTrack
=========================================================
Endpoints:
  GET    /ai/config            → lista todos los proveedores del negocio
  PUT    /ai/config/{provider} → crea/actualiza un proveedor
  POST   /ai/config/{provider}/validate → valida la API key contra el proveedor
  PATCH  /ai/config/{provider}/activate → activa este proveedor (desactiva los demás)
  DELETE /ai/config/{provider} → elimina (soft delete) la configuración
  GET    /ai/config/models     → catálogo de modelos por proveedor
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ai_provider_config import AIProvider, AIProviderConfig
from app.schemas.ai_provider_schemas import (
    PROVIDER_MODELS,
    AIConfigSummaryResponse,
    AIProviderConfigResponse,
    AIProviderUpsertRequest,
    AIProviderValidateResponse,
)
from app.services.llm_factory import LLMFactory
from app.utils.crypto import decrypt_api_key, encrypt_api_key, get_last4
from app.utils.security import get_current_business, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/config", tags=["IA — Configuración"])


def _to_response(cfg: AIProviderConfig) -> AIProviderConfigResponse:
    """Convierte un AIProviderConfig a su schema de respuesta (sin exponer la key)."""
    return AIProviderConfigResponse(
        id=str(cfg.id),
        provider=cfg.provider,
        display_name=cfg.display_name,
        api_key_last4=cfg.api_key_last4,
        api_key_configured=bool(cfg.api_key_encrypted),
        default_model=cfg.default_model,
        base_url=cfg.base_url,
        is_active=cfg.is_active,
        is_valid=cfg.is_valid,
        validated_at=cfg.validated_at,
        validation_error=cfg.validation_error,
    )


# ─────────────────────────────────────────────────────────────
# GET /ai/config — resumen completo de todos los proveedores
# ─────────────────────────────────────────────────────────────
@router.get("", response_model=AIConfigSummaryResponse)
async def get_ai_config(
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    _=Depends(get_current_user),
):
    """Retorna el estado de todos los proveedores IA configurados para el negocio."""
    business_id = str(current_business)

    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_id,
            AIProviderConfig.deleted_at == None,
        )
    )
    configs = result.scalars().all()

    active = next((c for c in configs if c.is_active), None)

    return AIConfigSummaryResponse(
        providers=[_to_response(c) for c in configs],
        active_provider=active.provider if active else None,
        active_model=active.default_model if active else None,
    )


# ─────────────────────────────────────────────────────────────
# PUT /ai/config/{provider} — crea o actualiza un proveedor
# ─────────────────────────────────────────────────────────────
@router.put("/{provider}", response_model=AIProviderConfigResponse)
async def upsert_ai_provider(
    provider: AIProvider,
    body: AIProviderUpsertRequest,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Crea o actualiza la configuración de un proveedor IA.
    Si se envía api_key, se cifra antes de guardar. Si se omite, se mantiene la existente.
    """
    business_id = str(current_business)

    # Buscar config existente — incluye registros con soft delete para poder restaurarlos
    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_id,
            AIProviderConfig.provider == provider.value,
        )
    )
    config = result.scalar_one_or_none()

    if config is None:
        # Primera vez — crear
        config = AIProviderConfig(
            business_id=business_id,
            provider=provider.value,
            is_active=False,
            is_valid=False,
        )
        db.add(config)
        logger.info(
            f"[AI Config] Creando config para '{provider}' en negocio {business_id}"
        )
    else:
        # Ya existe (con o sin soft delete) — restaurar si estaba borrado
        if config.deleted_at is not None:
            config.deleted_at = None
            logger.info(
                f"[AI Config] Restaurando config de '{provider}' en negocio {business_id}"
            )
        else:
            logger.info(
                f"[AI Config] Actualizando config de '{provider}' en negocio {business_id}"
            )

    # Actualizar campos opcionales
    if body.api_key is not None:
        config.api_key_encrypted = encrypt_api_key(body.api_key)
        config.api_key_last4 = get_last4(body.api_key)
        # Resetear validación al cambiar la key
        config.is_valid = False
        config.validated_at = None
        config.validation_error = None

    if body.default_model is not None:
        config.default_model = body.default_model

    if body.base_url is not None:
        config.base_url = body.base_url

    if body.display_name is not None:
        config.display_name = body.display_name

    try:
        await db.commit()
        await db.refresh(config)
    except IntegrityError:
        # Fallback defensivo: si por alguna race condition hay conflicto,
        # hacer rollback y re-buscar el registro para actualizarlo
        await db.rollback()
        result = await db.execute(
            select(AIProviderConfig).where(
                AIProviderConfig.business_id == business_id,
                AIProviderConfig.provider == provider.value,
            )
        )
        config = result.scalar_one()

        if body.api_key is not None:
            config.api_key_encrypted = encrypt_api_key(body.api_key)
            config.api_key_last4 = get_last4(body.api_key)
            config.is_valid = False
            config.validated_at = None
            config.validation_error = None
        if body.default_model is not None:
            config.default_model = body.default_model
        if body.base_url is not None:
            config.base_url = body.base_url
        if body.display_name is not None:
            config.display_name = body.display_name
        if config.deleted_at is not None:
            config.deleted_at = None

        await db.commit()
        await db.refresh(config)

    return _to_response(config)


# ─────────────────────────────────────────────────────────────
# POST /ai/config/{provider}/validate — valida la API key
# ─────────────────────────────────────────────────────────────
@router.post("/{provider}/validate", response_model=AIProviderValidateResponse)
async def validate_ai_provider(
    provider: AIProvider,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    _=Depends(get_current_user),
):
    """
    Valida la API key del proveedor haciendo una llamada mínima.
    Actualiza is_valid, validated_at y validation_error en la DB.
    """
    business_id = str(current_business)

    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_id,
            AIProviderConfig.provider == provider.value,
            AIProviderConfig.deleted_at == None,
        )
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proveedor '{provider.value}' no configurado. Guardá la API key primero.",
        )

    if not config.api_key_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay API key guardada para este proveedor.",
        )

    try:
        api_key = decrypt_api_key(config.api_key_encrypted)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )

    is_valid, message = await LLMFactory.validate_key(
        provider=provider.value,
        api_key=api_key,
        base_url=config.base_url,
        model=config.default_model,
    )

    await LLMFactory.update_validation_result(
        config, is_valid, message if not is_valid else None, db
    )

    suggested_models = [m["id"] for m in PROVIDER_MODELS.get(provider.value, [])]

    return AIProviderValidateResponse(
        provider=provider.value,
        is_valid=is_valid,
        message=message,
        validated_at=datetime.utcnow(),
        suggested_models=suggested_models,
    )


# ─────────────────────────────────────────────────────────────
# PATCH /ai/config/{provider}/activate — activa el proveedor
# ─────────────────────────────────────────────────────────────
@router.patch("/{provider}/activate", response_model=AIProviderConfigResponse)
async def activate_ai_provider(
    provider: AIProvider,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Activa el proveedor indicado y desactiva todos los demás del negocio.
    El proveedor debe tener una API key guardada.
    """
    business_id = str(current_business)

    # Cargar todos los configs del negocio
    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_id,
            AIProviderConfig.deleted_at == None,
        )
    )
    all_configs = result.scalars().all()

    # Encontrar el que queremos activar
    target = next((c for c in all_configs if c.provider == provider.value), None)

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proveedor '{provider.value}' no configurado. Guardá la API key primero.",
        )

    if not target.api_key_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No podés activar un proveedor sin API key configurada.",
        )

    # Desactivar todos y activar solo el target
    for cfg in all_configs:
        cfg.is_active = cfg.provider == provider.value

    await db.commit()
    await db.refresh(target)

    logger.info(
        f"[AI Config] Proveedor '{provider}' activado para negocio {business_id} "
        f"por usuario {current_user.id}"
    )

    return _to_response(target)


# ─────────────────────────────────────────────────────────────
# DELETE /ai/config/{provider} — elimina (soft delete) un proveedor
# ─────────────────────────────────────────────────────────────
@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_provider(
    provider: AIProvider,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    _=Depends(get_current_user),
):
    """Elimina la configuración de un proveedor (soft delete)."""
    business_id = str(current_business)

    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_id,
            AIProviderConfig.provider == provider.value,
            AIProviderConfig.deleted_at == None,
        )
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proveedor '{provider.value}' no encontrado.",
        )

    config.soft_delete()
    config.is_active = False
    await db.commit()


# ─────────────────────────────────────────────────────────────
# POST /ai/config/{provider}/fetch-models
# Consulta los modelos reales disponibles para una API key dada.
# No guarda nada en DB — solo consulta el proveedor en vivo.
# ─────────────────────────────────────────────────────────────
@router.post("/{provider}/fetch-models")
async def fetch_provider_models(
    provider: AIProvider,
    body: AIProviderUpsertRequest,
    _=Depends(get_current_user),
):
    """
    Dado un proveedor y una API key, consulta la API real y devuelve
    la lista de modelos disponibles para esa cuenta.
    No requiere que la key esté guardada en DB.
    """
    if not body.api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere api_key para consultar los modelos.",
        )

    try:
        models = await LLMFactory.fetch_models(
            provider=provider.value,
            api_key=body.api_key,
            base_url=body.base_url,
        )
        return {"provider": provider.value, "models": models}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ─────────────────────────────────────────────────────────────
# POST /ai/config/{provider}/fetch-models-saved
# Consulta modelos reales usando la API key YA GUARDADA en DB.
# Permite refrescar la lista de modelos sin tener que re-ingresar la key.
# ─────────────────────────────────────────────────────────────
@router.post("/{provider}/fetch-models-saved")
async def fetch_provider_models_saved(
    provider: AIProvider,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    _=Depends(get_current_user),
):
    """
    Consulta la API real del proveedor usando la key guardada en DB para ese negocio.
    Útil para refrescar la lista de modelos disponibles cuando el proveedor
    ya está configurado (sin tener que re-ingresar la API key).
    """
    business_id = str(current_business)

    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_id,
            AIProviderConfig.provider == provider.value,
            AIProviderConfig.deleted_at == None,
        )
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No hay configuración guardada para el proveedor '{provider.value}'.",
        )

    if not config.api_key_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El proveedor no tiene API key guardada.",
        )

    try:
        api_key = decrypt_api_key(config.api_key_encrypted)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo recuperar la API key guardada.",
        )

    try:
        models = await LLMFactory.fetch_models(
            provider=provider.value,
            api_key=api_key,
            base_url=config.base_url,
        )
        return {"provider": provider.value, "models": models}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ─────────────────────────────────────────────────────────────
# GET /ai/config/models — catálogo estático de modelos
# ─────────────────────────────────────────────────────────────
@router.get("/models/catalog")
async def get_models_catalog(_=Depends(get_current_user)):
    """Retorna el catálogo de modelos disponibles por proveedor."""
    return {provider: models for provider, models in PROVIDER_MODELS.items()}
