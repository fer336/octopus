# Frontend Dockerfile - React con Node.js 20
FROM node:20-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar package.json e instalar dependencias
COPY package.json package-lock.json* ./
RUN npm install

# Copiar código de la aplicación
COPY . .

# Puerto expuesto
EXPOSE 5173

# Comando por defecto (desarrollo)
CMD ["npm", "run", "dev", "--", "--host"]
