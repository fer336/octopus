# 🐙 OctopusTrack

Sistema ERP para sanitarios, ferreterías y corralones.

---

## 🚀 Probar el sistema

🌐 **Demo online:** https://app.octopustrack.shop

📲 **Acceso de prueba con autorización previa por WhatsApp:**

- WhatsApp: **+54 9 2254 59-6618**
- Link directo: https://wa.me/5492254596618

> Al ingresar, solicitá acceso por WhatsApp para habilitar la prueba.

---

## ✨ ¿Qué tiene hoy OctopusTrack? (paso a paso)

1. 🧾 **Cotizaciones**
   - Creación rápida de presupuestos.
   - Conversión posterior a remito o factura.

2. 🧷 **Remitos con y sin precios**
   - Emisión de remitos según necesidad operativa.
   - Ideal para entrega con control comercial.

3. 🧮 **Facturación electrónica ARCA (vía AFIP SDK)**
   - Emisión de comprobantes fiscales.
   - Flujo integrado con datos fiscales del sistema.

4. 💸 **Actualización masiva de precios**
   - Herramientas para modificar grandes volúmenes de productos.
   - Pensado para rubros con listas cambiantes.

5. 🤝 **Cuenta corriente por cliente**
   - Gestión de saldo, movimientos y seguimiento comercial.

6. 🏗️ **Cuenta corriente + retiro autorizado de mercadería**
   - Un cliente titular puede autorizar a otro cliente a retirar mercadería.
   - Caso real: arquitecto titular + instalador/plomero/electricista autorizado.

7. 💳 **Métodos de pago**
   - Configuración de métodos y registro operativo.

8. 👥 **Clientes y proveedores**
   - Gestión completa de contactos comerciales.

9. 🤖 **Agente de IA**
   - Consulta de precios por lenguaje natural.
   - Asistencia para crear cotizaciones.
   - Módulo en evolución continua para nuevas mejoras.

10. 📦 **Inventario y stock**
    - Control de stock y conteo.
    - Reportes para contabilizar mercadería.
    - Reportes exportables para compartir con proveedores.

11. 📊 **Área de reportes**
    - Reportes operativos del negocio para análisis diario.

12. 🛟 **Soporte y seguimiento de incidencias**
    - El usuario puede enviar feedback/problemas desde el sistema.
    - El mensaje se integra con **Linear App** para gestión de tickets.

---

## 🖼️ Capturas del sistema

### Login
![Login](docs/screenshots/login.png)

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)

### Productos
![Productos](docs/screenshots/productos.png)

### Actualización Masiva de Precios
![Actualización de Precios](docs/screenshots/actualizar-bd.png)

### Clientes
![Clientes](docs/screenshots/clientes.png)

### Proveedores
![Proveedores](docs/screenshots/proveedores.png)

### Categorías
![Categorías](docs/screenshots/categorias.png)

### Comprobantes
![Comprobantes](docs/screenshots/comprobantes.png)

### Cuenta Corriente
![Cuenta Corriente](docs/screenshots/cta-cte.png)

### Resumen Cuenta Corriente
![Resumen Cuenta Corriente](docs/screenshots/resumen-cta-cte.png)

### Caja
![Caja](docs/screenshots/caja.png)

### Métodos de Pago
![Métodos de Pago](docs/screenshots/metodosdepago.png)

### Inventario
![Inventario](docs/screenshots/inventario.png)

### PDF — Cotización
![Cotización PDF](docs/screenshots/pdf-cotizacion.png)

### PDF — Remito
![Remito PDF](docs/screenshots/pdf-remit.png)

### PDF — Factura
![Factura PDF](docs/screenshots/pdf-factura.png)

### PDF — Inventario
![Inventario PDF](docs/screenshots/pdf-inventario.png)

---

## 🛒 Integración Mercado Libre

OctopusTrack puede conectarse a una cuenta de Mercado Libre para publicar productos del inventario y sincronizar precios y stock automáticamente.

### Requisitos previos

1. Crear una aplicación en el [DevCenter de ML](https://developers.mercadolibre.com.ar/devcenter):
   - **Redirect URI**: `https://<tu-dominio>/api/v1/meli/oauth/callback`
   - Activar el topic **`orders_v2`** en Notifications y configurar la URL: `https://<tu-dominio>/api/v1/meli/notifications`
   - Anotar **App ID** (client_id) y **Secret Key** (client_secret)

2. Generar una clave Fernet para cifrar los tokens en la base de datos:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

### Variables de entorno

Agregar al `.env` del backend:

```env
MELI_CLIENT_ID=<App ID del DevCenter>
MELI_CLIENT_SECRET=<Secret Key del DevCenter>
MELI_REDIRECT_URI=https://<tu-dominio>/api/v1/meli/oauth/callback
MELI_SITE_ID=MLA
MELI_API_BASE=https://api.mercadolibre.com
MELI_AUTH_BASE=https://auth.mercadolibre.com.ar
MELI_TOKEN_ENCRYPTION_KEY=<clave Fernet generada arriba>
```

### Usuarios de prueba (desarrollo)

ML permite crear sellers y compradores de prueba desde el DevCenter → *Usuarios de prueba*. Con esos usuarios podés hacer el flujo completo (OAuth, publicar, webhook de venta) sin afectar cuentas reales.

### Arquitectura de la sincronización

```
Cambio local (precio/stock)
  └─► meli_sync_queue (outbox)
         └─► SyncWorker (asyncio, cada 5 s)
                └─► PUT /items/{id} en ML

Webhook ML (orders_v2)
  └─► POST /api/v1/meli/notifications → 200 inmediato
         └─► job process_order en meli_sync_queue
                └─► GET /orders/{id} → FIFO consume stock local
```

- Los tokens se guardan cifrados con Fernet, por negocio.
- El refresh_token es de un solo uso; se rota atómicamente con `SELECT … FOR UPDATE`.
- Los webhooks se procesan con idempotencia por `meli_order_id`.

---

## 💜 Colaboración

Este proyecto está en crecimiento constante.

Si querés colaborar con ideas, feedback funcional o mejoras:

- abrí un issue
- o escribinos por WhatsApp para coordinar una prueba guiada

---

**OctopusTrack** — evolución constante para negocios que necesitan velocidad, control y orden comercial real.
