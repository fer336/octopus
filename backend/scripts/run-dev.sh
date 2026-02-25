#!/bin/bash
# Script para correr el backend en modo desarrollo
# Uso: ./scripts/run-dev.sh

set -e

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Iniciando OctopusTrack Backend...${NC}"

# Verificar que estamos en el directorio correcto
if [ ! -f "app/main.py" ]; then
    echo -e "${RED}❌ Error: Este script debe ejecutarse desde el directorio backend/${NC}"
    echo -e "${YELLOW}💡 Ejecuta: cd backend && ./scripts/run-dev.sh${NC}"
    exit 1
fi

# Verificar si existe el venv
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}⚠️  No se encontró venv. Creando...${NC}"
    python3 -m venv venv
fi

# Activar venv
echo -e "${GREEN}✓${NC} Activando entorno virtual..."
source venv/bin/activate

# Verificar si las dependencias están instaladas
if ! python -c "import uvicorn" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Dependencias no instaladas. Instalando...${NC}"
    pip install -r requirements.txt
fi

# Verificar que existe el archivo .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No se encontró .env${NC}"
    if [ -f "../.env.example" ]; then
        echo -e "${BLUE}📋 Copiando .env.example a .env...${NC}"
        cp ../.env.example .env
        echo -e "${YELLOW}⚠️  IMPORTANTE: Configura tus variables de entorno en backend/.env${NC}"
    else
        echo -e "${RED}❌ No se encontró .env.example${NC}"
        exit 1
    fi
fi

# Correr el servidor
echo -e "${GREEN}✓${NC} Todo listo!"
echo -e "${BLUE}🌐 Servidor corriendo en: http://localhost:8000${NC}"
echo -e "${BLUE}📚 Documentación API: http://localhost:8000/docs${NC}"
echo -e "${YELLOW}⚡ Modo desarrollo: auto-reload activado${NC}"
echo ""

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
