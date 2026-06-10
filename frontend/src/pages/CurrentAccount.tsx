import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Filter,
  HelpCircle,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate, useSearchParams } from 'react-router-dom'

import clientsService from '../api/clientsService'
import clientTypesService from '../api/clientTypesService'
import clientAuthorizationsService, {
  ClientAuthorization,
} from '../api/clientAuthorizationsService'
import vouchersService, { Voucher } from '../api/vouchersService'
import ccDraftsService, { CCDraft } from '../api/ccDraftsService'
import { Button, ConfirmModal, Input, Modal } from '../components/ui'
import {
  TitularesList,
  RemitosTable,
  RemitosResumen,
  RemitosHistorial,
  ActionBar,
  ClosureGuide,
  VouchersSelectionModal,
  type VoucherItemOverride,
  type AppliedPriceList,
} from '../components/current-account'
import { formatErrorMessage } from '../utils/errorHelpers'

const CURRENT_ACCOUNT_MODES = [
  { value: 'disabled', label: 'Deshabilitada' },
  { value: 'limited', label: 'Con límite' },
  { value: 'unlimited', label: 'Sin límite' },
] as const

type WorkspaceTab = 'remitos' | 'resumen' | 'historial'
type PageTab = 'closure' | 'authorizations'

export default function CurrentAccount() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialBillingClientId = searchParams.get('billing_client_id') || ''
  const initialReceiptId = searchParams.get('receipt_id') || ''
  const initialReceiptStatus = searchParams.get('receipt_status')
  const initialReceiptStatusFilter: 'pending' | 'closed' | 'all' =
    initialReceiptStatus === 'closed' || initialReceiptStatus === 'all'
      ? initialReceiptStatus
      : 'pending'

  // ── Auth form state ───────────────────────────────────────────────────────
  const [billingClientId, setBillingClientId] = useState('')
  const [operatingClientId, setOperatingClientId] = useState('')
  const [operatingCreditLimit, setOperatingCreditLimit] = useState('')
  const [notes, setNotes] = useState('')
  const [editingAuth, setEditingAuth] = useState<ClientAuthorization | null>(null)
  const [authToDelete, setAuthToDelete] = useState<ClientAuthorization | null>(null)
  const [showDisabledBillingClients, setShowDisabledBillingClients] = useState(false)

  // ── Legacy closure state (kept for backwards compat with URL params) ───────
  const [closureBillingClientId, setClosureBillingClientId] = useState(initialBillingClientId)
  const [closureNotes] = useState('')
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>(
    initialReceiptId ? [initialReceiptId] : []
  )
  const [receiptStatusFilter] = useState<'pending' | 'closed' | 'all'>(initialReceiptStatusFilter)
  const [receiptSearch] = useState('')

  // ── Workspace state ───────────────────────────────────────────────────────
  const [selectedTitularId, setSelectedTitularId] = useState<string | null>(
    initialBillingClientId || null
  )
  const [workspaceSelectedIds, setWorkspaceSelectedIds] = useState<Set<string>>(
    initialReceiptId ? new Set([initialReceiptId]) : new Set()
  )
  const [itemQuantityOverrides, setItemQuantityOverrides] = useState<Map<string, number>>(
    new Map()
  )
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('remitos')
  const [pageTab, setPageTab] = useState<PageTab>('closure')
  const [remitosPage, setRemitosPage] = useState(1)
  const [workspaceClosureNotes, setWorkspaceClosureNotes] = useState('')
  const [showSelectionModal, setShowSelectionModal] = useState(false)
  const [workspaceSpecialListItems, setWorkspaceSpecialListItems] = useState<string[]>([])
  const [workspaceAppliedLists, setWorkspaceAppliedLists] = useState<Map<string, AppliedPriceList>>(new Map())
  const [draftBanner, setDraftBanner] = useState<'hidden' | 'visible'>('hidden')
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [existingDraft, setExistingDraft] = useState<CCDraft | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
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

  const { data: fallbackReceiptsData, isLoading: loadingFallbackReceipts } = useQuery({
    queryKey: [
      'current-account-receipts-fallback',
      closureBillingClientId,
      receiptStatusFilter,
      receiptSearch.trim(),
    ],
    queryFn: () =>
      vouchersService.getAll({
        page: 1,
        per_page: 100,
        voucher_type: 'receipt',
        search: receiptSearch.trim() || undefined,
      }),
    enabled: !!closureBillingClientId,
    retry: false,
  })

  const { data: workspaceReceiptsData } = useQuery({
    queryKey: ['current-account-receipts', selectedTitularId, remitosPage, 15],
    queryFn: () =>
      vouchersService.getCurrentAccountReceipts({
        billing_client_id: selectedTitularId!,
        page: remitosPage,
        per_page: 15,
        pending_only: true,
      }),
    enabled: !!selectedTitularId,
    staleTime: 15_000,
  })

  const workspacePageVouchers: Voucher[] = workspaceReceiptsData?.items ?? []

  const workspaceSelectedReceipts = useMemo(
    () => workspacePageVouchers.filter((v) => workspaceSelectedIds.has(v.id)),
    [workspacePageVouchers, workspaceSelectedIds]
  )

  const workspaceSelectedTotal = useMemo(
    () => workspaceSelectedReceipts.reduce((acc, v) => acc + Number(v.total ?? 0), 0),
    [workspaceSelectedReceipts]
  )

  // ── Derived values ────────────────────────────────────────────────────────
  const clients = clientsData?.items || []
  const clientTypes = clientTypesData || []
  const authorizations = authorizationsData?.items || []
  const currentAccountReceipts = currentAccountReceiptsData?.items || []

  const fallbackCurrentAccountReceipts = useMemo(() => {
    if (!closureBillingClientId || currentAccountReceipts.length > 0) return []
    return (fallbackReceiptsData?.items || []).filter((voucher) => {
      const belongsToSelectedClient =
        voucher.billing_client_id === closureBillingClientId ||
        (!voucher.billing_client_id && voucher.client_id === closureBillingClientId)
      const isCurrentAccountReceipt =
        voucher.voucher_type === 'receipt' &&
        !voucher.is_current_account_closure &&
        (voucher.is_current_account || !!voucher.billing_client_id)
      const matchesStatus =
        receiptStatusFilter === 'all' ||
        (receiptStatusFilter === 'pending'
          ? !voucher.invoiced_voucher_id
          : !!voucher.invoiced_voucher_id)
      return belongsToSelectedClient && isCurrentAccountReceipt && matchesStatus
    })
  }, [
    closureBillingClientId,
    currentAccountReceipts.length,
    fallbackReceiptsData?.items,
    receiptStatusFilter,
  ])

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  )

  const enabledBillingClients = useMemo(
    () => clients.filter((c) => (c.current_account_mode || 'disabled') !== 'disabled'),
    [clients]
  )

  const disabledBillingClients = useMemo(
    () => clients.filter((c) => (c.current_account_mode || 'disabled') === 'disabled'),
    [clients]
  )

  const billingClients = useMemo(
    () => (showDisabledBillingClients ? clients : enabledBillingClients),
    [clients, enabledBillingClients, showDisabledBillingClients]
  )

  const hasOnlyDisabledBillingClients =
    enabledBillingClients.length === 0 && disabledBillingClients.length > 0

  // Suppress unused variable warnings for legacy state still needed by queries/effects
  void currentAccountReceipts
  void fallbackCurrentAccountReceipts
  void loadingPendingReceipts
  void loadingFallbackReceipts
  void selectedReceiptIds
  void closureNotes

  const typeById = useMemo(
    () => new Map(clientTypes.map((item) => [item.id, item])),
    [clientTypes]
  )

  const eligibleOperatingClients = useMemo(
    () =>
      clients.filter((c) => {
        const type = c.client_type_id ? typeById.get(c.client_type_id) : undefined
        return !!type?.is_subclient_eligible
      }),
    [clients, typeById]
  )

  const availableOperatingClients = useMemo(
    () => eligibleOperatingClients.filter((c) => c.id !== billingClientId),
    [eligibleOperatingClients, billingClientId]
  )

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (billingClientId && !billingClients.some((c) => c.id === billingClientId)) {
      setBillingClientId('')
    }
    if (closureBillingClientId && !billingClients.some((c) => c.id === closureBillingClientId)) {
      setClosureBillingClientId('')
      setSelectedReceiptIds([])
    }
  }, [billingClients, billingClientId, closureBillingClientId])

  useEffect(() => {
    if (
      operatingClientId &&
      !availableOperatingClients.some((c) => c.id === operatingClientId)
    ) {
      setOperatingClientId('')
    }
  }, [availableOperatingClients, operatingClientId])

  // ── Auth mutations ────────────────────────────────────────────────────────
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
    onError: (error: unknown) => {
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
    onError: (error: unknown) => {
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
    onError: (error: unknown) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
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

  const handleWorkspaceTitularSelect = (id: string) => {
    setSelectedTitularId(id)
    setWorkspaceSelectedIds(new Set())
    setItemQuantityOverrides(new Map())
    setRemitosPage(1)
    setActiveTab('remitos')
    setWorkspaceAppliedLists(new Map())
    setDraftBanner('hidden')
    setExistingDraft(null)
    ccDraftsService.get(id).then((draft) => {
      if (draft) {
        setExistingDraft(draft)
        setDraftBanner('visible')
      }
    }).catch(() => {})
  }

  const handleWorkspaceToggleReceipt = (id: string) => {
    setWorkspaceSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleWorkspaceToggleAll = (ids: string[]) => {
    const allSelected = ids.every((id) => workspaceSelectedIds.has(id))
    if (!allSelected) {
      setShowSelectionModal(true)
    }
    setWorkspaceSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      }
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  const handleItemQtyChange = (itemId: string, qty: number) => {
    setItemQuantityOverrides((prev) => {
      const next = new Map(prev)
      next.set(itemId, qty)
      return next
    })
  }

  const handleWorkspaceCloseSuccess = () => {
    setWorkspaceSelectedIds(new Set())
    setItemQuantityOverrides(new Map())
    setWorkspaceClosureNotes('')
    setWorkspaceSpecialListItems([])
    setRemitosPage(1)
    if (selectedTitularId) ccDraftsService.delete(selectedTitularId).catch(() => {})
    setWorkspaceAppliedLists(new Map())
    setDraftBanner('hidden')
    setExistingDraft(null)
  }

  const handleSelectionModalConfirm = (
    overrides: Map<string, VoucherItemOverride>,
    appliedLists: Map<string, AppliedPriceList>
  ) => {
    if (overrides.size > 0) {
      setItemQuantityOverrides((prev) => {
        const next = new Map(prev)
        overrides.forEach((override, itemId) => {
          next.set(itemId, override.quantity)
        })
        return next
      })
    }
    setWorkspaceAppliedLists(appliedLists)
    if (workspaceSpecialListItems.length > 0) {
      const listText = workspaceSpecialListItems.map((i) => `• ${i}`).join('\n')
      setWorkspaceClosureNotes((prev) =>
        prev.trim() ? `${prev}\n\nLista especial:\n${listText}` : `Lista especial:\n${listText}`
      )
      setWorkspaceSpecialListItems([])
    }
    setShowSelectionModal(false)
  }

  const handleRestoreDraft = () => {
    if (!existingDraft) return
    if (existingDraft.selected_receipt_ids) {
      setWorkspaceSelectedIds(new Set(existingDraft.selected_receipt_ids))
    }
    if (existingDraft.closure_notes) setWorkspaceClosureNotes(existingDraft.closure_notes)
    if (existingDraft.special_list_items) setWorkspaceSpecialListItems(existingDraft.special_list_items)
    if (existingDraft.item_overrides) {
      const map = new Map<string, number>()
      Object.entries(existingDraft.item_overrides).forEach(([id, v]) => map.set(id, v.quantity))
      setItemQuantityOverrides(map)
    }
    if (existingDraft.applied_price_lists) {
      const map = new Map<string, AppliedPriceList>()
      Object.entries(existingDraft.applied_price_lists).forEach(([vId, v]) => map.set(vId, v))
      setWorkspaceAppliedLists(map)
    }
    setDraftBanner('hidden')
    toast.success('Borrador restaurado')
  }

  const handleDiscardDraft = () => {
    if (selectedTitularId) {
      ccDraftsService.delete(selectedTitularId).catch(() => {})
    }
    setDraftBanner('hidden')
    setExistingDraft(null)
  }

  const handleSaveDraft = async () => {
    if (!selectedTitularId) return
    setIsSavingDraft(true)
    try {
      const overridesObj: Record<string, { quantity: number; unit_price: number; discount_percent: number }> = {}
      itemQuantityOverrides.forEach((qty, id) => {
        overridesObj[id] = { quantity: qty, unit_price: 0, discount_percent: 0 }
      })

      const appliedObj: Record<string, AppliedPriceList> = {}
      workspaceAppliedLists.forEach((val, vId) => {
        appliedObj[vId] = val
      })

      await ccDraftsService.save(selectedTitularId, {
        titular_id: selectedTitularId,
        closure_notes: workspaceClosureNotes || undefined,
        special_list_items: workspaceSpecialListItems.length > 0 ? workspaceSpecialListItems : undefined,
        selected_receipt_ids: Array.from(workspaceSelectedIds),
        item_overrides: Object.keys(overridesObj).length > 0 ? overridesObj : undefined,
        applied_price_lists: Object.keys(appliedObj).length > 0 ? appliedObj : undefined,
      })
      toast.success('Borrador guardado')
    } catch {
      toast.error('Error al guardar el borrador')
    } finally {
      setIsSavingDraft(false)
    }
  }

  // ── KPI summary ───────────────────────────────────────────────────────────
  const topSummary = [
    { label: 'Clientes con Cta Cte habilitada', value: enabledBillingClients.length },
    { label: 'Subclientes elegibles', value: eligibleOperatingClients.length },
    { label: 'Autorizaciones activas', value: authorizations.filter((a) => a.is_active).length },
  ]

  const selectedTitularName = selectedTitularId
    ? (clientsById.get(selectedTitularId)?.name ?? null)
    : null

  return (
    <div className="w-full max-w-none space-y-2">
      {/* ── Page header ── */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/20 dark:to-primary-900/20 px-4 py-3 rounded-lg border border-primary-200 dark:border-primary-800">
        <ClipboardList className="h-5 w-5 text-primary-600 dark:text-primary-400 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-primary-900 dark:text-primary-100 leading-tight">
            Cuenta Corriente
          </h1>
          <p className="text-sm text-primary-700 dark:text-primary-300">
            Gestión de autorizaciones titular/subcliente y cierre de remitos.
          </p>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-3 gap-2">
        {topSummary.map((item) => {
          const isClients = item.label === 'Clientes con Cta Cte habilitada'
          const isSubclients = item.label === 'Subclientes elegibles'
          return (
            <div
              key={item.label}
              className={`rounded-xl border p-3 text-center ${
                isClients
                  ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                  : isSubclients
                    ? 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20'
                    : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">
                {isClients ? 'Cuentas activas' : isSubclients ? 'Subclientes' : 'Autorizaciones'}
              </p>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{item.value}</p>
            </div>
          )
        })}
      </div>

      {/* ── Page-level tabs ── */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg">
        <button
          onClick={() => setPageTab('closure')}
          className={[
            'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer',
            pageTab === 'closure'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
          ].join(' ')}
        >
          <XCircle size={15} />
          Cierre de Cuenta
        </button>
        <button
          onClick={() => setPageTab('authorizations')}
          className={[
            'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer',
            pageTab === 'authorizations'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
          ].join(' ')}
        >
          <ShieldCheck size={15} />
          Autorizaciones
          {authorizations.filter((a) => a.is_active).length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-[10px] font-bold w-4 h-4">
              {authorizations.filter((a) => a.is_active).length}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════
          TAB: Cierre de Cuenta
          ══════════════════════════════════════════════ */}
      {pageTab === 'closure' && (
        <div className="space-y-2">
          {/* Guide — always visible */}
          <div className="rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-100 dark:border-primary-800/60 flex items-center gap-2">
              <HelpCircle size={14} className="text-primary-500 shrink-0" />
              <p className="text-sm font-semibold text-primary-800 dark:text-primary-200">
                Pasos para cerrar la cuenta
              </p>
            </div>
            <div className="p-3">
              <ClosureGuide
                hasSelectedTitular={!!selectedTitularId}
                hasSelectedReceipts={workspaceSelectedIds.size > 0}
                alwaysOpen
              />
            </div>
          </div>

          {/* Workspace */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="flex flex-col lg:flex-row h-[620px] lg:h-[680px]">
              {/* Mobile: select */}
              <div className="lg:hidden p-2 border-b border-gray-200 dark:border-gray-700">
                <select
                  value={selectedTitularId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value
                    if (id) handleWorkspaceTitularSelect(id)
                    else setSelectedTitularId(null)
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Seleccioná un titular...</option>
                  {enabledBillingClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Desktop: sidebar */}
              <div className="hidden lg:flex flex-col w-60 shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/70 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Titulares
                  </p>
                </div>
                <div className="flex-1 overflow-hidden">
                  <TitularesList
                    selectedId={selectedTitularId}
                    onSelect={handleWorkspaceTitularSelect}
                  />
                </div>
              </div>

              {/* Right panel */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/70 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {selectedTitularName ?? (
                      <span className="text-gray-400 dark:text-gray-500 italic">
                        Seleccioná un titular...
                      </span>
                    )}
                  </p>
                </div>

                {/* Draft banner */}
                {draftBanner === 'visible' && (
                  <div className="mx-3 mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm">
                    <span className="text-amber-700 dark:text-amber-300 flex-1">
                      Hay un borrador guardado para este titular. ¿Querés continuar donde lo dejaste?
                    </span>
                    <Button size="sm" variant="outline" onClick={handleRestoreDraft}>Continuar</Button>
                    <button onClick={handleDiscardDraft} className="text-xs text-amber-500 hover:text-amber-700 cursor-pointer">Descartar</button>
                  </div>
                )}

                {selectedTitularId ? (
                  <>
                    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      {(['remitos', 'resumen', 'historial'] as WorkspaceTab[]).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={[
                            'px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer',
                            activeTab === tab
                              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                          ].join(' ')}
                        >
                          {tab === 'remitos' ? 'Remitos' : tab === 'resumen' ? 'Resumen' : 'Historial'}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                      {activeTab === 'remitos' && (
                        <RemitosTable
                          titularId={selectedTitularId}
                          selectedIds={workspaceSelectedIds}
                          itemQuantityOverrides={itemQuantityOverrides}
                          page={remitosPage}
                          onPageChange={setRemitosPage}
                          onToggleReceipt={handleWorkspaceToggleReceipt}
                          onToggleAll={handleWorkspaceToggleAll}
                          onItemQtyChange={handleItemQtyChange}
                        />
                      )}

                      {activeTab === 'resumen' && (
                        <RemitosResumen
                          selectedReceipts={workspaceSelectedReceipts}
                          itemQuantityOverrides={itemQuantityOverrides}
                        />
                      )}

                      {activeTab === 'historial' && (
                        <RemitosHistorial titularId={selectedTitularId} />
                      )}
                    </div>

                    <ActionBar
                      selectedCount={workspaceSelectedIds.size}
                      selectedTotal={workspaceSelectedTotal}
                      titularId={selectedTitularId}
                      closureNotes={workspaceClosureNotes}
                      onNotesChange={setWorkspaceClosureNotes}
                      itemQuantityOverrides={itemQuantityOverrides}
                      selectedReceiptIds={workspaceSelectedIds}
                      onCloseSuccess={handleWorkspaceCloseSuccess}
                      onOpenPreview={() => setShowSelectionModal(true)}
                      onSaveDraft={selectedTitularId ? handleSaveDraft : undefined}
                      isSavingDraft={isSavingDraft}
                    />
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
                    <ClipboardList size={36} className="opacity-20" />
                    <p className="text-sm">Seleccioná un titular para comenzar</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB: Autorizaciones
          ══════════════════════════════════════════════ */}
      {pageTab === 'authorizations' && (
        <div className="space-y-2">
          {/* Nueva autorización */}
          <div
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3"
            data-tour-current-account-auth-section
          >
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
              <Plus size={16} className="text-primary-600" />
              Nueva autorización de retiro
            </div>

            {clients.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                No hay clientes cargados todavía.
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => navigate('/clients')}>
                    Ir a Clientes
                  </Button>
                </div>
              </div>
            )}

            {hasOnlyDisabledBillingClients && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                No hay clientes con Cuenta Corriente habilitada.
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate('/clients')}>
                    Habilitar CC en Clientes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDisabledBillingClients(true)}
                  >
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
              Mostrar también clientes con CC deshabilitada
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  <option value="">
                    {billingClients.length > 0 ? 'Seleccionar titular...' : 'Sin titulares disponibles'}
                  </option>
                  {billingClients.map((client) => {
                    const mode = client.current_account_mode || 'disabled'
                    const modeLabel =
                      CURRENT_ACCOUNT_MODES.find((item) => item.value === mode)?.label || mode
                    return (
                      <option key={client.id} value={client.id}>
                        {client.name} · {modeLabel}
                      </option>
                    )
                  })}
                </select>
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

            <div className="flex justify-end" data-tour-current-account-create-auth-section>
              <Button
                onClick={handleCreateAuthorization}
                isLoading={createAuthorizationMutation.isPending}
                data-tour-current-account-create-auth
              >
                Guardar autorización
              </Button>
            </div>
          </div>

          {/* Clientes con CC */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold mb-3">
              <Filter size={16} className="text-primary-600" />
              Clientes con Cuenta Corriente
            </div>

            <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/70">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                      Cliente
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                      Modo CC
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                      Límite
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                      Saldo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clientsError && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-red-600 dark:text-red-400">
                        {formatErrorMessage(clientsError)}
                      </td>
                    </tr>
                  )}
                  {enabledBillingClients.map((client) => {
                    const mode = client.current_account_mode || 'disabled'
                    const modeLabel =
                      CURRENT_ACCOUNT_MODES.find((item) => item.value === mode)?.label || mode
                    const hasDebt = Number(client.current_balance || 0) > 0
                    return (
                      <tr key={client.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                          {client.name}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{modeLabel}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-700 dark:text-gray-300">
                          {client.credit_limit != null
                            ? `$${Number(client.credit_limit).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
                            : '—'}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono text-xs font-semibold ${
                            hasDebt ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          ${Number(client.current_balance || 0).toLocaleString('es-AR', {
                            minimumFractionDigits: 0,
                          })}
                        </td>
                      </tr>
                    )
                  })}
                  {!clientsError && enabledBillingClients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                        No hay titulares con CC habilitada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Autorizaciones */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold mb-3">
              <ShieldCheck size={16} className="text-primary-600" />
              Autorizaciones activas e históricas
            </div>

            {(loadingClients || loadingAuthorizations) && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>
            )}

            {!loadingClients && !loadingAuthorizations && (
              <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/70">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                        Titular
                      </th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                        Subcliente
                      </th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                        Sublímite
                      </th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                        Estado
                      </th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {authorizations.map((auth) => {
                      const billing = clientsById.get(auth.billing_client_id)
                      const operating = clientsById.get(auth.operating_client_id)
                      return (
                        <tr key={auth.id} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                            {billing?.name || '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                            {operating?.name || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                            {auth.operating_credit_limit != null
                              ? `$${Number(auth.operating_credit_limit).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                auth.is_active
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                              }`}
                            >
                              {auth.is_active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingAuth(auth)}
                              >
                                Editar
                              </Button>
                              <button
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                                onClick={() => setAuthToDelete(auth)}
                                title="Eliminar autorización"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {authorizations.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-gray-500 dark:text-gray-400"
                        >
                          No hay autorizaciones registradas todavía.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Selection preview modal ── */}
      <VouchersSelectionModal
        isOpen={showSelectionModal}
        onClose={() => setShowSelectionModal(false)}
        selectedReceipts={workspaceSelectedReceipts}
        closureNotes={workspaceClosureNotes}
        onNotesChange={setWorkspaceClosureNotes}
        specialListItems={workspaceSpecialListItems}
        onSpecialListChange={setWorkspaceSpecialListItems}
        initialAppliedLists={workspaceAppliedLists}
        onConfirm={handleSelectionModalConfirm}
      />

      {/* ── Modals ── */}
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notas
        </label>
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
