/**
 * Página de Ventas unificada.
 * Permite crear cotizaciones, remitos y facturas.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { ShoppingCart, FileText, Truck, Receipt, Plus, Trash2, Search, RotateCcw, Save, Download, Printer, X, ClipboardList, CheckCircle, AlertCircle, AlertTriangle, DollarSign, ZoomIn, ZoomOut, Settings, MoreVertical } from 'lucide-react'
import { Button, Modal, Select, Input } from '../components/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import productsService from '../api/productsService'
import clientsService from '../api/clientsService'
import clientAuthorizationsService from '../api/clientAuthorizationsService'
import vouchersService, { VoucherCreate, VoucherUpdate, VoucherPayment, Voucher as VoucherType2, type PriceStrategy, type VoucherTotalsPreviewRequest } from '../api/vouchersService'
import arcaService from '../api/arcaService'
import paymentMethodsService from '../api/paymentMethodsService'
import businessService from '../api/businessService'
import toast from 'react-hot-toast'
import { formatErrorMessage } from '../utils/errorHelpers'
import { useSalesStore } from '../stores/salesStore'
import { TAX_CONDITIONS, getTaxConditionLabel } from '../types'

type VoucherType = 'quotation' | 'receipt' | 'invoice' | 'current_account'
type SalesMenuMode = VoucherType
type MobileSalesSection = 'items' | 'products' | 'summary'

const baseVoucherTypes = [
  { value: 'quotation', label: 'Cotización', icon: FileText },
  { value: 'receipt', label: 'Remito', icon: Truck },
  { value: 'invoice', label: 'Factura', icon: Receipt },
  { value: 'current_account', label: 'Cta Cte', icon: ClipboardList },
]

const baseSalesMenuModes: Array<{ value: SalesMenuMode; label: string; icon: any; comingSoon?: boolean }> = [
  { value: 'quotation', label: 'Cotización', icon: FileText },
  { value: 'receipt', label: 'Remito', icon: Truck },
  { value: 'invoice', label: 'Factura', icon: Receipt },
  { value: 'current_account', label: 'Cta Cte', icon: ClipboardList },
]

interface Product {
  id: string
  code: string
  description: string
  net_price: number // Precio sin IVA (para enviar al backend)
  sale_price: number // Precio de venta final (ya calculado con IVA)
}

interface CartItem extends Product {
  quantity: number
  discount: number // Descuento adicional en la venta
  sourceBudgetId?: string // ID del presupuesto origen (para rastrear de qué cotización viene cada item)
}

// Presupuesto cargado desde código
interface LoadedBudget {
  id: string
  code: string
  clientName: string
  itemCount: number
}

interface Client {
  id: string
  name: string
  document_type: string
  document_number: string
  tax_condition: string
  street?: string
  street_number?: string
  floor?: string
  apartment?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  notes?: string
  client_type_id?: string
  current_account_mode?: 'disabled' | 'limited' | 'unlimited'
  credit_limit?: number
}

interface Draft {
  id: string
  voucherType: VoucherType
  client: Client
  selectedOperatingClientId?: string
  items: CartItem[]
  subtotal: number
  iva: number
  total: number
  generalDiscount: number
  showPrices?: boolean
  createdAt: string
}

interface PaymentSelectionState {
  selected: boolean
  amount: string
  reference: string
  extra_date?: string
}

type PaymentMethodLike = {
  code?: string
  name?: string
  requires_reference?: boolean
}

interface VoucherEditPayload {
  id: string
  voucher_type: 'quotation'
  client: Client
  date: string
  notes?: string
  show_prices?: boolean
  items: CartItem[]
  general_discount?: number
}

const normalizeCartItems = (rawItems: unknown[]): CartItem[] => {
  if (!Array.isArray(rawItems)) {
    return []
  }

  return rawItems
    .map((raw) => {
      const item = raw as Partial<CartItem> & { amount?: unknown; monto?: unknown; net_price?: unknown }
      const quantity = Math.max(1, Math.trunc(safeNumber(item.quantity || 1)))
      const salePrice = safeNumber(item.sale_price)
      // Si hay net_price, usarlo, sino calcularlo desde sale_price
      const netPrice = item.net_price ? safeNumber(item.net_price) : salePrice / 1.21

      return {
        id: safeText(item.id),
        code: safeText(item.code),
        description: safeText(item.description),
        net_price: netPrice,
        sale_price: salePrice,
        quantity,
        discount: safeNumber(item.discount),
      }
    })
    .filter((item) => item.id && item.description)
}

const safeText = (value: unknown): string => (typeof value === 'string' ? value : '')

const safeNumber = (value: unknown): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizePaymentMethodValue = (value: unknown): string => (
  typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
    : ''
)

const PAYMENT_METHOD_CODE_GROUPS = {
  check: new Set(['CHECK', 'CHEQUE']),
  transfer: new Set(['TRANSFER', 'TRANSFERENCIA', 'BANK_TRANSFER']),
  credit: new Set(['CREDIT', 'CREDITO', 'CARD_CREDIT', 'TARJETA_CREDITO']),
  debit: new Set(['DEBIT', 'DEBITO', 'CARD_DEBIT', 'TARJETA_DEBITO']),
}

const getPaymentMethodStableKey = (method: PaymentMethodLike): string => {
  const normalizedCode = normalizePaymentMethodValue(method.code)
  if (normalizedCode) {
    return normalizedCode
  }

  return normalizePaymentMethodValue(method.name)
}

const isPaymentMethodInGroup = (
  method: PaymentMethodLike,
  group: keyof typeof PAYMENT_METHOD_CODE_GROUPS,
): boolean => PAYMENT_METHOD_CODE_GROUPS[group].has(getPaymentMethodStableKey(method))

const isCheckPaymentMethod = (method: PaymentMethodLike): boolean => isPaymentMethodInGroup(method, 'check')

const getPaymentReferenceLabel = (method: PaymentMethodLike): string => {
  if (isCheckPaymentMethod(method)) {
    return 'el número de cheque'
  }

  if (isPaymentMethodInGroup(method, 'transfer')) {
    return 'el número de transferencia'
  }

  if (isPaymentMethodInGroup(method, 'credit') || isPaymentMethodInGroup(method, 'debit')) {
    return 'el número de cupón'
  }

  return 'la referencia'
}

const getPaymentReferencePlaceholder = (method: PaymentMethodLike): string => {
  if (isCheckPaymentMethod(method)) {
    return 'Nro Cheque'
  }

  if (isPaymentMethodInGroup(method, 'transfer')) {
    return 'Nro de transferencia'
  }

  if (isPaymentMethodInGroup(method, 'credit') || isPaymentMethodInGroup(method, 'debit')) {
    return 'Nro de cupón'
  }

  return method.requires_reference ? 'Obligatoria' : 'Opcional'
}

const formatNumber = (
  value: unknown,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string => safeNumber(value).toLocaleString(locale, options)

const roundMoney = (value: number): number => Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100

const calculateBackendCompatibleTotalFromCart = (
  cartItems: CartItem[],
  generalDiscountPercent: number,
): number => {
  const generalDiscountFactor = 1 - (safeNumber(generalDiscountPercent) / 100)

  const total = cartItems.reduce((acc, item) => {
    const unitPriceWithoutIva = safeNumber(item.net_price)
    const quantity = safeNumber(item.quantity)
    const itemDiscountFactor = 1 - (safeNumber(item.discount) / 100)

    const subtotalLine = roundMoney(unitPriceWithoutIva * quantity * itemDiscountFactor * generalDiscountFactor)
    const ivaLine = roundMoney(subtotalLine * 0.21)
    const totalLine = roundMoney(subtotalLine + ivaLine)

    return acc + totalLine
  }, 0)

  return roundMoney(total)
}

const resolveBackendVoucherType = (
  type: VoucherType,
  taxCondition?: string,
): VoucherTotalsPreviewRequest['voucher_type'] => {
  if (type === 'quotation') return 'quotation'
  if (type === 'receipt' || type === 'current_account') return 'receipt'
  return taxCondition === 'RI' ? 'invoice_a' : 'invoice_b'
}

const parseStoredDrafts = (value: string | null): Draft[] => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const documentTypes = [
  { value: 'CUIT', label: 'CUIT' },
  { value: 'CUIL', label: 'CUIL' },
  { value: 'DNI', label: 'DNI' },
]

const taxConditions = [...TAX_CONDITIONS]

const priceStrategyOptions: Array<{ value: PriceStrategy; label: string; help: string }> = [
  {
    value: 'historical',
    label: 'Mantener precios originales',
    help: 'Usa unit_price + IVA guardados en el comprobante origen.',
  },
  {
    value: 'current',
    label: 'Actualizar a precios vigentes',
    help: 'Usa sale_price + IVA actuales del catálogo de productos.',
  },
]

export default function Sales() {
  const queryClient = useQueryClient()
  const aiPreloadedItems = useSalesStore((s) => s.items)
  const aiPreloadedFromAI = useSalesStore((s) => s.preloadedFromAI)
  const clearAIPreload = useSalesStore((s) => s.clear)

  const { data: business } = useQuery({
    queryKey: ['business-me-sales'],
    queryFn: () => businessService.getMyBusiness(),
    staleTime: 60_000,
  })
  const invoicingEnabled = business?.invoicing_enabled ?? true
  const receiptsEnabled = business?.receipts_enabled ?? true

  const voucherTypes = useMemo(
    () =>
      baseVoucherTypes.filter((item) => {
        if (item.value === 'invoice') return invoicingEnabled
        if (item.value === 'receipt') return receiptsEnabled
        return true
      }),
    [invoicingEnabled, receiptsEnabled],
  )

  const salesMenuModes = useMemo(
    () =>
      baseSalesMenuModes.filter((item) => {
        if (item.value === 'invoice') return invoicingEnabled
        if (item.value === 'receipt') return receiptsEnabled
        return true
      }),
    [invoicingEnabled, receiptsEnabled],
  )

  // React Query para productos
  const { data: productsData } = useQuery({
    queryKey: ['products-for-sales'],
    queryFn: () => productsService.getAll({ per_page: 100, is_active: true }),
    retry: false,
  })

  // React Query para clientes
  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-sales'],
    queryFn: () => clientsService.getAll({ per_page: 100 }),
    retry: false,
  })

  // React Query para métodos de pago
  const { data: paymentMethodsData } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => paymentMethodsService.getAll(),
    retry: false,
  })

  const allProducts = Array.isArray(productsData?.items) ? productsData.items : []
  const allClients = Array.isArray(clientsData?.items) ? clientsData.items : []
  const billingClients = allClients.filter((client) => (client.current_account_mode || 'disabled') !== 'disabled')
  const [voucherType, setVoucherType] = useState<VoucherType>('quotation')
  const [showPrices, setShowPrices] = useState(true)
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null)
  const [editingVoucherDate, setEditingVoucherDate] = useState<string | null>(null)
  const [editingVoucherNotes, setEditingVoucherNotes] = useState<string | undefined>(undefined)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedOperatingClientId, setSelectedOperatingClientId] = useState<string>('')
  const [productSearch, setProductSearch] = useState('')
  const [budgetCode, setBudgetCode] = useState('')
  const [isLoadingBudget, setIsLoadingBudget] = useState(false)
  const [loadedBudgets, setLoadedBudgets] = useState<LoadedBudget[]>([])
  const [loadedBudgetsPriceStrategy, setLoadedBudgetsPriceStrategy] = useState<PriceStrategy>('historical')
  const [pendingBudgetData, setPendingBudgetData] = useState<{
    voucher: any
    priceCheck: any
  } | null>(null)
  const [items, setItems] = useState<CartItem[]>([])
  const [mobileSection, setMobileSection] = useState<MobileSalesSection>('items')
  const [showMobileVoucherMenu, setShowMobileVoucherMenu] = useState(false)
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const productListRef = useRef<HTMLDivElement>(null)
  const selectedRowRef = useRef<HTMLTableRowElement>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [paymentSelections, setPaymentSelections] = useState<Record<string, PaymentSelectionState>>({})

  const {
    data: authorizationsData,
    isError: authorizationsLoadError,
    error: authorizationsError,
  } = useQuery({
    queryKey: ['client-authorizations-for-sales', selectedClient?.id],
    queryFn: () =>
      clientAuthorizationsService.getAll({
        billing_client_id: selectedClient?.id,
        is_active: true,
        per_page: 100,
      }),
    enabled: voucherType === 'current_account' && !!selectedClient?.id,
    retry: false,
  })

  const authorizedOperatingClients = useMemo(() => {
    if (!selectedClient) return []

    const clientsById = new Map(allClients.map((client) => [client.id, client]))
    const auths = Array.isArray(authorizationsData?.items) ? authorizationsData.items : []
    const unique = new Map<string, Client>()

    // Siempre permitir que retire el titular
    unique.set(selectedClient.id, selectedClient)

    auths.forEach((auth) => {
      const client = clientsById.get(auth.operating_client_id)
      if (client) {
        unique.set(client.id, client)
      }
    })

    return Array.from(unique.values())
  }, [selectedClient, allClients, authorizationsData])

  const hasAuthorizedSubclient = useMemo(() => {
    if (!selectedClient) return false
    return authorizedOperatingClients.some((client) => client.id !== selectedClient.id)
  }, [authorizedOperatingClients, selectedClient])
  
  // Descuento general
  const [generalDiscount, setGeneralDiscount] = useState(0) // Descuento % sobre subtotal

  const formatCurrentAccountErrorMessage = (error: unknown): string => {
    const defaultMessage = formatErrorMessage(error)
    const normalized = defaultMessage.toLowerCase()

    if (normalized.includes('no existe autorización activa')) {
      return 'El subcliente no está autorizado para retirar por este titular. Revisalo en Cuenta Corriente → Autorizaciones.'
    }

    if (normalized.includes('excede el límite de crédito del cliente titular')) {
      return 'El remito supera el límite de crédito del titular. Ajustá montos/productos o actualizá el límite del cliente.'
    }

    if (normalized.includes('excede el límite del subcliente autorizado')) {
      return 'El remito supera el límite de crédito del subcliente autorizado. Ajustá la operación o su límite.'
    }

    if (normalized.includes('excede el sublímite configurado')) {
      return 'El remito supera el sublímite definido para este vínculo titular/subcliente.'
    }

    if (normalized.includes('cliente titular no tiene cuenta corriente habilitada')) {
      return 'El cliente titular no tiene Cuenta Corriente habilitada. Activala desde Clientes para continuar.'
    }

    if (normalized.includes('no tienes permiso') || normalized.includes('no autorizado')) {
      return 'No tenés permisos para emitir remitos de Cuenta Corriente. Pedile acceso a un administrador.'
    }

    return defaultMessage
  }

  // Mutation para convertir cotización en factura
  const convertQuotationMutation = useMutation({
    mutationFn: ({
      quotationId,
      payments,
      fiscalClientId,
      priceStrategy,
      sourceVoucherType,
    }: {
      quotationId: string
      payments?: VoucherPayment[]
      fiscalClientId?: string
      priceStrategy: PriceStrategy
      sourceVoucherType?: VoucherType2['voucher_type']
    }) => {
      if (sourceVoucherType === 'receipt') {
        return vouchersService.compileToInvoice([quotationId], payments, undefined, fiscalClientId, priceStrategy)
      }

      return vouchersService.convertToInvoice(quotationId, payments, fiscalClientId, priceStrategy)
    },
    onSuccess: async (data, variables) => {
      const sourceLabel = variables.sourceVoucherType === 'receipt' ? 'remito' : 'cotización'
      toast.success(`Factura generada a partir del ${sourceLabel}`, { icon: '✅' })

      // Emitir en ARCA/AFIP
      if (data.voucher_type.startsWith('invoice_')) {
        toast.loading('Emitiendo factura electrónica en ARCA/AFIP...', { id: 'emitting-conversion' })
        try {
          const emitResponse = await arcaService.emitInvoice({ voucher_id: data.id })
          if (emitResponse.success) {
            toast.success(
              `Factura emitida correctamente\nCAE: ${emitResponse.cae}`,
              { id: 'emitting-conversion', duration: 5000, icon: '🎉' }
            )
          } else {
            toast.error(
              `Error al emitir factura:\n${emitResponse.message}`,
              { id: 'emitting-conversion', duration: 7000 }
            )
          }
        } catch (error: any) {
          toast.error(
            `Error al emitir factura electrónica:\n${error.response?.data?.detail || error.message}`,
            { id: 'emitting-conversion', duration: 7000 }
          )
        }
      }

      // Descargar y mostrar PDF
      try {
        const pdfBlob = await vouchersService.getPdf(data.id)
        const blobUrl = URL.createObjectURL(pdfBlob)
        setPdfUrl(blobUrl)
        setPdfVoucherInfo({ type: data.voucher_type, number: data.number })
        setShowPdfModal(true)
      } catch (error) {
        toast.error('Error al abrir el PDF: ' + formatErrorMessage(error))
      }

      // Cerrar modales y refrescar cotizaciones
      setShowConvertQuotationModal(false)
      setShowPendingQuotationsModal(false)
      setSelectedQuotation(null)
      setSelectedConvertFiscalClientId('')
      setConvertPriceStrategy('historical')
      resetConvertPaymentSelections()
      refetchPendingQuotations()
    },
    onError: (error: any) => {
      const message = voucherType === 'current_account'
        ? formatCurrentAccountErrorMessage(error)
        : formatErrorMessage(error)
      toast.error(message)
    },
    onSettled: () => {
      setIsConvertingQuotation(false)
    }
  })

  // Mutation para compilar múltiples cotizaciones en una factura
  const compileToInvoiceMutation = useMutation({
    mutationFn: ({ quotationIds, payments, fiscalClientId, priceStrategy }: { quotationIds: string[]; payments?: VoucherPayment[]; fiscalClientId?: string; priceStrategy: PriceStrategy }) =>
      vouchersService.compileToInvoice(quotationIds, payments, undefined, fiscalClientId, priceStrategy),
    onSuccess: async (data) => {
      toast.success('Factura compilada correctamente desde múltiples presupuestos', { icon: '✅' })

      // Emitir en ARCA/AFIP
      if (data.voucher_type.startsWith('invoice_')) {
        toast.loading('Emitiendo factura electrónica en ARCA/AFIP...', { id: 'emitting-compile' })
        try {
          const emitResponse = await arcaService.emitInvoice({ voucher_id: data.id })
          if (emitResponse.success) {
            toast.success(
              `Factura emitida correctamente\nCAE: ${emitResponse.cae}`,
              { id: 'emitting-compile', duration: 5000, icon: '🎉' }
            )
          } else {
            toast.error(
              `Error al emitir factura:\n${emitResponse.message}`,
              { id: 'emitting-compile', duration: 7000 }
            )
          }
        } catch (error: any) {
          toast.error(
            `Error al emitir factura electrónica:\n${error.response?.data?.detail || error.message}`,
            { id: 'emitting-compile', duration: 7000 }
          )
        }
      }

      // Descargar y mostrar PDF
      try {
        const pdfBlob = await vouchersService.getPdf(data.id)
        const blobUrl = URL.createObjectURL(pdfBlob)
        setPdfUrl(blobUrl)
        setPdfVoucherInfo({ type: data.voucher_type, number: data.number })
        setShowPdfModal(true)
      } catch (error) {
        toast.error('Error al abrir el PDF: ' + formatErrorMessage(error))
      }

      // Limpiar todo
      setLoadedBudgets([])
      setItems([])
      setSelectedClient(null)
      setSelectedOperatingClientId('')
      setClientSearch('')
      setGeneralDiscount(0)
      setShowPrices(voucherType === 'receipt' || voucherType === 'current_account' ? false : true)
      setProductSearch('')
      setBudgetCode('')
      setLoadedBudgetsPriceStrategy('historical')
      resetPaymentSelections()
      refetchPendingQuotations()
    },
    onError: (error: any) => {
      const message = formatErrorMessage(error)
      toast.error(message)
    },
    onSettled: () => {
      setIsGenerating(false)
    }
  })

  // Mutation para crear comprobante
  const createVoucherMutation = useMutation({
    mutationFn: (data: VoucherCreate) => vouchersService.create(data),
    onSuccess: async (data) => {
      const isInvoice = data.voucher_type.startsWith('invoice_')
      
      toast.success('Comprobante generado correctamente', { icon: '✅' })
      
      // Si es factura, emitir electrónicamente
      if (isInvoice) {
        toast.loading('Emitiendo factura electrónica en ARCA/AFIP...', { id: 'emitting' })
        
        try {
          const emitResponse = await arcaService.emitInvoice({ voucher_id: data.id })
          
          if (emitResponse.success) {
            toast.success(
              `Factura emitida correctamente\nCAE: ${emitResponse.cae}\nVencimiento: ${emitResponse.cae_expiration}`,
              { 
                id: 'emitting',
                duration: 5000,
                icon: '🎉'
              }
            )
          } else {
            toast.error(
              `Error al emitir factura:\n${emitResponse.message}\n${emitResponse.errors?.join('\n') || ''}`,
              { 
                id: 'emitting',
                duration: 7000
              }
            )
          }
        } catch (error: any) {
          toast.error(
            `Error al emitir factura electrónica:\n${error.response?.data?.detail || error.message}`,
            { 
              id: 'emitting',
              duration: 7000
            }
          )
        }
      }
      
      // Descargar PDF con autenticación y abrirlo en modal
      try {
        console.log('🔍 Iniciando descarga de PDF para voucher:', data.id)
        const pdfBlob = await vouchersService.getPdf(data.id)
        console.log('✅ PDF descargado exitosamente. Tamaño:', pdfBlob.size, 'bytes')
        console.log('📄 Tipo de blob:', pdfBlob.type)
        
        const blobUrl = URL.createObjectURL(pdfBlob)
        console.log('🔗 Blob URL creada:', blobUrl)
        
        // Guardar la URL y la info del comprobante
        setPdfUrl(blobUrl)
        setPdfVoucherInfo({
          type: data.voucher_type,
          number: data.number
        })
        
        console.log('📋 Información del voucher guardada:', { type: data.voucher_type, number: data.number })
        
        // Abrir modal con el PDF
        setShowPdfModal(true)
        console.log('✨ Modal de PDF abierto')
        
      } catch (error) {
        console.error('❌ Error al descargar/abrir el PDF:', error)
        toast.error('Error al abrir el PDF: ' + formatErrorMessage(error))
      }
      
      // Limpiar
      setItems([])
      setSelectedClient(null)
      setSelectedOperatingClientId('')
      setClientSearch('')
      setGeneralDiscount(0)
      setShowPrices(voucherType === 'receipt' || voucherType === 'current_account' ? false : true)
      setProductSearch('')
      resetPaymentSelections()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
    onSettled: () => {
      setIsGenerating(false)
    }
  })

  const updateQuotationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: VoucherUpdate }) => vouchersService.update(id, data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      void queryClient.invalidateQueries({ queryKey: ['pending-quotations'] })

      toast.success('Cotización actualizada correctamente', { icon: '✅' })
      setEditingVoucherId(null)
      setEditingVoucherDate(null)
      setEditingVoucherNotes(undefined)
      sessionStorage.removeItem('sales-edit-voucher')

      setItems([])
      setSelectedClient(null)
      setSelectedOperatingClientId('')
      setClientSearch('')
      setGeneralDiscount(0)
      setShowPrices(voucherType === 'receipt' || voucherType === 'current_account' ? false : true)
      setProductSearch('')
      resetPaymentSelections()

      setPdfVoucherInfo({ type: data.voucher_type, number: data.number })
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
    onSettled: () => {
      setIsGenerating(false)
    },
  })

  // Modales
  const [showQuantityModal, setShowQuantityModal] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)
  const [showClientSelectorModal, setShowClientSelectorModal] = useState(false)
  const [showDraftsModal, setShowDraftsModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false)
  const [showSaveDraftSuccessModal, setShowSaveDraftSuccessModal] = useState(false)
  const [showDeleteDraftModal, setShowDeleteDraftModal] = useState(false)
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfVoucherInfo, setPdfVoucherInfo] = useState<{ type: string, number: string } | null>(null)

  // === Modal de diferencias de precios al cargar presupuesto ===
  const [showPriceDiffModal, setShowPriceDiffModal] = useState(false)

  // === Modales de cotizaciones/remitos pendientes ===
  const [showPendingQuotationsModal, setShowPendingQuotationsModal] = useState(false)
  const [showConvertQuotationModal, setShowConvertQuotationModal] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<VoucherType2 | null>(null)
  const [selectedConvertFiscalClientId, setSelectedConvertFiscalClientId] = useState('')
  const [convertPriceStrategy, setConvertPriceStrategy] = useState<PriceStrategy>('historical')
  const [quotationSearch, setQuotationSearch] = useState('')
  const [quotationTypeFilter, setQuotationTypeFilter] = useState<'all' | 'quotation' | 'receipt'>('all')
  // Fechas predeterminadas: primer y último día del mes actual
  const _today = new Date()
  const _firstOfMonth = new Date(_today.getFullYear(), _today.getMonth(), 1)
  const _lastOfMonth = new Date(_today.getFullYear(), _today.getMonth() + 1, 0)
  const _fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [quotationDateFrom, setQuotationDateFrom] = useState(_fmt(_firstOfMonth))
  const [quotationDateTo, setQuotationDateTo] = useState(_fmt(_lastOfMonth))
  const [isConvertingQuotation, setIsConvertingQuotation] = useState(false)
  const [convertPaymentSelections, setConvertPaymentSelections] = useState<Record<string, PaymentSelectionState>>({})

  // React Query para comprobantes pendientes de facturar (cotizaciones y remitos)
  // Se ejecuta solo cuando el modal está abierto
  const { data: pendingQuotationsData, refetch: refetchPendingQuotations } = useQuery({
    queryKey: ['pending-quotations', quotationSearch, quotationTypeFilter, quotationDateFrom, quotationDateTo],
    queryFn: () => vouchersService.getPendingQuotations({
      per_page: 100,
      search: quotationSearch || undefined,
      voucher_type: quotationTypeFilter === 'all' ? undefined : quotationTypeFilter,
      date_from: quotationDateFrom || undefined,
      date_to: quotationDateTo || undefined,
    }),
    enabled: showPendingQuotationsModal,
    retry: false,
  })

  const pendingQuotations = useMemo(
    () =>
      (pendingQuotationsData?.items || []).filter((voucher) => {
        if (voucher.voucher_type === 'receipt' && !receiptsEnabled) {
          return false
        }
        return true
      }),
    [pendingQuotationsData?.items, receiptsEnabled],
  )

  const voucherTotalsPreviewPayload = useMemo<VoucherTotalsPreviewRequest | null>(() => {
    if (!selectedClient || items.length === 0) return null

    const normalizedItems = normalizeCartItems(items)
    if (normalizedItems.length === 0) return null

    return {
      voucher_type: resolveBackendVoucherType(voucherType, selectedClient.tax_condition),
      general_discount: generalDiscount,
      items: normalizedItems.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.net_price,
        discount_percent: item.discount,
      })),
    }
  }, [selectedClient, items, voucherType, generalDiscount])

  const totalsPreviewQuery = useQuery({
    queryKey: ['sales-voucher-totals-preview', voucherTotalsPreviewPayload],
    queryFn: () => vouchersService.previewTotals(voucherTotalsPreviewPayload as VoucherTotalsPreviewRequest),
    enabled: Boolean(voucherTotalsPreviewPayload),
    staleTime: 5_000,
    retry: false,
  })

  // Panel de preview de productos seleccionados temporalmente con cantidad y descuento
  interface TempProduct extends Product {
    tempQuantity: number | string
    tempDiscount: number | string
  }
  const [tempSelectedProducts, setTempSelectedProducts] = useState<TempProduct[]>([])
  
  // Flag para bloquear eventos de teclado temporalmente después de confirmar
  const blockKeyboardEventsRef = useRef(false)

  // Formulario de cliente
  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: '',
    document_type: 'CUIT',
    document_number: '',
    tax_condition: 'CF',
  })

  const normalizedProductSearch = safeText(productSearch).toLowerCase()
  const normalizedClientSearch = safeText(clientSearch).toLowerCase()

  const searchInputRef = useRef<HTMLInputElement>(null)
  const clientNameInputRef = useRef<HTMLInputElement>(null)
  
  // Refs para los inputs del modal de configuración
  const modalInputsRef = useRef<(HTMLInputElement | null)[]>([])

  // Filtrar productos según búsqueda
  const filteredProducts = allProducts
    .map(p => ({
      id: p.id,
      code: safeText(p.code),
      description: safeText(p.description),
      net_price: safeNumber(p.net_price),
      sale_price: safeNumber(p.sale_price),
    }))
    .filter(p =>
      p.code.toLowerCase().includes(normalizedProductSearch) ||
      p.description.toLowerCase().includes(normalizedProductSearch)
    )

  // Filtrar clientes según búsqueda
  const clientsForSelection = voucherType === 'current_account' ? billingClients : allClients

  const filteredClients = clientsForSelection.filter(c =>
    safeText(c.name).toLowerCase().includes(normalizedClientSearch) ||
    safeText(c.document_number).includes(safeText(clientSearch))
  )

  const paymentMethods = paymentMethodsData || []

  useEffect(() => {
    const raw = sessionStorage.getItem('sales-edit-voucher')
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as VoucherEditPayload
      if (parsed?.id && parsed.voucher_type === 'quotation' && parsed.client && Array.isArray(parsed.items)) {
        const normalizedItems = normalizeCartItems(parsed.items)
        if (normalizedItems.length === 0) {
          throw new Error('Cotización sin renglones válidos para editar')
        }

        setVoucherType('quotation')
        // Cotización siempre incluye precios según PRD
        setShowPrices(true)
        setEditingVoucherId(parsed.id)
        setEditingVoucherDate(parsed.date)
        setEditingVoucherNotes(parsed.notes)
        setSelectedClient(parsed.client)
        setSelectedOperatingClientId('')
        setClientSearch(parsed.client.name)
        setItems(normalizedItems)
        setGeneralDiscount(parsed.general_discount || 0)
        toast.success('Cotización cargada en modo edición', { icon: '✏️' })
      }
    } catch {
      sessionStorage.removeItem('sales-edit-voucher')
    }
  }, [])

  // Hidratar ítems enviados desde el asistente IA (una sola vez por handoff)
  useEffect(() => {
    // Fallback robusto para handoff desde IA (sobrevive a refresh/navegación)
    try {
      const raw = sessionStorage.getItem('ai-sales-preload')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mappedFromSession: CartItem[] = parsed
            .filter((d: any) => d?.product)
            .map((d: any) => ({
              id: d.product.id,
              code: safeText(d.product.code),
              description: safeText(d.product.description),
              net_price: safeNumber(d.product.net_price),
              sale_price: safeNumber(d.product.sale_price),
              quantity: Math.max(1, safeNumber(d.qty ?? d.item?.qty ?? 1)),
              discount: 0,
            }))

          if (mappedFromSession.length > 0) {
            setItems(mappedFromSession)
            toast.success('Items del asistente cargados en la venta', { icon: '🛒' })
          }
        }
        sessionStorage.removeItem('ai-sales-preload')
      }
    } catch {
      // no-op
    }

    if (!aiPreloadedFromAI) return

    const mappedFromAI: CartItem[] = aiPreloadedItems.map((item) => ({
      id: item.productId,
      code: item.code,
      description: item.description,
      net_price: item.unitPrice / 1.21, // Calcular precio sin IVA
      sale_price: item.unitPrice,
      quantity: item.qty,
      discount: 0,
    }))

    if (mappedFromAI.length > 0) {
      setItems(mappedFromAI)
      toast.success('Items del asistente cargados en la venta', { icon: '🛒' })
    }

    clearAIPreload()
  }, [aiPreloadedFromAI, aiPreloadedItems, clearAIPreload])

  useEffect(() => {
    if (voucherType === 'invoice' && !invoicingEnabled) {
      setVoucherType('quotation')
      setShowPrices(true)
    }

    if (voucherType === 'receipt' && !receiptsEnabled) {
      setVoucherType('quotation')
      setShowPrices(true)
    }
  }, [voucherType, invoicingEnabled, receiptsEnabled])

  useEffect(() => {
    if (voucherType !== 'current_account') {
      return
    }

    if (!selectedClient) {
      setSelectedOperatingClientId('')
      return
    }

    const selectedIsAvailable = authorizedOperatingClients.some(
      (client) => client.id === selectedOperatingClientId,
    )

    if (!selectedOperatingClientId || !selectedIsAvailable) {
      setSelectedOperatingClientId(selectedClient.id)
    }
  }, [voucherType, selectedClient, selectedOperatingClientId, authorizedOperatingClients])

  useEffect(() => {
    if (!paymentMethodsData || paymentMethodsData.length === 0) return

    setPaymentSelections((prev) => {
      const next = { ...prev }

      paymentMethodsData.forEach((method) => {
        if (!next[method.id]) {
          next[method.id] = {
            selected: false,
            amount: '',
            reference: ''
          }
        }
      })

      return next
    })
  }, [paymentMethodsData])

  // Manejar eventos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cerrar modal de productos con F1
      if (showQuantityModal && e.key === 'F1') {
        e.preventDefault()
        setShowQuantityModal(false)
        return
      }

      // Bloquear eventos si están bloqueados temporalmente o hay modales abiertas
      if (blockKeyboardEventsRef.current || showQuantityModal || showClientModal || showDraftsModal) return

      if (e.key === 'Escape') {
        e.preventDefault()
        
        // Si hay productos temporales, abrir modal para editar
        if (tempSelectedProducts.length > 0) {
          setShowQuantityModal(true)
        } 
        // Si NO hay temporales pero hay 1 producto filtrado, agregarlo y abrir modal
        else if (filteredProducts.length === 1) {
          const product = filteredProducts[0]
          setTempSelectedProducts([{ ...product, tempQuantity: 1, tempDiscount: 0 }])
          setShowQuantityModal(true)
        }
        // Si NO hay temporales pero hay un producto seleccionado, agregarlo y abrir modal
        else if (filteredProducts.length > 0) {
          const product = filteredProducts[selectedProductIndex]
          if (product) {
            setTempSelectedProducts([{ ...product, tempQuantity: 1, tempDiscount: 0 }])
            setShowQuantityModal(true)
          }
        }
      } else if (e.key === 'Enter' && filteredProducts.length > 0) {
        e.preventDefault()
        // Toggle el producto seleccionado actual en la lista temporal
        const product = filteredProducts[selectedProductIndex]
        if (product) {
          toggleProductInTemp(product)
        }
      } else if (e.key === 'ArrowDown' && filteredProducts.length > 0) {
        e.preventDefault()
        setSelectedProductIndex((prev) =>
          prev < filteredProducts.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp' && filteredProducts.length > 0) {
        e.preventDefault()
        setSelectedProductIndex((prev) => (prev > 0 ? prev - 1 : 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredProducts, selectedProductIndex, showQuantityModal, showClientModal, showDraftsModal, tempSelectedProducts])

  // Reset selected index cuando cambia la búsqueda
  useEffect(() => {
    setSelectedProductIndex(0)
  }, [productSearch])

  // Auto-scroll: cuando el índice seleccionado cambia por teclado,
  // hace scroll para que el item quede visible dentro del contenedor
  useEffect(() => {
    if (selectedRowRef.current && productListRef.current) {
      selectedRowRef.current.scrollIntoView({
        block: 'nearest', // solo scrollea si el item está fuera de vista
        behavior: 'smooth',
      })
    }
  }, [selectedProductIndex])

  // Focus handlers
  useEffect(() => {
    if (showQuantityModal) {
      // Focus en el primer input (cantidad del primer producto)
      setTimeout(() => {
        if (modalInputsRef.current[0]) {
          modalInputsRef.current[0].focus()
          modalInputsRef.current[0].select()
        }
      }, 100)
    } else {
      // Limpiar refs cuando se cierra
      modalInputsRef.current = []
    }
  }, [showQuantityModal])

  useEffect(() => {
    if (showClientModal && clientNameInputRef.current) {
      clientNameInputRef.current.focus()
    }
  }, [showClientModal])
  
  // Función para navegar entre inputs del modal
  const handleModalInputKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // Evitar que el evento se propague al listener global
      
      const nextIndex = index + 1
      
      // Si hay un siguiente input, moverse a él
      if (nextIndex < modalInputsRef.current.length) {
        modalInputsRef.current[nextIndex]?.focus()
        modalInputsRef.current[nextIndex]?.select()
      } else {
        // Si era el último input, agregar al carrito
        confirmTempProducts()
      }
    }
  }

  // Cargar borradores al iniciar
  useEffect(() => {
    const parsedDrafts = parseStoredDrafts(localStorage.getItem('sales-drafts'))
    if (parsedDrafts.length > 0) {
      setDrafts(parsedDrafts)
    }
  }, [])

  // Toggle producto en lista temporal (agregar o quitar)
  const toggleProductInTemp = (product: Product) => {
    const alreadyInTemp = tempSelectedProducts.find(p => p.id === product.id)
    
    if (alreadyInTemp) {
      // Si ya está, quitarlo
      setTempSelectedProducts(tempSelectedProducts.filter(p => p.id !== product.id))
    } else {
      // Si no está, agregarlo
      setTempSelectedProducts([...tempSelectedProducts, { ...product, tempQuantity: 1, tempDiscount: 0 }])
    }
  }

  // Remover producto temporal
  const removeFromTemp = (productId: string) => {
    setTempSelectedProducts(tempSelectedProducts.filter(p => p.id !== productId))
  }

  // Actualizar cantidad/descuento de producto temporal
  const updateTempProduct = (productId: string, field: 'tempQuantity' | 'tempDiscount', value: number | string) => {
    setTempSelectedProducts(tempSelectedProducts.map(p =>
      p.id === productId ? { ...p, [field]: value } : p
    ))
  }

  // Confirmar y agregar todos los productos temporales al carrito
  const confirmTempProducts = () => {
    if (tempSelectedProducts.length === 0) {
      toast.error('No hay productos seleccionados')
      return
    }

    // Agregar cada producto con su cantidad y descuento configurados
    const newItems = [...items]
    tempSelectedProducts.forEach(product => {
      const existing = newItems.find(i => i.id === product.id)
      const quantityValue = Math.max(1, Number(product.tempQuantity) || 0)
      const discountValue = Math.max(0, Math.min(100, Number(product.tempDiscount) || 0))
      if (existing) {
        existing.quantity += quantityValue
        existing.discount = discountValue
      } else {
        newItems.push({ 
          ...product, 
          quantity: quantityValue,
          discount: discountValue,
        })
      }
    })
    setItems(newItems)

    // Limpiar TODO completamente en el orden correcto
    // 1. Bloquear eventos de teclado temporalmente para evitar que el Enter se propague
    blockKeyboardEventsRef.current = true
    
    // 2. Cerrar modal
    setShowQuantityModal(false)
    
    // 3. Limpiar estados sin perder posición del cursor
    setTempSelectedProducts([])
    // Mantener productSearch y selectedProductIndex para no perder posición
    
    // 4. Focus y desbloquear eventos después de un delay (sin limpiar search)
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus()
      }
      // Desbloquear eventos después de que todo se haya procesado
      blockKeyboardEventsRef.current = false
    }, 150)
  }

  const removeItem = (id: string) => {
    setItems((prevItems) => prevItems.filter(i => i.id !== id))
  }

  const updateItem = (id: string, field: 'quantity' | 'discount', value: number) => {
    setItems((prevItems) => prevItems.map(i =>
      i.id === id ? { ...i, [field]: value } : i
    ))
  }

  const calculateItemTotal = (item: CartItem) => {
    // Precio normal con IVA incluido
    const subtotal = item.sale_price * item.quantity
    const discountAmount = subtotal * (item.discount / 100)
    return subtotal - discountAmount
  }

  const handleVoucherTypeChange = (nextType: VoucherType) => {
    setVoucherType(nextType)
    if (nextType !== 'current_account') {
      setSelectedOperatingClientId('')
    }

    // Defaults por tipo (el usuario puede ajustar en cotización/remito)
    if (nextType === 'invoice') {
      setShowPrices(true)
      return
    }

    if (nextType === 'receipt') {
      setShowPrices(false)
      return
    }

    if (nextType === 'current_account') {
      if (selectedClient?.id) {
        setSelectedOperatingClientId(selectedClient.id)
      }
      setShowPrices(false)
      return
    }

    setShowPrices(true)
  }

  const clearSalesScreen = () => {
    setItems([])
    setSelectedClient(null)
    setSelectedOperatingClientId('')
    setClientSearch('')
    setProductSearch('')
    setBudgetCode('')
    setLoadedBudgets([])
    setLoadedBudgetsPriceStrategy('historical')
    setVoucherType('quotation')
    setShowPrices(true)
    setEditingVoucherId(null)
    setEditingVoucherDate(null)
    setEditingVoucherNotes(undefined)
    setGeneralDiscount(0)
    setConvertPriceStrategy('historical')
    sessionStorage.removeItem('sales-edit-voucher')
    resetPaymentSelections()
  }

  const handleClear = () => {
    if (items.length > 0 || selectedClient) {
      setShowClearConfirmModal(true)
      return
    }

    clearSalesScreen()
  }

  const handleConfirmClear = () => {
    clearSalesScreen()
    setShowClearConfirmModal(false)
    toast.success('Pantalla de ventas limpiada')
  }

  const handleLoadBudget = async () => {
    if (!budgetCode.trim()) {
      return
    }

    const budgetCodeTrimmed = budgetCode.trim()

    setIsLoadingBudget(true)
    try {
      // 1. First check if prices differ from catalog
      const priceCheck = await vouchersService.checkPrices(budgetCodeTrimmed)

      // 2. Get the voucher data
      const voucher = await vouchersService.getByCode(budgetCodeTrimmed)

      // Verificar que sea una cotización
      if (voucher.voucher_type !== 'quotation') {
        toast.error('El código no corresponde a una cotización/presupuesto')
        return
      }

      // Verificar si ya fue facturada
      if (voucher.invoiced_voucher_id) {
        toast.error('Esta cotización ya fue convertida a factura')
        return
      }

      // Verificar que todos los presupuestos sean del mismo cliente
      if (loadedBudgets.length > 0 && selectedClient) {
        if (voucher.client && voucher.client.id !== selectedClient.id) {
          toast.error('No se pueden mezclar presupuestos de diferentes clientes')
          return
        }
      }

      // 3. If there are price differences, show modal and pause
      if (priceCheck.has_differences) {
        setPendingBudgetData({ voucher, priceCheck })
        setShowPriceDiffModal(true)
        setIsLoadingBudget(false)
        return
      }

      // 4. No differences — load directly
      applyBudgetToCart(voucher, 'historical')

      // Limpiar el campo de código
      setBudgetCode('')
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message || 'Presupuesto no encontrado'
      toast.error(errorMessage)
    } finally {
      setIsLoadingBudget(false)
    }
  }

  // Apply a loaded budget to the cart with the chosen price strategy
  const applyBudgetToCart = (voucher: any, priceStrategy: PriceStrategy) => {
    // Cargar los datos del cliente (solo la primera vez)
    if (!selectedClient && voucher.client) {
      setSelectedClient(voucher.client as Client)
      setClientSearch(voucher.client.name)
    }

    // Agregar a la lista de presupuestos cargados
    const newBudget: LoadedBudget = {
      id: voucher.id,
      code: voucher.number,
      clientName: voucher.client?.name || selectedClient?.name || 'Sin cliente',
      itemCount: voucher.items?.length || 0,
    }
    setLoadedBudgets((prev) => [...prev, newBudget])

    // Cargar los items del presupuesto con referencia al sourceBudgetId
    if (voucher.items && voucher.items.length > 0) {
      const newItems: CartItem[] = voucher.items.map((item: any) => {
        const useCurrentPrice = priceStrategy === 'current'
        // El sale_price guardado en DB incluye IVA, calculamos net_price (sin IVA)
        const itemSalePrice = useCurrentPrice
          ? (item.product?.sale_price ?? Number(item.unit_price))
          : Number(item.unit_price)
        const itemNetPrice = itemSalePrice / 1.21
        return {
          id: `${voucher.id}-${item.product_id}`,
          product_id: item.product_id,
          code: item.code,
          description: item.description,
          net_price: itemNetPrice,
          sale_price: itemSalePrice,
          quantity: Number(item.quantity),
          discount: Number(item.discount_percent),
          sourceBudgetId: voucher.id,
        }
      })
      setItems((prev) => [...prev, ...newItems])

      const strategyLabel = priceStrategy === 'historical' ? 'precios originales' : 'precios vigentes'
      toast.success(`Presupuesto ${voucher.number} cargado con ${newItems.length} productos (${strategyLabel})`, { icon: '📋' })
    }
  }

  // Función para quitar un presupuesto cargado
  const handleRemoveLoadedBudget = (budgetId: string) => {
    // Quitar de la lista de presupuestos cargados
    const updatedBudgets = loadedBudgets.filter(b => b.id !== budgetId)
    setLoadedBudgets(updatedBudgets)

    // Quitar los items que有这个 sourceBudgetId
    const updatedItems = items.filter(item => item.sourceBudgetId !== budgetId)
    setItems(updatedItems)

    // Si no quedan presupuestos, limpiar el cliente también
    if (updatedBudgets.length === 0) {
      setSelectedClient(null)
      setClientSearch('')
      setSelectedOperatingClientId('')
    }

    toast.success('Presupuesto removido')
  }

  const handleGenerateClick = () => {
    if (items.length === 0) {
      toast.error('No hay productos en la lista')
      return
    }

    if (!selectedClient) {
      toast.error('Debe seleccionar un cliente')
      return
    }

    if (voucherType === 'current_account' && selectedClient.current_account_mode === 'disabled') {
      toast.error('El cliente titular no tiene Cuenta Corriente habilitada. Activala desde Clientes antes de emitir.')
      return
    }

    if (voucherType === 'current_account' && !selectedOperatingClientId && selectedClient.id) {
      setSelectedOperatingClientId(selectedClient.id)
    }

    // Mostrar modal de confirmación
    setShowConfirmModal(true)
  }

  const handleConfirmGenerate = async () => {
    if (!selectedClient) {
      toast.error('Debe seleccionar un cliente')
      return
    }

    if (voucherType === 'current_account' && selectedClient.current_account_mode === 'disabled') {
      toast.error('El cliente titular no tiene Cuenta Corriente habilitada')
      return
    }

    if (voucherType === 'invoice' && voucherTotalsPreviewPayload) {
      const previewResult = await totalsPreviewQuery.refetch()
      if (previewResult.error) {
        toast.error('No se pudo validar el total con backend. Reintentá en unos segundos.')
        return
      }
    }

    const paymentValidation = validatePayments()
    if (!paymentValidation.valid) {
      toast.error(paymentValidation.message || 'Verifique los métodos de pago')
      return
    }

    setShowConfirmModal(false)
    
    setIsGenerating(true)

    if (voucherType === 'invoice' && !invoicingEnabled) {
      toast.error('Facturación deshabilitada para este tenant')
      setIsGenerating(false)
      return
    }

    if (voucherType === 'receipt' && !receiptsEnabled) {
      toast.error('Remitos deshabilitados para este tenant')
      setIsGenerating(false)
      return
    }

    // Si hay múltiples presupuestos cargados y es factura, usar compileToInvoice
    if (loadedBudgets.length >= 2 && voucherType === 'invoice') {
      const quotationIds = loadedBudgets.map(b => b.id)
      compileToInvoiceMutation.mutate({
        quotationIds,
        payments: buildPaymentsPayload(),
        fiscalClientId: selectedClient.id,
        priceStrategy: loadedBudgetsPriceStrategy,
      })
      return
    }

    // Si hay 1 presupuesto cargado y es factura, usar convertQuotationMutation
    if (loadedBudgets.length === 1 && voucherType === 'invoice') {
      convertQuotationMutation.mutate({
        quotationId: loadedBudgets[0].id,
        payments: buildPaymentsPayload(),
        fiscalClientId: selectedClient.id,
        priceStrategy: loadedBudgetsPriceStrategy,
      })
      return
    }
    
    // Mapear tipo de comprobante (simplificado para MVP)
    let backendType = 'quotation'
    if (voucherType === 'receipt') backendType = 'receipt'
    if (voucherType === 'current_account') backendType = 'receipt'
    if (voucherType === 'invoice') {
      // Lógica simple: Si es RI -> A, sino B
      backendType = selectedClient.tax_condition === 'RI' ? 'invoice_a' : 'invoice_b'
    }

    // Obtener fecha local (sin conversión UTC)
    const today = new Date()
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const normalizedItems = normalizeCartItems(items)
    if (normalizedItems.length === 0) {
      toast.error('No hay renglones válidos para guardar')
      setIsGenerating(false)
      return
    }

    const operatingClientIdForPayload =
      voucherType === 'current_account'
        ? selectedOperatingClientId || selectedClient.id
        : undefined

    const voucherData: VoucherCreate = {
      client_id: selectedClient.id,
      voucher_type: backendType as any,
      date: localDate,
      show_prices: voucherType === 'invoice' || voucherType === 'quotation' ? true : showPrices,
      is_current_account: voucherType === 'current_account',
      billing_client_id: voucherType === 'current_account' ? selectedClient.id : undefined,
      operating_client_id: operatingClientIdForPayload,
      general_discount: generalDiscount,
      items: normalizedItems.map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.net_price, // Enviamos el precio SIN IVA para que el backend calcule el IVA correctamente
        discount_percent: item.discount
      })),
      payments: buildPaymentsPayload(),
    }

    if (editingVoucherId) {
      if (backendType !== 'quotation') {
        toast.error('Solo se puede actualizar una cotización. Cambiá a Cotización o limpiá la edición.')
        setIsGenerating(false)
        return
      }

      const updatePayload: VoucherUpdate = {
        client_id: voucherData.client_id,
        date: editingVoucherDate || voucherData.date,
        notes: editingVoucherNotes,
        show_prices: voucherData.show_prices,
        general_discount: voucherData.general_discount,
        items: voucherData.items,
      }

      updateQuotationMutation.mutate({ id: editingVoucherId, data: updatePayload })
      return
    }

    createVoucherMutation.mutate(voucherData)
  }

  const handleSaveDraft = () => {
    if (items.length === 0) {
      toast.error('No hay productos para guardar')
      return
    }

    if (!selectedClient) {
      toast.error('Debe seleccionar un cliente antes de guardar el borrador')
      return
    }

    const draft: Draft = {
      id: Date.now().toString(),
      voucherType,
      client: selectedClient,
      selectedOperatingClientId: voucherType === 'current_account' ? selectedOperatingClientId : undefined,
      items,
      subtotal: subtotal,
      iva: iva,
      total: total,
      generalDiscount,
      showPrices,
      createdAt: new Date().toISOString(),
    }

    const savedDrafts = [...drafts, draft]
    setDrafts(savedDrafts)
    localStorage.setItem('sales-drafts', JSON.stringify(savedDrafts))

    // Mostrar modal de éxito
    setShowSaveDraftSuccessModal(true)

    // Limpiar después de guardar
    setItems([])
    setSelectedClient(null)
    setSelectedOperatingClientId('')
    setClientSearch('')
    setProductSearch('')
    setShowPrices(voucherType === 'receipt' || voucherType === 'current_account' ? false : true)
  }

  const loadDraft = (draft: Draft) => {
    setEditingVoucherId(null)
    setEditingVoucherDate(null)
    setEditingVoucherNotes(undefined)
    sessionStorage.removeItem('sales-edit-voucher')
    setVoucherType(draft.voucherType)
    setShowPrices(draft.showPrices ?? (draft.voucherType === 'receipt' || draft.voucherType === 'current_account' ? false : true))
    setSelectedClient(draft.client)
    setSelectedOperatingClientId(
      draft.voucherType === 'current_account'
        ? draft.selectedOperatingClientId || draft.client.id
        : '',
    )
    setClientSearch(draft.client.name)
    setItems(draft.items)
    setGeneralDiscount(draft.generalDiscount || 0)
    setShowDraftsModal(false)
  }

  const handleDeleteDraftClick = (draftId: string) => {
    setDraftToDelete(draftId)
    setShowDeleteDraftModal(true)
  }

  const confirmDeleteDraft = () => {
    if (draftToDelete) {
      const updatedDrafts = drafts.filter(d => d.id !== draftToDelete)
      setDrafts(updatedDrafts)
      localStorage.setItem('sales-drafts', JSON.stringify(updatedDrafts))
      toast.success('Borrador eliminado correctamente')
    }
    setShowDeleteDraftModal(false)
    setDraftToDelete(null)
  }

  const handleDownloadPdf = () => {
    if (pdfUrl && pdfVoucherInfo) {
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `comprobante_${pdfVoucherInfo.type}_${pdfVoucherInfo.number}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('PDF descargado correctamente')
    }
  }

  const handlePrintPdf = () => {
    if (pdfUrl) {
      // Abrir en nueva ventana para imprimir
      const printWindow = window.open(pdfUrl, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    }
  }

  const handleClosePdfModal = () => {
    setShowPdfModal(false)
    // Limpiar URL después de cerrar
    if (pdfUrl) {
      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl)
        setPdfUrl(null)
        setPdfVoucherInfo(null)
      }, 500)
    }
  }

  const handleCreateClient = () => {
    const client: Client = {
      id: Date.now().toString(),
      name: newClient.name || '',
      document_type: newClient.document_type || 'CUIT',
      document_number: newClient.document_number || '',
      tax_condition: newClient.tax_condition || 'CF',
      street: newClient.street,
      street_number: newClient.street_number,
      floor: newClient.floor,
      apartment: newClient.apartment,
      city: newClient.city,
      province: newClient.province,
      postal_code: newClient.postal_code,
      phone: newClient.phone,
      email: newClient.email,
      notes: newClient.notes,
    }

    setSelectedClient(client)
    setSelectedOperatingClientId(voucherType === 'current_account' ? client.id : '')
    setClientSearch(client.name)
    setShowClientModal(false)
    setNewClient({
      name: '',
      document_type: 'CUIT',
      document_number: '',
      tax_condition: 'CF',
    })
  }

  // Restablecer selección de métodos de pago
  const resetPaymentSelections = () => {
    if (paymentMethods.length === 0) {
      setPaymentSelections({})
      return
    }

    const next: Record<string, PaymentSelectionState> = {}
    paymentMethods.forEach((method) => {
      next[method.id] = {
        selected: false,
        amount: '',
        reference: ''
      }
    })

    setPaymentSelections(next)
  }

  // Inicializar/resetear pagos del modal de conversión
  const resetConvertPaymentSelections = () => {
    if (paymentMethods.length === 0) {
      setConvertPaymentSelections({})
      return
    }
    const next: Record<string, PaymentSelectionState> = {}
    paymentMethods.forEach((method) => {
      next[method.id] = { selected: false, amount: '', reference: '' }
    })
    setConvertPaymentSelections(next)
  }

  // Inicializar pagos de conversión cuando se selecciona una cotización
  const handleSelectQuotationToConvert = (quotation: VoucherType2) => {
    setSelectedQuotation(quotation)
    setSelectedConvertFiscalClientId(quotation.client?.id || '')
    setConvertPriceStrategy('historical')
    // Pre-inicializar los métodos de pago
    if (paymentMethods.length > 0) {
      const next: Record<string, PaymentSelectionState> = {}
      paymentMethods.forEach((method) => {
        next[method.id] = { selected: false, amount: '', reference: '' }
      })
      setConvertPaymentSelections(next)
    }
    setShowPendingQuotationsModal(false)
    setShowConvertQuotationModal(true)
  }

  // Helper: calcular total correcto desde cotización del backend
  // unit_price en la DB no incluye IVA, por eso hay que recalcular
  const calculateQuotationTotal = (quotation: any): number => {
    const backendTotal = Number(quotation?.total)
    if (Number.isFinite(backendTotal) && backendTotal > 0) {
      return roundMoney(backendTotal)
    }

    const items = quotation.items || []
    const generalDiscountFactor = 1 - ((Number(quotation.general_discount) || 0) / 100)
    const total = items.reduce((acc: number, item: any) => {
      const unitPrice = Number(item.unit_price) || 0
      const qty = Number(item.quantity) || 0
      const discount = Number(item.discount_percent) || 0
      const itemDiscountFactor = 1 - (discount / 100)

      const subtotalLine = roundMoney(unitPrice * qty * itemDiscountFactor * generalDiscountFactor)
      const ivaLine = roundMoney(subtotalLine * 0.21)
      const totalLine = roundMoney(subtotalLine + ivaLine)

      return acc + totalLine
    }, 0)

    return roundMoney(total)
  }

  // Toggle método de pago en modal de conversión
  const handleConvertTogglePayment = (methodId: string, selected: boolean) => {
    if (!selectedQuotation) return
    setConvertPaymentSelections((prev) => {
      const current = prev[methodId] || { selected: false, amount: '', reference: '' }
      if (selected) {
        const currentlyAssigned = Object.entries(prev).reduce((acc, [id, data]) => {
          if (id === methodId || !data.selected) return acc
          const amountValue = Number(data.amount)
          return acc + (Number.isFinite(amountValue) ? amountValue : 0)
        }, 0)
        const quotationTotal = calculateQuotationTotal(selectedQuotation)
        const difference = Math.max(0, quotationTotal - currentlyAssigned)
        const newAmount = (!current.amount && difference > 0) ? difference.toFixed(2) : current.amount
        return { ...prev, [methodId]: { ...current, selected, amount: newAmount, reference: current.reference || '' } }
      }
      return { ...prev, [methodId]: { ...current, selected, amount: '', reference: '', extra_date: '' } }
    })
  }

  // Actualizar monto en modal de conversión
  const handleConvertPaymentAmountChange = (methodId: string, value: string) => {
    if (!selectedQuotation) return
    setConvertPaymentSelections((prev) => {
      const quotationTotal = calculateQuotationTotal(selectedQuotation)
      const otherSelectedMethods = Object.entries(prev).filter(([id, data]) => id !== methodId && data.selected)
      const newSelections = { ...prev, [methodId]: { ...prev[methodId], amount: value } }
      if (otherSelectedMethods.length === 1) {
        const otherMethodId = otherSelectedMethods[0][0]
        const newValueNumber = Number(value)
        if (Number.isFinite(newValueNumber) && newValueNumber <= quotationTotal) {
          newSelections[otherMethodId] = { ...newSelections[otherMethodId], amount: (quotationTotal - newValueNumber).toFixed(2) }
        }
      }
      return newSelections
    })
  }

  // Actualizar referencia en modal de conversión
  const handleConvertPaymentReferenceChange = (methodId: string, value: string) => {
    setConvertPaymentSelections((prev) => ({
      ...prev,
      [methodId]: { ...prev[methodId], reference: value }
    }))
  }

  // Actualizar fecha extra en modal de conversión
  const handleConvertPaymentExtraDateChange = (methodId: string, value: string) => {
    setConvertPaymentSelections((prev) => ({
      ...prev,
      [methodId]: { ...prev[methodId], extra_date: value }
    }))
  }

  // Construir payload de pagos para conversión
  const buildConvertPaymentsPayload = (): VoucherPayment[] | undefined => {
    const payload = paymentMethods
      .map((method) => {
        const selection = convertPaymentSelections[method.id]
        if (!selection?.selected) return null
        const amountValue = Number(selection.amount)
        if (!Number.isFinite(amountValue) || amountValue <= 0) return null
        let referenceValue = selection.reference?.trim()
        if (isCheckPaymentMethod(method) && selection.extra_date) {
          const formattedDate = new Date(selection.extra_date).toLocaleDateString('es-AR')
          referenceValue = referenceValue ? `${referenceValue} - Vto: ${formattedDate}` : `Vto: ${formattedDate}`
        }
        return {
          payment_method_id: method.id,
          amount: amountValue,
          reference: referenceValue ? referenceValue : undefined
        }
      })
      .filter(Boolean) as VoucherPayment[]
    return payload.length > 0 ? payload : undefined
  }

  // Validar pagos del modal de conversión
  const validateConvertPayments = () => {
    if (!selectedQuotation) return { valid: false, message: 'No hay cotización seleccionada' }
    
    // Recalcular total desde los items (unit_price es sin IVA en el backend)
    const quotationItems = selectedQuotation.items || []
    const subtotalFromItems = quotationItems.reduce((acc, item) => {
      const itemUnitPrice = Number(item.unit_price) || 0
      const itemQty = Number(item.quantity) || 0
      const itemDiscount = Number(item.discount_percent) || 0
      const itemSubtotal = itemUnitPrice * itemQty
      const discountAmount = itemSubtotal * (itemDiscount / 100)
      return acc + (itemSubtotal - discountAmount)
    }, 0)
    const discountPercent = Number(selectedQuotation.general_discount) || 0
    const subtotalAfterDiscount = subtotalFromItems * (1 - discountPercent / 100)
    const ivaFromItems = subtotalAfterDiscount * 0.21
    const quotationTotal = subtotalAfterDiscount + ivaFromItems

    if (paymentMethods.length === 0) {
      return { valid: false, message: 'No hay métodos de pago disponibles para facturas' }
    }

    for (const method of paymentMethods) {
      const selection = convertPaymentSelections[method.id]
      if (!selection?.selected) continue
      const amountValue = Number(selection.amount)
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        return { valid: false, message: `Ingrese un monto válido para ${method.name}` }
      }
      if (method.requires_reference && !selection.reference?.trim()) {
        return { valid: false, message: `Debe ingresar referencia para ${method.name}` }
      }
      if (isCheckPaymentMethod(method) && method.requires_reference && !selection.extra_date) {
        return { valid: false, message: `Debe ingresar la fecha de vencimiento para el Cheque` }
      }
    }

    const assignedTotal = paymentMethods.reduce((acc, method) => {
      const selection = convertPaymentSelections[method.id]
      if (!selection?.selected) return acc
      const amountValue = Number(selection.amount)
      return acc + (Number.isFinite(amountValue) ? amountValue : 0)
    }, 0)

    if (assignedTotal <= 0) {
      return { valid: false, message: 'Debe cargar al menos un método de pago para facturas' }
    }

    if (assignedTotal > 0 && Math.abs(Number(assignedTotal.toFixed(2)) - Number(quotationTotal.toFixed(2))) > 0.01) {
      return {
        valid: false,
        message: `La suma de pagos ($${assignedTotal.toFixed(2)}) no coincide con el total ($${quotationTotal.toFixed(2)})`
      }
    }
    return { valid: true }
  }

  // Confirmar conversión de cotización a factura
  const handleConfirmConvertQuotation = () => {
    if (!selectedQuotation) return
    const fiscalClientId = selectedConvertFiscalClientId || selectedQuotation.client?.id
    if (!fiscalClientId) {
      toast.error('Debe seleccionar el cliente a facturar')
      return
    }
    const paymentValidation = validateConvertPayments()
    if (!paymentValidation.valid) {
      toast.error(paymentValidation.message || 'Verifique los métodos de pago')
      return
    }
    setIsConvertingQuotation(true)
    convertQuotationMutation.mutate({
      quotationId: selectedQuotation.id,
      payments: buildConvertPaymentsPayload(),
      fiscalClientId,
      priceStrategy: convertPriceStrategy,
      sourceVoucherType: selectedQuotation.voucher_type,
    })
  }

  // Activar o desactivar un método de pago
  const handleTogglePayment = (methodId: string, selected: boolean) => {
    setPaymentSelections((prev) => {
      const current = prev[methodId] || { selected: false, amount: '', reference: '' }
      
      // Si estamos seleccionando un nuevo método
      if (selected) {
        // Calcular cuánto falta por pagar
        const currentlyAssigned = Object.entries(prev).reduce((acc, [id, data]) => {
          if (id === methodId || !data.selected) return acc
          const amountValue = Number(data.amount)
          return acc + (Number.isFinite(amountValue) ? amountValue : 0)
        }, 0)

        // Total alineado con backend para evitar discrepancias por redondeo
        const total = calculateBackendCompatibleTotalFromCart(items, generalDiscount)

        // La diferencia (lo que falta pagar)
        const difference = Math.max(0, total - currentlyAssigned)
        
        // Si hay diferencia y el usuario no había puesto un monto manual antes
        const newAmount = (!current.amount && difference > 0) ? difference.toFixed(2) : current.amount

        return {
          ...prev,
          [methodId]: {
            ...current,
            selected,
            amount: newAmount,
            reference: current.reference || ''
          }
        }
      }

      // Si estamos deseleccionando, borramos el monto y referencia
      return {
        ...prev,
        [methodId]: {
          ...current,
          selected,
          amount: '',
          reference: ''
        }
      }
    })
  }

  // Actualizar monto de un método de pago
  const handlePaymentAmountChange = (methodId: string, value: string) => {
    setPaymentSelections((prev) => {
      // 1. Calculamos el total de la factura alineado con backend
      const total = calculateBackendCompatibleTotalFromCart(items, generalDiscount)

      // 2. Buscamos si hay OTROS métodos seleccionados (que no sean el actual)
      const otherSelectedMethods = Object.entries(prev).filter(([id, data]) => id !== methodId && data.selected)
      
      const newSelections = {
        ...prev,
        [methodId]: {
          ...prev[methodId],
          amount: value
        }
      }

      // 3. Si hay EXACTAMENTE UN método más seleccionado, ajustamos su valor automáticamente para que cuadre el total
      if (otherSelectedMethods.length === 1) {
        const otherMethodId = otherSelectedMethods[0][0]
        const newValueNumber = Number(value)
        
        // Solo calculamos si el valor ingresado es un número válido y menor o igual al total
        if (Number.isFinite(newValueNumber) && newValueNumber <= total) {
          const newOtherAmount = (total - newValueNumber).toFixed(2)
          newSelections[otherMethodId] = {
            ...newSelections[otherMethodId],
            amount: newOtherAmount
          }
        }
      }

      return newSelections
    })
  }

  // Actualizar referencia de un método de pago
  const handlePaymentReferenceChange = (methodId: string, value: string) => {
    setPaymentSelections((prev) => ({
      ...prev,
      [methodId]: {
        ...prev[methodId],
        reference: value
      }
    }))
  }

  // Actualizar fecha extra de un método de pago
  const handlePaymentExtraDateChange = (methodId: string, value: string) => {
    setPaymentSelections((prev) => ({
      ...prev,
      [methodId]: {
        ...prev[methodId],
        extra_date: value
      }
    }))
  }

  // Construir payload de pagos para el backend
  const buildPaymentsPayload = (): VoucherPayment[] | undefined => {
    const payload = paymentMethods
      .map((method) => {
        const selection = paymentSelections[method.id]
        if (!selection?.selected) return null

        const amountValue = Number(selection.amount)
        if (!Number.isFinite(amountValue) || amountValue <= 0) return null

        let referenceValue = selection.reference?.trim()
        
        // Formatear referencia para Cheque con vencimiento
        if (isCheckPaymentMethod(method) && selection.extra_date) {
          const formattedDate = new Date(selection.extra_date).toLocaleDateString('es-AR')
          referenceValue = referenceValue ? `${referenceValue} - Vto: ${formattedDate}` : `Vto: ${formattedDate}`
        }

        return {
          payment_method_id: method.id,
          amount: amountValue,
          reference: referenceValue ? referenceValue : undefined
        }
      })
      .filter(Boolean) as VoucherPayment[]

    return payload.length > 0 ? payload : undefined
  }

  // Validar montos y referencias de pagos
  const validatePayments = () => {
    if (paymentMethods.length === 0) {
      if (voucherType === 'invoice') {
        return { valid: false, message: 'No hay métodos de pago disponibles para facturas' }
      }
      return { valid: true }
    }

    for (const method of paymentMethods) {
      const selection = paymentSelections[method.id]
      if (!selection?.selected) continue

      const amountValue = Number(selection.amount)
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        return { valid: false, message: `Ingrese un monto válido para ${method.name}` }
      }

      if (method.requires_reference && !selection.reference?.trim()) {
        return { valid: false, message: `Debe ingresar ${getPaymentReferenceLabel(method)} para ${method.name}` }
      }

      if (isCheckPaymentMethod(method) && method.requires_reference && !selection.extra_date) {
        return { valid: false, message: `Debe ingresar la fecha de vencimiento para el Cheque` }
      }
    }

    const assignedTotal = paymentMethods.reduce((acc, method) => {
      const selection = paymentSelections[method.id]
      if (!selection?.selected) return acc
      const amountValue = Number(selection.amount)
      return acc + (Number.isFinite(amountValue) ? amountValue : 0)
    }, 0)

    if (voucherType === 'invoice' && assignedTotal <= 0) {
      return { valid: false, message: 'Debe cargar al menos un método de pago para facturas' }
    }

    const expectedTotal = Number(totalsPreviewQuery.data?.total) || calculateBackendCompatibleTotalFromCart(items, generalDiscount)

    // Comparar contra total compatible con backend (redondeo por renglón + IVA)
    if (assignedTotal > 0 && Math.abs(Number(assignedTotal.toFixed(2)) - expectedTotal) > 0.01) {
      return { 
        valid: false, 
        message: `La suma de pagos ($${assignedTotal.toFixed(2)}) no coincide con el total ($${expectedTotal.toFixed(2)})` 
      }
    }

    return { valid: true }
  }

  // Cálculos de totales
  // IMPORTANTE: sale_price del producto YA CONTIENE IVA incluido (sale_price = net_price * 1.21)
  // Por lo tanto, usamos sale_price directamente como el total sin recalcular IVA
  const subtotal = items.reduce((acc, item) => {
    // quantity * sale_price (que ya incluye IVA)
    const itemTotal = item.sale_price * item.quantity
    const discountAmount = itemTotal * (item.discount / 100)
    return acc + (itemTotal - discountAmount)
  }, 0)
  
  // Descuento general sobre el subtotal (ya incluye IVA)
  const discountAmount = subtotal * (generalDiscount / 100)
  const total = subtotal - discountAmount
  const totalRounded = Number(totalsPreviewQuery.data?.total) || calculateBackendCompatibleTotalFromCart(items, generalDiscount)
  
  // Calcular IVA real para mostrar en UI (separando el IVA del precio final)
  // El total incluye IVA, entonces: Subtotal = Total / 1.21, IVA = Total - Subtotal
  const subtotalWithoutIva = total / 1.21
  const iva = total - subtotalWithoutIva
  const discountedItemsCount = items.filter((item) => item.discount > 0).length

  const assignedPaymentsTotal = paymentMethods.reduce((acc, method) => {
    const selection = paymentSelections[method.id]
    if (!selection?.selected) return acc
    const amountValue = Number(selection.amount)
    return acc + (Number.isFinite(amountValue) ? amountValue : 0)
  }, 0)

  const shouldShowPaymentDifference = assignedPaymentsTotal > 0 || voucherType === 'invoice'
  const paymentDifference = shouldShowPaymentDifference ? Number((totalRounded - assignedPaymentsTotal).toFixed(2)) : 0
  const isPaymentBalanced = shouldShowPaymentDifference ? Math.abs(totalRounded - Number(assignedPaymentsTotal.toFixed(2))) <= 0.01 : true

  const mobileSteps: Array<{ key: MobileSalesSection; label: string }> = [
    { key: 'items', label: 'Cliente' },
    { key: 'products', label: 'Productos' },
    { key: 'summary', label: 'Resumen' },
  ]

  const mobileStepIndex = mobileSteps.findIndex((step) => step.key === mobileSection)

  const goToMobileStep = (index: number) => {
    const safeIndex = Math.min(Math.max(index, 0), mobileSteps.length - 1)
    setMobileSection(mobileSteps[safeIndex].key)
    setShowMobileVoucherMenu(false)
  }

  const goToPrevMobileStep = () => goToMobileStep(mobileStepIndex - 1)
  const goToNextMobileStep = () => goToMobileStep(mobileStepIndex + 1)

  return (
    <div className="-m-6 h-[calc(100%+3rem)] max-h-[calc(100%+3rem)] overflow-hidden flex flex-col p-1" data-tour-sales-root data-tour-sales-mode={voucherType}>
      {/* Header compacto desktop */}
      <div className="hidden lg:block flex-shrink-0 bg-white dark:bg-gray-800 rounded-md p-1 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setShowClientModal(true)} title="Nuevo cliente" className="px-2 py-1" data-tour-sales-new-client>
              <Plus size={18} />
            </Button>

            <div className="relative w-[280px]">
              <input
                type="text"
                value={selectedClient ? selectedClient.name : clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value)
                  if (!e.target.value) {
                    setSelectedClient(null)
                    setSelectedOperatingClientId('')
                  }
                }}
                placeholder="Cliente (buscar o seleccionar)"
                className="w-full rounded-lg border px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                readOnly={!!selectedClient}
              />
              {selectedClient && (
                <div className="absolute inset-y-0 right-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    ✓ {selectedClient.document_number}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedClient(null)
                      setClientSearch('')
                      setSelectedOperatingClientId('')
                    }}
                    className="text-gray-400 hover:text-red-600"
                    title="Quitar cliente"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClientSelectorModal(true)}
              title="Seleccionar cliente"
              className="px-2 py-1"
              data-tour-sales-client-selector
            >
              <Search size={18} />
            </Button>

            {voucherType === 'current_account' && (
              <div className="w-[280px]">
                <select
                  value={selectedOperatingClientId}
                  onChange={(e) => setSelectedOperatingClientId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="">Seleccionar retirador (titular o subcliente)</option>
                  {authorizedOperatingClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.id === selectedClient?.id
                        ? `Titular (retira): ${client.name}`
                        : `${client.name} · ${client.document_number}`}
                    </option>
                  ))}
                </select>
                {selectedClient && authorizationsLoadError ? (
                  <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">
                    No pudimos cargar autorizaciones de subclientes para este titular. Se usará retiro por titular hasta resolverlo. {formatErrorMessage(authorizationsError)}
                  </p>
                ) : selectedClient && !hasAuthorizedSubclient ? (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                    No hay subclientes autorizados para este titular. El remito saldrá como retiro por titular. Para habilitar terceros: asigná un Tipo de Cliente con retiro por terceros y creá la autorización en Cuenta Corriente.
                  </p>
                ) : null}
              </div>
            )}

            <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="px-2 py-1"
                title="Limpiar"
                aria-label="Limpiar"
              >
                <RotateCcw size={16} />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDraftsModal(true)}
                className="relative px-2 py-1"
                title="Borradores"
                aria-label="Borradores"
              >
                <FileText size={16} />
                {drafts.length > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold leading-none text-white">
                    {drafts.length}
                  </span>
                )}
              </Button>
            </div>

            <div className="flex items-center gap-1.5" title="Cargar presupuesto por código">
              <input
                type="text"
                value={budgetCode}
                onChange={(e) => setBudgetCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && budgetCode.trim()) {
                    handleLoadBudget()
                  }
                }}
                placeholder="Cargar presupuesto (#0001-00000001)"
                className="w-44 rounded-lg border px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 placeholder:text-gray-400"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadBudget}
                disabled={!budgetCode.trim() || isLoadingBudget}
                className="px-2 py-1"
                title="Cargar presupuesto"
              >
                {isLoadingBudget ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />
                ) : (
                  <FileText size={16} className="text-blue-600" />
                )}
              </Button>
            </div>

            {/* Chips de presupuestos cargados */}
            {loadedBudgets.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" title="Presupuestos cargados">
                {loadedBudgets.map((budget) => (
                  <div
                    key={budget.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-full text-xs"
                  >
                    <FileText size={12} className="text-amber-600 dark:text-amber-400" />
                    <span className="font-medium text-amber-800 dark:text-amber-200">
                      {budget.code}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400">
                      ({budget.itemCount} {budget.itemCount === 1 ? 'prod' : 'prods'})
                    </span>
                    <button
                      onClick={() => handleRemoveLoadedBudget(budget.id)}
                      className="ml-0.5 text-amber-500 hover:text-red-600 dark:text-amber-400 dark:hover:text-red-400"
                      title="Quitar presupuesto"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {voucherType === 'invoice' && loadedBudgets.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-2 py-2 text-[11px] text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                <div>
                  <span className="font-semibold">Origen:</span> {loadedBudgets[0]?.clientName || '—'}
                  <span className="mx-1">→</span>
                  <span className="font-semibold">Cliente a facturar:</span> {selectedClient?.name || 'Seleccionar cliente fiscal'}
                </div>
                <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <label className="font-semibold">Precios al facturar:</label>
                  <select
                    value={loadedBudgetsPriceStrategy}
                    onChange={(e) => setLoadedBudgetsPriceStrategy(e.target.value as PriceStrategy)}
                    className="h-8 rounded-md border border-blue-300 bg-white px-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-blue-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {priceStrategyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-[10px] text-blue-700 dark:text-blue-300">
                  {priceStrategyOptions.find((option) => option.value === loadedBudgetsPriceStrategy)?.help}
                </p>
              </div>
            )}

            <div className="flex items-center rounded-lg border border-primary-200 bg-primary-50/40 p-0.5 dark:border-primary-800 dark:bg-primary-900/20" data-tour-sales-voucher-types>
              {salesMenuModes.map((mode) => {
                const Icon = mode.icon
                const isActive = voucherType === mode.value
                const isComingSoon = !!mode.comingSoon

                return (
                  <button
                    key={mode.value}
                    onClick={() => {
                      if (isComingSoon) {
                        toast('Cuenta Corriente: próximamente', { icon: '🛠️' })
                        return
                      }
                      handleVoucherTypeChange(mode.value as VoucherType)
                    }}
                    className={`relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : isComingSoon
                          ? 'text-primary-700 dark:text-primary-300 hover:bg-primary-100/70 dark:hover:bg-primary-900/40'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-primary-100/70 dark:hover:bg-primary-900/40'
                    }`}
                    title={isComingSoon ? 'Próximamente' : mode.label}
                    data-tour-sales-mode-receipt={mode.value === 'receipt' ? 'true' : undefined}
                    data-tour-sales-mode-current-account={mode.value === 'current_account' ? 'true' : undefined}
                  >
                    <Icon size={16} />
                    {mode.label}
                    {isComingSoon && (
                      <span className="ml-1 rounded-full bg-primary-200 px-1.5 py-[1px] text-[9px] font-bold uppercase text-primary-900 dark:bg-primary-800 dark:text-primary-100">
                        Prox
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {(voucherType === 'receipt' || voucherType === 'current_account') && (
              <button
                onClick={() => setShowPrices((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  showPrices
                    ? 'border-primary-300 bg-primary-100 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                    : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
                title="Incluir precios en impresión"
                data-tour-sales-price-toggle
              >
                <DollarSign size={16} />
                {showPrices ? 'Precios ON' : 'Precios OFF'}
              </button>
            )}

        </div>
      </div>

      {/* Contenido mobile por pasos (exacto referencia) */}
      <div className="lg:hidden flex-1 min-h-0 overflow-hidden">
        {mobileSection === 'items' && (
          <div className="h-full space-y-2 overflow-auto rounded-lg border border-gray-200 bg-white py-2 px-4 dark:border-gray-700 dark:bg-gray-800">
            {/* Botones de acción: Nuevo cliente + Borradores */}
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => setShowClientModal(true)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-1 py-1.5 text-[9px] font-medium text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                <Plus size={10} />
                Nuevo
              </button>
              <button type="button" onClick={() => setShowDraftsModal(true)} className="relative flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 px-1 py-1.5 text-[9px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                <FileText size={10} />
                Borradores
                {drafts.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary-600 px-0.5 text-[8px] font-bold leading-none text-white">{drafts.length}</span>
                )}
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Cliente</label>
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                <input
                  type="text"
                  value={selectedClient ? selectedClient.name : clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    if (!e.target.value) {
                      setSelectedClient(null)
                      setSelectedOperatingClientId('')
                    }
                  }}
                  placeholder="Buscar o seleccionar cliente..."
                  className="w-full bg-transparent text-sm text-gray-800 outline-none dark:text-gray-100"
                  readOnly={!!selectedClient}
                />
                <button type="button" onClick={() => setShowClientSelectorModal(true)} className="text-gray-500">
                  <Search size={16} />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Tipo de comprobante</label>
              <div className="grid grid-cols-2 gap-2">
                {salesMenuModes.map((mode) => {
                  const isActive = voucherType === mode.value
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => !mode.comingSoon && handleVoucherTypeChange(mode.value)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                        isActive
                          ? 'border-primary-300 bg-primary-100 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                          : 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {voucherType === 'receipt' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Impresión del remito</label>
                <button
                  type="button"
                  onClick={() => setShowPrices((prev) => !prev)}
                  className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                    showPrices
                      ? 'border-primary-300 bg-primary-100 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                      : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                  title="Incluir precios en impresión"
                >
                  <DollarSign size={14} />
                  {showPrices ? 'Con precios' : 'Sin precios'}
                </button>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Cargar presupuesto</label>
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                <FileText size={14} className="text-gray-500" />
                <input
                  type="text"
                  value={budgetCode}
                  onChange={(e) => setBudgetCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && budgetCode.trim() && handleLoadBudget()}
                  placeholder="#0001-00001"
                  className="w-full bg-transparent text-xs text-gray-700 outline-none dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={handleLoadBudget}
                  disabled={!budgetCode.trim() || isLoadingBudget}
                  className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
                >
                  Cargar
                </button>
              </div>
            </div>
          </div>
        )}

        {mobileSection === 'products' && (
          <div className="h-full space-y-2 overflow-auto rounded-lg border border-gray-200 bg-white py-2 px-4 dark:border-gray-700 dark:bg-gray-800">
            {/* Configurar ahora se integra en barra inferior dinámica */}

            <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
              <Search size={14} className="text-gray-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar producto por código o nombre..."
                className="w-full bg-transparent text-sm text-gray-800 outline-none dark:text-gray-100"
              />
            </div>

            <div className="rounded-md bg-green-100 px-2 py-1 text-[11px] text-green-700 dark:bg-green-900/30 dark:text-green-300">
              ✓ {tempSelectedProducts.length} producto(s) seleccionados
            </div>

            <p className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400">RESULTADOS</p>

            <div className="space-y-2">
              {filteredProducts.slice(0, 30).map((product) => {
                const isSelected = tempSelectedProducts.some((p) => p.id === product.id)
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleProductInTemp(product)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${
                      isSelected
                        ? 'border-primary-300 bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30'
                        : 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-700'
                    }`}
                  >
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{product.code}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">{product.description}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">${formatNumber(product.sale_price)}</p>
                    </div>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md text-sm font-semibold ${isSelected ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-primary-600 text-white'}`}>
                      {isSelected ? '✓' : '+'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {mobileSection === 'summary' && (
          <div className="h-full space-y-2 overflow-auto rounded-lg border border-gray-200 bg-white py-2 px-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mt-1 text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400">PRODUCTOS SELECCIONADOS</p>
            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-600 dark:bg-gray-700">
              {items.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">No hay productos seleccionados</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-600 dark:bg-gray-800">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">{item.description}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{item.code} · ${formatNumber(item.sale_price)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="rounded-md p-1 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30"
                        aria-label="Quitar producto"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Cant.</p>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full bg-transparent text-right text-xs font-medium text-gray-800 outline-none dark:text-gray-100"
                        />
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Desc%</p>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={item.discount}
                          onChange={(e) => updateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-right text-xs font-medium text-gray-800 outline-none dark:text-gray-100"
                        />
                      </div>
                      <div className="rounded-md border border-primary-200 bg-primary-50 px-2 py-1 dark:border-primary-700 dark:bg-primary-900/20">
                        <p className="text-[10px] text-primary-600 dark:text-primary-300">Subtotal</p>
                        <p className="text-right text-xs font-semibold text-primary-800 dark:text-primary-200">
                          ${formatNumber(calculateItemTotal(item), undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <p className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400">DESCUENTO GENERAL</p>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
              <span className="text-xs text-gray-600 dark:text-gray-300">Aplicar descuento</span>
              <input
                type="number"
                value={generalDiscount}
                onChange={(e) => setGeneralDiscount(parseFloat(e.target.value) || 0)}
                className="ml-auto w-16 rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm dark:border-gray-500 dark:bg-gray-800"
                min={0}
                max={100}
                step={0.1}
              />
              <span className="text-xs text-gray-600 dark:text-gray-300">%</span>
            </div>

            <p className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400">TOTALES</p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700">
              <div className="flex justify-between py-1 text-xs text-gray-600 dark:text-gray-300">
                <span>Subtotal (sin IVA)</span>
                <span>${formatNumber(subtotalWithoutIva, undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 text-xs text-gray-600 dark:text-gray-300">
                <span>IVA (21%)</span>
                <span>${formatNumber(iva, undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-gray-300 pt-2 text-base font-semibold text-gray-900 dark:border-gray-500 dark:text-white">
                <span>TOTAL</span>
                <span>${formatNumber(totalRounded, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-2 overflow-x-hidden rounded-lg border border-gray-200 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 lg:hidden">
        <div className="flex items-center gap-1">
          {mobileSteps.map((step, index) => {
            const isActive = index === mobileStepIndex
            const isDone = index < mobileStepIndex
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => goToMobileStep(index)}
                className="flex flex-1 flex-col items-center"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    isActive
                      ? 'border-primary-300 bg-primary-100 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                      : isDone
                        ? 'border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/40 dark:text-green-200'
                        : 'border-gray-300 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {isDone ? '✓' : index + 1}
                </span>
                <span className={`mt-1 text-[9px] ${isActive ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}>
                  {step.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-2 flex w-full max-w-full items-center gap-1 min-w-0 overflow-x-hidden border-t border-gray-200 pt-1 dark:border-gray-700">
          {/* Paso 1: Continuar + Configurar */}
          {mobileSection === 'items' && (
            <>
              <button type="button" onClick={goToNextMobileStep} className="min-w-0 flex-1 rounded-lg border border-primary-200 bg-primary-600 px-1 py-1 text-[9px] font-medium text-white dark:border-primary-700 dark:bg-primary-600">
                Continuar
              </button>
              <button type="button" onClick={() => setShowQuantityModal(true)} disabled={tempSelectedProducts.length === 0} className={`min-w-[86px] flex-shrink-0 rounded-lg border px-2 py-1 text-[9px] font-medium ${tempSelectedProducts.length === 0 ? 'border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-500' : 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300'}`}>
                <span className="inline-flex items-center justify-center">
                  <Settings size={10} className="mr-0.5" />
                  {tempSelectedProducts.length > 0 ? `Config (${tempSelectedProducts.length})` : 'Configurar'}
                </span>
              </button>
            </>
          )}

          {/* Paso 2: Atrás + Configurar (dinámico) + Continuar */}
          {mobileSection === 'products' && (
            <>
              <button type="button" onClick={goToPrevMobileStep} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-0.5 py-1 text-[9px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                Atrás
              </button>
              {tempSelectedProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowQuantityModal(true)}
                  className="min-w-[96px] flex-shrink-0 rounded-lg border border-primary-200 bg-primary-50 px-1.5 py-1 text-[9px] font-medium text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                >
                  <span className="inline-flex items-center justify-center">
                    <Settings size={10} className="mr-0.5" />
                    Config ({tempSelectedProducts.length})
                  </span>
                </button>
              )}
              <button type="button" onClick={goToNextMobileStep} className="min-w-0 flex-1 rounded-lg border border-primary-200 bg-primary-600 px-0.5 py-1 text-[9px] font-medium text-white dark:border-primary-700 dark:bg-primary-600">
                Continuar
              </button>
            </>
          )}

          {/* Paso 3: Atrás + Emitir + Más opciones */}
          {mobileSection === 'summary' && (
            <>
              <button type="button" onClick={goToPrevMobileStep} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-0.5 py-1 text-[9px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                Atrás
              </button>
              <button type="button" onClick={handleGenerateClick} disabled={isGenerating} className="min-w-0 flex-1 rounded-lg border border-primary-200 bg-primary-600 px-0.5 py-1 text-[9px] font-medium text-white dark:border-primary-700 dark:bg-primary-600">
                {isGenerating ? 'Procesando...' : 'Emitir'}
              </button>
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => setShowMobileVoucherMenu(true)} className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-gray-100 px-1 py-1 text-[9px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200" aria-label="Más opciones">
                  <MoreVertical size={12} />
                  <span className="ml-1">⋯</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="hidden lg:flex flex-1 min-h-0 w-full flex-col gap-px overflow-hidden pt-1 lg:flex-row">
        {/* Panel izquierdo - Tablas */}
        <div
          className={`flex-1 w-full min-w-0 min-h-0 h-full flex flex-col gap-1 overflow-hidden ${
            mobileSection === 'summary' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* TABLA SUPERIOR - Carrito */}
          <div className={`w-full bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden ${mobileSection === 'products' ? 'hidden lg:block' : 'block'}`} data-tour-sales-cart-table>
            <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Productos seleccionados ({items.length})
                </h3>
                <div className="inline-flex items-center rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-800">
                  <button
                    onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.8))}
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    title="Achicar tabla"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span className="w-9 text-center text-[10px] font-medium text-gray-500 select-none">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 1.4))}
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    title="Agrandar tabla"
                  >
                    <ZoomIn size={13} />
                  </button>
                </div>
              </div>
            </div>
            <div className="w-full overflow-x-auto max-h-[192px] overflow-y-auto">
              <table className="w-full transition-all duration-200" style={{ fontSize: `${0.875 * zoomLevel}rem` }}>
                <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-3 py-[5px] text-left font-medium text-gray-600 dark:text-gray-400">Código</th>
                    <th className="px-3 py-[5px] text-left font-medium text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="px-3 py-[5px] text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: `${5 * zoomLevel}rem` }}>Cant.</th>
                    <th className="px-3 py-[5px] text-right font-medium text-gray-600 dark:text-gray-400">Precio</th>
                    <th className="px-3 py-[5px] text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: `${5 * zoomLevel}rem` }}>Desc%</th>
                    <th className="px-3 py-[5px] text-right font-medium text-gray-600 dark:text-gray-400">Total</th>
                    <th className="px-3 py-[5px] w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                        <ShoppingCart className="mx-auto mb-1 opacity-50" size={28 * zoomLevel} />
                        <p className="text-sm">Sin productos</p>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, rowIndex) => (
                      <tr key={item.id} className={`hover:bg-primary-50 dark:hover:bg-primary-900/20 ${rowIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-primary-50/30 dark:bg-primary-900/10'}`}>
                        <td className="px-3 py-[3px] font-medium text-gray-800 dark:text-gray-100">{item.code}</td>
                        <td className="px-3 py-[3px] text-gray-700 dark:text-gray-200">{item.description}</td>
                        <td className="px-3 py-[3px] text-right">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                            style={{ 
                              fontSize: `${0.875 * zoomLevel}rem`,
                              padding: `${0.09 * zoomLevel}rem ${0.28 * zoomLevel}rem`
                            }}
                            min={1}
                          />
                        </td>
                        <td className="px-3 py-[3px] text-right">${formatNumber(item.sale_price)}</td>
                        <td className="px-3 py-[3px] text-right">
                          <input
                            type="number"
                            value={item.discount}
                            onChange={(e) => updateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                            className="w-full text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                            style={{ 
                              fontSize: `${0.875 * zoomLevel}rem`,
                              padding: `${0.09 * zoomLevel}rem ${0.28 * zoomLevel}rem`
                            }}
                            min={0}
                            max={100}
                            step={0.1}
                          />
                        </td>
                        <td className="px-3 py-[3px] text-right font-medium">
                          ${formatNumber(calculateItemTotal(item))}
                        </td>
                        <td className="px-3 py-[3px]">
                          <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 size={16 * zoomLevel} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLA INFERIOR - Búsqueda */}
          <div className={`w-full bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 flex-1 min-h-0 flex-col overflow-hidden ${mobileSection === 'items' ? 'hidden lg:flex' : 'flex'}`}>
            <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar - Enter/Doble Click: Seleccionar | ESC: Configurar y Cargar"
                  className="flex-1 text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300"
                  data-tour-sales-product-search
                />
              </div>
            </div>
            
            {/* Panel de preview de productos seleccionados temporalmente */}
            {tempSelectedProducts.length > 0 && (
              <div className="p-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800" data-tour-sales-temp-selection>
                <div className="flex items-start justify-between mb-1">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                    Productos seleccionados ({tempSelectedProducts.length})
                  </p>
                  <button
                    onClick={() => setTempSelectedProducts([])}
                    className="text-xs text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {tempSelectedProducts.map(product => (
                    <div
                      key={product.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 rounded text-xs"
                    >
                      <span>{product.code}</span>
                      <button
                        onClick={() => removeFromTemp(product.id)}
                        className="hover:text-red-600 dark:hover:text-red-400 ml-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div ref={productListRef} className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Código</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                        <p className="text-sm">
                          {productSearch ? 'No se encontraron productos' : 'Busque productos para agregar'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product, index) => {
                      const isInTemp = tempSelectedProducts.find(p => p.id === product.id)
                      return (
                        <tr
                          key={product.id}
                          ref={index === selectedProductIndex ? selectedRowRef : null}
                          data-tour-sales-product-row={index === selectedProductIndex ? 'true' : undefined}
                          className={`cursor-pointer ${
                            isInTemp 
                              ? 'bg-green-100 dark:bg-green-900' 
                              : index === selectedProductIndex
                                ? 'bg-primary-100 dark:bg-primary-900'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                          onClick={() => setSelectedProductIndex(index)}
                          onDoubleClick={() => toggleProductInTemp(product)}
                        >
                          <td className="px-3 py-2 font-medium">
                            {isInTemp && <span className="text-green-600 dark:text-green-400 mr-1 text-base">✓</span>}
                            {product.code}
                          </td>
                          <td className="px-3 py-2">{product.description}</td>
                          <td className="px-3 py-2 text-right">${formatNumber(product.sale_price)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500 hidden lg:block" data-tour-sales-esc-hint>
                    ↑↓ Navegar | Enter o Doble Click Seleccionar/Deseleccionar | ESC Configurar
                  </p>
                  {/* Botón para mobile: abrir modal de configuración */}
                  <button
                    onClick={() => setShowQuantityModal(true)}
                    disabled={tempSelectedProducts.length === 0}
                    className="lg:hidden flex items-center gap-1 px-2 py-1 text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Settings size={14} />
                    Configurar ({tempSelectedProducts.length})
                  </button>
                </div>
                {tempSelectedProducts.length > 0 && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {tempSelectedProducts.length} seleccionado(s) - Presione ESC para configurar
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Panel lateral - Resumen */}
        <div className={`w-full lg:w-72 flex-shrink-0 h-full min-h-0 overflow-hidden ${mobileSection === 'summary' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-white dark:bg-gray-800 rounded-md p-2 shadow-sm border border-gray-200 dark:border-gray-700 h-full max-h-full flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex-shrink-0">
              Resumen
            </h3>

            <div className="space-y-1.5 text-xs flex-shrink-0">
              {generalDiscount > 0 && (
                <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                  <span>Descuento ({generalDiscount}%)</span>
                  <span className="font-medium">-${formatNumber(discountAmount, undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>Subtotal (sin IVA)</span>
                <span className="font-medium">${formatNumber(subtotalWithoutIva, undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>IVA (21%)</span>
                <span className="font-medium">${formatNumber(iva, undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t-2 border-gray-300 dark:border-gray-600">
                <span>TOTAL</span>
                <span>${formatNumber(totalRounded, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Input de descuento general */}
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Descuento General
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={generalDiscount}
                  onChange={(e) => setGeneralDiscount(parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 text-sm text-right border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-medium"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="0"
                />
                <span className="text-sm font-medium text-gray-500">%</span>
              </div>
            </div>

            <div className="space-y-1.5 mt-auto">
              <Button 
                variant="primary" 
                size="sm" 
                className="w-full text-xs" 
                onClick={handleGenerateClick}
                disabled={isGenerating}
                data-tour-sales-generate
              >
                {isGenerating 
                  ? 'Procesando...' 
                  : editingVoucherId
                    ? 'Actualizar Cotización'
                  : voucherType === 'invoice' 
                    ? 'Emitir Factura Electrónica' 
                    : `Generar ${voucherTypes.find(v => v.value === voucherType)?.label}`
                }
              </Button>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleSaveDraft}>
                <Save size={14} className="mr-1" />
                Guardar borrador
              </Button>
              {/* Botón Facturar Cotización/Remito */}
              {invoicingEnabled ? (
                <button
                  onClick={() => setShowPendingQuotationsModal(true)}
                  className="relative w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                  data-tour-sales-bill-pending
                >
                  <ClipboardList size={14} />
                  Facturar Cotización / Remito
                  {pendingQuotations.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">
                      {pendingQuotations.length > 99 ? '99+' : pendingQuotations.length}
                    </span>
                  )}
                </button>
              ) : (
                <div className="w-full text-center px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                  Facturación deshabilitada desde CMS
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showMobileVoucherMenu}
        onClose={() => setShowMobileVoucherMenu(false)}
        title="Cambiar tipo de comprobante"
        size="sm"
      >
        <div className="space-y-2">
          {salesMenuModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => {
                if (!mode.comingSoon) {
                  handleVoucherTypeChange(mode.value)
                }
                setShowMobileVoucherMenu(false)
              }}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                mode.comingSoon
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-500'
                  : voucherType === mode.value
                    ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
              disabled={mode.comingSoon}
            >
              {mode.label}
              {mode.comingSoon && ' (pronto)'}
            </button>
          ))}
        </div>
      </Modal>

      {/* Modal configuración de productos seleccionados */}
      <Modal 
        isOpen={showQuantityModal} 
        onClose={() => {
          setShowQuantityModal(false)
          // NO limpiamos tempSelectedProducts para que pueda volver a abrir con ESC
        }} 
        title="Configurar productos seleccionados"
        size="xl"
        frameClassName="p-0 sm:p-1 lg:p-4"
        containerClassName="flex h-[92vh] max-h-[92vh] flex-col overflow-hidden lg:block lg:h-auto lg:max-h-none"
        headerClassName="px-2 py-1.5 lg:px-6 lg:py-4"
        titleClassName="text-[13px] lg:text-lg"
        closeButtonClassName="p-0.5 lg:p-1"
        contentClassName="min-h-0 flex-1 p-0.5 lg:p-0 lg:block lg:min-h-0 lg:px-6 lg:py-4"
      >
        <div className="flex h-full min-h-0 flex-col lg:h-auto" data-tour-sales-configure-modal>
          {tempSelectedProducts.length > 0 ? (
            <>
              <div className="mt-0.5 min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-inner dark:border-gray-600 dark:bg-gray-800 lg:mx-0 lg:mt-0 lg:max-h-96 lg:flex-none lg:rounded-lg lg:bg-transparent lg:shadow-none dark:lg:bg-transparent">
                {/* Desktop: tabla clásica */}
                <div className="hidden lg:block">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-100/95 backdrop-blur dark:bg-gray-900/95 lg:bg-gray-100 lg:backdrop-blur-none dark:lg:bg-gray-900">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Código</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Descripción</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Precio</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: '80px' }}>Cant.</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: '80px' }}>Desc%</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Subtotal</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {tempSelectedProducts.map((product, productIndex) => {
                        const qty = Number(product.tempQuantity) || 0
                        const disc = Number(product.tempDiscount) || 0
                        const subtotal = product.sale_price * qty
                        const discountAmount = subtotal * (disc / 100)
                        const total = subtotal - discountAmount
                        const quantityInputIndex = productIndex * 2
                        const discountInputIndex = productIndex * 2 + 1

                        return (
                          <tr key={product.id}>
                            <td className="px-3 py-2 font-medium">{product.code}</td>
                            <td className="px-3 py-2">{product.description}</td>
                            <td className="px-3 py-2 text-right">${formatNumber(product.sale_price)}</td>
                            <td className="px-3 py-2 text-right">
                              <input
                                ref={(el) => modalInputsRef.current[quantityInputIndex] = el}
                                type="number"
                                value={product.tempQuantity}
                                onChange={(e) => updateTempProduct(product.id, 'tempQuantity', e.target.value)}
                                onKeyDown={(e) => handleModalInputKeyDown(e, quantityInputIndex)}
                                className="w-full rounded-lg border border-primary-200 bg-white px-2 py-1 text-right text-sm shadow-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-primary-800 dark:bg-gray-700 dark:focus:ring-primary-900"
                                min={1}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                ref={(el) => modalInputsRef.current[discountInputIndex] = el}
                                type="number"
                                value={product.tempDiscount}
                                onChange={(e) => updateTempProduct(product.id, 'tempDiscount', e.target.value)}
                                onKeyDown={(e) => handleModalInputKeyDown(e, discountInputIndex)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-right text-sm shadow-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-primary-900"
                                min={0}
                                max={100}
                                step={1}
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              ${formatNumber(total, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => removeFromTemp(product.id)} className="text-red-500 hover:text-red-700" title="Quitar">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Total:</td>
                        <td className="px-3 py-2 text-right text-lg font-bold text-gray-900 dark:text-white">
                          ${formatNumber(tempSelectedProducts.reduce((acc, p) => {
                            const qty = Number(p.tempQuantity) || 0
                            const disc = Number(p.tempDiscount) || 0
                            const subtotal = p.sale_price * qty
                            const discount = subtotal * (disc / 100)
                            return acc + (subtotal - discount)
                          }, 0), undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile: cards estilo CMS */}
                <div className="space-y-1.5 p-1 lg:hidden">
                  {tempSelectedProducts.map((product) => {
                    const qty = Number(product.tempQuantity) || 0
                    const disc = Number(product.tempDiscount) || 0
                    const subtotal = product.sale_price * qty
                    const discountAmount = subtotal * (disc / 100)
                    const total = subtotal - discountAmount

                    return (
                      <div key={product.id} className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-600 dark:bg-gray-700">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-300">#{product.code}</p>
                            <p className="pr-1 text-xs leading-[1.2] font-medium text-gray-800 dark:text-gray-100 break-words">{product.description}</p>
                            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-300">Precio: ${formatNumber(product.sale_price)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromTemp(product.id)}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
                            aria-label="Quitar producto"
                            title="Quitar producto"
                          >
                            <Trash2 size={15} className="text-red-500 dark:text-red-300" />
                          </button>
                        </div>

                        <div className="grid grid-cols-[56px_56px_minmax(0,1fr)] items-stretch gap-1.5">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-600 dark:bg-gray-800">
                            <p className="mb-1 text-[10px] leading-none text-gray-500 dark:text-gray-400">Cant.</p>
                            <div className="mx-auto flex w-[40px] flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => updateTempProduct(product.id, 'tempQuantity', (Number(product.tempQuantity) || 0) + 1)}
                                className="flex h-4 w-full items-center justify-center rounded-md border border-primary-200 bg-white text-[12px] leading-none text-primary-600 dark:border-primary-800 dark:bg-gray-700 dark:text-primary-300"
                                aria-label="Aumentar cantidad"
                              >
                                +
                              </button>
                              <input
                                type="number"
                                value={product.tempQuantity}
                                onChange={(e) => updateTempProduct(product.id, 'tempQuantity', e.target.value)}
                                min={1}
                                step={1}
                                className="no-spinner h-6 w-full rounded-md border border-primary-200 bg-white px-1 text-center text-sm font-semibold tabular-nums text-gray-900 dark:border-primary-800 dark:bg-gray-700 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => updateTempProduct(product.id, 'tempQuantity', Math.max(1, (Number(product.tempQuantity) || 0) - 1))}
                                className="flex h-4 w-full items-center justify-center rounded-md border border-primary-200 bg-white text-[12px] leading-none text-primary-600 dark:border-primary-800 dark:bg-gray-700 dark:text-primary-300"
                                aria-label="Disminuir cantidad"
                              >
                                −
                              </button>
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-600 dark:bg-gray-800">
                            <p className="mb-1 text-[10px] leading-none text-gray-500 dark:text-gray-400">Desc%</p>
                            <div className="mx-auto flex w-[40px] flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => updateTempProduct(product.id, 'tempDiscount', Math.min(100, Math.round(Number(product.tempDiscount) || 0) + 1))}
                                className="flex h-4 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-[12px] leading-none text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                                aria-label="Aumentar descuento"
                              >
                                +
                              </button>
                              <input
                                type="number"
                                value={product.tempDiscount}
                                onChange={(e) => updateTempProduct(product.id, 'tempDiscount', e.target.value)}
                                min={0}
                                max={100}
                                step={1}
                                className="no-spinner h-6 w-full rounded-md border border-gray-300 bg-white px-1 text-center text-sm font-semibold tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => updateTempProduct(product.id, 'tempDiscount', Math.max(0, Math.round(Number(product.tempDiscount) || 0) - 1))}
                                className="flex h-4 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-[12px] leading-none text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                                aria-label="Disminuir descuento"
                              >
                                −
                              </button>
                            </div>
                          </div>
                          <div className="flex min-h-[56px] min-w-0 flex-col rounded-lg border border-primary-200 bg-primary-50 p-1 dark:border-primary-700 dark:bg-primary-900/20">
                            <p className="mb-0.5 text-[10px] leading-none text-primary-600 dark:text-primary-300">Subtotal</p>
                            <p className="flex flex-1 items-center justify-center text-center text-sm font-bold leading-none text-primary-800 dark:text-primary-200 tabular-nums">
                              ${formatNumber(total, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-2.5 py-2 dark:border-gray-700 dark:bg-gray-800 lg:static lg:mt-2 lg:border-t-0 lg:bg-transparent lg:px-0 lg:py-0 dark:lg:bg-transparent">
                <p className="mb-1 text-[10px] leading-none text-gray-400 dark:text-gray-500 lg:hidden">
                  Enter: siguiente campo · último Enter: agregar al carrito
                </p>
                <div className="mb-1.5 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700 lg:hidden">
                  <span className="text-xs text-gray-600 dark:text-gray-300">Total</span>
                  <span className="text-base font-bold text-gray-900 dark:text-white">
                    ${formatNumber(tempSelectedProducts.reduce((acc, p) => {
                      const qty = Number(p.tempQuantity) || 0
                      const disc = Number(p.tempDiscount) || 0
                      const subtotal = p.sale_price * qty
                      const discount = subtotal * (disc / 100)
                      return acc + (subtotal - discount)
                    }, 0), undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-1.5 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setShowQuantityModal(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-200 bg-white text-primary-600 shadow-sm hover:bg-primary-50 dark:border-primary-800 dark:bg-gray-800 dark:text-primary-300 dark:hover:bg-primary-900/30"
                    title="Agregar producto"
                    aria-label="Agregar producto"
                  >
                    <Plus size={16} className="text-primary-600 dark:text-primary-300" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuantityModal(false)
                      setTempSelectedProducts([])
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 shadow-sm hover:bg-red-50 dark:border-red-800 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
                    title="Cancelar todo"
                    aria-label="Cancelar todo"
                  >
                    <Trash2 size={16} className="text-red-500 dark:text-red-400" />
                  </button>
                  <button
                    type="button"
                    onClick={confirmTempProducts}
                    className="flex h-9 min-w-[164px] items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                    title="Agregar al carrito"
                    aria-label="Agregar al carrito"
                    data-tour-sales-add-to-table
                  >
                    <CheckCircle size={16} className="text-white" />
                    <span>Agregar al carrito</span>
                  </button>
                </div>

                <div className="hidden gap-2 pt-2 lg:flex">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowQuantityModal(false)} 
                    className="flex-1"
                  >
                    Continuar Seleccionando
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowQuantityModal(false)
                      setTempSelectedProducts([])
                    }} 
                    className="flex-1 text-red-600 hover:text-red-700"
                  >
                    Cancelar Todo
                  </Button>
                  <Button variant="primary" onClick={confirmTempProducts} className="flex-1" data-tour-sales-add-to-table>
                    Agregar al Carrito
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No hay productos seleccionados</p>
              <p className="text-xs mt-2">Hacé doble click en los productos para seleccionarlos</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal cliente - REUTILIZA ESTE EN LA PÁGINA DE CLIENTES */}
      <Modal isOpen={showClientModal} onClose={() => setShowClientModal(false)} title="Nuevo Cliente">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Razón Social / Nombre *
              </label>
              <input
                ref={clientNameInputRef}
                type="text"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo Doc. *
              </label>
              <Select
                value={newClient.document_type}
                onChange={(e) => setNewClient({ ...newClient, document_type: e.target.value })}
                options={documentTypes}
                className="text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Número *
              </label>
              <input
                type="text"
                value={newClient.document_number}
                onChange={(e) => setNewClient({ ...newClient, document_number: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                placeholder="XX-XXXXXXXX-X"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Condición ante IVA *
              </label>
              <Select
                value={newClient.tax_condition}
                onChange={(e) => setNewClient({ ...newClient, tax_condition: e.target.value })}
                options={taxConditions}
                className="text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Dirección</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  value={newClient.street || ''}
                  onChange={(e) => setNewClient({ ...newClient, street: e.target.value })}
                  placeholder="Calle"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newClient.street_number || ''}
                  onChange={(e) => setNewClient({ ...newClient, street_number: e.target.value })}
                  placeholder="Número"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newClient.floor || ''}
                  onChange={(e) => setNewClient({ ...newClient, floor: e.target.value })}
                  placeholder="Piso"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newClient.apartment || ''}
                  onChange={(e) => setNewClient({ ...newClient, apartment: e.target.value })}
                  placeholder="Depto"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newClient.city || ''}
                  onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                  placeholder="Ciudad"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newClient.province || ''}
                  onChange={(e) => setNewClient({ ...newClient, province: e.target.value })}
                  placeholder="Provincia"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Contacto</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  value={newClient.phone || ''}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  placeholder="Teléfono"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <input
                  type="email"
                  value={newClient.email || ''}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="Email"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowClientModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateClient}
              className="flex-1"
              disabled={!newClient.name || !newClient.document_number}
            >
              Crear Cliente
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal borradores */}
      <Modal isOpen={showDraftsModal} onClose={() => setShowDraftsModal(false)} title="Borradores Guardados">
        <div className="space-y-3">
          {drafts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="mx-auto mb-2 opacity-50" size={32} />
              <p className="text-sm">No hay borradores guardados</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
                          {voucherTypes.find(v => v.value === draft.voucherType)?.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(draft.createdAt).toLocaleDateString()} {new Date(draft.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {draft.client.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {draft.client.document_type}: {draft.client.document_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        ${formatNumber(draft.total)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {draft.items.length} productos
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Button variant="primary" size="sm" onClick={() => loadDraft(draft)} className="flex-1 text-xs">
                      Cargar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteDraftClick(draft.id)}
                      className="text-xs text-red-600 hover:text-red-700 hover:border-red-600"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal selector de clientes */}
      <Modal 
        isOpen={showClientSelectorModal} 
        onClose={() => setShowClientSelectorModal(false)} 
        title="Seleccionar Cliente"
        size="lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Buscar por nombre o documento..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>

          <div className="max-h-96 overflow-y-auto border rounded-lg dark:border-gray-600">
            {filteredClients.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No se encontraron clientes</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => {
                    setShowClientSelectorModal(false)
                    setShowClientModal(true)
                  }}
                >
                  <Plus size={16} className="mr-2" />
                  Crear Nuevo Cliente
                </Button>
              </div>
            ) : (
              <div className="divide-y dark:divide-gray-700">
                {filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client)
                      setSelectedOperatingClientId(voucherType === 'current_account' ? client.id : '')
                      setClientSearch('')
                      setShowClientSelectorModal(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{client.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {client.document_type}: {client.document_number}
                        </p>
                      </div>
                      <div className="text-right">
                          <p className="text-xs font-medium text-primary-600 dark:text-primary-400">
                            {getTaxConditionLabel(client.tax_condition)}
                          </p>
                        {client.phone && (
                          <p className="text-xs text-gray-500">{client.phone}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal de confirmación */}
      <Modal 
        isOpen={showConfirmModal} 
        onClose={() => setShowConfirmModal(false)} 
        title={voucherType === 'invoice' ? 'Confirmar Emisión de Factura Electrónica' : `Confirmar ${voucherTypes.find(v => v.value === voucherType)?.label}`}
        size={voucherType === 'invoice' ? 'xl' : 'lg'}
      >
        <div className="space-y-4">
          <div className={voucherType === 'invoice' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''}>
            {/* Detalles Venta */}
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Cliente:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedClient?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tipo:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {voucherTypes.find(v => v.value === voucherType)?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Productos:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{items.length}</span>
                </div>
                {(voucherType === 'receipt' || voucherType === 'current_account') && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Impresión:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {showPrices ? 'Con precios' : 'Sin precios'}
                    </span>
                  </div>
                )}

                {discountedItemsCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Desc. por ítem:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {discountedItemsCount} con descuento
                    </span>
                  </div>
                )}

                {voucherType === 'invoice' && loadedBudgets.length > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Cliente origen:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{loadedBudgets[0]?.clientName || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Cliente a facturar:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{selectedClient?.name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Estrategia de precios:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {loadedBudgetsPriceStrategy === 'historical'
                          ? 'Mantener precios originales'
                          : 'Actualizar a precios vigentes'}
                      </span>
                    </div>
                  </>
                )}

                {voucherType === 'current_account' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Titular:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{selectedClient?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Subcliente:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {(selectedOperatingClientId || selectedClient?.id) === selectedClient?.id
                          ? `${selectedClient?.name} (retira titular)`
                          : allClients.find((c) => c.id === (selectedOperatingClientId || selectedClient?.id))?.name || 'No seleccionado'}
                      </span>
                    </div>
                  </>
                )}

                {/* Descuento General Editable */}
                <div className="pt-3 border-t border-primary-200 dark:border-primary-700">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Descuento general:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={generalDiscount}
                        onChange={(e) => setGeneralDiscount(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-sm text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                        min={0}
                        max={100}
                        step={0.1}
                        placeholder="0"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </div>
                </div>

                {/* Desglose de totales */}
                <div className="space-y-2 pt-2 border-t border-primary-200 dark:border-primary-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Subtotal (sin IVA):</span>
                    <span className="font-medium">${formatNumber(subtotalWithoutIva, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {generalDiscount > 0 && (
                    <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                      <span>Descuento ({generalDiscount}%):</span>
                      <span className="font-medium">-${formatNumber(discountAmount, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">IVA (21%):</span>
                    <span className="font-medium">${formatNumber(iva, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {/* Total final */}
                  <div className="flex justify-between pt-2 border-t-2 border-primary-300 dark:border-primary-600">
                    <span className="font-bold text-gray-900 dark:text-white text-base">TOTAL:</span>
                    <span className="font-bold text-xl text-primary-600 dark:text-primary-400">
                      ${formatNumber(totalRounded, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Descuento General - después del TOTAL */}
                <div className="pt-3 border-t border-primary-200 dark:border-primary-700">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Descuento General
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={generalDiscount}
                      onChange={(e) => setGeneralDiscount(parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 text-sm text-right border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-medium"
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="0"
                    />
                    <span className="text-sm font-medium text-gray-500">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Métodos de pago — solo para facturas */}
            {voucherType === 'invoice' && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Métodos de pago</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Obligatorio para facturas.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total asignado</p>
                <p className={`text-sm font-semibold ${isPaymentBalanced ? 'text-primary-600 dark:text-primary-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  ${formatNumber(assignedPaymentsTotal, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {paymentMethods.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                No hay métodos de pago configurados para este negocio.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {paymentMethods.map((method) => {
                  const selection = paymentSelections[method.id]
                  const isSelected = selection?.selected || false

                  return (
                    <div 
                      key={method.id} 
                      className={`rounded-lg border p-2 transition-colors ${
                        isSelected 
                          ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/20' 
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <label className="flex items-center gap-2 min-w-[140px] shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleTogglePayment(method.id, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                          <div className="flex flex-col">
                            <span className={`text-sm font-medium leading-tight ${isSelected ? 'text-primary-900 dark:text-primary-100' : 'text-gray-700 dark:text-gray-300'}`}>
                              {method.name}
                            </span>
                            {method.requires_reference && (
                              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 leading-tight">
                                Req. ref.
                              </span>
                            )}
                          </div>
                        </label>

                        <div className="flex flex-1 gap-2">
                          <div className={`${isCheckPaymentMethod(method) ? 'w-[25%]' : 'w-[40%]'}`}>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={selection?.amount || ''}
                              onChange={(e) => handlePaymentAmountChange(method.id, e.target.value)}
                              placeholder="Monto"
                              disabled={!isSelected}
                              className={`text-right h-8 text-sm w-full ${!isSelected && 'opacity-50 bg-gray-50 dark:bg-gray-900'}`}
                            />
                          </div>

                          <div className={`flex gap-2 ${isCheckPaymentMethod(method) ? 'w-[75%]' : 'w-[60%]'}`}>
                            {isCheckPaymentMethod(method) ? (
                              <>
                                <Input
                                  type="text"
                                  value={selection?.reference || ''}
                                  onChange={(e) => handlePaymentReferenceChange(method.id, e.target.value)}
                                  placeholder={getPaymentReferencePlaceholder(method)}
                                  disabled={!isSelected}
                                  className={`h-8 text-sm w-[60%] ${!isSelected && 'opacity-50 bg-gray-50 dark:bg-gray-900'}`}
                                />
                                <Input
                                  type="date"
                                  value={selection?.extra_date || ''}
                                  onChange={(e) => handlePaymentExtraDateChange(method.id, e.target.value)}
                                  placeholder="Vencimiento"
                                  disabled={!isSelected}
                                  className={`h-8 text-sm w-[40%] px-1 ${!isSelected && 'opacity-50 bg-gray-50 dark:bg-gray-900'}`}
                                  title="Fecha de vencimiento"
                                />
                              </>
                            ) : (
                                <Input
                                  type="text"
                                  value={selection?.reference || ''}
                                  onChange={(e) => handlePaymentReferenceChange(method.id, e.target.value)}
                                  placeholder={getPaymentReferencePlaceholder(method)}
                                  disabled={!isSelected}
                                  className={`h-8 text-sm w-full ${!isSelected && 'opacity-50 bg-gray-50 dark:bg-gray-900'}`}
                                />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Diferencia:</span>
              <span className={`font-semibold ${isPaymentBalanced ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'}`}>
                ${formatNumber(paymentDifference, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          )} {/* fin panel métodos de pago */}
          </div>

          {voucherType === 'invoice' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>⚠️ Importante:</strong> Se emitirá una factura electrónica en ARCA/AFIP. 
                Este proceso es <strong>irreversible</strong> y se obtendrá un CAE oficial.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmModal(false)} 
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmGenerate}
              className="flex-1"
            >
              {voucherType === 'invoice' ? 'Emitir Factura Electrónica' : editingVoucherId ? 'Actualizar' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmación para limpiar pantalla */}
      <Modal
        isOpen={showClearConfirmModal}
        onClose={() => setShowClearConfirmModal(false)}
        title="Limpiar venta actual"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-primary-100 dark:bg-primary-800/40 p-2">
                <AlertCircle className="text-primary-600 dark:text-primary-300" size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  ¿Querés limpiar la pantalla de ventas?
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Se van a borrar los productos cargados, el cliente seleccionado y los datos de edición del comprobante actual.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              onClick={() => setShowClearConfirmModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmClear}
              className="flex-1"
            >
              Sí, limpiar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de diferencias de precios al cargar presupuesto por código */}
      <Modal
        isOpen={showPriceDiffModal}
        onClose={() => {
          setShowPriceDiffModal(false)
          setPendingBudgetData(null)
        }}
        title="Precios modificados desde la cotización"
        size="lg"
      >
        {pendingBudgetData && (() => {
          const { voucher, priceCheck } = pendingBudgetData
          return (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-amber-100 dark:bg-amber-800/40 p-2">
                    <AlertTriangle className="text-amber-600 dark:text-amber-300" size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {priceCheck.affected_items} de {priceCheck.total_items} producto(s) tienen precios diferentes al catálogo actual
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      ¿Querés cargar los productos con los precios originales de la cotización o actualizar a los precios vigentes?
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabla de diferencias */}
              <div className="border rounded-lg dark:border-gray-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 font-medium">Precio cotización</th>
                      <th className="text-right px-3 py-2 font-medium">Precio actual</th>
                      <th className="text-right px-3 py-2 font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceCheck.differences.map((diff: any) => (
                      <tr key={diff.product_id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{diff.product_name}</td>
                        <td className="px-3 py-2 text-right font-mono">${Number(diff.old_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right font-mono">${Number(diff.current_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${Number(diff.difference_percent) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {Number(diff.difference_percent) > 0 ? '+' : ''}{Number(diff.difference_percent).toLocaleString('es-AR', { minimumFractionDigits: 1 })}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    applyBudgetToCart(voucher, 'historical')
                    setShowPriceDiffModal(false)
                    setPendingBudgetData(null)
                    setBudgetCode('')
                  }}
                  className="flex-1"
                >
                  Mantener precios originales
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    applyBudgetToCart(voucher, 'current')
                    setShowPriceDiffModal(false)
                    setPendingBudgetData(null)
                    setBudgetCode('')
                  }}
                  className="flex-1"
                >
                  Actualizar a precios vigentes
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal de confirmación de borrador guardado */}
      <Modal 
        isOpen={showSaveDraftSuccessModal} 
        onClose={() => setShowSaveDraftSuccessModal(false)} 
        title="Borrador Guardado"
      >
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
              <Save className="text-green-600 dark:text-green-400" size={24} />
            </div>
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Borrador guardado correctamente
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Podés recuperarlo desde el botón "Borradores"
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              variant="primary" 
              onClick={() => setShowSaveDraftSuccessModal(false)} 
              className="flex-1"
            >
              Aceptar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmación para eliminar borrador */}
      <Modal 
        isOpen={showDeleteDraftModal} 
        onClose={() => {
          setShowDeleteDraftModal(false)
          setDraftToDelete(null)
        }} 
        title="Eliminar Borrador"
      >
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-3">
              <Trash2 className="text-red-600 dark:text-red-400" size={24} />
            </div>
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              ¿Está seguro de eliminar este borrador?
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Esta acción no se puede deshacer
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDraftModal(false)
                setDraftToDelete(null)
              }} 
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              variant="primary" 
              onClick={confirmDeleteDraft} 
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===== Modal: Comprobantes Pendientes de Facturar ===== */}
      <Modal
        isOpen={showPendingQuotationsModal}
        onClose={() => {
          setShowPendingQuotationsModal(false)
          setQuotationSearch('')
          setQuotationTypeFilter('all')
          setQuotationDateFrom(_fmt(_firstOfMonth))
          setQuotationDateTo(_fmt(_lastOfMonth))
        }}
        title="Comprobantes Pendientes de Facturar"
        size="xl"
      >
        <div className="space-y-3">
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Filtro por tipo */}
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs font-medium">
              {[
                { value: 'all', label: 'Todos' },
                { value: 'quotation', label: 'Cotizaciones' },
                ...(receiptsEnabled ? [{ value: 'receipt', label: 'Remitos' }] : []),
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setQuotationTypeFilter(opt.value as 'all' | 'quotation' | 'receipt')}
                  className={`flex-1 py-2 transition-colors ${
                    quotationTypeFilter === opt.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Fecha desde */}
            <div className="relative">
              <label className="absolute -top-2 left-2 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-1">
                Desde
              </label>
              <input
                type="date"
                value={quotationDateFrom}
                onChange={(e) => setQuotationDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>

            {/* Fecha hasta */}
            <div className="relative">
              <label className="absolute -top-2 left-2 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-1">
                Hasta
              </label>
              <input
                type="date"
                value={quotationDateTo}
                onChange={(e) => setQuotationDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={quotationSearch}
              onChange={(e) => setQuotationSearch(e.target.value)}
              placeholder="Buscar por número, cliente o notas..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Lista */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Header de la tabla */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <span>Tipo / N°</span>
              <span>Cliente</span>
              <span className="text-center">Fecha</span>
              <span className="text-right">Total</span>
            </div>

            <div className="max-h-[45vh] overflow-y-auto">
              {!pendingQuotationsData ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="inline-block w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-sm">Cargando...</p>
                </div>
              ) : pendingQuotations.length === 0 ? (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                  <ClipboardList className="mx-auto mb-3 opacity-30" size={36} />
                  <p className="font-medium text-sm">Sin resultados</p>
                  <p className="text-xs mt-1 opacity-60">
                    {quotationTypeFilter !== 'all' || quotationSearch || quotationDateFrom || quotationDateTo
                      ? 'Probá ajustando los filtros'
                      : 'No hay comprobantes pendientes de facturar'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {pendingQuotations.map((voucher) => {
                    const isQuotation = voucher.voucher_type === 'quotation'
                    const isCCClosure = !!voucher.is_current_account_closure
                    return (
                      <button
                        key={voucher.id}
                        onClick={() => handleSelectQuotationToConvert(voucher)}
                        className="w-full grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center px-3 py-2.5 text-left hover:bg-primary-50 dark:hover:bg-primary-900/15 transition-colors group"
                      >
                        {/* Badge tipo */}
                        <div className="shrink-0">
                          <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isQuotation
                              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                              : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          }`}>
                            {isQuotation ? 'COT' : 'REM'}
                          </span>
                          <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums text-center">
                            {voucher.sale_point}-{voucher.number}
                          </p>
                        </div>

                        {/* Cliente */}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-tight">
                            {voucher.client?.name || '—'}
                          </p>
                          {isCCClosure && (
                            <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                              Cta Cte cerrada
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 truncate leading-tight">
                            {voucher.client?.document_type}: {voucher.client?.document_number}
                            {voucher.client?.tax_condition && (
                              <span className="ml-1.5 text-primary-500 dark:text-primary-400">
                                · {getTaxConditionLabel(voucher.client.tax_condition)}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-300 dark:text-gray-500">
                            {voucher.items.length} producto(s)
                          </p>
                        </div>

                        {/* Fecha */}
                        <div className="text-center shrink-0">
                          <p className="text-xs text-gray-500 tabular-nums">
                            {new Date(voucher.date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          </p>
                        </div>

                        {/* Total + acción */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                            ${formatNumber(voucher.total, 'es-AR', { minimumFractionDigits: 2 })}
                          </p>
                          <span className="text-[10px] text-primary-500 dark:text-primary-400 group-hover:underline font-medium">
                            Facturar →
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer con conteo */}
          {pendingQuotationsData && (
            <p className="text-xs text-gray-400 text-right">
              {pendingQuotations.length} comprobante(s) pendiente(s)
            </p>
          )}
        </div>
      </Modal>

      {/* ===== Modal: Confirmar Conversión Cotización → Factura ===== */}
      <Modal
        isOpen={showConvertQuotationModal}
        onClose={() => {
          if (!isConvertingQuotation) {
            setShowConvertQuotationModal(false)
            setSelectedQuotation(null)
            setSelectedConvertFiscalClientId('')
            setConvertPriceStrategy('historical')
            resetConvertPaymentSelections()
          }
        }}
        title={selectedQuotation?.voucher_type === 'receipt' ? 'Facturar Remito' : 'Facturar Cotización'}
        size="xl"
      >
        {selectedQuotation && (
          <div className="space-y-4">
            {/* Datos de la cotización */}
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Cotización a Facturar
                </h4>
                <span className={`text-xs font-bold px-2 py-1 rounded ${
                  selectedQuotation.voucher_type === 'receipt'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                }`}>
                  {selectedQuotation.voucher_type === 'receipt' ? 'REM' : 'COT'} {selectedQuotation.sale_point}-{selectedQuotation.number}
                </span>
              </div>
              {(() => {
                const billedClient = allClients.find((client) => client.id === selectedConvertFiscalClientId)
                const billedTaxCondition = billedClient?.tax_condition || selectedQuotation.client?.tax_condition
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Cliente origen (comprobante):</span>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedQuotation.client?.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedQuotation.client?.document_type}: {selectedQuotation.client?.document_number}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Cliente a facturar (titular fiscal):</span>
                  <select
                    value={selectedConvertFiscalClientId}
                    onChange={(e) => setSelectedConvertFiscalClientId(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="">Seleccionar cliente fiscal</option>
                    {allClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} · {client.document_number}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                    Condición IVA: {billedTaxCondition || '—'} → Factura {billedTaxCondition === 'RI' ? 'A' : 'B'}
                  </p>
                </div>
              </div>
                )
              })()}

              <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3 dark:border-violet-800 dark:bg-violet-900/20 mb-3">
                <label className="block text-xs font-semibold text-violet-900 dark:text-violet-200 mb-1.5">
                  Estrategia de precios al facturar
                </label>
                <select
                  value={convertPriceStrategy}
                  onChange={(e) => setConvertPriceStrategy(e.target.value as PriceStrategy)}
                  className="h-10 w-full rounded-lg border border-violet-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 dark:border-violet-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  {priceStrategyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
                  {priceStrategyOptions.find((option) => option.value === convertPriceStrategy)?.help}
                </p>
              </div>

              {/* Items */}
              <div className="border rounded dark:border-gray-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-gray-600 dark:text-gray-400">Descripción</th>
                      <th className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-400">Cant.</th>
                      <th className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-400">P.Unit</th>
                      <th className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-400">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {selectedQuotation.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-2 py-1.5 text-gray-900 dark:text-white">
                          <span className="text-gray-500 mr-1">{item.code}</span>
                          {item.description}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-300">{item.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-300">
                          ${formatNumber(item.unit_price, 'es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium text-gray-900 dark:text-white">
                          ${formatNumber(item.subtotal, 'es-AR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-right font-bold text-gray-900 dark:text-white">TOTAL:</td>
                      <td className="px-2 py-2 text-right font-bold text-primary-600 dark:text-primary-400 text-sm">
                        ${formatNumber(calculateQuotationTotal(selectedQuotation), 'es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Métodos de pago */}
            {paymentMethods.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Métodos de Pago</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Obligatorio</p>
                </div>
                <div className="space-y-2">
                  {paymentMethods.map((method) => {
                    const selection = convertPaymentSelections[method.id]
                    const isSelected = selection?.selected || false

                    return (
                      <div
                        key={method.id}
                        className={`rounded-lg border p-2 transition-colors ${
                          isSelected
                            ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <label className="flex items-center gap-2 min-w-[140px] shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleConvertTogglePayment(method.id, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600"
                            />
                            <span className={`text-sm font-medium ${isSelected ? 'text-primary-900 dark:text-primary-100' : 'text-gray-700 dark:text-gray-300'}`}>
                              {method.name}
                            </span>
                          </label>
                          <div className="flex flex-1 gap-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={selection?.amount || ''}
                              onChange={(e) => handleConvertPaymentAmountChange(method.id, e.target.value)}
                              placeholder="Monto"
                              disabled={!isSelected}
                              className={`w-32 text-right text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500 ${!isSelected ? 'opacity-40' : ''}`}
                            />
                            {isCheckPaymentMethod(method) ? (
                              <>
                                <input
                                  type="text"
                                  value={selection?.reference || ''}
                                  onChange={(e) => handleConvertPaymentReferenceChange(method.id, e.target.value)}
                                  placeholder={getPaymentReferencePlaceholder(method)}
                                  disabled={!isSelected}
                                  className={`flex-1 text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500 ${!isSelected ? 'opacity-40' : ''}`}
                                />
                                <input
                                  type="date"
                                  value={selection?.extra_date || ''}
                                  onChange={(e) => handleConvertPaymentExtraDateChange(method.id, e.target.value)}
                                  disabled={!isSelected}
                                  className={`text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500 ${!isSelected ? 'opacity-40' : ''}`}
                                  title="Fecha de vencimiento"
                                />
                              </>
                            ) : (
                                <input
                                  type="text"
                                  value={selection?.reference || ''}
                                  onChange={(e) => handleConvertPaymentReferenceChange(method.id, e.target.value)}
                                  placeholder={getPaymentReferencePlaceholder(method)}
                                  disabled={!isSelected}
                                  className={`flex-1 text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500 ${!isSelected ? 'opacity-40' : ''}`}
                                />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Advertencia de irreversibilidad */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-900 dark:text-red-200 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                <span>
              <strong>⚠️ Atención:</strong> Esta acción es <strong>irreversible</strong>.
                El comprobante quedará marcado como facturado y se emitirá una factura electrónica en ARCA/AFIP.
                Para revertir, deberás emitir una <strong>Nota de Crédito Fiscal</strong> desde la factura generada.
                </span>
              </p>
            </div>

            {/* Botones */}
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  setShowConvertQuotationModal(false)
                  setShowPendingQuotationsModal(true)
                  setSelectedQuotation(null)
                  setSelectedConvertFiscalClientId('')
                  setConvertPriceStrategy('historical')
                  resetConvertPaymentSelections()
                }}
                className="flex-1"
                disabled={isConvertingQuotation}
              >
                ← Volver
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmConvertQuotation}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                disabled={isConvertingQuotation}
              >
                {isConvertingQuotation ? (
                  <>Procesando...</>
                ) : (
                  <>
                    <CheckCircle size={16} className="mr-2" />
                    Emitir Factura Electrónica
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal visor de PDF */}
      <Modal 
        isOpen={showPdfModal} 
        onClose={handleClosePdfModal}
        title="Comprobante Generado"
        size="xl"
      >
        <div className="space-y-4">
          {pdfUrl && (
            <>
              {/* Visor de PDF con iframe */}
              <div className="bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                <iframe
                  src={pdfUrl}
                  className="w-full h-[70vh]"
                  title="Visor de PDF"
                />
              </div>

              {/* Botones de acción */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={handleDownloadPdf}
                  className="w-full min-w-0"
                >
                  <Download size={16} className="sm:mr-2" />
                  <span className="hidden sm:inline">Descargar PDF</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handlePrintPdf}
                  className="w-full min-w-0"
                >
                  <Printer size={16} className="sm:mr-2" />
                  <span className="hidden sm:inline">Imprimir</span>
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleClosePdfModal}
                  className="w-full min-w-0"
                >
                  <X size={16} className="sm:mr-2" />
                  <span className="hidden sm:inline">Cerrar</span>
                </Button>
              </div>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                El PDF también está disponible desde la lista de comprobantes
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
