"""
Router tenant para WhatsApp/Evolution.
El frontend usa estos endpoints para que la API key nunca salga del backend.
"""

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.services.whatsapp_evolution_service import WhatsAppEvolutionService
from app.utils.security import get_current_business


router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


def get_evolution_service() -> WhatsAppEvolutionService:
    """Dependency para construir el cliente Evolution con settings actuales."""
    return WhatsAppEvolutionService()


@router.get("/instance/fetchInstances")
async def fetch_instances(
    instance_name: str | None = Query(default=None, alias="instanceName"),
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    params = {"instanceName": instance_name} if instance_name else None
    return await service.request("GET", "/instance/fetchInstances", params=params)


@router.get("/instance/connectionState/{instance_name}")
async def connection_state(
    instance_name: str,
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("GET", f"/instance/connectionState/{instance_name}")


@router.post("/instance/create")
async def create_instance(
    body: dict[str, Any],
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("POST", "/instance/create", json=body)


@router.get("/instance/connect/{instance_name}")
async def connect_instance(
    instance_name: str,
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("GET", f"/instance/connect/{instance_name}")


@router.delete("/instance/logout/{instance_name}")
async def logout_instance(
    instance_name: str,
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("DELETE", f"/instance/logout/{instance_name}")


@router.delete("/instance/delete/{instance_name}")
async def delete_instance(
    instance_name: str,
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("DELETE", f"/instance/delete/{instance_name}")


@router.post("/chat/findMessages/{instance_name}")
async def find_messages(
    instance_name: str,
    body: dict[str, Any],
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("POST", f"/chat/findMessages/{instance_name}", json=body)


@router.post("/message/sendText/{instance_name}")
async def send_text(
    instance_name: str,
    body: dict[str, Any],
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("POST", f"/message/sendText/{instance_name}", json=body)


@router.post("/message/sendMedia/{instance_name}")
async def send_media(
    instance_name: str,
    body: dict[str, Any],
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("POST", f"/message/sendMedia/{instance_name}", json=body)


@router.post("/chat/findContacts/{instance_name}")
async def find_contacts(
    instance_name: str,
    body: dict[str, Any],
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("POST", f"/chat/findContacts/{instance_name}", json=body)


@router.post("/chat/whatsappNumbers/{instance_name}")
async def whatsapp_numbers(
    instance_name: str,
    body: dict[str, Any],
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("POST", f"/chat/whatsappNumbers/{instance_name}", json=body)


@router.post("/message/sendList/{instance_name}")
async def send_list(
    instance_name: str,
    body: dict[str, Any],
    current_business=Depends(get_current_business),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    return await service.request("POST", f"/message/sendList/{instance_name}", json=body)
