# DevOps — OctopusTrack

## Arquitectura de Despliegue

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Repository                           │
│                  github.com/fer336/octopus                     │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │     CI      │     │   Sistema   │     │    CMS      │
   │  (tests)    │     │  (backend+  │     │  (admin)    │
   │             │     │   frontend) │     │             │
   └─────────────┘     └─────────────┘     └─────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  GHCR +     │     │  Portainer  │     │  Portainer  │
   │  Docker Hub │     │  (Swarm)    │     │  (Swarm)    │
   └─────────────┘     └─────────────┘     └─────────────┘
                              │                    │
                              ▼                    ▼
                       ┌─────────────┐       ┌─────────────┐
                       │   Backend   │       │    CMS      │
                       │   Frontend  │       │   (admin)   │
                       │  (tenant)   │       └─────────────┘
                       └─────────────┘
```

## Pipelines Disponibles

| Workflow | Trigger | Qué despliega |
|----------|---------|---------------|
| **CI** | push(main/develop), PR(main) | Solo corre tests (no deploya) |
| **System** | tag `system-v*.*.*` | Backend + Frontend (tenant) |
| **CMS** | tag `cms-v*.*.*` | Solo CMS (admin panel) |

## Cómo Desplegar

### Sistema (Backend + Frontend tenant)

```bash
# Crear tag para sistema
git tag system-v1.2.19
git push origin system-v1.2.19
```

O ejecutar manualmente: **Actions > System Deploy > Run workflow**

### CMS (Admin panel)

```bash
# Crear tag para CMS
git tag cms-v1.2.19
git push origin cms-v1.2.19
```

O ejecutar manualmente: **Actions > CMS Deploy > Run workflow**

## Tags y Convenciones

| Prefijo | Ejemplo | Uso |
|---------|---------|-----|
| `system-v*.*.*` | `system-v1.2.19` | Sistema completo (backend + frontend) |
| `cms-v*.*.*` | `cms-v1.2.19` | Solo CMS |

### Tags de imágenes generados

| Servicio | GHCR | Docker Hub |
|----------|------|------------|
| Backend | `ghcr.io/fer336/octopustrack-backend:system-v1.2.19` | `fer336/octopustrack-backend:system-v1.2.19` |
| Frontend | `ghcr.io/fer336/octopustrack-frontend:system-v1.2.19` | `fer336/octopustrack-frontend:system-v1.2.19` |
| CMS | `ghcr.io/fer336/octopustrack-cms:cms-v1.2.19` | `fer336/octopustrack-cms:cms-v1.2.19` |

## Secrets配置

| Secret | Descripción |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Tu cuenta Docker Hub (fer336) |
| `DOCKERHUB_TOKEN` | Token de Docker Hub |
| `PORTAINER_WEBHOOK_URL` | Webhook del stack de Sistema |
| `PORTAINER_CMS_WEBHOOK_URL` | Webhook del stack de CMS |
| `APP_HEALTH_URL` | Health del sistema (`https://api.tudominio.com/health`) |
| `CMS_HEALTH_URL` | Health del CMS |

## Variables de Repo

| Variable | Descripción |
|----------|-------------|
| `VITE_TENANT_LOGIN_URL` | URL de login del tenant |
| `VITE_OCTOPUS_TRACK_LOGIN_URL` | URL de login OctopusTrack |
| `VITE_OCTOPUS_FLOW_LOGIN_URL` | URL de login OctopusFlow |

## Stacks en Portainer

- **Sistema**: `docs/devops/stack.portainer.yml` (backend + frontend tenant)
- **CMS**: Stack separado con imagen `octopustrack-cms`

## Troubleshooting

### No se activa el workflow
→ Confirmar que el tag tenga el prefijo correcto (`system-`, `cms-`)

### Deploy no ejecuta
→ Verificar que el webhook correspondiente esté configurado en secrets

### Conflictos de versiones
→ Cada pipeline tiene su propia numeración, no se pisan entre sí
