"""Storage privado de snapshots Excel de acopio en MinIO."""

from __future__ import annotations

import io
from datetime import timedelta
from uuid import UUID

from app.config import get_settings
from app.services.logo_storage_service import _get_minio_client_class


class StockpileSnapshotStorageService:
    """Sube Excels de snapshots a un bucket privado y genera URLs presignadas."""

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
            "MINIO_STOCKPILE_SNAPSHOT_BUCKET_NAME": self.settings.MINIO_STOCKPILE_SNAPSHOT_BUCKET_NAME,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(
                f"Faltan variables de entorno para MinIO: {', '.join(missing)}"
            )

    def upload_excel_and_presign(
        self,
        *,
        stockpile_id: UUID,
        excel_bytes: bytes,
        business_id: UUID | None = None,
    ) -> tuple[str, str]:
        bucket = self.settings.MINIO_STOCKPILE_SNAPSHOT_BUCKET_NAME
        object_name = self._build_object_name(stockpile_id, business_id)

        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)

        self.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=io.BytesIO(excel_bytes),
            length=len(excel_bytes),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        expires = timedelta(
            seconds=self.settings.STOCKPILE_SNAPSHOT_PRESIGNED_URL_EXPIRE_SECONDS
        )
        presigned_url = self.client.presigned_get_object(
            bucket_name=bucket,
            object_name=object_name,
            expires=expires,
        )
        return presigned_url, object_name

    @staticmethod
    def _build_object_name(stockpile_id: UUID, business_id: UUID | None) -> str:
        scope = f"business/{business_id}" if business_id else "stockpile"
        return f"{scope}/stockpiles/{stockpile_id}/price-snapshot.xlsx"


def upload_stockpile_snapshot_excel(
    *,
    stockpile_id: UUID,
    excel_bytes: bytes,
    business_id: UUID | None = None,
) -> tuple[str, str]:
    service = StockpileSnapshotStorageService()
    return service.upload_excel_and_presign(
        stockpile_id=stockpile_id,
        business_id=business_id,
        excel_bytes=excel_bytes,
    )
