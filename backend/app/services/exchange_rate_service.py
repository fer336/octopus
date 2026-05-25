"""
Servicio para obtener cotizaciones del dólar desde dolarapi.com.
Cachea el resultado por 10 minutos para no saturar la API externa.
"""

import time

import httpx
from fastapi import HTTPException, status

_cache: dict = {}
CACHE_TTL = 600  # 10 minutos


def _promedio(data: dict) -> float:
    compra = float(data["compra"])
    venta = float(data["venta"])
    return round((compra + venta) / 2, 2)


async def fetch_dollar_rates() -> dict:
    now = time.time()
    if _cache.get("ts") and now - _cache["ts"] < CACHE_TTL:
        return _cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            blue_res = await client.get("https://dolarapi.com/v1/dolares/blue")
            oficial_res = await client.get("https://dolarapi.com/v1/dolares/oficial")

        blue_res.raise_for_status()
        oficial_res.raise_for_status()

        blue = blue_res.json()
        oficial = oficial_res.json()

        data = {
            "blue": {
                "compra": float(blue["compra"]),
                "venta": float(blue["venta"]),
                "promedio": _promedio(blue),
            },
            "oficial": {
                "compra": float(oficial["compra"]),
                "venta": float(oficial["venta"]),
                "promedio": _promedio(oficial),
            },
        }

        _cache["data"] = data
        _cache["ts"] = now
        return data

    except httpx.RequestError as exc:
        if _cache.get("data"):
            return _cache["data"]
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo obtener la cotización del dólar.",
        ) from exc
    except (httpx.HTTPStatusError, KeyError, ValueError) as exc:
        if _cache.get("data"):
            return _cache["data"]
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Respuesta inválida de dolarapi.com.",
        ) from exc
