/**
 * Página de Cuenta Corriente.
 * MVP de CC-03: gestión de autorizaciones titular/subcliente con sublímite.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardList, Filter, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

import clientsService from '../api/clientsService'
import clientTypesService from '../api/clientTypesService'
import clientAuthorizationsService, {
  ClientAuthorization,
} from '../api/clientAuthorizationsService'
import vouchersService from '../api/vouchersService'
import { Button, ConfirmModal, Input, Modal } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'

const CURRENT_ACCOUNT_MODES = [
  { value: 'disabled', label: 'Deshabilitada' },
  { value: 'limited', label: 'Con límite' },
  { value: 'unlimited', label: 'Sin límite' },
] as const

export default function CurrentAccount() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [billingClientId, setBillingClientId] = useState('')
  const [operatingClientId, setOperatingClientId] = useState('')
  const [operatingCreditLimit, setOperatingCreditLimit] = useState('')
  const [notes, setNotes] = useState('')
  const [editingAuth, setEditingAuth] = useState<ClientAuthorization | null>(null)
  const [authToDelete, setAuthToDelete] = useState<ClientAuthorization | null>(null)
  const [closureBillingClientId, setClosureBillingClientId] = useState('')
  const [closureNotes, setClosureNotes] = useState('')
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([])
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<'pending' | 'closed' | 'all'>(
    'pending'
  )
  const [receiptSearch, setReceiptSearch] = useState('')
  const [showDisabledBillingClients, setShowDisabledBillingClients] = useState(false)
  const [showHistorySection, setShowHistorySection] = useState(false)

  const {
    data: clientsData,
    isLoading: loadingClients,
    error: clientsError,
  } = useQuery({
    queryKey: ['clients', 'current-account-page'],
    queryFn: () => clientsService.getAll({ page: 1, per_page: 100 }),
    retry: false,
  })

  const { data: clientTypesData } = useQuery({
    queryKey: ['client-types', 'current-account-page'],
    queryFn: () => clientTypesService.getAll(),
    retry: false,
  })

  const { data: authorizationsData, isLoading: loadingAuthorizations } = useQuery({
    queryKey: ['client-authorizations'],
    queryFn: () => clientAuthorizationsService.getAll({ page: 1, per_page: 100 }),
    retry: false,
  })

  const { data: currentAccountReceiptsData, isLoading: loadingPendingReceipts } = useQuery({
    queryKey: [
      'current-account-receipts',
      closureBillingClientId,
      receiptStatusFilter,
      receiptSearch.trim(),
    ],
    queryFn: () =>
      vouchersService.getCurrentAccountReceipts({
        page: 1,
        per_page: 300,
        billing_client_id: closureBillingClientId || undefined,
        pending_only:
          receiptStatusFilter === 'all' ? undefined : receiptStatusFilter === 'pending',
        search: receiptSearch.trim() || undefined,
      }),
    retry: false,
  })

  const clients = clientsData?.items || []
  const clientTypes = clientTypesData || []
  const authorizations = authorizationsData?.items || []
  const currentAccountReceipts = currentAccountReceiptsData?.items || []

  const clientsById = useMemo(() => {
    return new Map(clients.map((client) => [client.id, client]))
  }, [clients])

  const enabledBillingClients = useMemo(() => {
    return clients.filter((client) => (client.current_account_mode || 'disabled') !== 'disabled')
  }, [clients])

  const disabledBillingClients = useMemo(() => {
    return clients.filter((client) => (client.current_account_mode || 'disabled') === 'disabled')
  }, [clients])

  const billingClients = useMemo(() => {
    if (showDisabledBillingClients) {
      return clients
    }
    return enabledBillingClients
  }, [clients, enabledBillingClients, showDisabledBillingClients])

  const hasOnlyDisabledBillingClients =
    enabledBillingClients.length === 0 && disabledBillingClients.length > 0

  useEffect(() => {
    if (billingClientId && !billingClients.some((client) => client.id === billingClientId)) {
      setBillingClientId('')
    }

    if (
      closureBillingClientId &&
      !billingClients.some((client) => client.id === closureBillingClientId)
    ) {
      setClosureBillingClientId('')
      setSelectedReceiptIds([])
    }
  }, [billingClients, billingClientId, closureBillingClientId])

  const closureReceipts = useMemo(() => currentAccountReceipts, [currentAccountReceipts])

  const pendingReceiptIds = useMemo(
    () =>
      new Set(
        closureReceipts
          .filter((voucher) => !voucher.invoiced_voucher_id)
          .map((voucher) => voucher.id)
      ),
    [closureReceipts]
  )

  useEffect(() => {
    setSelectedReceiptIds((prev) => prev.filter((id) => pendingReceiptIds.has(id)))
  }, [pendingReceiptIds])

  const typeById = useMemo(() => {
    return new Map(clientTypes.map((item) => [item.id, item]))
  }, [clientTypes])

  const eligibleOperatingClients = useMemo(() => {
    return clients.filter((client) => {
      const type = client.client_type_id ? typeById.get(client.client_type_id) : undefined
      return !!type?.is_subclient_eligible
    })
  }, [clients, typeById])

  const availableOperatingClients = useMemo(() => {
    return eligibleOperatingClients.filter((client) => client.id !== billingClientId)
  }, [eligibleOperatingClients, billingClientId])

  useEffect(() => {
    if (
      operatingClientId &&
      !availableOperatingClients.some((client) => client.id === operatingClientId)
    ) {
      setOperatingClientId('')
    }
  }, [availableOperatingClients, operatingClientId])

  const createAuthorizationMutation = useMutation({
    mutationFn: () =>
      clientAuthorizationsService.create({
        billing_client_id: billingClientId,
        operating_client_id: operatingClientId,
        operating_credit_limit: operatingCreditLimit ? Number(operatingCreditLimit) : null,
        notes: notes.trim() || undefined,
        is_active: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-authorizations'] })
      toast.success('Autorización creada correctamente')
      setBillingClientId('')
      setOperatingClientId('')
      setOperatingCreditLimit('')
      setNotes('')
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const updateAuthorizationMutation = useMutation({
    mutationFn: (payload: {
      id: string
      operating_credit_limit?: number | null
      is_active: boolean
      notes?: string
    }) =>
      clientAuthorizationsService.update(payload.id, {
        operating_credit_limit: payload.operating_credit_limit,
        is_active: payload.is_active,
        notes: payload.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-authorizations'] })
      toast.success('Autorización actualizada')
      setEditingAuth(null)
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const deleteAuthorizationMutation = useMutation({
    mutationFn: (id: string) => clientAuthorizationsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-authorizations'] })
      toast.success('Autorización eliminada')
      setAuthToDelete(null)
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const closeCurrentAccountMutation = useMutation({
    mutationFn: (payload: { close_all: boolean }) =>
      vouchersService.closeCurrentAccount({
        billing_client_id: closureBillingClientId,
        receipt_ids: payload.close_all ? undefined : selectedReceiptIds,
        close_all: payload.close_all,
        notes: closureNotes.trim() || undefined,
      }),
    onSuccess: (voucher) => {
      queryClient.invalidateQueries({ queryKey: ['current-account-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['current-account-pending-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['pending-quotations'] })
      toast.success(
        `Cierre generado: ${voucher.sale_point}-${voucher.number} (pendiente de facturar)`
      )
      setSelectedReceiptIds([])
      setClosureNotes('')
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const historyQuery = useQuery({
    queryKey: ['current-account-history', closureBillingClientId],
    queryFn: () => vouchersService.getCurrentAccountHistory(closureBillingClientId),
    enabled: !!closureBillingClientId && showHistorySection,
  })

  const handleCreateAuthorization = () => {
    if (!billingClientId || !operatingClientId) {
      toast.error('Seleccioná titular y subcliente')
      return
    }

    if (billingClientId === operatingClientId) {
      toast.error('Titular y subcliente deben ser distintos')
      return
    }

    createAuthorizationMutation.mutate()
  }

  const handleToggleReceipt = (voucherId: string, isLocked: boolean) => {
    if (isLocked) {
      toast.error('Este remito ya quedó cerrado y no se puede seleccionar')
      return
    }

    setSelectedReceiptIds((prev) =>
      prev.includes(voucherId) ? prev.filter((id) => id !== voucherId) : [...prev, voucherId]
    )
  }

  const handleCloseCurrentAccount = (closeAll: boolean) => {
    if (!closureBillingClientId) {
      toast.error('Seleccioná el cliente titular a cerrar')
      return
    }

    if (!closeAll && selectedReceiptIds.length === 0) {
      toast.error('Seleccioná al menos un remito o usá "Cerrar toda la cuenta"')
      return
    }

    closeCurrentAccountMutation.mutate({ close_all: closeAll })
  }

  const handlePreview = async (closeAll: boolean) => {
    if (!closureBillingClientId) {
      toast.error('Seleccioná el cliente titular a cerrar')
      return
    }

    if (!closeAll && selectedReceiptIds.length === 0) {
      toast.error('Seleccioná al menos un remito para previsualizar o usá "Vista previa total"')
      return
    }

    try {
      toast.loading('Generando PDF...', { id: 'preview-pdf' })
      const blob = await vouchersService.previewCurrentAccountClosePdf({
        billing_client_id: closureBillingClientId,
        receipt_ids: closeAll ? undefined : selectedReceiptIds,
        close_all: closeAll,
        notes: closureNotes.trim() || undefined,
      })

      // Abrir PDF en nueva pestaña
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')

      toast.success('PDF generado', { id: 'preview-pdf' })
    } catch (error) {
      toast.error(formatErrorMessage(error), { id: 'preview-pdf' })
    }
  }

  const topSummary = [
    {
      label: 'Clientes con Cta Cte habilitada',
      value: enabledBillingClients.length,
    },
    {
      label: 'Subclientes elegibles',
      value: eligibleOperatingClients.length,
    },
    {
      label: 'Autorizaciones activas',
      value: authorizations.filter((a) => a.is_active).length,
    },
  ]

  const selectedReceiptsTotal = useMemo(() => {
    return closureReceipts
      .filter((voucher) => selectedReceiptIds.includes(voucher.id))
      .reduce((acc, voucher) => acc + Number(voucher.total || 0), 0)
  }, [closureReceipts, selectedReceiptIds])

  const selectedBillingClient = closureBillingClientId
    ? clientsById.get(closureBillingClientId)
    : undefined

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/20 dark:to-primary-900/20 p-6 rounded-xl border border-primary-200 dark:border-primary-800">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-100 flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary-600 dark:text-primary-400" />
            Cuenta Corriente
          </h1>
          <p className="text-primary-700 dark:text-primary-300">
            Gestión de autorizaciones titular/subcliente con sublímite por vínculo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {topSummary.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {item.label}
            </p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4" data-tour-current-account-auth-section>
        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
          <Plus size={16} className="text-primary-600" />
          Nueva autorización de retiro
        </div>

        {clients.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            No hay clientes cargados todavía. Para crear autorizaciones primero necesitás dar de alta clientes.
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => navigate('/clients')}>
                Ir a Clientes
              </Button>
            </div>
          </div>
        )}

        {hasOnlyDisabledBillingClients && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            No hay clientes con Cuenta Corriente habilitada. Podés habilitarla desde Clientes o mostrar
            temporalmente los clientes deshabilitados para continuar con el flujo.
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate('/clients')}>
                Habilitar CC en Clientes
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowDisabledBillingClients(true)}>
                Mostrar deshabilitados
              </Button>
            </div>
          </div>
        )}

        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showDisabledBillingClients}
            onChange={(e) => setShowDisabledBillingClients(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Mostrar también clientes con Cuenta Corriente deshabilitada
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cliente titular (paga la cuenta)
            </label>
            <select
              value={billingClientId}
              onChange={(e) => setBillingClientId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
              data-tour-current-account-billing-select
            >
              <option value="">{billingClients.length > 0 ? 'Seleccionar titular...' : 'Sin titulares disponibles'}</option>
              {billingClients.map((client) => {
                const mode = client.current_account_mode || 'disabled'
                const modeLabel = CURRENT_ACCOUNT_MODES.find((item) => item.value === mode)?.label || mode
                return (
                  <option key={client.id} value={client.id}>
                    {client.name} · {modeLabel}
                  </option>
                )
              })}
            </select>
            {billingClients.length === 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                No hay clientes para seleccionar. Revisá la configuración de Cuenta Corriente en Clientes.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subcliente autorizado (retira mercadería)
            </label>
            <select
              value={operatingClientId}
              onChange={(e) => setOperatingClientId(e.target.value)}
              disabled={availableOperatingClients.length === 0}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
              data-tour-current-account-operating-select
            >
              <option value="">
                {availableOperatingClients.length > 0
                  ? 'Seleccionar subcliente...'
                  : 'Sin subclientes disponibles'}
              </option>
              {availableOperatingClients.map((client) => {
                const typeName = client.client_type_id
                  ? typeById.get(client.client_type_id)?.name
                  : 'Sin tipo'
                return (
                  <option key={client.id} value={client.id}>
                    {client.name} · {typeName}
                  </option>
                )
              })}
            </select>
            {billingClientId && availableOperatingClients.length === 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                No quedan subclientes disponibles para este titular.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sublímite (opcional)
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={operatingCreditLimit}
              onChange={(e) => setOperatingCreditLimit(e.target.value)}
              placeholder="Ej: 500000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notas
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones del vínculo..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleCreateAuthorization} isLoading={createAuthorizationMutation.isPending}>
            Guardar autorización
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold mb-3">
          <Filter size={16} className="text-primary-600" />
          Clientes titulares para Cuenta Corriente
        </div>

        <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/70">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Cliente</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Modo CC</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Límite</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Saldo</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Acción</th>
              </tr>
            </thead>
            <tbody>
              {clientsError && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-red-600 dark:text-red-400">
                    Error cargando clientes: {formatErrorMessage(clientsError)}
                  </td>
                </tr>
              )}

              {billingClients.map((client) => {
                const mode = client.current_account_mode || 'disabled'
                const modeLabel = CURRENT_ACCOUNT_MODES.find((item) => item.value === mode)?.label || mode
                const isSelected = closureBillingClientId === client.id
                return (
                  <tr key={client.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">{client.name}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{modeLabel}</td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                      {client.credit_limit != null
                        ? `$ ${Number(client.credit_limit).toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                          })}`
                        : 'Sin límite'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                      $ {Number(client.current_balance || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant={isSelected ? 'primary' : 'outline'}
                        onClick={() => {
                          setClosureBillingClientId(client.id)
                          setSelectedReceiptIds([])
                        }}
                      >
                        {isSelected ? 'Filtrando' : 'Ver remitos'}
                      </Button>
                    </td>
                  </tr>
                )
              })}

               {!clientsError && billingClients.length === 0 && (
                 <tr>
                   <td colSpan={5} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                     No hay titulares para mostrar. Activá "Mostrar también clientes deshabilitados" o
                     habilitá Cuenta Corriente desde Clientes.
                   </td>
                 </tr>
               )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold mb-3">
          <ShieldCheck size={16} className="text-primary-600" />
          Autorizaciones activas e históricas
        </div>

        {(loadingClients || loadingAuthorizations) && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando autorizaciones...</p>
        )}

        {!loadingClients && !loadingAuthorizations && (
          <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/70">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Titular</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Subcliente</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Sublímite</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Estado</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {authorizations.map((auth) => {
                  const billing = clientsById.get(auth.billing_client_id)
                  const operating = clientsById.get(auth.operating_client_id)
                  return (
                    <tr key={auth.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{billing?.name || '—'}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{operating?.name || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {auth.operating_credit_limit != null
                          ? `$ ${Number(auth.operating_credit_limit).toLocaleString('es-AR', {
                              minimumFractionDigits: 2,
                            })}`
                          : 'Sin sublímite'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            auth.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {auth.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingAuth(auth)}>
                            Editar
                          </Button>
                          <button
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            onClick={() => setAuthToDelete(auth)}
                            title="Eliminar autorización"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {authorizations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                      No hay autorizaciones registradas todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4" data-tour-current-account-close-section>
        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
          <ClipboardList size={16} className="text-primary-600" />
          Control previo al cierre y selección de remitos
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cliente titular a cerrar
            </label>
            <select
              value={closureBillingClientId}
              onChange={(e) => {
                setClosureBillingClientId(e.target.value)
                setSelectedReceiptIds([])
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
            >
              <option value="">{billingClients.length > 0 ? 'Seleccionar titular...' : 'Sin titulares disponibles'}</option>
              {billingClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {(client.current_account_mode || 'disabled') === 'disabled'
                    ? ' · Deshabilitada'
                    : ''}
                </option>
              ))}
            </select>
            {billingClients.length === 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Sin titulares para cierre. Mostrá clientes deshabilitados o habilitá CC en Clientes.
              </p>
            )}
            {selectedBillingClient && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Saldo actual: ${' '}
                {Number(selectedBillingClient.current_balance || 0).toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                })}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Observaciones del cierre (opcional)
            </label>
            <Input
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
              placeholder="Nota para el comprobante de cierre..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estado de remitos
            </label>
            <select
              value={receiptStatusFilter}
              onChange={(e) => {
                setReceiptStatusFilter(e.target.value as 'pending' | 'closed' | 'all')
                setSelectedReceiptIds([])
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
            >
              <option value="pending">Solo pendientes</option>
              <option value="closed">Solo cerrados/bloqueados</option>
              <option value="all">Todos</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Buscar remito
            </label>
            <Input
              value={receiptSearch}
              onChange={(e) => setReceiptSearch(e.target.value)}
              placeholder="Número o nota..."
            />
          </div>
        </div>

        <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-72">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/70">
              <tr>
                <th className="px-3 py-2 text-left">Sel.</th>
                <th className="px-3 py-2 text-left">Remito</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Titular</th>
                <th className="px-3 py-2 text-left">Autorizado</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loadingPendingReceipts && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
                    Cargando remitos pendientes...
                  </td>
                </tr>
              )}

              {!loadingPendingReceipts && closureReceipts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
                    No hay remitos de Cuenta Corriente pendientes para este titular.
                  </td>
                </tr>
              )}

              {!loadingPendingReceipts &&
                closureReceipts.map((voucher) => {
                  const isLocked = !!voucher.invoiced_voucher_id
                  // Mostrar el titular (billing client)
                  const titularName =
                    voucher.billing_client?.name ||
                    clientsById.get(voucher.billing_client_id || '')?.name ||
                    '—'
                  const isAuthorized = !!voucher.is_withdrawal_authorized

                  return (
                    <tr key={voucher.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedReceiptIds.includes(voucher.id)}
                          onChange={() => handleToggleReceipt(voucher.id, isLocked)}
                          disabled={isLocked}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">
                        {voucher.sale_point}-{voucher.number}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {new Date(`${voucher.date}T00:00:00`).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{titularName}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            isAuthorized
                              ? 'border border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300'
                          }`}
                        >
                          {isAuthorized ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                            <AlertTriangle size={12} />
                            Bloqueado (cerrado)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300">
                            <CheckCircle2 size={12} />
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900 dark:text-white font-medium">
                        $
                        {Number(voucher.total).toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Seleccionados: <strong>{selectedReceiptIds.length}</strong></span>
            <span>
              Total selección:{' '}
              <strong>
                $ {selectedReceiptsTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </strong>
            </span>
            <span>
              Pendientes visibles:{' '}
              <strong>{closureReceipts.filter((voucher) => !voucher.invoiced_voucher_id).length}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handlePreview(false)}
            disabled={selectedReceiptIds.length === 0}
            data-tour-current-account-preview
          >
            Vista previa
          </Button>
          <Button
            variant="outline"
            onClick={() => handleCloseCurrentAccount(false)}
            isLoading={closeCurrentAccountMutation.isPending}
            disabled={selectedReceiptIds.length === 0}
          >
            Cerrar seleccionados ({selectedReceiptIds.length})
          </Button>
          <Button
            onClick={() => handlePreview(true)}
          >
            Vista previa total
          </Button>
          <Button
            onClick={() => handleCloseCurrentAccount(true)}
            isLoading={closeCurrentAccountMutation.isPending}
            data-tour-current-account-close-all
          >
            Cerrar toda la cuenta
          </Button>
        </div>

        {/* Sección histórico de cierres */}
        {closureBillingClientId && (
          <div className="mt-4">
            <button
              onClick={() => setShowHistorySection(!showHistorySection)}
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              {showHistorySection ? 'Ocultar' : 'Ver'} histórico de cierres
            </button>
          </div>
        )}

        {showHistorySection && historyQuery.data && (
          <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Histórico de cierres
            </h3>
            {historyQuery.data.closures.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay cierres históricos</p>
            ) : (
              <div className="space-y-2">
                {historyQuery.data.closures.map((closure) => (
                  <div
                    key={closure.closure_voucher_id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded"
                  >
                    <div>
                      <span className="font-medium">{closure.closure_number}</span>
                      <span className="ml-2 text-gray-500 text-sm">
                        {new Date(closure.closure_date).toLocaleDateString('es-AR')} ·{' '}
                        {closure.total_receipts} remito(s) · ${' '}
                        {closure.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
</div>
        )}
      </div>

      <Modal
        isOpen={!!editingAuth}
        onClose={() => setEditingAuth(null)}
        title="Editar autorización"
        size="md"
      >
        {editingAuth && (
          <EditAuthorizationForm
            auth={editingAuth}
            onCancel={() => setEditingAuth(null)}
            onSave={(payload) =>
              updateAuthorizationMutation.mutate({
                id: editingAuth.id,
                ...payload,
              })
            }
            isSaving={updateAuthorizationMutation.isPending}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!authToDelete}
        onClose={() => setAuthToDelete(null)}
        onConfirm={() => authToDelete && deleteAuthorizationMutation.mutate(authToDelete.id)}
        title="¿Eliminar autorización?"
        description="Esta acción deshabilita el vínculo titular/subcliente para nuevos retiros."
        confirmText="Eliminar"
        isLoading={deleteAuthorizationMutation.isPending}
      />
    </div>
  )
}

function EditAuthorizationForm({
  auth,
  onCancel,
  onSave,
  isSaving,
}: {
  auth: ClientAuthorization
  onCancel: () => void
  onSave: (payload: {
    operating_credit_limit?: number | null
    is_active: boolean
    notes?: string
  }) => void
  isSaving: boolean
}) {
  const [limit, setLimit] = useState(
    auth.operating_credit_limit != null ? String(auth.operating_credit_limit) : ''
  )
  const [isActive, setIsActive] = useState(auth.is_active)
  const [notes, setNotes] = useState(auth.notes || '')

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Sublímite
        </label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Vacío = sin sublímite"
        />
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        Autorización activa
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas" />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} type="button">
          Cancelar
        </Button>
        <Button
          onClick={() =>
            onSave({
              operating_credit_limit: limit ? Number(limit) : null,
              is_active: isActive,
              notes: notes.trim() || undefined,
            })
          }
          isLoading={isSaving}
          type="button"
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
