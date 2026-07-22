# API para Agentes Externos — Unidad 1

Este documento describe únicamente los contratos implementados en la Unidad 1 de `external-agent-api-access`.

Este archivo es la referencia operativa autoritativa para la API externa implementada. Cualquier nota histórica o documento de arquitectura previo debe considerarse planificación no operativa si contradice este contrato.

## Autenticación

Los agentes usan tokens opacos en el encabezado HTTP:

```http
Authorization: Bearer otag_v1_<key_id>_<secret>
X-Correlation-ID: <id-opcional-del-cliente>
```

El secreto crudo se muestra solo al crear o rotar la credencial. La base de datos guarda `key_id`, hash HMAC-SHA256 y los últimos 4 caracteres; nunca guarda el token crudo. El servidor requiere `AGENT_TOKEN_PEPPER` configurado al iniciar; si falta, la aplicación falla de forma segura antes de aceptar tráfico.

## Superficies

- `/api/agent/tenant/*`: credenciales tenant asociadas a un único comercio.
- `/api/agent/admin/*`: credenciales platform para administración global. En Unidad 1 solo existe `GET /health` para validar separación de superficie.

Una credencial tenant no puede llamar rutas admin. Una credencial platform no puede llamar rutas tenant.

## Scopes implementados

- `products:read`: permite listar y consultar productos del comercio asociado a la credencial.

`GET /api/agent/tenant/health` y `GET /api/agent/admin/health` no requieren scopes adicionales: son contratos intencionalmente libres de scope para comprobar autenticación, separación de superficie y estado del servicio. El resto de endpoints implementados exige scope explícito.

`business_id` siempre se deriva de la credencial tenant. Si el request envía `business_id`, se ignora para evitar selección de tenant por entrada externa.

## Ciclo de vida de credenciales

Estas rutas usan autenticación existente de usuario superadmin, no autenticación de agente.

### Crear credencial

`POST /api/admin/agent-credentials`

```json
{
  "name": "Agente de catálogo",
  "surface": "tenant",
  "business_id": "uuid-del-comercio",
  "scopes": ["products:read"],
  "expires_at": "2027-07-15T00:00:00"
}
```

Respuesta `201`: incluye `credential` y `secret`. El campo `secret` no vuelve a mostrarse. Si `expires_at` no se envía, se aplica `AGENT_TOKEN_TTL_DAYS` como vencimiento por defecto.

### Listar credenciales

`GET /api/admin/agent-credentials?page=1&per_page=50`

Devuelve metadatos sin secreto crudo.

### Rotar credencial

`POST /api/admin/agent-credentials/{credential_id}/rotate`

Invalida inmediatamente el token anterior y devuelve un nuevo `secret` una sola vez. Solo se pueden rotar credenciales activas; una credencial revocada no puede reactivarse mediante rotación.

### Revocar credencial

`POST /api/admin/agent-credentials/{credential_id}/revoke`

Bloquea inmediatamente el uso futuro de la credencial.

## Endpoints tenant implementados

### Salud

`GET /api/agent/tenant/health`

Devuelve estado, superficie, `business_id` derivado y actor agente.

### Productos

`GET /api/agent/tenant/products`

Parámetros: `search`, `category_id`, `supplier_id`, `is_active`, `page`, `per_page`.

Requiere `products:read`.

`GET /api/agent/tenant/products/{product_id}`

Requiere `products:read`. Si el producto pertenece a otro comercio, responde `404` sin revelar su existencia.

## Errores

Las rutas de agente devuelven errores con este formato:

```json
{
  "error": {
    "code": "agent_missing_scope",
    "message": "La credencial no tiene el scope requerido.",
    "correlation_id": "..."
  }
}
```

Códigos usados en Unidad 1: `agent_credentials_missing`, `agent_token_invalid`, `agent_token_expired`, `agent_token_revoked`, `agent_wrong_surface`, `agent_missing_scope`, `agent_resource_not_found`.

## Auditoría y correlación

Las respuestas de agente incluyen `X-Correlation-ID`. Si el cliente lo envía, se normaliza a caracteres seguros y se limita a 80 caracteres. Las llamadas permitidas y denegadas registran actor, agente, negocio cuando aplica, superficie, scopes evaluados, operación y resultado en auditoría.

La auditoría es de mejor esfuerzo: una falla al registrar auditoría no debe convertir una lectura exitosa en error ni reemplazar respuestas esperadas `401`/`403`. Los logs de error no deben incluir tokens crudos ni hashes.

## Limitaciones de Unidad 1

No están implementados todavía clientes, proveedores, categorías, dashboard, caja, reportes, comprobantes, escrituras con idempotencia ni administración de comercios vía agente platform.

Limitaciones y seguimientos explícitos:

- Rate limiting por credencial/IP no está implementado en Unidad 1.
- No existe todavía un flujo automatizado de downgrade destructivo o reemisión masiva de credenciales ante rollback; la mitigación operativa actual es revocar credenciales antes de retirar rutas.
- No hay endpoints de escritura para agentes en Unidad 1; idempotencia y confirmaciones quedan diferidas.
- No se documenta ni se habilita ningún endpoint amplio del ERP fuera de salud y productos tenant.
