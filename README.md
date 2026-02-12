# OctopusTrack

Sistema ERP para gestión comercial de sanitarios, ferreterías y corralones.

## Características

- **Gestión de productos** con cálculo automático de precios y bonificaciones
- **Clientes y cuenta corriente** con seguimiento de saldos
- **Proveedores** con condiciones comerciales
- **Ventas unificadas**: cotizaciones, remitos y facturas
- **Facturación electrónica** con integración ARCA (AFIP)
- **Reportes** de ventas, stock y cuentas corrientes
- **Tema claro/oscuro**

## Stack Tecnológico

### Backend
- **FastAPI** (Python 3.11+)
- **SQLAlchemy** (async) + **PostgreSQL**
- **Alembic** para migraciones
- **Pydantic** para validación
- **JWT** para autenticación

### Frontend
- **React 18** + **TypeScript**
- **TailwindCSS**
- **React Query** (TanStack Query)
- **Zustand** para estado global
- **React Router**

## Requisitos

- Docker y Docker Compose
- Node.js 20+ (para desarrollo local del frontend)
- Python 3.11+ (para desarrollo local del backend)

## Inicio Rápido

### Con Docker (recomendado)

```bash
# Clonar el repositorio
git clone <repo-url>
cd octopustrack

# Copiar archivo de variables de entorno
cp .env.example .env

# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f
```

La aplicación estará disponible en:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Documentación API: http://localhost:8000/docs

### Desarrollo Local

#### Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# o: venv\Scripts\activate  # Windows

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp ../.env.example .env

# Ejecutar migraciones
alembic upgrade head

# Iniciar servidor
uvicorn app.main:app --reload
```

#### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

## Estructura del Proyecto

```
octopustrack/
├── backend/
│   ├── app/
│   │   ├── main.py          # Entry point FastAPI
│   │   ├── config.py        # Configuración
│   │   ├── database.py      # Conexión PostgreSQL
│   │   ├── models/          # Modelos SQLAlchemy
│   │   ├── schemas/         # Schemas Pydantic
│   │   ├── routers/         # Endpoints API
│   │   ├── services/        # Lógica de negocio
│   │   └── utils/           # Utilidades
│   ├── alembic/             # Migraciones
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # Cliente HTTP
│   │   ├── components/      # Componentes React
│   │   ├── pages/           # Páginas
│   │   ├── context/         # React Context
│   │   ├── stores/          # Zustand stores
│   │   └── types/           # TypeScript types
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## API Endpoints

### Autenticación
- `POST /api/v1/auth/google` - Login con Google OAuth
- `POST /api/v1/auth/refresh` - Refrescar token
- `GET /api/v1/auth/me` - Usuario actual

### Productos
- `GET /api/v1/products` - Listar productos
- `POST /api/v1/products` - Crear producto
- `GET /api/v1/products/{id}` - Obtener producto
- `PUT /api/v1/products/{id}` - Actualizar producto
- `DELETE /api/v1/products/{id}` - Eliminar producto

### Clientes
- `GET /api/v1/clients` - Listar clientes
- `POST /api/v1/clients` - Crear cliente
- `GET /api/v1/clients/{id}` - Obtener cliente
- `PUT /api/v1/clients/{id}` - Actualizar cliente
- `DELETE /api/v1/clients/{id}` - Eliminar cliente

### Proveedores
- `GET /api/v1/suppliers` - Listar proveedores
- `POST /api/v1/suppliers` - Crear proveedor
- `GET /api/v1/suppliers/{id}` - Obtener proveedor
- `PUT /api/v1/suppliers/{id}` - Actualizar proveedor
- `DELETE /api/v1/suppliers/{id}` - Eliminar proveedor

### Categorías
- `GET /api/v1/categories` - Listar categorías
- `GET /api/v1/categories/tree` - Árbol de categorías
- `POST /api/v1/categories` - Crear categoría
- `PUT /api/v1/categories/{id}` - Actualizar categoría
- `DELETE /api/v1/categories/{id}` - Eliminar categoría

## Variables de Entorno

Ver `.env.example` para la lista completa de variables.

## Licencia

Todos los derechos reservados.
