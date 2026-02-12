# 🚀 Guía de Inicio Rápido - OctopusTrack

## ✅ Configuración Completada

- ✅ Base de datos PostgreSQL creada y migrada
- ✅ Autenticación Google OAuth configurada
- ✅ Backend con FastAPI completamente funcional
- ✅ Frontend con React conectado al backend
- ✅ Servicios API implementados

---

## 📋 Requisitos Previos

- Python 3.11+ instalado
- Node.js 20+ instalado
- PostgreSQL corriendo en 91.99.162.240:5432

---

## 🎯 Iniciar el Sistema

### 1️⃣ Iniciar el Backend (Puerto 8000)

```bash
cd /home/ferc33/Documentos/18-OctopusTrack/backend

# Activar entorno virtual
source venv/bin/activate

# Iniciar el servidor FastAPI
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Backend estará disponible en:**
- API: http://localhost:8000
- Documentación Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

### 2️⃣ Iniciar el Frontend (Puerto 5173)

Abrir una **nueva terminal**:

```bash
cd /home/ferc33/Documentos/18-OctopusTrack/frontend

# Instalar dependencias (solo la primera vez)
npm install

# Iniciar el servidor de desarrollo
npm run dev
```

**Frontend estará disponible en:**
- App: http://localhost:5173

---

## 🔐 Flujo de Autenticación

### Cómo Funciona:

1. Usuario hace clic en **"Continuar con Google"** en `/login`
2. Se redirige a la página de autorización de Google
3. Usuario autoriza la aplicación
4. Google redirige a `http://localhost:8000/api/v1/auth/google/callback`
5. Backend:
   - Intercambia el código por tokens de Google
   - Verifica la identidad del usuario
   - Crea/actualiza el usuario en la BD
   - Genera nuestros propios JWT tokens
   - Redirige al frontend con los tokens: `http://localhost:5173/auth/callback?access_token=...&refresh_token=...`
6. Frontend guarda los tokens en localStorage
7. Usuario es redirigido al Dashboard

---

## 🧪 Probar la Aplicación

### 1. Abrir el navegador en http://localhost:5173

### 2. Iniciar sesión con Google
- Haz clic en "Continuar con Google"
- Autoriza la aplicación
- Deberías ser redirigido al Dashboard

### 3. Verificar funcionalidades:

✅ **Dashboard**: Ver métricas y estadísticas
✅ **Productos**: Lista de productos (por ahora vacía)
✅ **Clientes**: Lista de clientes (por ahora vacía)
✅ **Proveedores**: Lista de proveedores (por ahora vacía)
✅ **Categorías**: Lista de categorías (por ahora vacía)
✅ **Ventas**: Pantalla unificada para crear ventas

---

## 🔧 Variables de Entorno Configuradas

### Backend (.env)
```env
DATABASE_URL=postgresql+asyncpg://postgres:Zbsrp4Avr9XFVuBdXkAf@91.99.162.240:5432/octopustrack
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
JWT_SECRET=your-jwt-secret-key
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_BACKEND_URL=http://localhost:8000
```

---

## 📡 Endpoints API Disponibles

### Autenticación
- `GET /api/v1/auth/google/login` - Iniciar flujo OAuth
- `GET /api/v1/auth/google/callback` - Callback de Google
- `POST /api/v1/auth/refresh` - Renovar access token
- `GET /api/v1/auth/me` - Usuario actual
- `POST /api/v1/auth/logout` - Cerrar sesión

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

---

## 🛠️ Solución de Problemas

### Error: "Cannot connect to database"
```bash
# Verificar que PostgreSQL está corriendo
PGPASSWORD="Zbsrp4Avr9XFVuBdXkAf" psql -h 91.99.162.240 -p 5432 -U postgres -d octopustrack -c "SELECT 1;"
```

### Error: "Module not found" (Frontend)
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Error: "Import error" (Backend)
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### Verificar que los puertos estén disponibles
```bash
# Puerto 8000 (Backend)
lsof -i :8000

# Puerto 5173 (Frontend)
lsof -i :5173
```

---

## 📊 Estructura de Base de Datos

### Modelo Multitenant

```
users (Usuarios con Google OAuth)
  └── businesses (Negocios/Tenants)
        ├── products (business_id)
        ├── clients (business_id)
        ├── suppliers (business_id)
        ├── categories (business_id)
        ├── vouchers (business_id)
        ├── payments (business_id)
        └── client_accounts (via clients)
```

Cada usuario puede tener múltiples negocios, y cada negocio tiene sus propios datos completamente aislados.

---

## 🎨 Características del Frontend

- ✅ Tema claro/oscuro funcional
- ✅ Navegación con Sidebar
- ✅ Componentes UI reutilizables
- ✅ Gestión de estado con Zustand
- ✅ React Query para cache de datos
- ✅ Interceptores de axios para tokens
- ✅ Renovación automática de tokens
- ✅ Toast notifications
- ✅ Responsive design con TailwindCSS

---

## 📝 Próximos Pasos

1. ✅ Probar el flujo completo de autenticación
2. ✅ Crear algunos productos, clientes y proveedores de prueba
3. ✅ Implementar el CRUD completo en las páginas
4. ⏳ Implementar la funcionalidad de ventas
5. ⏳ Agregar importación de Excel para productos
6. ⏳ Implementar generación de PDFs
7. ⏳ Integrar facturación electrónica con ARCA

---

## 🆘 Soporte

Si encuentras algún error o necesitas ayuda:
1. Verifica los logs del backend en la terminal
2. Abre la consola del navegador (F12) para ver errores del frontend
3. Revisa la documentación Swagger en http://localhost:8000/docs

---

¡Felicidades! 🎉 El sistema está completamente configurado y listo para usar.
