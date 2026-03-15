# TestSprite - Guía de ejecución en entorno local

Este documento define cómo correr pruebas E2E con TestSprite para OctopusTrack.

## Pre-requisitos

- Backend levantado en `http://127.0.0.1:8000`
- Frontend levantado en `http://127.0.0.1:5173`
- Usuario de testing: `casserafernando@gmail.com`

## Bypass de login para testing

Para evitar bloqueo por OAuth en pruebas automatizadas:

- Backend expone `POST /auth/dev-login?email=<email>`
- Solo funciona cuando `DEBUG=True`
- Si el usuario no existe, se crea automáticamente con negocio por defecto

En frontend (modo desarrollo):

- Botón en login: `Ingresar testing (casserafernando@gmail.com)`
- Opcional auto-login por variable de entorno:

```bash
VITE_DEV_AUTO_LOGIN=true
VITE_DEV_BYPASS_EMAIL=casserafernando@gmail.com
```

## Flujo sugerido para pruebas del agente IA

1. Abrir login y usar bypass de testing.
2. Ir al panel del Asistente IA.
3. Probar consulta de producto (precio/stock).
4. Agregar ítems al carrito virtual con "Cotizar este producto".
5. Enviar una lista de presupuesto y validar preview + preguntas de datos faltantes.

## Nota de seguridad

El bypass de login es exclusivamente para testing/desarrollo y no debe habilitarse en producción.
