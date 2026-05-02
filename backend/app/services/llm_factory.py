"""
LLMFactory — Fábrica de clientes IA multi-proveedor.
======================================================
Resuelve el proveedor activo del negocio desde la base de datos,
descifra la API key y construye el cliente correcto para cada proveedor.

Uso típico en servicios:
    provider, api_key, model = await LLMFactory.resolve(business_id, db)
    client = LLMFactory.build_openai_compatible(api_key, base_url)
    # … usar client …
"""

import logging
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_provider_config import AIProvider, AIProviderConfig
from app.utils.crypto import decrypt_api_key

logger = logging.getLogger(__name__)

# Modelos por defecto si el negocio no configuró uno
# Actualizados a marzo 2026 — fuente: docs oficiales de cada proveedor
DEFAULT_MODELS: dict[str, str] = {
    AIProvider.OPENAI: "gpt-5.4",
    AIProvider.GEMINI: "gemini-2.5-flash",
    AIProvider.ANTHROPIC: "claude-sonnet-4-6",
    AIProvider.OPENROUTER: "openai/gpt-4o",
}

# Modelos rápidos/baratos para clasificación de intents (temperatura 0, ~200 tokens)
# Son independientes del modelo principal que eligió el usuario.
# Priorizamos velocidad y costo mínimo — no necesitamos razonamiento complejo.
FAST_CLASSIFIER_MODELS: dict[str, str] = {
    AIProvider.OPENAI: "gpt-4o-mini",
    AIProvider.GEMINI: "gemini-2.0-flash-lite",
    AIProvider.ANTHROPIC: "claude-haiku-4-5",
    AIProvider.OPENROUTER: "openai/gpt-4o-mini",
}

# Base URLs por proveedor
BASE_URLS: dict[str, str] = {
    AIProvider.OPENAI: "https://api.openai.com/v1",
    AIProvider.GEMINI: "https://generativelanguage.googleapis.com/v1beta/openai",
    AIProvider.ANTHROPIC: "https://api.anthropic.com/v1",
    AIProvider.OPENROUTER: "https://openrouter.ai/api/v1",
}

# Whisper solo está disponible en OpenAI (y vía OpenRouter con audio habilitado)
SUPPORTS_AUDIO: set[str] = {AIProvider.OPENAI, AIProvider.OPENROUTER}

# Modelos de transcripción por proveedor
WHISPER_MODELS: dict[str, str] = {
    AIProvider.OPENAI: "whisper-1",
    AIProvider.OPENROUTER: "openai/whisper-large-v3",
}


