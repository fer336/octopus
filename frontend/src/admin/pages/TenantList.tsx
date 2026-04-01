/**
 * Lista de tenants — panel de superadmin para gestionar negocios del ERP.
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import adminAPI, { type Tenant } from '../../api/adminService'

function TenantRow({ tenant }: { tenant: Tenant }) {
  const navigate = useNavigate()

  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
      onClick={() => navigate(`/tenants/${tenant.id}`)}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
        {tenant.name}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {tenant.cuit}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {tenant.tax_condition}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {tenant.owner_email}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {new Date(tenant.created_at).toLocaleDateString('es-AR')}
      </td>
      <td className="px-4 py-3 text-sm">
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/tenants/${tenant.id}/arca`)
          }}
          className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
        >
          Configurar ARCA
        </button>
      </td>
    </tr>
  )
}

function TenantTableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 6 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export default function TenantList() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const perPage = 20

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-tenants', page, debouncedSearch],
    queryFn: () => adminAPI.listTenants(page, perPage, debouncedSearch || undefined),
  })

  if (error) {
    toast.error('Error al cargar los tenants')
  }

  const tenants = data?.tenants ?? []
  const totalPages = data?.total_pages ?? 1
  const total = data?.total ?? 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Gestión de Tenants
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Administrá los negocios registrados en la plataforma
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre de negocio..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  CUIT
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Condición Fiscal
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Email Owner
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Creado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            {isLoading ? (
              <TenantTableSkeleton />
            ) : tenants.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {debouncedSearch
                      ? 'No se encontraron tenants con ese criterio de búsqueda'
                      : 'No hay tenants registrados'}
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {tenants.map((tenant) => (
                  <TenantRow key={tenant.id} tenant={tenant} />
                ))}
              </tbody>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Mostrando {tenants.length} de {total} tenants
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
