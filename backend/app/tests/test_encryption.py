"""
Tests unitarios para el módulo de cifrado crypto.py.

Verifica:
1. Roundtrip encrypt → decrypt
2. Ciphertext diferente para mismo plaintext (IV aleatorio de Fernet)
3. get_last4 retorna sufijo correcto
4. get_last4 en vacío retorna "????" (no None)
5. Decrypt de datos inválidos lanza ValueError
6. Encrypt de string vacío lanza ValueError
7. Encrypt de caracteres especiales funciona
8. Key incorrecta no puede decrypt
"""

import pytest
from cryptography.fernet import Fernet

from app.utils.crypto import decrypt_api_key, encrypt_api_key, get_last4


@pytest.fixture(autouse=True)
def set_encryption_key(monkeypatch):
    """Configura una clave de cifrado de test para todos los tests."""
    test_key = Fernet.generate_key().decode()
    monkeypatch.setenv("APP_ENCRYPTION_KEY", test_key)


def test_encrypt_decrypt_roundtrip():
    """encrypt → decrypt retorna el valor original."""
    original = "sk-test-abc123def456"
    encrypted = encrypt_api_key(original)
    decrypted = decrypt_api_key(encrypted)
    assert decrypted == original


def test_encrypt_produces_different_ciphertext():
    """Cifrando el mismo valor dos veces produce ciphertext diferente (IV aleatorio)."""
    value = "same-secret-key"
    encrypted1 = encrypt_api_key(value)
    encrypted2 = encrypt_api_key(value)
    assert encrypted1 != encrypted2


def test_get_last4_returns_correct_suffix():
    """get_last4 retorna los últimos 4 caracteres del valor desencriptado."""
    original = "sk-test-abc123"
    encrypted = encrypt_api_key(original)
    decrypted = decrypt_api_key(encrypted)
    last4 = get_last4(decrypted)
    assert last4 == "c123"


def test_get_last4_on_empty_returns_question_marks():
    """get_last4 retorna '????' para input vacío o menor a 4 caracteres."""
    assert get_last4("") == "????"
    assert get_last4(None) == "????"
    assert get_last4("ab") == "????"
    assert get_last4("abc") == "????"


def test_decrypt_invalid_ciphertext_raises_error():
    """Decryptar datos basura lanza ValueError."""
    with pytest.raises(ValueError, match="No se pudo descifrar"):
        decrypt_api_key("not-valid-fernet-data!!!")


def test_decrypt_empty_string_raises_error():
    """Decryptar string vacío lanza ValueError."""
    with pytest.raises(ValueError, match="No hay key cifrada"):
        decrypt_api_key("")


def test_encrypt_empty_string_raises_error():
    """Cifrar string vacío lanza ValueError."""
    with pytest.raises(ValueError, match="No se puede cifrar"):
        encrypt_api_key("")


def test_encrypt_special_characters():
    """Cifrar valores con caracteres especiales funciona."""
    special_values = [
        "key\"with'quotes",
        "line1\nline2\ttab",
        "café ñ üñicode",
        "!@#$%^&*()_+-=[]{}|;':\",.<>?/`~",
    ]
    for value in special_values:
        encrypted = encrypt_api_key(value)
        decrypted = decrypt_api_key(encrypted)
        assert decrypted == value


def test_encrypted_value_cannot_be_decrypted_with_wrong_key(monkeypatch):
    """Verificar que cambiar la clave hace fallar el decrypt."""
    original = "super-secret-api-key"
    encrypted = encrypt_api_key(original)

    wrong_key = Fernet.generate_key().decode()
    monkeypatch.setenv("APP_ENCRYPTION_KEY", wrong_key)

    with pytest.raises(ValueError, match="No se pudo descifrar"):
        decrypt_api_key(encrypted)
