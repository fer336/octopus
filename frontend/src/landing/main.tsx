import React from 'react'
import ReactDOM from 'react-dom/client'
import Landing from '../pages/Landing'
import '../styles/globals.css'

const tenantLoginUrl = import.meta.env.VITE_TENANT_LOGIN_URL || 'https://octopus.qeva.xyz/tenant.html#/login'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Landing loginUrl={tenantLoginUrl} />
  </React.StrictMode>,
)
