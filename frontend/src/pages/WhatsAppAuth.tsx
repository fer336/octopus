import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Plus, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  createRequest,
  listRequests,
  type WhatsAppAuthCreate,
  type WhatsAppAuthRequest,
} from '../api/whatsappAuthService'
import { formatErrorMessage } from '../utils/errorHelpers'

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700' },
  authorized: { label: 'Autorizado', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expirado', cls: 'bg-gray-100 text-gray-500' },
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.cls}`}>
      {config.label}
    </span>
  )
}

const emptyForm: WhatsAppAuthCreate = {
  client_name: '',
  client_phone: '',
  requester_name: '',
  description: 'retiro de materiales',
}

export default function WhatsAppAuth() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<WhatsAppAuthCreate>(emptyForm)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['whatsapp-auth-requests'],
    queryFn: () => listRequests(),
    refetchInterval: 30000,
  })

  const createMutation = useMutation({
    mutationFn: (data: WhatsAppAuthCreate) => createRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-auth-requests'] })
      toast.success('Solicitud enviada por WhatsApp')
      setShowForm(false)
      setForm(emptyForm)
    },
    onError: (error: unknown) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_name.trim() || !form.client_phone.trim() || !form.requester_name.trim()) {
      toast.error('Completá todos los campos obligatorios')
      return
    }
    createMutation.mutate(form)
  }

  return (
    <div className="w-full max-w-none space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-3 rounded-md border border-green-200 dark:border-green-800">
        <div>
          <h1 className="text-xl font-bold text-green-900 dark:text-green-100 flex items-center gap-1.5">
            <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
            Autorizaciones WhatsApp
          </h1>
          <p className="text-sm text-green-700 dark:text-green-300">
            Solicitá autorización de retiro de materiales por WhatsApp.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva solicitud
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Nueva solicitud de autorización
              </h2>
              <button
                onClick={() => { setShowForm(false); setForm(emptyForm) }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nombre del cliente <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Teléfono WhatsApp <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.client_phone}
                  onChange={(e) => setForm({ ...form, client_phone: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ej: 5491155551234"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Titular a cargo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.requester_name}
                  onChange={(e) => setForm({ ...form, requester_name: e.target.value })}
                  placeholder="Ej: María García"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="retiro de materiales"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(emptyForm) }}
                  className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? 'Enviando...' : 'Enviar autorización por WhatsApp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No hay solicitudes aún
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Creá una nueva solicitud para enviar una autorización por WhatsApp.
          </p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {['Cliente', 'Teléfono', 'Responsable', 'Descripción', 'Estado', 'Fecha'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item: WhatsAppAuthRequest) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {item.client_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono">
                    {item.client_phone}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {item.requester_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-[180px] truncate">
                    {item.description}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
