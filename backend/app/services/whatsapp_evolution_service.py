"""
Servicio proxy para Evolution API.
Mantiene la API key en backend y expone sólo las operaciones necesarias al frontend.
"""

from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import get_settings


class WhatsAppEvolutionService:
    """Cliente mínimo para reenviar requests seguros a Evolution API."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.EVOLUTION_API_BASE_URL.rstrip("/")
        self.api_key = self.settings.AUTHENTICATION_API_KEY

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="WhatsApp no está configurado en el servidor.",
            )

        return {"apikey": self.api_key}

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        """Ejecuta una request contra Evolution sin exponer credenciales al cliente."""
        url = f"{self.base_url}{path}"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    headers=self._headers(),
                )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="No se pudo conectar con Evolution API.",
            ) from exc

        if response.status_code >= 400:
            detail: Any
            try:
                detail = response.json()
            except ValueError:
                detail = response.text or "Error de Evolution API."

            raise HTTPException(status_code=response.status_code, detail=detail)

        if response.status_code == status.HTTP_204_NO_CONTENT:
            return None

        try:
            return response.json()
        except ValueError:
            return {"data": response.text}
