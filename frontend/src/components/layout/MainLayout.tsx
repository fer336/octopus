/**
 * Layout principal de la aplicación.
 * Combina Sidebar, Header y área de contenido.
 */
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useAIStore } from '../../stores/aiStore'
import Sidebar from './Sidebar'
import Header from './Header'
import AIAssistantPanel from '../ai/AIAssistantPanel'

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const isAIOpen = useAIStore((s) => s.isOpen)

  // Hook para cargar usuario en refresh
  useAuth()

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      {/* Main content */}
      <div
        className={`
          flex-1 flex flex-col overflow-hidden transition-all duration-300
          ${isAIOpen ? 'sm:mr-96' : 'mr-0'}
        `}
      >
        <Header
          onMenuClick={toggleSidebar}
          isSidebarCollapsed={sidebarCollapsed}
        />

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      <AIAssistantPanel />
    </div>
  )
}
