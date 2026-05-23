import pytest

from app.services import ai_memory_service


@pytest.mark.asyncio
async def test_get_business_memory_context_disabled_returns_empty(monkeypatch):
    monkeypatch.setenv("ENGRAM_ENABLED", "false")

    result = await ai_memory_service.get_business_memory_context(
        "ventas del mes",
        business_id="business-1",
    )

    assert result == ""


@pytest.mark.asyncio
async def test_get_business_memory_context_formats_search_response(monkeypatch):
    captured: dict = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "observations": [
                    {
                        "title": "Cliente compra los viernes",
                        "content": "Suele pedir reposición de grifería antes del fin de semana.",
                    },
                    {
                        "title": "Proveedor sensible al stock",
                        "content": "Validar disponibilidad real antes de sugerir compras grandes.",
                    },
                ]
            }

    class FakeClient:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, path, params):
            captured["path"] = path
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setenv("ENGRAM_ENABLED", "true")
    monkeypatch.setenv("ENGRAM_PROJECT", "octopus-test")
    monkeypatch.setattr(ai_memory_service.httpx, "AsyncClient", FakeClient)

    result = await ai_memory_service.get_business_memory_context(
        "qué debería revisar",
        business_id="business-1",
        limit=3,
    )

    assert "Cliente compra los viernes" in result
    assert "Proveedor sensible al stock" in result
    assert len(result) <= ai_memory_service.MAX_MEMORY_CONTEXT_CHARS
    assert captured["path"] == "/search"
    assert captured["params"]["project"] == "octopus-test"
    assert captured["params"]["scope"] == "project"
    assert captured["params"]["limit"] == 3
    assert "business-1" in captured["params"]["q"]
