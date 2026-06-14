/**
 * Página de Comprobantes.
 * Visualiza cotizaciones, remitos y facturas generadas.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { FileText, Truck, Receipt, Search, Eye, Download, Trash2, AlertTriangle, RotateCcw, FileMinus, ExternalLink, Pencil, Menu, Info, CircleDollarSign, CalendarDays, X, ClipboardList } from 'lucide-react'
import gsap from 'gsap'
import { Button, Table, Pagination, Select, Modal, Input, ResponsiveTable } from '../components/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import vouchersService, { type DeleteVoucherResponse, type LegacyPaymentMethod, type Voucher, type VoucherPayment, type PriceStrategy } from '../api/vouchersService'
import arcaService from '../api/arcaService'
import businessService from '../api/businessService'
import clientsService from '../api/clientsService'
import { usePaymentMethods } from '../hooks/usePaymentMethods'
import CreditNoteModal from '../components/vouchers/CreditNoteModal'
import WhatsAppSendModal, { type PdfSpec } from '../components/messaging/WhatsAppSendModal'
import WhatsAppSendPdfButton from '../components/messaging/WhatsAppSendPdfButton'
import WhatsAppIcon from '../components/messaging/WhatsAppIcon'
import toast from 'react-hot-toast'
import { formatErrorMessage } from '../utils/errorHelpers'
import { useAuthStore } from '../stores/authStore'
import { hasModuleAccess } from '../utils/acl'
import ClientSelectorModal, { type ClientSelectorClient } from '../components/shared/ClientSelectorModal'

type VoucherListItem = Voucher

const getCurrentAccountClosureLockInfo = (voucher: VoucherListItem): { isLocked: boolean; reason: string } => {
  const isClosureVoucher = !!voucher.is_current_account_closure
  const isLinkedReceiptByBackendFlag = !!voucher.is_receipt_linked_to_current_account_closure
  const isLinkedReceiptByClosureId = !!voucher.current_account_closure_voucher_id
  const isLinkedReceiptByLegacyHeuristic =
    voucher.voucher_type === 'receipt' && voucher.is_current_account === true && !!voucher.invoiced_voucher_id

  const isLocked =
    isClosureVoucher ||
    isLinkedReceiptByBackendFlag ||
    isLinkedReceiptByClosureId ||
    isLinkedReceiptByLegacyHeuristic

  if (!isLocked) {
    return { isLocked: false, reason: '' }
  }

  if (isClosureVoucher) {
    return {
      isLocked: true,
      reason: 'Bloqueado: comprobante de cierre de Cuenta Corriente',
    }
  }

  return {
    isLocked: true,
    reason: 'Bloqueado: remito incluido en un cierre de Cuenta Corriente',
  }
}

const voucherTypeLabels: Record<string, { label: string; textClass: string; icon: any }> = {
  quotation:      { label: 'Cotización',      textClass: 'text-primary-600 dark:text-primary-400',   icon: FileText  },
  receipt:        { label: 'Remito',           textClass: 'text-orange-600 dark:text-orange-400', icon: Truck     },
  invoice_a:      { label: 'Factura A',        textClass: 'text-green-600 dark:text-green-400',  icon: Receipt   },
  invoice_b:      { label: 'Factura B',        textClass: 'text-green-600 dark:text-green-400',  icon: Receipt   },
  invoice_c:      { label: 'Factura C',        textClass: 'text-green-600 dark:text-green-400',  icon: Receipt   },
  credit_note_a:  { label: 'Nota de Crédito A', textClass: 'text-red-600 dark:text-red-400',  icon: FileMinus },
  credit_note_b:  { label: 'Nota de Crédito B', textClass: 'text-red-600 dark:text-red-400',  icon: FileMinus },
  credit_note_c:  { label: 'Nota de Crédito C', textClass: 'text-red-600 dark:text-red-400',  icon: FileMinus },
  debit_note_a:   { label: 'Nota de Débito A',  textClass: 'text-primary-600 dark:text-primary-400', icon: FileMinus },
  debit_note_b:   { label: 'Nota de Débito B',  textClass: 'text-primary-600 dark:text-primary-400', icon: FileMinus },
  debit_note_c:   { label: 'Nota de Débito C',  textClass: 'text-primary-600 dark:text-primary-400', icon: FileMinus },
  invoice_x:      { label: 'Comprobante X',      textClass: 'text-violet-600 dark:text-violet-400', icon: Receipt },
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
  confirmed: { label: 'Confirmado', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  issued: { label: 'Emitido', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Anulado', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

const isInvoiceVoucher = (voucher: VoucherListItem): boolean => voucher.voucher_type?.startsWith('invoice_')

const isCurrentAccountReceipt = (voucher: VoucherListItem): boolean =>
  voucher.voucher_type === 'receipt' &&
  !voucher.is_current_account_closure &&
  (voucher.is_current_account === true || !!voucher.billing_client_id)

const isCurrentAccountClosureVoucher = (voucher: VoucherListItem): boolean =>
  voucher.voucher_type === 'quotation' && !!voucher.is_current_account_closure

const getVoucherTypeInfo = (voucher: VoucherListItem) => {
  if (isCurrentAccountClosureVoucher(voucher)) {
    return {
      label: 'Resumen Cta Cte',
      textClass: 'text-violet-600 dark:text-violet-400',
      icon: ClipboardList,
    }
  }

  return voucherTypeLabels[voucher.voucher_type] || {
    label: voucher.voucher_type,
    textClass: 'text-gray-600 dark:text-gray-400',
    icon: FileText,
  }
}

const parseLocalDate = (value?: string | null): Date | null => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const formatLocalDate = (date: Date): string => date.toLocaleDateString('es-AR')

const getCurrentAccountInvoiceInfo = (voucher: VoucherListItem) => {
  if (!isInvoiceVoucher(voucher) || !voucher.is_current_account) return null

  const baseDate = parseLocalDate(voucher.date)
  const days = Number(voucher.payment_days || 0)
  if (!baseDate || !days) return null

  const dueDate = new Date(baseDate)
  dueDate.setDate(dueDate.getDate() + days)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  dueDate.setHours(0, 0, 0, 0)

  const isPaid = Boolean(voucher.is_paid)
  const isOverdue = !isPaid && dueDate < today

  if (isPaid) {
    return {
      isPaid,
      isOverdue,
      label: `Cta Cte pagada ${voucher.payment_date ? formatLocalDate(parseLocalDate(voucher.payment_date) || dueDate) : ''}`.trim(),
      className: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700',
    }
  }

  return {
    isPaid,
    isOverdue,
    label: isOverdue ? `Cta Cte vencida ${formatLocalDate(dueDate)}` : `Cta Cte vence ${formatLocalDate(dueDate)}`,
    className: isOverdue
      ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'
      : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
  }
}

const mapCatalogPaymentMethodToLegacy = (method: any): LegacyPaymentMethod => {
  const raw = `${method?.code || ''} ${method?.name || ''}`.toLowerCase()
  if (raw.includes('efectivo') || raw.includes('cash')) return 'cash'
  if (raw.includes('transfer')) return 'transfer'
  if (raw.includes('cheque') || raw.includes('check')) return 'check'
  if (raw.includes('mercadopago') || raw.includes('mercado pago') || raw.includes('mp')) return 'mercadopago'
  if (raw.includes('débito') || raw.includes('debito') || raw.includes('debit')) return 'debit_card'
  if (raw.includes('crédito') || raw.includes('credito') || raw.includes('credit')) return 'credit_card'
  if (raw.includes('tarjeta') || raw.includes('card')) return 'credit_card'
  return 'other'
}

const priceStrategyOptions: Array<{ value: PriceStrategy; label: string; help: string }> = [
  {
    value: 'historical',
    label: 'Mantener precios originales',
    help: 'Usa unit_price + IVA del comprobante base.',
  },
  {
    value: 'current',
    label: 'Actualizar a precios vigentes',
    help: 'Usa el precio vigente final del producto.',
  },
]

export default function Vouchers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const { data: business } = useQuery({
    queryKey: ['business-me-vouchers'],
    queryFn: () => businessService.getMyBusiness(),
    staleTime: 60_000,
  })
  const invoicingEnabled = business?.invoicing_enabled ?? true
  const receiptsEnabled = business?.receipts_enabled ?? true
  const whatsappEnabled = business?.whatsapp_enabled ?? true
  const currentAccountEnabled =
    (business?.current_account_mode ?? 'disabled') !== 'disabled' &&
    hasModuleAccess(user, 'current_account')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('')
  const [filterCurrentAccount, setFilterCurrentAccount] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [voucherToDelete, setVoucherToDelete] = useState<VoucherListItem | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteReasonError, setDeleteReasonError] = useState('')
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false)
  const [selectedVoucherForNC, setSelectedVoucherForNC] = useState<any>(null)
  const [selectedQuotationIds, setSelectedQuotationIds] = useState<string[]>([])
  const [bulkWhatsAppOpen, setBulkWhatsAppOpen] = useState(false)
  const [showCompileModal, setShowCompileModal] = useState(false)
  const [compileSelectedPaymentMethodId, setCompileSelectedPaymentMethodId] = useState<string | null>(null)
  const [compilePaymentReferences, setCompilePaymentReferences] = useState<Record<string, string>>({})
  const [compileGeneralDiscount, setCompileGeneralDiscount] = useState<string>('0')
  const [compilePaymentError, setCompilePaymentError] = useState<string>('')
  const [compileFiscalClientId, setCompileFiscalClientId] = useState<string>('')
  const [compileSelectedFiscalClient, setCompileSelectedFiscalClient] = useState<ClientSelectorClient | null>(null)
  const [compilePriceStrategy, setCompilePriceStrategy] = useState<PriceStrategy>('historical')
  const [compilePreviewTotals, setCompilePreviewTotals] = useState<{
    subtotal: number
    iva_amount: number
    total: number
    discount_amount: number
  } | null>(null)
  const [_compilePreviewLoading, _setCompilePreviewLoading] = useState(false)
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const [openSubrowDetailsId, setOpenSubrowDetailsId] = useState<string | null>(null)
  const [voucherToPay, setVoucherToPay] = useState<VoucherListItem | null>(null)
  const [payPaymentMethodId, setPayPaymentMethodId] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payReference, setPayReference] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState('')
  const [compilePayInCurrentAccount, setCompilePayInCurrentAccount] = useState(false)
  const [compileCurrentAccountDays, setCompileCurrentAccountDays] = useState(30)
  const [showFiscalClientModal, setShowFiscalClientModal] = useState(false)
  const hasActiveFilters = Boolean(
    search ||
    filterType ||
    filterStatus ||
    filterPaymentMethod ||
    filterCurrentAccount ||
    filterDateFrom ||
    filterDateTo,
  )

  const resetFilters = () => {
    setSearch('')
    setFilterType('')
    setFilterStatus('')
    setFilterPaymentMethod('')
    setFilterCurrentAccount('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setPage(1)
  }
  
  // Refs para animaciones GSAP
  const expandedChildRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevExpandedRef = useRef<string | null>(null)

  // Función helper para animación de botones
  const animateButton = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    gsap.to(btn, { scale: 0.88, duration: 0.06, ease: 'power2.in', onComplete: () => {
      gsap.to(btn, { scale: 1, duration: 0.12, ease: 'elastic.out(1, 0.5)' })
    }})
  }

  // Efecto para animaciones de expandir/colapsar
  useEffect(() => {
    if (!currentAccountEnabled && filterCurrentAccount) {
      setFilterCurrentAccount('')
      setPage(1)
    }

    if (!currentAccountEnabled && compilePayInCurrentAccount) {
      setCompilePayInCurrentAccount(false)
    }
  }, [currentAccountEnabled, filterCurrentAccount, compilePayInCurrentAccount])

  useEffect(() => {
    const current = expandedInvoiceId
    const previous = prevExpandedRef.current
    
    if (current !== previous && current) {
      prevExpandedRef.current = current
      // Animation simple: fade in + slide down cuando se expande
      setTimeout(() => {
        const row = expandedChildRefs.current.get(current)
        if (row) {
          gsap.fromTo(row, 
            { opacity: 0, maxHeight: 0 },
            { opacity: 1, maxHeight: 500, duration: 0.3, ease: 'power2.out' }
          )
        }
      }, 10)
    }
  }, [expandedInvoiceId])

  // Query para comprobantes
  const { data: vouchersData, isLoading, error } = useQuery({
    queryKey: ['vouchers', page, search, filterType, filterStatus, filterPaymentMethod, filterCurrentAccount, filterDateFrom, filterDateTo],
    queryFn: () => vouchersService.getAll({ 
      page, 
      per_page: 20, 
      search,
      voucher_type: filterType || undefined,
      status: filterStatus || undefined,
      payment_method_id: filterPaymentMethod || undefined,
      is_current_account: filterCurrentAccount === 'current_account' || filterCurrentAccount === 'current_account_overdue' ? true : undefined,
      current_account_status: filterCurrentAccount === 'current_account_overdue' ? 'overdue' : undefined,
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
    }),
    retry: false,
  })

  // Fetch preview totals when modal is open or strategy/discount changes
  useEffect(() => {
    if (!showCompileModal || selectedQuotationIds.length === 0) {
      setCompilePreviewTotals(null)
      return
    }

    const fetchPreview = async () => {
      _setCompilePreviewLoading(true)
      try {
        const preview = await vouchersService.previewCompile(
          selectedQuotationIds,
          Number(compileGeneralDiscount) || 0,
          compilePriceStrategy,
          compileFiscalClientId || undefined,
        )
        setCompilePreviewTotals({
          subtotal: preview.subtotal,
          iva_amount: preview.iva_amount,
          total: preview.total,
          discount_amount: preview.discount_amount,
        })
        setCompilePaymentError('')
      } catch {
        // Fallback: use local calculation if preview fails
        const vouchers = (vouchersData?.items || []).filter((v) =>
          selectedQuotationIds.includes(v.id),
        )
        const subtotal = vouchers.reduce((sum, v) => sum + Number(v.total), 0)
        setCompilePreviewTotals({
          subtotal,
          iva_amount: 0,
          total: subtotal,
          discount_amount: 0,
        })
      } finally {
        _setCompilePreviewLoading(false)
      }
    }

    fetchPreview()
  }, [showCompileModal, selectedQuotationIds, compilePriceStrategy, compileGeneralDiscount, compileFiscalClientId, vouchersData])

  const {
    data: clientsData,
    isLoading: isClientsLoading,
    isError: isClientsError,
  } = useQuery({
    queryKey: ['clients-for-voucher-compile'],
    queryFn: () => clientsService.getAll({ per_page: 200 }),
    retry: false,
  })

  // Los comprobantes de acopio (remitos hijos y remitos principales) se muestran
  // exclusivamente en el módulo Acopios, no en Comprobantes generales.
  const vouchers = (vouchersData?.items || []).filter(
    (voucher) => !voucher.stockpile_id && !voucher.is_stockpile_principal_receipt,
  )
  const allClients = Array.isArray(clientsData?.items) ? clientsData.items : []
  const paymentMethods = usePaymentMethods(false).data || []

  // Build compile client options (fiscal client selector)
  const compileClientOptions = useMemo(() => {
    const options = new Map<string, { id: string; name: string; document_number: string; document_type: string; tax_condition: string }>()
    allClients.forEach((client: any) => {
      if (client?.id) {
        options.set(client.id, client)
      }
    })
    const selectedVouchers = (vouchersData?.items || []).filter(
      (v) => selectedQuotationIds.includes(v.id),
    )
    selectedVouchers.forEach((voucher: any) => {
      const fallbackClientId = voucher.client?.id || voucher.client_id
      if (fallbackClientId) {
        options.set(fallbackClientId, {
          id: fallbackClientId,
          name: voucher.client?.name || `Cliente #${(voucher.client_id || '').substring(0, 8)}...`,
          document_number: voucher.client?.document_number || '',
          document_type: voucher.client?.document_type || '',
          tax_condition: voucher.client?.tax_condition || '',
        })
      }
    })
    return Array.from(options.values())
  }, [allClients, vouchersData?.items, selectedQuotationIds])

  const selectedFiscalClient = compileSelectedFiscalClient || compileClientOptions.find(
    (client) => client.id === compileFiscalClientId,
  )
  const sourceParentInvoiceIds = new Set(
    vouchers
      .filter(
        (v) =>
          (v.voucher_type === 'quotation' || v.voucher_type === 'receipt') &&
          !!v.invoiced_voucher_id,
      )
      .map((v) => v.invoiced_voucher_id as string),
  )
  const isCompiledInvoice = (voucher: VoucherListItem) => {
    if (!voucher.voucher_type?.startsWith('invoice_')) return false
    if (sourceParentInvoiceIds.has(voucher.id)) return true
    const notes = (voucher.notes || '').toLowerCase()
    return (
      notes.includes('facturado desde comprobantes') ||
      notes.includes('facturado desde cotizaciones') ||
      notes.includes('facturado desde remito') ||
      notes.includes('facturado desde remitos')
    )
  }

  const isCompiledSourceVoucher = (
    voucher: VoucherListItem,
    parentInvoice?: VoucherListItem,
  ): boolean => {
    const isSourceType =
      voucher.voucher_type === 'quotation' || voucher.voucher_type === 'receipt'

    if (!isSourceType || !voucher.invoiced_voucher_id) return false

    if (!parentInvoice) return true

    return (
      voucher.invoiced_voucher_id === parentInvoice.id &&
      isCompiledInvoice(parentInvoice)
    )
  }

  const hasCompiledSources = (voucher: VoucherListItem) => {
    return isCompiledInvoice(voucher) || isCurrentAccountClosureVoucher(voucher)
  }

  // Query para cotizaciones origen de una factura expandida
  const { data: sourceQuotations, isFetching: isSourceQuotationsFetching } = useQuery({
    queryKey: ['voucher-source-quotations', expandedInvoiceId],
    queryFn: () =>
      expandedInvoiceId
        ? vouchersService.getSourceQuotations(expandedInvoiceId)
        : Promise.resolve([]),
    enabled: !!expandedInvoiceId,
    retry: false,
  })

  // Mutation para eliminar comprobante
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      vouchersService.delete(id, reason),
    onSuccess: (response: DeleteVoucherResponse) => {
      // Verificar si se requiere autorización
      if (response.authorization_required) {
        queryClient.invalidateQueries({ queryKey: ['pending-authorizations'] })
        toast.success(response.message || 'Solicitud de autorización enviada', { icon: '🔒' })
        setShowDeleteModal(false)
        setVoucherToDelete(null)
        setDeleteReason('')
        setDeleteReasonError('')
      } else {
        queryClient.invalidateQueries({ queryKey: ['vouchers'] })
        toast.success('Comprobante eliminado correctamente', { icon: '✅' })
        setShowDeleteModal(false)
        setVoucherToDelete(null)
        setDeleteReason('')
        setDeleteReasonError('')
      }
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const compileMutation = useMutation({
    mutationFn: ({ quotationIds, payments, general_discount, fiscal_client_id, price_strategy, currentAccount }: { quotationIds: string[]; payments?: VoucherPayment[]; general_discount?: number; fiscal_client_id?: string; price_strategy: PriceStrategy; currentAccount?: { enabled: boolean; paymentDays?: number } }) =>
      vouchersService.compileToInvoice(quotationIds, payments, general_discount, fiscal_client_id, price_strategy, currentAccount),
    onSuccess: async (invoice: any) => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      setShowCompileModal(false)
      setSelectedQuotationIds([])
      setCompileSelectedPaymentMethodId(null)
      setCompilePaymentReferences({})
      setCompileGeneralDiscount('0')
      setCompilePaymentError('')
      setCompileFiscalClientId('')
      setCompileSelectedFiscalClient(null)
      setCompilePriceStrategy('historical')
      setCompilePayInCurrentAccount(false)
      setCompileCurrentAccountDays(30)
      toast.success('Factura generada correctamente', { icon: '✅' })

      if (invoice?.voucher_type?.startsWith('invoice_')) {
        toast.loading('Emitiendo factura electrónica en ARCA/AFIP...', {
          id: 'emitting-compiled-invoice',
        })
        try {
          const emitResponse = await arcaService.emitInvoice({ voucher_id: invoice.id })
          if (emitResponse.success) {
            toast.success(`Factura ARCA emitida\nCAE: ${emitResponse.cae}`, {
              id: 'emitting-compiled-invoice',
              duration: 5000,
              icon: '🎉',
            })
          } else {
            toast.error(`Error ARCA: ${emitResponse.message}`, {
              id: 'emitting-compiled-invoice',
              duration: 7000,
            })
          }
        } catch (emitError: any) {
          toast.error(
            `Error al emitir en ARCA: ${emitError?.response?.data?.detail || emitError?.message || 'Error desconocido'}`,
            { id: 'emitting-compiled-invoice', duration: 7000 },
          )
        }
      }

      // Descargar PDF
      try {
        const pdfBlob = await vouchersService.getPdf(invoice.id)
        const pdfUrl = URL.createObjectURL(pdfBlob)
        window.open(pdfUrl, '_blank')
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
      } catch {
        toast.error('Factura creada pero no se pudo abrir el PDF')
      }
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const payInvoiceMutation = useMutation({
    mutationFn: async ({ voucher, paymentMethodId, paymentDate, reference, notes }: { voucher: VoucherListItem; paymentMethodId: string; paymentDate: string; reference?: string; notes?: string }) => {
      const method = paymentMethods.find((pm: any) => pm.id === paymentMethodId)
      if (!method) {
        throw new Error('Método de pago inválido')
      }

      return vouchersService.payCurrentAccountInvoice(voucher.id, {
        payment_date: paymentDate,
        amount: Number(voucher.total),
        payment_method: mapCatalogPaymentMethodToLegacy(method),
        reference: reference?.trim() || undefined,
        notes: notes?.trim() || undefined,
      })
    },
    onSuccess: async (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      toast.success('Pago registrado y remito de pago generado', { icon: '✅' })
      setVoucherToPay(null)
      setPayPaymentMethodId('')
      setPayReference('')
      setPayNotes('')
      setPayError('')

      try {
        const pdfBlob = await vouchersService.getPaymentReceiptPdf(variables.voucher.id)
        const pdfUrl = URL.createObjectURL(pdfBlob)
        window.open(pdfUrl, '_blank')
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
      } catch (error) {
        toast.error(`Pago registrado, pero no se pudo abrir el remito de pago: ${formatErrorMessage(error)}`)
      }
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const handleConfirmDelete = () => {
    if (!voucherToDelete) {
      return
    }

    const trimmedReason = deleteReason.trim()
    if (!trimmedReason) {
      setDeleteReasonError('El motivo de eliminación es obligatorio.')
      return
    }

    setDeleteReasonError('')
    deleteMutation.mutate({
      id: voucherToDelete.id,
      reason: trimmedReason,
    })
  }

  const handleViewPdf = async (voucherId: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(voucherId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      window.open(pdfUrl, '_blank')
      
      // Limpiar después de 10 segundos
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
    } catch (error) {
      console.error('Error al abrir PDF:', error)
      toast.error(`Error al abrir el PDF: ${formatErrorMessage(error)}`)
    }
  }

  // Mapa de ID → número formateado, construido desde los items cargados
  const voucherNumberMap: Record<string, string> = {}
  if (vouchersData?.items) {
    for (const v of vouchersData.items) {
      voucherNumberMap[v.id] = `${v.sale_point}-${v.number}`
    }
  }

  const handleViewRelatedPdf = async (relatedId: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(relatedId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      window.open(pdfUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
    } catch (error) {
      toast.error(`No se pudo abrir el comprobante relacionado: ${formatErrorMessage(error)}`)
    }
  }

  const handleDownloadPdf = async (voucherId: string, voucherNumber: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(voucherId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `comprobante-${voucherNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Limpiar
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000)
    } catch (error) {
      console.error('Error al descargar PDF:', error)
      toast.error(`Error al descargar el PDF: ${formatErrorMessage(error)}`)
    }
  }

  const handleEditQuotation = (voucher: any) => {
    const isQuotation = voucher.voucher_type === 'quotation'
    const isInvoiced = !!voucher.invoiced_voucher_id
    if (!isQuotation || isInvoiced || voucher.is_current_account_closure) {
      toast.error('Solo podés editar cotizaciones pendientes de facturar')
      return
    }

    if (!voucher.client) {
      toast.error('No se pudo cargar el cliente de la cotización')
      return
    }

    const payload = {
      id: voucher.id,
      voucher_type: 'quotation' as const,
      client: voucher.client,
      date: voucher.date,
      notes: voucher.notes,
      show_prices: voucher.show_prices,
      items: (voucher.items || []).map((item: any) => ({
        id: item.product_id,
        code: item.code,
        description: item.description,
        sale_price: Number(item.unit_price) || 0,
        quantity: Number(item.quantity) || 1,
        discount: Number(item.discount_percent) || 0,
      })),
      general_discount: Number(voucher.general_discount) || 0,
    }

    sessionStorage.setItem('sales-edit-voucher', JSON.stringify(payload))
    navigate('/sales')
  }

  const handleGoToCurrentAccount = (voucher: VoucherListItem) => {
    const billingClientId = voucher.billing_client_id || voucher.client_id

    if (!billingClientId) {
      toast.error('No se pudo identificar el titular de la Cuenta Corriente')
      return
    }

    const params = new URLSearchParams({
      billing_client_id: billingClientId,
      receipt_id: voucher.id,
      receipt_status: voucher.invoiced_voucher_id ? 'closed' : 'pending',
    })

    navigate(`/current-account?${params.toString()}`)
  }

  const getExpandedSourceRows = (invoice: VoucherListItem): VoucherListItem[] => {
    const isExpandedInvoice = hasCompiledSources(invoice) && expandedInvoiceId === invoice.id

    if (!isExpandedInvoice || !sourceQuotations || sourceQuotations.length === 0) {
      return []
    }

    return sourceQuotations.map((sq: any) => {
      const fromTable = vouchers.find((v) => v.id === sq.id)
      if (fromTable) {
        return fromTable
      }

      return ({
        id: sq.id,
        voucher_type: sq.voucher_type || 'quotation',
        sale_point: sq.code?.split('-')[0] || '0001',
        number: sq.code?.split('-')[1] || sq.code,
        date: sq.date,
        client: undefined,
        client_id: sq.client_name || '',
        status: 'confirmed',
        total: Number(sq.total || 0),
        subtotal: Number(sq.total || 0),
        iva_amount: 0,
        notes: null,
        invoiced_voucher_id: invoice.id,
        has_credit_note: false,
        items: [],
        deleted_at: null,
        is_current_account: sq.voucher_type === 'receipt' && isCurrentAccountClosureVoucher(invoice),
        is_current_account_closure: false,
        billing_client: null,
        operating_client: null,
        is_withdrawal_authorized: false,
        withdrawal_client_name: null,
      } as unknown) as VoucherListItem
    })
  }

  const renderTreeCell = (
    item: VoucherListItem,
    parentNode: any,
    renderChildNode: (child: VoucherListItem) => any,
  ) => {
    const isExpandedInvoice = hasCompiledSources(item) && expandedInvoiceId === item.id

    if (!isExpandedInvoice) {
      return <>{parentNode}</>
    }

    const childRows = getExpandedSourceRows(item)

    //获取 el ref para GSAP animation
    const rowRef = (el: HTMLDivElement | null) => {
      if (el) expandedChildRefs.current.set(item.id, el)
    }

    return (
      <div className="space-y-1">
        <div>{parentNode}</div>
        <div ref={rowRef} className="mt-1 space-y-1 overflow-hidden" style={{ height: expandedInvoiceId === item.id ? 'auto' : 0, opacity: expandedInvoiceId === item.id ? 1 : 0 }}>
          {isSourceQuotationsFetching ? (
            <span className="text-[11px] text-indigo-600 dark:text-indigo-300">
              Cargando comprobantes vinculados...
            </span>
          ) : childRows.length > 0 ? (
            childRows.map((child) => (
              <div
                key={child.id}
                className="rounded-md border border-indigo-200/80 dark:border-indigo-800/80 bg-indigo-50/40 dark:bg-indigo-900/10 px-2 py-1"
              >
                {renderChildNode(child)}
              </div>
            ))
          ) : (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Sin comprobantes vinculados
            </span>
          )}
        </div>
      </div>
    )
  }

  const columns = [
    {
      key: 'checkbox',
      header: (
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={
            (() => {
              const selectableIds = vouchers
                .filter(
                    (v) =>
                      (v.voucher_type === 'quotation' || v.voucher_type === 'receipt') &&
                    !isCurrentAccountReceipt(v) &&
                     !v.invoiced_voucher_id,
                )
                .map((v) => v.id)
              return (
                selectableIds.length > 0 &&
                selectableIds.every((id) => selectedQuotationIds.includes(id))
              )
            })()
          }
          onChange={(e) => {
            if (e.target.checked) {
              const selectables = vouchers
                .filter(
                    (v) =>
                      (v.voucher_type === 'quotation' || v.voucher_type === 'receipt') &&
                    !isCurrentAccountReceipt(v) &&
                     !v.invoiced_voucher_id,
                )
                .map((v) => v.id)
              setSelectedQuotationIds(selectables)
            } else {
              setSelectedQuotationIds([])
            }
          }}
        />
      ),
      className: 'w-10',
      render: (item: VoucherListItem) => {
        const isSelectable =
          (item.voucher_type === 'quotation' || item.voucher_type === 'receipt') &&
          !isCurrentAccountReceipt(item) &&
          !item.invoiced_voucher_id &&
          !item.is_return_receipt
        if (!isSelectable) return null
        return (
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={selectedQuotationIds.includes(item.id)}
            onChange={() => {
              setSelectedQuotationIds((prev) =>
                prev.includes(item.id)
                  ? prev.filter((id) => id !== item.id)
                  : [...prev, item.id],
              )
            }}
          />
        )
      },
    },
    {
      key: 'type',
      header: 'Tipo',
       render: (item: VoucherListItem) => {
          const typeInfo = item.is_return_receipt
          ? { label: 'Remito de devolución', textClass: 'text-red-600 dark:text-red-400', icon: RotateCcw }
          : getVoucherTypeInfo(item)
        const Icon = typeInfo.icon
        const isInvoiced = (item.voucher_type === 'quotation' || item.voucher_type === 'receipt') && item.invoiced_voucher_id && !item.is_return_receipt
        const isCCClosure = !!item.is_current_account_closure
        const closureLockInfo = getCurrentAccountClosureLockInfo(item)
        const hasCreditNote = item.voucher_type?.startsWith('invoice_') && item.has_credit_note
        const isCreditNote = item.voucher_type?.startsWith('credit_note_')
        const currentAccountInfo = getCurrentAccountInvoiceInfo(item)
        const parentNode = (
          <div className="flex items-center gap-2 flex-wrap">
            <Icon size={16} className={`${typeInfo.textClass} shrink-0`} />
            <span className={`text-xs font-medium ${typeInfo.textClass}`}>
              {typeInfo.label}
            </span>
            {item.is_return_receipt && (
              <span
                title="Remito de devolución"
                className="inline-flex items-center justify-center w-5 h-5 rounded-full shadow-sm border border-red-300 bg-gradient-to-br from-red-200 to-red-100 text-red-700 dark:from-red-900/40 dark:to-red-800 dark:border-red-700 dark:text-red-300 text-[10px] font-bold leading-none shrink-0"
              >
                D
              </span>
            )}
            {item.voucher_type === 'receipt' && (item.is_current_account || item.billing_client_id) && !item.is_current_account_closure && (
              <span
                title="Cuenta Corriente"
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 text-[9px] font-bold leading-none shrink-0"
              >
                Cta Cte
              </span>
            )}
            {isInvoiced && (
              <span
                title="Este comprobante ya fue facturado"
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold leading-none shrink-0"
              >
                F
              </span>
            )}
            {isCCClosure && (
              <span
                title="Cierre de Cuenta Corriente"
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 text-[9px] font-bold leading-none shrink-0"
              >
                Cierre CC
              </span>
            )}
            {closureLockInfo.isLocked && (
              <span
                title={closureLockInfo.reason}
                className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 text-[9px] font-bold leading-none shrink-0"
              >
                <AlertTriangle size={10} />
                Bloq. CC
              </span>
            )}
            {hasCreditNote && (
              <span
                title="Tiene una Nota de Crédito asociada"
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none shrink-0"
              >
                NC
              </span>
            )}
            {isCreditNote && (
              <span
                title="Nota de Crédito Fiscal"
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 text-[9px] font-bold leading-none shrink-0"
              >
                NC
              </span>
            )}
            {currentAccountInfo && (
              <span
                title={currentAccountInfo.label}
                className={`inline-flex items-center px-1.5 h-5 rounded-full border text-[9px] font-bold leading-none shrink-0 ${currentAccountInfo.className}`}
              >
                {currentAccountInfo.label}
              </span>
            )}
          </div>
        )

        return renderTreeCell(item, parentNode, (child) => {
          const childInfo =
            voucherTypeLabels[child.voucher_type] || {
              label: child.voucher_type,
              textClass: 'text-gray-600 dark:text-gray-400',
              icon: FileText,
            }
          const ChildIcon = childInfo.icon
          const childBadge = child.voucher_type === 'receipt' ? 'REM' : child.voucher_type === 'quotation' ? 'COT' : null
          return (
            <div className="flex items-center gap-1.5">
              <ChildIcon size={12} className={childInfo.textClass} />
              {childBadge && (
                <span
                  className={`inline-flex items-center px-1 h-4 rounded border text-[9px] font-bold leading-none ${
                    childBadge === 'REM'
                      ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700'
                      : 'bg-primary-100 text-primary-700 border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-700'
                  }`}
                >
                  {childBadge}
                </span>
              )}
              <span className={`text-[11px] ${childInfo.textClass}`}>{childInfo.label}</span>
            </div>
          )
        })
      },
    },
    {
      key: 'number',
      header: 'Número',
      className: 'w-[150px] max-w-[150px] align-top',
      render: (item: any) => {
        // Referencia a factura generada (cotización/remito facturado)
        const invoicedRef = item.invoiced_voucher_id
          ? voucherNumberMap[item.invoiced_voucher_id] || 'Ver factura'
          : null

        // Referencia a factura original (nota de crédito)
        const relatedRef = item.related_voucher_id && item.voucher_type?.startsWith('credit_note_')
          ? voucherNumberMap[item.related_voucher_id] || 'Ver factura'
          : null

        const parentNode = (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              {item.is_return_receipt && (
                <span
                  title="Remito de devolución"
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full shadow-sm border border-red-300 bg-gradient-to-br from-red-200 to-red-100 text-red-700 dark:from-red-900/40 dark:to-red-800 dark:border-red-700 dark:text-red-300 text-[10px] font-bold shrink-0"
                >
                  D
                </span>
              )}
              <span className="font-mono text-sm font-medium">
                {item.sale_point}-{item.number}
              </span>
            </div>

            {invoicedRef && (
              <button
                onClick={() => handleViewRelatedPdf(item.invoiced_voucher_id)}
                className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 hover:underline w-fit"
                title="Ver la factura generada desde este comprobante"
              >
                <ExternalLink size={10} />
                Fact. {invoicedRef}
              </button>
            )}
            {relatedRef && (
              <button
                onClick={() => handleViewRelatedPdf(item.related_voucher_id)}
                className="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400 hover:underline w-fit"
                title="Ver la factura original de esta Nota de Crédito"
              >
                <ExternalLink size={10} />
                Fact. {relatedRef}
              </button>
            )}
          </div>
        )

        return renderTreeCell(item, parentNode, (child) => (
          <span className="block font-mono text-[11px] text-indigo-700 dark:text-indigo-300">
            {child.sale_point}-{child.number}
          </span>
        ))
      },
    },
    {
      key: 'date',
      header: 'Fecha',
      className: 'w-[110px] max-w-[110px] align-top',
      render: (item: any) => {
        // Parsear fecha sin conversión de zona horaria
        // Si la fecha viene como "2026-02-06", tratarla como local
        const [year, month, day] = item.date.split('-')
        const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        const parentNode = (
          <span className="text-sm">{localDate.toLocaleDateString('es-AR')}</span>
        )

        return renderTreeCell(item, parentNode, (child) => {
          const [y, m, d] = child.date.split('-')
          const childDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
          return (
            <span className="text-[11px] text-gray-600 dark:text-gray-300">
              {childDate.toLocaleDateString('es-AR')}
            </span>
          )
        })
      },
    },
    {
      key: 'client',
      header: 'Cliente',
      className: 'min-w-[240px] align-top',
      render: (item: any) => {
        const parentNode = (
          <span className="block text-sm whitespace-normal break-words">
            {item.client ? item.client.name : `Cliente #${item.client_id.substring(0, 8)}...`}
          </span>
        )

        return renderTreeCell(item, parentNode, (child) => {
          return (
            <span className="block text-[11px] text-gray-700 dark:text-gray-200 whitespace-normal break-words">
              {child.client?.name || child.client_id || '—'}
            </span>
          )
        })
      },
    },
    {
      key: 'status',
      header: 'Estado',
      className: 'w-[100px] max-w-[100px] align-top',
      render: (item: any) => {
        const statusInfo = statusLabels[item.status] || { label: item.status, className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' }
        const parentNode = (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        )

        return renderTreeCell(item, parentNode, (child) => {
          const childStatusInfo =
            statusLabels[child.status] || {
              label: child.status,
              className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
            }
          const isCompiledStatus = String(childStatusInfo.label).toLowerCase() === 'compilado'
          return (
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${childStatusInfo.className}`}>
                {isCompiledStatus ? '—' : childStatusInfo.label}
              </span>
            </div>
          )
        })
      },
    },
    {
      key: 'total',
      header: 'Total',
      className: 'w-[130px] max-w-[130px] align-top',
      render: (item: any) => {
        const parentNode = (
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            ${item.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )

        return renderTreeCell(item, parentNode, (child) => (
          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            ${Number(child.total).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ))
      },
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'text-center w-[160px] max-w-[160px] align-top',
        render: (item: VoucherListItem) => {
          const isDeleted = !!item.deleted_at
          const closureLockInfo = getCurrentAccountClosureLockInfo(item)
          const isLockedByClosure = closureLockInfo.isLocked
          const canPayCurrentAccountInvoice = currentAccountEnabled && isInvoiceVoucher(item) && !!item.is_current_account && !item.is_paid

        const parentActions = (
          <div className="mx-auto flex w-[152px] flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
            {!isDeleted && (
              <>
                {item.voucher_type === 'quotation' && !item.invoiced_voucher_id && !item.is_current_account_closure && (
                  <button
                    onClick={(e) => { animateButton(e); handleEditQuotation(item) }}
                    className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                    title="Editar cotización"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={(e) => { animateButton(e); handleViewPdf(item.id) }}
                  className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                  title="Ver PDF"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={(e) => { animateButton(e); handleDownloadPdf(item.id, `${item.sale_point}-${item.number}`) }}
                  className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                  title="Descargar PDF"
                >
                  <Download size={14} />
                </button>

                {whatsappEnabled && isInvoiceVoucher(item) && (
                  <WhatsAppSendPdfButton
                    getPdfBlob={() => vouchersService.getPdf(item.id)}
                    filename={`comprobante-${item.sale_point}-${item.number}.pdf`}
                    caption={`Comprobante ${item.sale_point}-${item.number}`}
                    defaultClientId={item.billing_client_id || item.client_id || ''}
                    size={14}
                  />
                )}

                {canPayCurrentAccountInvoice && (
                  <button
                    onClick={(e) => {
                      animateButton(e)
                      setVoucherToPay(item)
                      setPayPaymentMethodId(paymentMethods.find((pm: any) => pm.is_active !== false)?.id || '')
                      setPayDate(new Date().toISOString().slice(0, 10))
                      setPayReference('')
                      setPayNotes('')
                      setPayError('')
                    }}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                    title="Cobrar factura y generar remito de pago"
                  >
                    <CircleDollarSign size={14} />
                  </button>
                )}

                {currentAccountEnabled && isCurrentAccountReceipt(item) && (
                  <button
                    onClick={(e) => { animateButton(e); handleGoToCurrentAccount(item) }}
                    className="p-1 text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded transition-colors"
                    title="Ir a Cuenta Corriente"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
                
                {/* Botón Nota de Crédito - SOLO para facturas con CAE y SIN NC previa */}
                {invoicingEnabled && item.voucher_type.startsWith('invoice_') && item.cae && !item.has_credit_note && (
                  <button
                    onClick={(e) => { 
                      animateButton(e)
                      setSelectedVoucherForNC(item)
                      setShowCreditNoteModal(true)
                    }}
                    className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded transition-colors"
                    title="Crear Nota de Crédito"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}

                {/* Indicador de NC emitida */}
                {invoicingEnabled && item.has_credit_note && (
                  <span 
                    className="p-1 text-orange-500 cursor-help" 
                    title="Esta factura ya tiene una Nota de Crédito asociada"
                  >
                    <RotateCcw size={14} className="opacity-50" />
                  </span>
                )}

                {/* Botón comprobantes vinculados — solo para facturas compiladas */}
                {hasCompiledSources(item) && (
                  <button
                    onClick={(e) => {
                      const btn = e.currentTarget
                      // GSAP scale effect on click
                      gsap.to(btn, { scale: 0.85, duration: 0.06, onComplete: () => {
                        gsap.to(btn, { scale: 1, duration: 0.1 })
                      }})
                      // Toggle expansion
                      setExpandedInvoiceId(
                        expandedInvoiceId === item.id ? null : item.id,
                      )
                    }}
                    className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-colors"
                    title="Ver comprobantes vinculados"
                  >
                    <Menu size={14} />
                  </button>
                )}
                
                {!isInvoiceVoucher(item) && (
                <button
                  onClick={(e) => {
                    animateButton(e)
                    if (isLockedByClosure) {
                      toast.error(closureLockInfo.reason)
                      return
                    }
                    setVoucherToDelete(item)
                    setDeleteReasonError('')
                    setShowDeleteModal(true)
                  }}
                  disabled={isLockedByClosure}
                  className={`p-1 rounded transition-colors ${
                    isLockedByClosure
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'
                  }`}
                  title={
                    isLockedByClosure
                      ? closureLockInfo.reason
                      : 'Eliminar'
                  }
                >
                  <Trash2 size={14} />
                </button>
                )}
              </>
            )}
            {isDeleted && (
              <span className="text-xs text-red-600 font-medium">ELIMINADO</span>
            )}
          </div>
        )

        return renderTreeCell(item, parentActions, (child) => {
          const childIsDeleted = !!child.deleted_at
          const childIsEditableQuotation =
            child.voucher_type === 'quotation' && !child.invoiced_voucher_id
          const childIsCompiledSource = isCompiledSourceVoucher(child, item)
          const canShowSubrowDetails = child.voucher_type === 'receipt' && child.is_current_account
          const isDetailsOpen = openSubrowDetailsId === child.id
          const holderName = child.billing_client?.name || child.client?.name || child.client_id || '—'
          const withdrawalName =
            child.withdrawal_client_name || child.operating_client?.name || child.billing_client?.name || '—'

          if (childIsDeleted) {
            return <span className="text-[10px] text-red-600 font-medium">ELIMINADO</span>
          }

          return (
            <div className="relative flex items-center justify-center gap-1">
              {canShowSubrowDetails && (
                <button
                  onClick={(e) => { animateButton(e); setOpenSubrowDetailsId((current) => (current === child.id ? null : child.id)) }}
                  className="p-0.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded transition-colors"
                  title="Ver detalle de retiro"
                >
                  <Info size={12} />
                </button>
              )}
              <button
                onClick={(e) => { animateButton(e); handleViewPdf(child.id) }}
                className="p-0.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                title={`Ver PDF del ${child.voucher_type === 'receipt' ? 'remito' : 'comprobante'}`}
              >
                <Eye size={12} />
              </button>
              {!childIsCompiledSource && childIsEditableQuotation && (
                <button
                  onClick={(e) => { animateButton(e); handleEditQuotation(child as any) }}
                  className="p-0.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                  title="Editar cotización"
                >
                  <Pencil size={12} />
                </button>
              )}

              {isDetailsOpen && canShowSubrowDetails && (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Detalle de retiro
                  </div>
                  <div className="space-y-1.5 text-[11px] text-gray-700 dark:text-gray-200">
                    <div>
                      <span className="font-semibold text-gray-500 dark:text-gray-400">Titular:</span>{' '}
                      {holderName}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 dark:text-gray-400">Autorizado:</span>{' '}
                      {child.is_withdrawal_authorized ? 'Sí' : 'No'}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 dark:text-gray-400">Retira:</span>{' '}
                      {withdrawalName}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })
      },
    },
  ]

  const sourceQuotationIds = new Set((sourceQuotations || []).map((sq: any) => sq.id))
  const tableVouchers = vouchers.filter((v: VoucherListItem) => {
    // Cotizaciones/remitos ya facturados SOLO viven como subfilas dentro de su factura
    if ((v.voucher_type === 'quotation' || v.voucher_type === 'receipt') && v.invoiced_voucher_id) {
      return false
    }

    if (!expandedInvoiceId || sourceQuotationIds.size === 0) {
      return true
    }
    if (v.voucher_type !== 'quotation' && v.voucher_type !== 'receipt') {
      return true
    }
    return !sourceQuotationIds.has(v.id)
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    const errorMessage = formatErrorMessage(error)
    const errorStatus = typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined
    const isUnauthorized = errorStatus === 401 || errorMessage.includes('401') || errorMessage.includes('Unauthorized')
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
          <FileText className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {isUnauthorized ? 'Sesión Expirada' : 'Error al cargar comprobantes'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          {isUnauthorized 
            ? 'Tu sesión ha caducado. Por favor inicia sesión nuevamente.' 
            : errorMessage}
        </p>
        {isUnauthorized && (
          <Button onClick={() => window.location.href = '/login'}>Ir al Login</Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full max-w-none">
      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(120px,132px))_40px_40px_40px]">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Buscar
              </span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Número de comprobante"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 text-sm text-gray-900 outline-none transition focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-100 dark:focus:bg-gray-900"
                />
              </div>
            </div>

            <Select
              label="Tipo"
              value={filterType}
              className="h-10 rounded-xl bg-gray-50 text-sm dark:bg-gray-900/40 sm:w-[132px]"
              onChange={(e) => {
                setFilterType(e.target.value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Todos los tipos' },
                { value: 'quotation',     label: 'Cotizaciones' },
                ...(receiptsEnabled ? [{ value: 'receipt', label: 'Remitos' }] : []),
                ...(invoicingEnabled
                  ? [
                      { value: 'invoice_a', label: 'Facturas A' },
                      { value: 'invoice_b', label: 'Facturas B' },
                      { value: 'invoice_c', label: 'Facturas C' },
                      { value: 'credit_note_a', label: 'Notas de Crédito A' },
                      { value: 'credit_note_b', label: 'Notas de Crédito B' },
                      { value: 'credit_note_c', label: 'Notas de Crédito C' },
                    ]
                  : []),
              ]}
            />

            <Select
              label="Estado"
              value={filterStatus}
              className="h-10 rounded-xl bg-gray-50 text-sm dark:bg-gray-900/40 sm:w-[132px]"
              onChange={(e) => {
                setFilterStatus(e.target.value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Todos los estados' },
                { value: 'draft', label: 'Borradores' },
                { value: 'confirmed', label: 'Confirmados' },
                { value: 'cancelled', label: 'Anulados' },
              ]}
            />

            <Select
              label="Medio de pago"
              value={filterPaymentMethod}
              className="h-10 rounded-xl bg-gray-50 text-sm dark:bg-gray-900/40 sm:w-[132px]"
              onChange={(e) => {
                setFilterPaymentMethod(e.target.value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Todos los métodos' },
                ...paymentMethods.map((method) => ({
                  value: method.id,
                  label: method.is_active ? method.name : `${method.name} (inactivo)`,
                })),
              ]}
            />

            <Select
              label="Cuenta"
              value={filterCurrentAccount}
              className="h-10 rounded-xl bg-gray-50 text-sm dark:bg-gray-900/40 sm:w-[132px]"
              onChange={(e) => {
                setFilterCurrentAccount(e.target.value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Todas' },
                ...(currentAccountEnabled
                  ? [
                      { value: 'current_account', label: 'Solo Ctas Ctes' },
                      { value: 'current_account_overdue', label: 'Ctas Ctes vencidas' },
                    ]
                  : []),
              ]}
            />
            <div className="space-y-1">
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <CalendarDays size={12} />
                Desde
              </span>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => {
                  setFilterDateFrom(e.target.value)
                  setPage(1)
                }}
                aria-label="Fecha desde"
                title={filterDateFrom ? `Desde: ${filterDateFrom}` : 'Fecha desde'}
                className="relative h-10 w-10 cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-0 text-transparent outline-none transition [color-scheme:light] focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900/40 dark:[color-scheme:dark] dark:focus:bg-gray-900 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-1/2 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:-translate-x-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:opacity-70"
              />
            </div>

            <div className="space-y-1">
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <CalendarDays size={12} />
                Hasta
              </span>
              <input
                type="date"
                value={filterDateTo}
                min={filterDateFrom || undefined}
                onChange={(e) => {
                  setFilterDateTo(e.target.value)
                  setPage(1)
                }}
                aria-label="Fecha hasta"
                title={filterDateTo ? `Hasta: ${filterDateTo}` : 'Fecha hasta'}
                className="relative h-10 w-10 cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-0 text-transparent outline-none transition [color-scheme:light] focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900/40 dark:[color-scheme:dark] dark:focus:bg-gray-900 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-1/2 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:-translate-x-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:opacity-70"
              />
            </div>

              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                title="Limpiar filtros"
                aria-label="Limpiar filtros"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <X size={16} />
              </button>
        </div>
      </div>

      {/* Tabla */}
      {selectedQuotationIds.length >= 1 && (
        <div className="mb-4 hidden items-center justify-start gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-800 dark:bg-primary-900/20 lg:flex">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary-700 dark:text-primary-300">
            {selectedQuotationIds.length} comprobante{selectedQuotationIds.length > 1 ? 's' : ''} seleccionado{selectedQuotationIds.length > 1 ? 's' : ''}
          </span>
          {(vouchersData?.items || []).some(
            (v) =>
              selectedQuotationIds.includes(v.id) &&
              (v.voucher_type === 'quotation' || v.voucher_type === 'receipt') &&
              !isCurrentAccountReceipt(v) &&
              !v.invoiced_voucher_id,
          ) && (
            <button
              onClick={() => {
                const selectedVouchers = (vouchersData?.items || []).filter((voucher) =>
                  selectedQuotationIds.includes(voucher.id),
                )
                const sourceClientId = selectedVouchers[0]?.client?.id || selectedVouchers[0]?.client_id || ''
                const sourceClient = compileClientOptions.find((client) => client.id === sourceClientId)
                setCompileFiscalClientId(sourceClientId)
                setCompileSelectedFiscalClient(sourceClient || null)
                setShowCompileModal(true)
              }}
              className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-2.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              title="Facturar seleccionados"
              aria-label="Facturar seleccionados"
            >
              <Receipt size={14} />
              <span>Facturar seleccionados</span>
            </button>
          )}
          {whatsappEnabled && (
            <button
              onClick={() => setBulkWhatsAppOpen(true)}
              className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-400 px-2.5 py-1.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white dark:border-emerald-500 dark:text-emerald-400"
              title="Enviar por WhatsApp"
              aria-label="Enviar por WhatsApp"
            >
              <WhatsAppIcon size={14} />
              <span>Enviar por WhatsApp</span>
            </button>
          )}
          <button
            onClick={() => setSelectedQuotationIds([])}
            className="inline-flex flex-shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title="Cancelar selección"
            aria-label="Cancelar selección"
          >
            <X size={14} />
            <span>Cancelar</span>
          </button>
        </div>
      )}

      {bulkWhatsAppOpen && (() => {
        const selectedVouchers = (vouchersData?.items || []).filter((v) =>
          selectedQuotationIds.includes(v.id),
        )
        const pdfList: PdfSpec[] = selectedVouchers.map((v) => ({
          getPdfBlob: () => vouchersService.getPdf(v.id),
          filename: `comprobante-${v.sale_point}-${v.number}.pdf`,
          caption: `Comprobante ${v.sale_point}-${v.number}`,
        }))
        const firstClientId = selectedVouchers[0]?.billing_client_id || selectedVouchers[0]?.client_id || ''
        return (
          <WhatsAppSendModal
            isOpen={bulkWhatsAppOpen}
            onClose={() => setBulkWhatsAppOpen(false)}
            pdfs={pdfList}
            defaultClientId={firstClientId}
          />
        )
      })()}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <ResponsiveTable
          data={tableVouchers}
          emptyState={
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              No se encontraron comprobantes.
            </div>
          }
          renderDesktop={() => (
            <Table 
              columns={columns} 
              data={tableVouchers}
              emptyMessage="No se encontraron comprobantes."
              density="compact"
            />
          )}
          renderCard={(voucher, _idx) => {
            const isDeleted = !!voucher.deleted_at
            // Selectable: quotation or receipt not yet invoiced
            const isSelectable = (voucher.voucher_type === 'quotation' || voucher.voucher_type === 'receipt') && !isCurrentAccountReceipt(voucher) && !voucher.invoiced_voucher_id && !voucher.is_return_receipt
            const typeLabels: Record<string, { label: string; color: string }> = {
              quotation: { label: 'Cotización', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
              receipt: { label: 'Remito', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
              invoice_a: { label: 'Factura A', color: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
              invoice_b: { label: 'Factura B', color: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
              invoice_c: { label: 'Factura C', color: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
            }
            const typeInfo = voucher.is_return_receipt
              ? { label: 'Remito de devolución', color: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30' }
              : isCurrentAccountClosureVoucher(voucher)
                ? { label: 'Resumen Cta Cte', color: 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-900/30' }
              : typeLabels[voucher.voucher_type] || { label: voucher.voucher_type, color: 'text-gray-600 bg-gray-50 dark:bg-gray-700' }
            // Usar labels consistentes con desktop
            const statusRaw = statusLabels[voucher.status] || { label: voucher.status, className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' }
            const statusLabel = statusRaw.label
            // Para mobile, convertir className bg-green-* a bg-emerald-* para consistente con el diseño
            const statusColor = statusRaw.className.replace('green', 'emerald')
            const currentAccountInfo = getCurrentAccountInvoiceInfo(voucher)
            const canPayCurrentAccountInvoice = currentAccountEnabled && isInvoiceVoucher(voucher) && !!voucher.is_current_account && !voucher.is_paid
            const isSelected = selectedQuotationIds.includes(voucher.id)
            
            return (
              <div key={voucher.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                {/* Checkbox para seleccionar - solo cotizaciones/remitos sin facturar */}
                {isSelectable && (
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedQuotationIds((prev) =>
                            prev.includes(voucher.id)
                              ? prev.filter((id) => id !== voucher.id)
                              : [...prev, voucher.id],
                          )
                        }}
                      />
                      {!isSelected && <span className="text-xs text-gray-400">Seleccionar para facturar</span>}
                    </label>
                    {isSelected && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const sourceClientId = voucher.client?.id || voucher.client_id || ''
                            const sourceClient = compileClientOptions.find((client) => client.id === sourceClientId)
                            setCompileFiscalClientId(sourceClientId)
                            setCompileSelectedFiscalClient(sourceClient || null)
                            setShowCompileModal(true)
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white transition-colors hover:bg-primary-700"
                          title="Facturar seleccionados"
                          aria-label="Facturar seleccionados"
                        >
                          <Receipt size={17} />
                        </button>
                        {whatsappEnabled && (
                          <button
                            type="button"
                            onClick={() => setBulkWhatsAppOpen(true)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400 text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white dark:border-emerald-500 dark:text-emerald-400"
                            title="Enviar por WhatsApp"
                            aria-label="Enviar por WhatsApp"
                          >
                            <WhatsAppIcon size={17} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedQuotationIds((prev) => prev.filter((id) => id !== voucher.id))}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                          title="Cancelar selección"
                          aria-label="Cancelar selección"
                        >
                          <X size={17} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Header: Tipo + Número */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    {voucher.voucher_type === 'receipt' && (voucher.is_current_account || voucher.billing_client_id) && !voucher.is_current_account_closure && (
                      <span
                        title="Cuenta Corriente"
                        className="inline-flex items-center px-1.5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 text-[9px] font-bold leading-none shrink-0"
                      >
                        Cta Cte
                      </span>
                    )}
                    {isDeleted && (
                      <span className="text-xs font-bold text-red-600">ELIMINADO</span>
                    )}
                    {currentAccountInfo && (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${currentAccountInfo.className}`}>
                        {currentAccountInfo.label}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                    {voucher.sale_point}-{voucher.number}
                  </span>
                </div>
                
                {/* Cliente */}
                <div className="mb-2 text-sm text-gray-700 dark:text-gray-200">
                  <span className="font-medium">{voucher.billing_client?.name || voucher.client?.name || voucher.client_id || '—'}</span>
                </div>
                
                {/* Fecha + Estado */}
                <div className="flex items-center justify-between mb-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{voucher.date}</span>
                  <span className={`px-2 py-0.5 rounded-full ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
                
                {/* Total */}
                <div className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                  ${Number(voucher.total).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                
                {/* Acciones */}
                <div className="flex flex-wrap gap-1 border-t border-gray-100 dark:border-gray-700 pt-3">
                  {!isDeleted && (
                    <>
                      <button onClick={(e) => { animateButton(e); handleViewPdf(voucher.id) }} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg" title="Ver PDF">
                        <Eye size={16} />
                      </button>
                      <button onClick={(e) => { animateButton(e); handleDownloadPdf(voucher.id, `${voucher.sale_point}-${voucher.number}`) }} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg" title="Descargar PDF">
                        <Download size={16} />
                      </button>
                      {whatsappEnabled && isInvoiceVoucher(voucher) && (
                        <WhatsAppSendPdfButton
                          getPdfBlob={() => vouchersService.getPdf(voucher.id)}
                          filename={`comprobante-${voucher.sale_point}-${voucher.number}.pdf`}
                          caption={`Comprobante ${voucher.sale_point}-${voucher.number}`}
                          defaultClientId={voucher.billing_client_id || voucher.client_id || ''}
                          size={16}
                        />
                      )}
                      {canPayCurrentAccountInvoice && (
                        <button
                          onClick={(e) => {
                            animateButton(e)
                            setVoucherToPay(voucher)
                            setPayPaymentMethodId(paymentMethods.find((pm: any) => pm.is_active !== false)?.id || '')
                            setPayDate(new Date().toISOString().slice(0, 10))
                            setPayReference('')
                            setPayNotes('')
                            setPayError('')
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                          title="Cobrar factura y generar remito de pago"
                        >
                          <CircleDollarSign size={16} />
                        </button>
                      )}
                      {currentAccountEnabled && isCurrentAccountReceipt(voucher) && (
                        <button
                          onClick={(e) => { animateButton(e); handleGoToCurrentAccount(voucher) }}
                          className="p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded-lg"
                          title="Ir a Cuenta Corriente"
                        >
                          <ExternalLink size={16} />
                        </button>
                      )}
                      {hasCompiledSources(voucher) && (
                        <button onClick={(e) => { animateButton(e); setExpandedInvoiceId(expandedInvoiceId === voucher.id ? null : voucher.id) }} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg" title="Ver comprobantes vinculados">
                          <Menu size={16} />
                        </button>
                      )}
                      {!isInvoiceVoucher(voucher) && (
                      <button onClick={(e) => {
                        animateButton(e)
                        if (!voucher.is_current_account_closure && !voucher.is_receipt_linked_to_current_account_closure) {
                          setVoucherToDelete(voucher)
                          setDeleteReasonError('')
                        }
                      }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" title="Eliminar">
                        <Trash2 size={16} />
                      </button>
                      )}
                    </>
                  )}
                </div>
                
                {/* Expanded child rows - show linked quotations/remitos */}
                {expandedInvoiceId === voucher.id && hasCompiledSources(voucher) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Comprobantes vinculados:</div>
                    {isSourceQuotationsFetching ? (
                      <div className="text-xs text-indigo-600 dark:text-indigo-300 animate-pulse">Cargando...</div>
                    ) : sourceQuotations && sourceQuotations.length > 0 ? (
                      <div className="space-y-2">
                        {(sourceQuotations as any[]).map((sq: any) => (
                          <div key={sq.id} className="flex items-center justify-between rounded-md border border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-900/10 px-2 py-1.5 text-xs">
                            <div className="flex items-center gap-1.5">
                              {sq.voucher_type === 'quotation' ? (
                                <FileText size={12} className="text-amber-500" />
                              ) : (
                                <Truck size={12} className="text-blue-500" />
                              )}
                              <span className="font-medium text-gray-700 dark:text-gray-200">
                                {sq.code || sq.id}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={(e) => { animateButton(e); handleViewPdf(sq.id) }} 
                                className="p-1 text-gray-400 hover:text-primary-600 rounded"
                                title="Ver"
                              >
                                <Eye size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 dark:text-gray-500">Sin comprobantes vinculados</div>
                    )}
                  </div>
                )}
              </div>
            )
          }}
        />
      </div>

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={vouchersData?.pages || 1}
        totalItems={vouchersData?.total || 0}
        onPageChange={setPage}
      />

      {/* Modal de cobro de factura en Cuenta Corriente */}
      <Modal
        isOpen={!!voucherToPay}
        onClose={() => {
          if (!payInvoiceMutation.isPending) {
            setVoucherToPay(null)
            setPayPaymentMethodId('')
            setPayReference('')
            setPayNotes('')
            setPayError('')
          }
        }}
        title="Cobrar factura en Cuenta Corriente"
      >
        {voucherToPay && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-sm dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                    Factura a cobrar
                  </p>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">
                    {voucherToPay.sale_point}-{voucherToPay.number}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-700 dark:text-blue-300">Total</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    ${Number(voucherToPay.total).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              {getCurrentAccountInvoiceInfo(voucherToPay) && (
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${getCurrentAccountInvoiceInfo(voucherToPay)?.className}`}>
                  {getCurrentAccountInvoiceInfo(voucherToPay)?.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Fecha de pago
                </label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Método de pago
                </label>
                <Select
                  value={payPaymentMethodId}
                  onChange={(e) => {
                    setPayPaymentMethodId(e.target.value)
                    setPayError('')
                  }}
                  options={[
                    { value: '', label: 'Seleccionar método' },
                    ...paymentMethods
                      .filter((method: any) => method.is_active !== false)
                      .map((method: any) => ({ value: method.id, label: method.name })),
                  ]}
                />
              </div>
            </div>

            <Input
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="Referencia opcional: transferencia, cheque, cupón..."
            />
            <Input
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="Notas opcionales para el remito de pago"
            />

            {payError && <p className="text-sm text-red-600 dark:text-red-400">{payError}</p>}

            <div className="flex gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
              <Button variant="outline" className="flex-1" disabled={payInvoiceMutation.isPending} onClick={() => setVoucherToPay(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={payInvoiceMutation.isPending}
                onClick={() => {
                  if (!payPaymentMethodId) {
                    setPayError('Seleccioná un método de pago')
                    return
                  }
                  if (!payDate) {
                    setPayError('Indicá la fecha de pago')
                    return
                  }
                  payInvoiceMutation.mutate({
                    voucher: voucherToPay,
                    paymentMethodId: payPaymentMethodId,
                    paymentDate: payDate,
                    reference: payReference,
                    notes: payNotes,
                  })
                }}
              >
                {payInvoiceMutation.isPending ? 'Registrando...' : 'Cobrar y generar remito'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Eliminación */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setVoucherToDelete(null)
          setDeleteReason('')
          setDeleteReasonError('')
        }}
        title="Eliminar Comprobante"
      >
        {voucherToDelete && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  ¿Estás seguro?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Vas a eliminar el comprobante <strong>{voucherToDelete.sale_point}-{voucherToDelete.number}</strong>.
                  El registro quedará marcado como eliminado pero visible en el historial.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Motivo de eliminación <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <Input
                value={deleteReason}
                onChange={(e) => {
                  setDeleteReason(e.target.value)
                  if (deleteReasonError) {
                    setDeleteReasonError('')
                  }
                }}
                placeholder="Ej: Error en los datos, duplicado, etc."
                error={deleteReasonError}
                required
              />
            </div>

            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowDeleteModal(false)
                  setVoucherToDelete(null)
                  setDeleteReason('')
                  setDeleteReasonError('')
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                variant="danger" 
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending || !deleteReason.trim()}
                className="flex-1"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Nota de Crédito */}
      <CreditNoteModal
        isOpen={showCreditNoteModal}
        onClose={() => {
          setShowCreditNoteModal(false)
          setSelectedVoucherForNC(null)
        }}
        voucher={selectedVoucherForNC}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['vouchers'] })
        }}
      />

      {/* Modal de facturación de comprobantes seleccionados */}
      <Modal
        isOpen={showCompileModal}
        onClose={() => {
          setShowCompileModal(false)
          setCompileSelectedPaymentMethodId(null)
          setCompilePaymentReferences({})
          setCompileGeneralDiscount('0')
          setCompilePaymentError('')
          setCompileFiscalClientId('')
          setCompileSelectedFiscalClient(null)
          setCompilePriceStrategy('historical')
          setCompilePayInCurrentAccount(false)
          setCompileCurrentAccountDays(30)
        }}
        title="Facturar comprobantes seleccionados"
        size="xl"
      >
        {(() => {
          const selectedVouchers = (vouchersData?.items || []).filter(
            (v) => selectedQuotationIds.includes(v.id),
          )
          const clientName =
            selectedVouchers[0]?.client?.name ||
            `Cliente #${selectedVouchers[0]?.client_id?.substring(0, 8)}...`
          const mixedClients = new Set(
            selectedVouchers.map((v) =>
              v.client ? v.client.name : v.client_id,
            ),
          )
          const hasMixedClients = mixedClients.size > 1

          return (
            <div className="space-y-3">
              {hasMixedClients ? (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                  Los comprobantes seleccionados pertenecen a diferentes
                  clientes. Debés seleccionar solo comprobantes del mismo
                  cliente.
                </div>
              ) : (
                <>
                  {(() => {
                    // Use preview totals from backend (respects price strategy)
                    const previewSubtotal = compilePreviewTotals?.subtotal ?? 0
                    const previewTotal = compilePreviewTotals?.total ?? 0
                    const previewDiscountAmount = compilePreviewTotals?.discount_amount ?? 0
                    const discountPercent = Number(compileGeneralDiscount) || 0
                    const assignedTotal = compilePayInCurrentAccount
                      ? 0
                      : compileSelectedPaymentMethodId
                      ? previewTotal
                      : 0

                    return (
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <div className="space-y-3">
                          <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                              Cliente comprobantes: {clientName}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {selectedVouchers.length} comprobante
                              {selectedVouchers.length > 1 ? 's' : ''} — Total: $
                              {previewSubtotal.toLocaleString('es-AR', {
                                minimumFractionDigits: 2,
                              })}
                            </p>
                          </div>

                          <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 dark:border-blue-800 dark:bg-blue-900/20">
                            <label className="block text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1.5">
                              Cliente a facturar (titular fiscal)
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowFiscalClientModal(true)}
                              disabled={isClientsLoading || compileClientOptions.length === 0}
                              className="h-10 w-full rounded-lg border border-blue-300 bg-white px-3 text-sm text-left text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-blue-700 dark:bg-gray-900 dark:text-gray-100"
                            >
                              {compileFiscalClientId && selectedFiscalClient ? (
                                <span>{selectedFiscalClient.name} · {selectedFiscalClient.document_number}</span>
                              ) : isClientsLoading ? (
                                <span className="text-gray-400">Cargando clientes...</span>
                              ) : (
                                <span className="text-gray-400">Seleccionar cliente fiscal</span>
                              )}
                            </button>
                            <p className="mt-1.5 text-[11px] text-blue-700 dark:text-blue-300">
                              Diferenciá titular fiscal final vs cliente de
                              los comprobantes.
                            </p>
                            {isClientsLoading && (
                              <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-300">
                                Cargando clientes disponibles...
                              </p>
                            )}
                            {!isClientsLoading && isClientsError && compileClientOptions.length === 0 && (
                              <p className="mt-1 text-[11px] text-red-600 dark:text-red-300">
                                No pudimos cargar el listado completo de clientes. Reintentá y, si persiste, revisamos el endpoint.
                              </p>
                            )}
                            {!isClientsLoading && compileClientOptions.length === 0 && (
                              <p className="mt-1 text-[11px] text-red-600 dark:text-red-300">
                                No hay clientes disponibles para facturar.
                              </p>
                            )}
                            {(() => {
                              const fiscalTaxCondition = selectedFiscalClient?.tax_condition
                              return (
                                <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-300">
                                  Condición IVA: {fiscalTaxCondition || '—'} →
                                  Factura{' '}
                                  {fiscalTaxCondition
                                    ? fiscalTaxCondition === 'Responsable Inscripto'
                                      ? 'A'
                                      : 'B'
                                    : '—'}
                                </p>
                              )
                            })()}
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5 dark:border-violet-800 dark:bg-violet-900/10">
                              <label className="block text-xs font-semibold text-violet-900 dark:text-violet-200 mb-1.5">
                                Estrategia de precios al facturar
                              </label>
                              <select
                                value={compilePriceStrategy}
                                onChange={(e) => setCompilePriceStrategy(e.target.value as PriceStrategy)}
                                className="h-10 w-full rounded-lg border border-violet-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 dark:border-violet-700 dark:bg-gray-900 dark:text-gray-100"
                              >
                                {priceStrategyOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
                                {priceStrategyOptions.find((option) => option.value === compilePriceStrategy)?.help}
                              </p>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Descuento general (%)
                              </label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={compileGeneralDiscount}
                                onChange={(e) => {
                                  setCompileGeneralDiscount(e.target.value)
                                  setCompilePaymentError('')
                                }}
                                className="w-28 text-sm"
                              />
                            </div>
                          </div>

                          <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Subtotal:</span>
                              <span className="font-medium">
                                ${previewSubtotal.toLocaleString('es-AR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            {discountPercent > 0 && (
                              <div className="flex justify-between text-orange-600">
                                <span>Descuento ({discountPercent}%):</span>
                                <span>
                                  -$
                                  {previewDiscountAmount.toLocaleString('es-AR', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-gray-700 pt-1">
                              <span>Total a pagar:</span>
                              <span>
                                ${previewTotal.toLocaleString('es-AR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span
                                className={
                                  compilePayInCurrentAccount || (assignedTotal >= previewTotal - 0.01 &&
                                  assignedTotal <= previewTotal + 0.01)
                                    ? 'text-green-600'
                                    : 'text-orange-600'
                                }
                              >
                                Pagos asignados:
                              </span>
                              <span
                                className={
                                  compilePayInCurrentAccount || (assignedTotal >= previewTotal - 0.01 &&
                                  assignedTotal <= previewTotal + 0.01)
                                    ? 'text-green-600'
                                    : 'text-orange-600'
                                }
                              >
                                Pagos asignados:
                              </span>
                              <span
                                className={
                                  compilePayInCurrentAccount || (assignedTotal >= previewTotal - 0.01 &&
                                  assignedTotal <= previewTotal + 0.01)
                                    ? 'text-green-600'
                                    : 'text-orange-600'
                                }
                              >
                                {compilePayInCurrentAccount ? 'Pendiente en Cta. Cte.' : `$${assignedTotal.toLocaleString('es-AR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`}
                              </span>
                            </div>
                            {compilePaymentError && (
                              <p className="text-red-600 text-xs mt-1">
                                {compilePaymentError}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="max-h-40 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                                    <th className="text-left px-3 py-2 font-medium">
                                      Número
                                    </th>
                                    <th className="text-left px-3 py-2 font-medium">
                                      Fecha
                                    </th>
                                    <th className="text-right px-3 py-2 font-medium">
                                      Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedVouchers.map((v) => {
                                    const [y, m, d] = v.date.split('-')
                                    const ld = new Date(
                                      parseInt(y),
                                      parseInt(m) - 1,
                                      parseInt(d),
                                    )
                                    return (
                                      <tr
                                        key={v.id}
                                        className="border-t border-gray-100 dark:border-gray-700 last:border-0"
                                      >
                                        <td className="px-3 py-2 font-mono">
                                          {v.sale_point}-{v.number}
                                        </td>
                                        <td className="px-3 py-2">
                                          {ld.toLocaleDateString('es-AR')}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          ${Number(v.total).toLocaleString(
                                            'es-AR',
                                            { minimumFractionDigits: 2 },
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {currentAccountEnabled && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                            <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
                              <input
                                type="checkbox"
                                checked={compilePayInCurrentAccount}
                                onChange={(e) => {
                                  setCompilePayInCurrentAccount(e.target.checked)
                                  if (e.target.checked) {
                                    setCompileSelectedPaymentMethodId(null)
                                    setCompilePaymentReferences({})
                                  }
                                  setCompilePaymentError('')
                                }}
                                className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>Dejar factura en Cuenta Corriente</span>
                            </label>
                            {compilePayInCurrentAccount && (
                              <div className="mt-2">
                                <label className="mb-1 block text-xs font-medium text-blue-700 dark:text-blue-300">
                                  Vencimiento
                                </label>
                                <select
                                  value={compileCurrentAccountDays}
                                  onChange={(e) => setCompileCurrentAccountDays(Number(e.target.value))}
                                  className="h-9 w-full rounded-lg border border-blue-300 bg-white px-3 text-sm dark:border-blue-700 dark:bg-gray-900"
                                >
                                  {[7, 15, 30, 60, 90].map((days) => (
                                    <option key={days} value={days}>{days} días</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                          )}

                          {!compilePayInCurrentAccount && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Métodos de pago
                            </label>
                            {paymentMethods.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">
                                No hay métodos de pago configurados.
                              </p>
                            ) : (
                                <div className="space-y-1.5">
                                {paymentMethods.map((pm: any) => {
                                  const methodName = String(
                                    pm.name || '',
                                  ).toLowerCase()
                                  const methodCode = String(
                                    pm.code || '',
                                  ).toLowerCase()
                                  const isCheque =
                                    methodName.includes('cheque') ||
                                    methodCode.includes('cheque')
                                  const isCard =
                                    methodName.includes('crédito') ||
                                    methodName.includes('credito') ||
                                    methodName.includes('débito') ||
                                    methodName.includes('debito') ||
                                    methodName.includes('tarjeta') ||
                                    methodCode.includes('credit') ||
                                    methodCode.includes('debit') ||
                                    methodCode.includes('card')
                                  const shouldAskReference =
                                    Boolean(pm.requires_reference) ||
                                    isCheque ||
                                    isCard
                                  const referenceLabel = isCheque
                                    ? 'N° cheque'
                                    : isCard
                                      ? 'N° cupón'
                                      : 'Referencia'
                                  const isSelected =
                                    compileSelectedPaymentMethodId === pm.id

                                  return (
                                    <div key={pm.id} className="space-y-1.5">
                                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            setCompileSelectedPaymentMethodId(
                                              e.target.checked ? pm.id : null,
                                            )
                                            setCompilePaymentError('')
                                          }}
                                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className="w-40 shrink-0">
                                          {pm.name}
                                        </span>
                                        {isSelected && (
                                          <span className="text-xs text-gray-500">
                                            ${previewTotal.toLocaleString('es-AR', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </span>
                                        )}
                                      </label>

                                      {isSelected && shouldAskReference && (
                                        <div className="pl-7">
                                          <Input
                                            type="text"
                                            placeholder={referenceLabel}
                                            className="text-sm"
                                            value={
                                              compilePaymentReferences[pm.id] ||
                                              ''
                                            }
                                            onChange={(e) => {
                                              setCompilePaymentReferences((prev) => ({
                                                ...prev,
                                                [pm.id]: e.target.value,
                                              }))
                                              setCompilePaymentError('')
                                            }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}

              <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setShowCompileModal(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                {!hasMixedClients && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      // Validar pagos usando totales del preview (respetan price_strategy)
                      if (!compilePreviewTotals) {
                        setCompilePaymentError('Calculando totales, esperá un momento...')
                        return
                      }

                      const previewTotal = compilePreviewTotals.total

                      const payments: VoucherPayment[] = []
                      let assignedTotal = 0

                      if (!compileFiscalClientId) {
                        setCompilePaymentError('Debe seleccionar el cliente a facturar')
                        return
                      }

                      if (compilePayInCurrentAccount && !currentAccountEnabled) {
                        setCompilePaymentError('Cuenta Corriente está deshabilitada para este negocio desde el CMS')
                        return
                      }

                      if (!compilePayInCurrentAccount) {
                        if (!compileSelectedPaymentMethodId) {
                          setCompilePaymentError('Debe seleccionar un método de pago')
                          return
                        }

                        const selectedMethod = paymentMethods.find((pm: any) => pm.id === compileSelectedPaymentMethodId)
                        if (!selectedMethod) {
                          setCompilePaymentError('Método de pago inválido')
                          return
                        }

                        const methodName = String(selectedMethod.name || '').toLowerCase()
                        const methodCode = String(selectedMethod.code || '').toLowerCase()
                        const isCheque = methodName.includes('cheque') || methodCode.includes('cheque')
                        const isCard = methodName.includes('crédito') || methodName.includes('credito') || methodName.includes('débito') || methodName.includes('debito') || methodName.includes('tarjeta') || methodCode.includes('credit') || methodCode.includes('debit') || methodCode.includes('card')
                        const shouldAskReference = Boolean(selectedMethod.requires_reference) || isCheque || isCard

                        if (shouldAskReference && !compilePaymentReferences[selectedMethod.id]?.trim()) {
                          setCompilePaymentError(`Debe ingresar referencia para ${selectedMethod.name}`)
                          return
                        }

                        payments.push({
                          payment_method_id: selectedMethod.id,
                          amount: previewTotal,
                          reference: compilePaymentReferences[selectedMethod.id]?.trim() || undefined,
                        })
                        assignedTotal = previewTotal

                        if (payments.length === 0) {
                          setCompilePaymentError('Debe cargar al menos un método de pago')
                          return
                        }

                        if (assignedTotal < previewTotal - 0.01 || assignedTotal > previewTotal + 0.01) {
                          setCompilePaymentError(`El total asignado ($${assignedTotal.toFixed(2)}) no coincide con el total a pagar ($${previewTotal.toFixed(2)})`)
                          return
                        }
                      }

                      compileMutation.mutate({
                        quotationIds: selectedQuotationIds,
                        payments: compilePayInCurrentAccount ? undefined : payments,
                        general_discount: Number(compileGeneralDiscount) || 0,
                        fiscal_client_id: compileFiscalClientId,
                        price_strategy: compilePriceStrategy,
                        currentAccount: {
                          enabled: compilePayInCurrentAccount,
                          paymentDays: compilePayInCurrentAccount ? compileCurrentAccountDays : undefined,
                        },
                      })
                    }}
                     disabled={
                       compileMutation.isPending ||
                       selectedQuotationIds.length < 1
                     }
                    className="flex-1"
                  >
                    {compileMutation.isPending
                      ? 'Generando...'
                      : 'Confirmar y Facturar'}
                  </Button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal selector de cliente fiscal */}
      <ClientSelectorModal
        isOpen={showFiscalClientModal}
        onClose={() => setShowFiscalClientModal(false)}
        clients={compileClientOptions}
        searchClients={clientsService.search}
        onSelect={(client) => {
          setCompileFiscalClientId(client.id)
          setCompileSelectedFiscalClient(client)
          setCompilePaymentError('')
          setShowFiscalClientModal(false)
        }}
        title="Seleccionar cliente a facturar"
      />
    </div>
  )
}
