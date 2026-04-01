/**
 * Detalle de un tenant específico — placeholder.
 */
import { useParams } from 'react-router-dom'

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Tenant: {id}
      </h1>
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <p className="text-yellow-800 dark:text-yellow-200">
          En desarrollo — Detalle y configuración del tenant
        </p>
      </div>
    </div>
  )
}
