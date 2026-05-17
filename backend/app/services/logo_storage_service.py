"""Storage de logos de branding en MinIO (S3 compatible)."""

from __future__ import annotations

import io
import mimetypes
from typing import Any
from uuid import uuid4

from app.config import get_settings


class LogoStorageService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._validate_configuration()
        minio_client_cls = _get_minio_client_class()
        self.client = minio_client_cls(
            endpoint=self.settings.MINIO_ENDPOINT,
            access_key=self.settings.MINIO_ACCESS_KEY,
            secret_key=self.settings.MINIO_SECRET_KEY,
            secure=bool(self.settings.MINIO_SECURE),
            region=self.settings.MINIO_REGION or None,
        )

    def _validate_configuration(self) -> None:
        required = {
            "MINIO_ENDPOINT": self.settings.MINIO_ENDPOINT,
            "MINIO_ACCESS_KEY": self.settings.MINIO_ACCESS_KEY,
            "MINIO_SECRET_KEY": self.settings.MINIO_SECRET_KEY,
            "MINIO_BUCKET_NAME": self.settings.MINIO_BUCKET_NAME,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(
                f"Faltan variables de entorno para MinIO: {', '.join(missing)}"
            )

    def upload_logo(self, tenant_id: str, file_bytes: bytes, original_name: str) -> str:
        bucket = self.settings.MINIO_BUCKET_NAME
        extension = (original_name.rsplit(".", 1)[-1].lower() if "." in original_name else "png")
        object_name = f"{tenant_id}/{uuid4().hex}.{extension}"

        content_type = mimetypes.guess_type(original_name)[0] or "image/png"
        data = io.BytesIO(file_bytes)

        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)

        self.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=data,
            length=len(file_bytes),
            content_type=content_type,
        )

        if self.settings.MINIO_PUBLIC_BASE_URL:
            return f"{self.settings.MINIO_PUBLIC_BASE_URL.rstrip('/')}/{object_name}"

        scheme = "https" if self.settings.MINIO_SECURE else "http"
        return f"{scheme}://{self.settings.MINIO_ENDPOINT}/{bucket}/{object_name}"


def upload_logo_to_storage(tenant_id: str, file_bytes: bytes, original_name: str) -> str:
    """Helper simple para subir logo y retornar URL pública."""
    service = LogoStorageService()
    try:
        return service.upload_logo(tenant_id, file_bytes, original_name)
    except Exception as exc:
        raise RuntimeError(f"Error subiendo logo a MinIO: {exc}") from exc


def upload_product_photo(business_id: str, product_id: str, file_bytes: bytes, original_name: str) -> str:
    """Upload a product photo to MinIO and return its public URL."""
    service = LogoStorageService()
    try:
        settings = service.settings
        bucket = settings.MINIO_BUCKET_NAME
        extension = (original_name.rsplit(".", 1)[-1].lower() if "." in original_name else "jpg")
        object_name = f"products/{business_id}/{product_id}.{extension}"

        content_type = mimetypes.guess_type(original_name)[0] or "image/jpeg"
        data = io.BytesIO(file_bytes)

        if not service.client.bucket_exists(bucket):
            service.client.make_bucket(bucket)

        service.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=data,
            length=len(file_bytes),
            content_type=content_type,
        )

        if settings.MINIO_PUBLIC_BASE_URL:
            return f"{settings.MINIO_PUBLIC_BASE_URL.rstrip('/')}/{object_name}"

        scheme = "https" if settings.MINIO_SECURE else "http"
        return f"{scheme}://{settings.MINIO_ENDPOINT}/{bucket}/{object_name}"
    except Exception as exc:
        raise RuntimeError(f"Error subiendo foto de producto a MinIO: {exc}") from exc


def _get_minio_client_class() -> Any:
    """Import lazy de MinIO para no romper arranque si falta dependencia."""
    try:
        from minio import Minio  # type: ignore

        return Minio
    except Exception as exc:  # pragma: no cover - error de entorno
        raise RuntimeError(
            "Dependencia 'minio' no instalada. Ejecutá: pip install -r backend/requirements.txt"
        ) from exc
