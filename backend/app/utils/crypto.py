"""
Servicio de cifrado simétrico para datos sensibles (API keys).
Usa Fernet (AES-128-CBC + HMAC-SHA256) de la librería cryptography.

La APP_ENCRYPTION_KEY debe ser una clave Fernet válida de 32 bytes en base64.
Generarla una sola vez con:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
y guardarla en .env como APP_ENCRYPTION_KEY=<valor>.
"""

import base64
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet:
    """
    Construye el objeto Fernet usando APP_ENCRYPTION_KEY del entorno.
    Si la key no es una clave Fernet válida, intenta usarla como raw bytes
    (útil para keys generadas con secrets.token_bytes(32)).
    """
    settings = get_settings()
    raw_key = settings.APP_ENCRYPTION_KEY

    if not raw_key:
        raise ValueError(
            "APP_ENCRYPTION_KEY no está configurada. "
            'Generá una con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )

    # Intentar usar directamente (ya es Fernet key en base64url)
    try:
        return Fernet(raw_key.encode() if isinstance(raw_key, str) else raw_key)
    except Exception:
        pass

    # Fallback: tratar como bytes crudos y encodear a base64url
    try:
        key_bytes = raw_key.encode("utf-8")
        padded = key_bytes[:32].ljust(32, b"\x00")
        b64_key = base64.urlsafe_b64encode(padded)
        return Fernet(b64_key)
    except Exception as e:
        raise ValueError(f"APP_ENCRYPTION_KEY inválida: {e}") from e


def encrypt_api_key(plain_key: str) -> str:
    """
    Cifra una API key en texto plano y retorna el token cifrado como string.
    El resultado es seguro para almacenar en la base de datos.
    """
    if not plain_key:
        raise ValueError("No se puede cifrar una key vacía.")

    fernet = _get_fernet()
    encrypted_bytes = fernet.encrypt(plain_key.encode("utf-8"))
    return encrypted_bytes.decode("utf-8")


def decrypt_api_key(encrypted_key: str) -> str:
    """
    Descifra un token Fernet y retorna la API key original en texto plano.
    Lanza ValueError si el token es inválido o fue alterado.
    """
    if not encrypted_key:
        raise ValueError("No hay key cifrada para descifrar.")

    fernet = _get_fernet()
    try:
        decrypted_bytes = fernet.decrypt(encrypted_key.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except InvalidToken as e:
        raise ValueError(
            "No se pudo descifrar la API key. "
            "Verificá que APP_ENCRYPTION_KEY sea la misma con la que se cifró originalmente."
        ) from e


def get_last4(plain_key: str) -> str:
    """
    Retorna los últimos 4 caracteres de la API key para mostrar en la UI
    sin exponer la key completa. Ejemplo: '...sk4F'
    """
    if not plain_key or len(plain_key) < 4:
        return "????"
    return plain_key[-4:]
