/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_BACKEND_URL: string
  readonly VITE_TENANT_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