class LLMFactory:
    """
    Fábrica estática que resuelve y construye clientes IA.
    Todos los métodos son async cuando necesitan tocar la DB.
    """

    @staticmethod
    async def get_active_config(
        business_id: str,
        db: AsyncSession,
    ) -> AIProviderConfig | None:
        """
        Retorna el AIProviderConfig activo del negocio, o None si no hay ninguno.
        """
        result = await db.execute(
            select(AIProviderConfig).where(
                AIProviderConfig.business_id == business_id,
                AIProviderConfig.is_active == True,
                AIProviderConfig.deleted_at == None,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def resolve(
        business_id: str,
        db: AsyncSession,
    ) -> tuple[str, str, str]:
        """
        Resuelve el proveedor activo y retorna (provider, api_key_plain, model).
        Lanza ValueError si no hay proveedor configurado o la key no se puede descifrar.
        """
        config = await LLMFactory.get_active_config(business_id, db)

        if not config:
            raise ValueError(
                "No hay un proveedor de IA configurado para este negocio. "
                "Configurá uno en Ajustes → Inteligencia Artificial."
            )

        if not config.api_key_encrypted:
            raise ValueError(
                f"El proveedor '{config.provider}' no tiene API key configurada. "
                "Ingresala en Ajustes → Inteligencia Artificial."
            )

        try:
            api_key = decrypt_api_key(config.api_key_encrypted)
        except ValueError as e:
            raise ValueError(
                f"Error al recuperar la API key del proveedor '{config.provider}': {e}"
            ) from e

        model = config.default_model or DEFAULT_MODELS.get(config.provider, "gpt-4o")
        return config.provider, api_key, model

    @staticmethod
    def build_openai_compatible(
        api_key: str,
        provider: str,
        base_url: str | None = None,
    ) -> Any:
        """
        Construye un cliente openai.OpenAI apuntando al endpoint correcto.
        Funciona para OpenAI, Gemini (vía endpoint OpenAI-compat), OpenRouter y Anthropic.
        """
        from openai import OpenAI

        resolved_base_url = base_url or BASE_URLS.get(
            provider, BASE_URLS[AIProvider.OPENAI]
        )

        extra_headers = {}
        if provider == AIProvider.OPENROUTER:
            extra_headers = {
                "HTTP-Referer": "https://octopustrack.app",
                "X-Title": "OctopusTrack ERP",
            }

        return OpenAI(
            api_key=api_key,
            base_url=resolved_base_url,
            default_headers=extra_headers if extra_headers else None,
        )

    @staticmethod
    def build_classifier_client(
        api_key: str,
        provider: str,
        base_url: str | None = None,
    ) -> tuple[Any, str]:
        """
        Construye un cliente OpenAI-compatible usando el modelo rápido/barato
        del proveedor, ideal para clasificación de intents (temperatura 0, pocos tokens).
        Retorna (client, fast_model_name).
        """
        fast_model = FAST_CLASSIFIER_MODELS.get(
            provider, DEFAULT_MODELS.get(provider, "gpt-4o-mini")
        )
        client = LLMFactory.build_openai_compatible(api_key, provider, base_url)
        return client, fast_model

    @staticmethod
    def supports_audio(provider: str) -> bool:
        """Indica si el proveedor soporta transcripción de audio (Whisper o equivalente)."""
        return provider in SUPPORTS_AUDIO

    @staticmethod
    def get_whisper_model(provider: str) -> str:
        """Retorna el nombre del modelo de transcripción para el proveedor dado."""
        return WHISPER_MODELS.get(provider, "whisper-1")

    @staticmethod
    async def validate_key(
        provider: str,
        api_key: str,
        base_url: str | None = None,
        model: str | None = None,
    ) -> tuple[bool, str]:
        """
        Valida una API key haciendo una llamada mínima al proveedor.
        Retorna (is_valid, message).
        """
        try:
            client = LLMFactory.build_openai_compatible(api_key, provider, base_url)
            test_model = model or DEFAULT_MODELS.get(provider, "gpt-4o")

            # Llamada mínima: 1 token de entrada, 1 de salida
            response = client.chat.completions.create(
                model=test_model,
                messages=[{"role": "user", "content": "1+1="}],
                max_tokens=3,
            )

            if response.choices:
                return True, f"Conexión exitosa con {provider}. Modelo: {test_model}"
            return False, "El proveedor respondió pero sin resultados."

        except Exception as e:
            error_msg = str(e)
            # Simplificar mensajes comunes
            if (
                "401" in error_msg
                or "Unauthorized" in error_msg
                or "invalid_api_key" in error_msg
            ):
                return False, "API key inválida o sin permisos."
            if "404" in error_msg or "model_not_found" in error_msg:
                return False, f"Modelo '{model}' no encontrado. Probá con otro modelo."
            if "429" in error_msg or "rate_limit" in error_msg:
                return (
                    True,
                    "API key válida (límite de tasa alcanzado, intentá de nuevo).",
                )
            if "connection" in error_msg.lower() or "timeout" in error_msg.lower():
                return (
                    False,
                    "No se pudo conectar con el proveedor. Verificá la URL base.",
                )
            return False, f"Error: {error_msg[:200]}"

    @staticmethod
    async def fetch_models(
        provider: str,
        api_key: str,
        base_url: str | None = None,
    ) -> list[dict]:
        """
        Consulta la API real del proveedor y retorna la lista de modelos disponibles.
        Retorna lista de {id, label} ordenada alfabéticamente.
        Lanza ValueError con mensaje amigable si la key es inválida.
        """
        # Gemini tiene endpoint propio de modelos (no compatible con /models de OpenAI)
        if provider == AIProvider.GEMINI:
            return await LLMFactory._fetch_gemini_models(api_key)

        # Anthropic no expone endpoint /models público — usamos catálogo curado
        if provider == AIProvider.ANTHROPIC:
            return await LLMFactory._fetch_anthropic_models(api_key)

        # OpenAI y OpenRouter: endpoint estándar GET /models
        resolved_base_url = base_url or BASE_URLS.get(
            provider, BASE_URLS[AIProvider.OPENAI]
        )

        headers = {"Authorization": f"Bearer {api_key}"}
        if provider == AIProvider.OPENROUTER:
            headers["HTTP-Referer"] = "https://octopustrack.app"
            headers["X-Title"] = "OctopusTrack ERP"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{resolved_base_url}/models", headers=headers)

            if resp.status_code == 401:
                raise ValueError("API key inválida o sin permisos.")
            if resp.status_code == 403:
                raise ValueError("Sin acceso. Verificá los permisos de tu API key.")
            if not resp.is_success:
                raise ValueError(f"Error del proveedor ({resp.status_code}).")

            data = resp.json()
            raw_models = data.get("data", [])

            # Filtrar modelos de chat/texto.
            # OpenAI: blacklist de categorías no-chat en lugar de whitelist de prefijos.
            # Así cualquier modelo nuevo (gpt-5.4, gpt-5-mini, etc.) aparece
            # automáticamente sin tener que actualizar el código.
            NON_CHAT_KEYWORDS = (
                "embedding",
                "whisper",
                "tts",
                "dall-e",
                "moderation",
                "realtime",
                "instruct",
                "search",
                "similarity",
                "edit",
                "babbage",
                "davinci",
                "ada",
                "curie",
                "transcribe",
                "translate",
                "image",
                "vision-preview",
            )
            if provider == AIProvider.OPENAI:
                models = [
                    m
                    for m in raw_models
                    if isinstance(m.get("id"), str)
                    and not any(excl in m["id"].lower() for excl in NON_CHAT_KEYWORDS)
                ]
            elif provider == AIProvider.OPENROUTER:
                models = [m for m in raw_models if isinstance(m.get("id"), str)]
            else:
                models = [m for m in raw_models if isinstance(m.get("id"), str)]

            result = [
                {"id": m["id"], "label": m.get("name") or m["id"]} for m in models
            ]
            return sorted(result, key=lambda x: x["id"])

        except ValueError:
            raise
        except Exception as e:
            error = str(e).lower()
            if "timeout" in error or "connect" in error:
                raise ValueError(
                    "No se pudo conectar con el proveedor. Verificá tu conexión."
                )
            raise ValueError(f"Error al obtener modelos: {str(e)[:150]}")

    @staticmethod
    async def _fetch_gemini_models(api_key: str) -> list[dict]:
        """Consulta los modelos de Gemini vía su API propia."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url)

            if resp.status_code == 400 or resp.status_code == 401:
                raise ValueError("API key de Gemini inválida.")
            if not resp.is_success:
                raise ValueError(f"Error de Gemini ({resp.status_code}).")

            data = resp.json()
            raw_models = data.get("models", [])

            # Solo modelos que soporten generateContent (chat)
            models = [
                m
                for m in raw_models
                if "generateContent" in m.get("supportedGenerationMethods", [])
                and "gemini" in m.get("name", "")
            ]

            result = []
            for m in models:
                model_id = m["name"].replace(
                    "models/", ""
                )  # "models/gemini-1.5-pro" → "gemini-1.5-pro"
                label = m.get("displayName") or model_id
                result.append({"id": model_id, "label": label})

            return sorted(
                result, key=lambda x: x["id"], reverse=True
            )  # Más nuevos primero

        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Error al obtener modelos de Gemini: {str(e)[:150]}")

    @staticmethod
    async def _fetch_anthropic_models(api_key: str) -> list[dict]:
        """
        Anthropic tiene endpoint /models desde la API v1.
        Si falla, devuelve catálogo curado.
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )

            if resp.status_code == 401:
                raise ValueError("API key de Anthropic inválida.")
            if resp.status_code == 403:
                raise ValueError(
                    "Sin acceso. Verificá los permisos de tu API key de Anthropic."
                )

            if resp.is_success:
                data = resp.json()
                raw_models = data.get("data", [])
                result = [
                    {"id": m["id"], "label": m.get("display_name") or m["id"]}
                    for m in raw_models
                    if isinstance(m.get("id"), str)
                ]
                return sorted(result, key=lambda x: x["id"], reverse=True)

        except ValueError:
            raise
        except Exception:
            pass

        # Fallback: catálogo curado si el endpoint falla
        # Actualizado a marzo 2026 — fuente: docs.anthropic.com/en/docs/about-claude/models
        return [
            {"id": "claude-opus-4-6", "label": "Claude Opus 4.6 (más inteligente)"},
            {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6 (recomendado)"},
            {"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5 (más rápido)"},
            {"id": "claude-opus-4-5", "label": "Claude Opus 4.5"},
            {"id": "claude-sonnet-4-5", "label": "Claude Sonnet 4.5"},
        ]

    @staticmethod
    async def update_validation_result(
        config: AIProviderConfig,
        is_valid: bool,
        error_msg: str | None,
        db: AsyncSession,
    ) -> None:
        """Persiste el resultado de la validación en la config del proveedor."""
        config.is_valid = is_valid
        config.validated_at = datetime.utcnow()
        config.validation_error = None if is_valid else error_msg
        await db.commit()
