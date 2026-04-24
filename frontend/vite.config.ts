import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const buildTarget = process.env.BUILD_APP ?? 'all'

const buildInput =
  buildTarget === 'landing'
    ? {
        landing: path.resolve(__dirname, 'landing.html'),
      }
    : {
        tenant: path.resolve(__dirname, 'tenant.html'),
        admin: path.resolve(__dirname, 'admin.html'),
        landing: path.resolve(__dirname, 'landing.html'),
      }

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: buildInput,
    },
  },
})
