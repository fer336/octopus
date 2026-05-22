# Setup Notes — OctopusTrack

## 1. Health endpoint para FastAPI

Agregá esto en tu `main.py` o en un router dedicado (`routers/health.py`):

```python
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import time

app = FastAPI()

_START_TIME = time.time()

@app.get("/health", tags=["system"])
async def health_check():
    """
    Endpoint de salud para:
    - Docker healthcheck (en el stack.yml)
    - Verificación post-deploy en GitHub Actions
    - Monitoreo externo (UptimeRobot, Better Uptime, etc.)
    """
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "uptime_seconds": round(time.time() - _START_TIME, 1),
            "version": app.version or "unknown",
        }
    )
```

## 2. Secrets necesarios en GitHub

Settings > Secrets and variables > Actions > New repository secret

| Secret | Descripción |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Tu usuario de Docker Hub (fer336) |
| `DOCKERHUB_TOKEN` | Token de Docker Hub (no la contraseña, el PAT de acceso). Docker Hub > Account Settings > Security > New Access Token |
| `PORTAINER_WEBHOOK_URL` | URL completa del webhook de Portainer. Portainer > Stacks > octopus > Webhooks > copiar URL |
| `APP_HEALTH_URL` | URL pública del health check del backend. Ejemplo: `https://api.tudominio.com/health` |

> **Nota:** `GITHUB_TOKEN` es automático, no necesitás crearlo.

## 3. Estructura de archivos del repo

```
octopus/
├── .github/
│   └── workflows/
│       ├── ci.yml              ← push(main/develop), PR(main) y reusable por workflow_call
│       └── docker-release.yml ← release/deploy por tags v*.*.* (y dispatch manual)
├── backend/
│   ├── Dockerfile.prod
│   ├── requirements.txt
│   ├── requirements-dev.txt    ← pytest, ruff, mypy, etc.
│   └── tests/
│       └── test_health.py      ← al menos un test de ejemplo
├── frontend/
│   ├── Dockerfile.prod
│   └── package.json            ← scripts: lint, typecheck, test
├── docs/devops/
│   ├── stack.portainer.yml    ← stack para Portainer (con IMAGE_TAG)
│   └── setup-notes.md         ← este archivo
└── ruff.toml                  ← config del linter
```

## 4. Scripts mínimos en package.json del frontend

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  }
}
```

## 5. requirements-dev.txt mínimo para backend

```
ruff==0.4.4
mypy==1.10.0
pytest==8.2.0
pytest-asyncio==0.23.7
pytest-cov==5.0.0
httpx==0.27.0     # para TestClient de FastAPI
```

## 6. Test mínimo de ejemplo

`backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```
