# TestSprite - Guía de ejecución en entorno local

Este documento define cómo correr pruebas E2E con TestSprite para OctopusTrack.

## Pre-requisitos

- Backend levantado en `http://127.0.0.1:8000`
- Frontend levantado en `http://127.0.0.1:5173`
- Usuario demo: `user@demo`
- Contraseña demo: `demo123`

## Bypass de login para testing

Para evitar bloqueo por OAuth en pruebas automatizadas:

- Backend expone `POST /auth/dev-login?email=<email>&password=<password>`
- Solo funciona cuando `DEBUG=True`
- Si no hay usuarios activos, crea un usuario demo con negocio por defecto

En frontend (modo desarrollo):

- Formulario visible en login con las credenciales demo
- Opcional auto-login por variable de entorno:

```bash
VITE_DEV_AUTO_LOGIN=true
VITE_DEMO_LOGIN_EMAIL=user@demo
VITE_DEMO_LOGIN_PASSWORD=demo123
```

## Flujo sugerido para pruebas del agente IA

1. Abrir login y usar bypass de testing.
2. Ir al panel del Asistente IA.
3. Probar consulta de producto (precio/stock).
4. Agregar ítems al carrito virtual con "Cotizar este producto".
5. Enviar una lista de presupuesto y validar preview + preguntas de datos faltantes.

## Nota de seguridad

El bypass de login es exclusivamente para testing/desarrollo y no debe habilitarse en producción.
