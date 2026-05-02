# n8n — Pago aprobado: email + activación de plan

## Estado actual verificado

- Workflow checkout: `OctopusTrack MP` (`5F0HFtbXozCIy7Rf`) ✅
- Workflow notificación MP: `🔔 Octopus - MP Notifications` (`DSmP5ZsSWS4VJJgK`) ✅
- El workflow de notificación hoy está incompleto (`If` sin condición útil + Gmail con contenido placeholder).

## Objetivo

Cuando MercadoPago confirme `approved`:

1. Enviar email según producto/plan:
   - **Excel**: HTML con botones de descarga (Excel + Google Sheets)
   - **Plan SaaS**: HTML con plan elegido + pasos para iniciar sesión
2. Activar automáticamente en backend las funcionalidades del tenant según plan.
3. Si plan incluye facturación (Completo/Premium), informar onboarding manual para ARCA/AFIP (punto de venta electrónico).

---

## Endpoint backend listo para consumir desde n8n

`POST /api/billing/mp/activate`

Headers:

- `Content-Type: application/json`
- `X-Billing-Secret: {{ $env.BILLING_WEBHOOK_SECRET }}`

Body:

```json
{
  "email": "cliente@correo.com",
  "plan_code": "basico",
  "payment_id": "1234567890",
  "payment_status": "approved"
}
```

`plan_code` soportados: `excel | basico | negocio | completo | premium`

---

## Diseño de flujo recomendado (Webhook Processing Pattern)

### Workflow: `🔔 Octopus - MP Notifications`

```text
Webhook MP (POST /webhook/octopus-notification)
  -> HTTP Request: Get MP Payment
  -> IF status == approved
      -> Set: normalize payload (email, plan_code, payment_id, onboarding_type)
      -> HTTP Request: activate backend plan
      -> Switch: excel vs plan
          -> Gmail: email Excel (HTML)
          -> Gmail: email Plan (HTML)
```

### Node 1: `HTTP Request - Get MP Payment`

- Method: `GET`
- URL: `https://api.mercadopago.com/v1/payments/{{ $json.body.data.id || $json.query['data.id'] }}`
- Header Authorization: `Bearer {{$env.MP_ACCESS_TOKEN}}`

### Node 2: `IF approved`

Condición:

```js
{{ $json.status === 'approved' }}
```

### Node 3: `Set - Normalize`

Mapear:

- `email`: `{{$json.metadata.email || $json.payer.email || ''}}`
- `plan_code`: `{{$json.metadata.plan_code || $json.metadata.onboarding_type || 'excel'}}`
- `payment_id`: `{{$json.id}}`
- `payment_status`: `{{$json.status}}`
- `product`: `{{$json.metadata.product || 'OctopusTrack'}}`

### Node 4: `HTTP Request - Activate Backend`

- Method: `POST`
- URL: `https://api.tu-dominio.com/api/billing/mp/activate`
- Headers:
  - `X-Billing-Secret: {{$env.BILLING_WEBHOOK_SECRET}}`
  - `Content-Type: application/json`
- Body JSON:

```json
{
  "email": "={{ $json.email }}",
  "plan_code": "={{ $json.plan_code }}",
  "payment_id": "={{ $json.payment_id }}",
  "payment_status": "={{ $json.payment_status }}"
}
```

### Node 5: `Switch` (excel vs planes)

- Caso Excel: `plan_code == 'excel'`
- Caso Plan: `plan_code in ['basico','negocio','completo','premium']`

---

## HTML email — Excel

Subject sugerido: `Tu cotizador Octopus está listo 🐙`

```html
<h2>¡Gracias por tu compra!</h2>
<p>Tu cotizador ya está disponible. Elegí el formato que prefieras:</p>
<p>
  <a href="https://TU-LINK-EXCEL" style="padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">Descargar Excel</a>
  &nbsp;
  <a href="https://TU-LINK-GSHEETS" style="padding:10px 16px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px;">Abrir Google Sheets</a>
</p>
<p>Si necesitás ayuda para configurarlo, respondé este correo y te damos una mano.</p>
```

---

## HTML email — Plan SaaS

Subject sugerido: `Plan {{plan_code}} activado en OctopusTrack ✅`

```html
<h2>¡Pago aprobado y plan activado!</h2>
<p>Tu plan <b>{{plan_code}}</b> ya está activo.</p>
<ol>
  <li>Ingresá a <a href="https://octopustrack.shop/acceder">octopustrack.shop/acceder</a></li>
  <li>Iniciá sesión con el mismo email de compra.</li>
  <li>Vas a ver habilitadas automáticamente las funcionalidades de tu plan.</li>
</ol>
<p><b>Si contrataste un plan con Facturación Electrónica:</b><br/>
Nos vamos a comunicar por email para configurar ARCA/AFIP y el punto de venta electrónico antes de emitir facturas.</p>
```

---

## Mapeo de features por plan (backend)

- `excel`: sin módulos SaaS
- `basico`: cotizaciones, remitos, inventario, actualización de precios
- `negocio`: todo Básico + cuenta corriente
- `completo`: todo Negocio + facturación + reportes
- `premium`: todo Completo + backup SQL

> Nota: para planes con facturación, el email aclara onboarding manual ARCA/AFIP.
