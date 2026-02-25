/**
 * Página de Ventas unificada.
 * Permite crear cotizaciones, remitos y facturas.
 */
import { useState, useEffect, useRef } from 'react'
import { ShoppingCart, FileText, Truck, Receipt, Plus, Trash2, Search, RotateCcw, Save, ZoomIn, ZoomOut, Download, Printer, X, ClipboardList, CheckCircle, AlertCircle } from 'lucide-react'
import { Button, Modal, Select, Input } from '../components/ui'
import { useQuery, useMutation } from '@tanstack/react-query'
import productsService from '../api/productsService'
import clientsService from '../api/clientsService'
import vouchersService, { VoucherCreate, VoucherPayment, Voucher as VoucherType2 } from '../api/vouchersService'
import arcaService from '../api/arcaService'
import paymentMethodsService from '../api/paymentMethodsService'
import toast from 'react-hot-toast'
import { formatErrorMessage } from '../utils/errorHelpers'

type VoucherType = 'quotation' | 'receipt' | 'invoice'

const voucherTypes = [
  { value: 'quotation', label: 'Cotización', icon: FileText },
  { value: 'receipt', label: 'Remito', icon: Truck },
  { value: 'invoice', label: 'Factura', icon: Receipt },
]

interface Product {
  id: string
  code: string
  description: string
  sale_price: number // Precio de venta final (ya calculado en productos)
}

interface CartItem extends Product {
  quantity: number
  discount: number // Descuento adicional en la venta
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
}

interface Draft {
  id: string
  voucherType: VoucherType
  client: Client
  items: CartItem[]
  subtotal: number
  iva: number
  total: number
  generalDiscount: number
  createdAt: string
}

interface PaymentSelectionState {
  selected: boolean
  amount: string
  reference: string
  extra_date?: string
}

const documentTypes = [
  { value: 'CUIT', label: 'CUIT' },
  { value: 'CUIL', label: 'CUIL' },
  { value: 'DNI', label: 'DNI' },
]

const taxConditions = [
  { value: 'RI', label: 'Responsable Inscripto' },
  { value: 'Monotributista', label: 'Monotributista' },
  { value: 'CF', label: 'Consumidor Final' },
  { value: 'Exento', label: 'Exento' },
]

export default function Sales() {
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

  const allProducts = productsData?.items || []
  const allClients = clientsData?.items || []
  const [voucherType, setVoucherType] = useState<VoucherType>('quotation')
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [items, setItems] = useState<CartItem[]>([])
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const productListRef = useRef<HTMLDivElement>(null)
  const selectedRowRef = useRef<HTMLTableRowElement>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100% (normal)
  const [isGenerating, setIsGenerating] = useState(false)
  const [paymentSelections, setPaymentSelections] = useState<Record<string, PaymentSelectionState>>({})
  
  // Descuento general
  const [generalDiscount, setGeneralDiscount] = useState(0) // Descuento % sobre subtotal

  // Mutation para convertir cotización en factura
  const convertQuotationMutation = useMutation({
    mutationFn: ({ quotationId, payments }: { quotationId: string; payments?: VoucherPayment[] }) =>
      vouchersService.convertToInvoice(quotationId, payments),
    onSuccess: async (data) => {
      toast.success('Factura generada a partir de la cotización', { icon: '✅' })

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
      resetConvertPaymentSelections()
      refetchPendingQuotations()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
    onSettled: () => {
      setIsConvertingQuotation(false)
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
      setClientSearch('')
      setGeneralDiscount(0)
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

  // Modales
  const [showQuantityModal, setShowQuantityModal] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)
  const [showClientSelectorModal, setShowClientSelectorModal] = useState(false)
  const [showDraftsModal, setShowDraftsModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showSaveDraftSuccessModal, setShowSaveDraftSuccessModal] = useState(false)
  const [showDeleteDraftModal, setShowDeleteDraftModal] = useState(false)
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfVoucherInfo, setPdfVoucherInfo] = useState<{ type: string, number: string } | null>(null)

  // === Modales de cotizaciones/remitos pendientes ===
  const [showPendingQuotationsModal, setShowPendingQuotationsModal] = useState(false)
  const [showConvertQuotationModal, setShowConvertQuotationModal] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<VoucherType2 | null>(null)
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

  // Panel de preview de productos seleccionados temporalmente con cantidad y descuento
  interface TempProduct extends Product {
    tempQuantity: number
    tempDiscount: number
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

  const searchInputRef = useRef<HTMLInputElement>(null)
  const clientNameInputRef = useRef<HTMLInputElement>(null)
  
  // Refs para los inputs del modal de configuración
  const modalInputsRef = useRef<(HTMLInputElement | null)[]>([])

  // Filtrar productos según búsqueda
  const filteredProducts = allProducts
    .map(p => ({
      id: p.id,
      code: p.code,
      description: p.description,
      sale_price: p.sale_price,
    }))
    .filter(p =>
      p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.description.toLowerCase().includes(productSearch.toLowerCase())
    )

  // Filtrar clientes según búsqueda
  const filteredClients = allClients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.document_number.includes(clientSearch)
  )

  const paymentMethods = paymentMethodsData || []

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
      // Bloquear eventos si están bloqueados temporalmente o hay modales abiertos
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
    const savedDrafts = localStorage.getItem('sales-drafts')
    if (savedDrafts) {
      setDrafts(JSON.parse(savedDrafts))
    }
  }, [])

  // Toggle producto en lista temporal (agregar o quitar)
  const toggleProductInTemp = (product: Product) => {
    const alreadyInTemp = tempSelectedProducts.find(p => p.id === product.id)
    
    if (alreadyInTemp) {
      // Si ya está, quitarlo
      setTempSelectedProducts(tempSelectedProducts.filter(p => p.id !== product.id))
      toast.success(`${product.description} quitado`, { duration: 1000, icon: '✓' })
    } else {
      // Si no está, agregarlo
      setTempSelectedProducts([...tempSelectedProducts, { ...product, tempQuantity: 1, tempDiscount: 0 }])
      toast.success(`${product.description} agregado`, { duration: 1000, icon: '✓' })
    }
  }

  // Remover producto temporal
  const removeFromTemp = (productId: string) => {
    setTempSelectedProducts(tempSelectedProducts.filter(p => p.id !== productId))
  }

  // Actualizar cantidad/descuento de producto temporal
  const updateTempProduct = (productId: string, field: 'tempQuantity' | 'tempDiscount', value: number) => {
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
      if (existing) {
        existing.quantity += product.tempQuantity
        existing.discount = product.tempDiscount
      } else {
        newItems.push({ 
          ...product, 
          quantity: product.tempQuantity, 
          discount: product.tempDiscount 
        })
      }
    })
    setItems(newItems)

    // Limpiar TODO completamente en el orden correcto
    const count = tempSelectedProducts.length
    
    // 1. Bloquear eventos de teclado temporalmente para evitar que el Enter se propague
    blockKeyboardEventsRef.current = true
    
    // 2. Cerrar modal
    setShowQuantityModal(false)
    
    // 3. Limpiar estados inmediatamente
    setTempSelectedProducts([])
    setProductSearch('')
    setSelectedProductIndex(0)
    
    // 4. Mostrar confirmación
    toast.success(`${count} producto(s) agregados al carrito`)
    
    // 5. Focus en el buscador y desbloquear eventos después de un delay
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.value = '' // Forzar limpieza del DOM
        searchInputRef.current.focus()
      }
      // Desbloquear eventos después de que todo se haya procesado
      blockKeyboardEventsRef.current = false
    }, 150)
  }

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id))
  }

  const updateItem = (id: string, field: 'quantity' | 'discount', value: number) => {
    setItems(items.map(i =>
      i.id === id ? { ...i, [field]: value } : i
    ))
  }

  const calculateItemTotal = (item: CartItem) => {
    const subtotal = item.sale_price * item.quantity
    const discountAmount = subtotal * (item.discount / 100)
    return subtotal - discountAmount
  }

  const handleClear = () => {
    if (items.length > 0 || selectedClient) {
      if (window.confirm('¿Está seguro de que desea limpiar la pantalla?')) {
        setItems([])
        setSelectedClient(null)
        setClientSearch('')
        setProductSearch('')
        setVoucherType('quotation')
        setGeneralDiscount(0)
        resetPaymentSelections()
      }
    }
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

    // Mostrar modal de confirmación
    setShowConfirmModal(true)
  }

  const handleConfirmGenerate = () => {
    if (!selectedClient) {
      toast.error('Debe seleccionar un cliente')
      return
    }

    const paymentValidation = validatePayments()
    if (!paymentValidation.valid) {
      toast.error(paymentValidation.message || 'Verifique los métodos de pago')
      return
    }

    setShowConfirmModal(false)
    
    setIsGenerating(true)
    
    // Mapear tipo de comprobante (simplificado para MVP)
    let backendType = 'quotation'
    if (voucherType === 'receipt') backendType = 'receipt'
    if (voucherType === 'invoice') {
      // Lógica simple: Si es RI -> A, sino B
      backendType = selectedClient.tax_condition === 'RI' ? 'invoice_a' : 'invoice_b'
    }

    // Obtener fecha local (sin conversión UTC)
    const today = new Date()
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const voucherData: VoucherCreate = {
      client_id: selectedClient.id,
      voucher_type: backendType as any,
      date: localDate,
      show_prices: voucherType !== 'receipt', // Remito sin precios por defecto (configurable)
      general_discount: generalDiscount,
      items: items.map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.sale_price, // Enviamos el precio base, el backend recalcula o valida
        discount_percent: item.discount
      })),
      payments: buildPaymentsPayload(),
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
      items,
      subtotal: subtotalAfterDiscount,
      iva: iva,
      total: total,
      generalDiscount,
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
    setClientSearch('')
    setProductSearch('')
  }

  const loadDraft = (draft: Draft) => {
    setVoucherType(draft.voucherType)
    setSelectedClient(draft.client)
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
        const quotationTotal = Number(selectedQuotation.total)
        const difference = Math.max(0, quotationTotal - currentlyAssigned)
        const newAmount = (!current.amount && difference > 0) ? difference.toFixed(2) : current.amount
        return { ...prev, [methodId]: { ...current, selected, amount: newAmount, reference: current.reference || '' } }
      }
      return { ...prev, [methodId]: { ...current, selected, amount: '', reference: '' } }
    })
  }

  // Actualizar monto en modal de conversión
  const handleConvertPaymentAmountChange = (methodId: string, value: string) => {
    if (!selectedQuotation) return
    setConvertPaymentSelections((prev) => {
      const quotationTotal = Number(selectedQuotation.total)
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
        if (method.name === 'Cheque' && selection.extra_date) {
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
    const quotationTotal = Number(selectedQuotation.total)

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
      if (method.name === 'Cheque' && method.requires_reference && !selection.extra_date) {
        return { valid: false, message: `Debe ingresar la fecha de vencimiento para el Cheque` }
      }
    }

    const assignedTotal = paymentMethods.reduce((acc, method) => {
      const selection = convertPaymentSelections[method.id]
      if (!selection?.selected) return acc
      const amountValue = Number(selection.amount)
      return acc + (Number.isFinite(amountValue) ? amountValue : 0)
    }, 0)

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
    const paymentValidation = validateConvertPayments()
    if (!paymentValidation.valid) {
      toast.error(paymentValidation.message || 'Verifique los métodos de pago')
      return
    }
    setIsConvertingQuotation(true)
    convertQuotationMutation.mutate({
      quotationId: selectedQuotation.id,
      payments: buildConvertPaymentsPayload(),
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

        // El total a pagar
        const subtotalItems = items.reduce((acc, item) => acc + calculateItemTotal(item), 0)
        const discountAmount = subtotalItems * (generalDiscount / 100)
        const subtotalAfterDiscount = subtotalItems - discountAmount
        const iva = subtotalAfterDiscount * 0.21
        const total = subtotalAfterDiscount + iva

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
      // 1. Calculamos el total de la factura
      const subtotalItems = items.reduce((acc, item) => acc + calculateItemTotal(item), 0)
      const discountAmount = subtotalItems * (generalDiscount / 100)
      const subtotalAfterDiscount = subtotalItems - discountAmount
      const iva = subtotalAfterDiscount * 0.21
      const total = subtotalAfterDiscount + iva

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
        if (method.name === 'Cheque' && selection.extra_date) {
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
        const refName = 
          method.name === 'Cheque' ? 'el número de cheque' : 
          method.name === 'Transferencia' ? 'el número de transferencia' :
          (method.name === 'Crédito' || method.name === 'Débito') ? 'el número de cupón' :
          'la referencia'
        
        return { valid: false, message: `Debe ingresar ${refName} para ${method.name}` }
      }

      if (method.name === 'Cheque' && method.requires_reference && !selection.extra_date) {
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

    // El frontend mostraba diferencias mínimas en la sumatoria debido a precisión.
    // Usamos Number(toFixed(2)) o directamente comparamos las diferencias redondeadas
    if (assignedTotal > 0 && Math.abs(Number(assignedTotal.toFixed(2)) - Number(total.toFixed(2))) > 0.01) {
      return { 
        valid: false, 
        message: `La suma de pagos ($${assignedTotal.toFixed(2)}) no coincide con el total ($${total.toFixed(2)})` 
      }
    }

    return { valid: true }
  }

  // Cálculos de totales con descuento general
  const subtotalItems = items.reduce((acc, item) => acc + calculateItemTotal(item), 0)
  const discountAmount = subtotalItems * (generalDiscount / 100)
  const subtotalAfterDiscount = subtotalItems - discountAmount
  const iva = subtotalAfterDiscount * 0.21
  const total = subtotalAfterDiscount + iva

  const assignedPaymentsTotal = paymentMethods.reduce((acc, method) => {
    const selection = paymentSelections[method.id]
    if (!selection?.selected) return acc
    const amountValue = Number(selection.amount)
    return acc + (Number.isFinite(amountValue) ? amountValue : 0)
  }, 0)

  const shouldShowPaymentDifference = assignedPaymentsTotal > 0 || voucherType === 'invoice'
  const paymentDifference = shouldShowPaymentDifference ? Number((total - assignedPaymentsTotal).toFixed(2)) : 0
  const isPaymentBalanced = shouldShowPaymentDifference ? Math.abs(Number(total.toFixed(2)) - Number(assignedPaymentsTotal.toFixed(2))) <= 0.01 : true

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Nueva Venta
          </h1>
          <Button variant="outline" size="sm" onClick={handleClear} className="text-xs">
            <RotateCcw size={14} className="mr-1" />
            Limpiar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDraftsModal(true)} className="text-xs relative">
            <FileText size={14} className="mr-1" />
            Borradores
            {drafts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {drafts.length}
              </span>
            )}
          </Button>
          {/* Controles de Zoom */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600 ml-2">
            <button
              onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.8))}
              className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              title="Reducir tamaño"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[10px] font-medium text-gray-500 w-8 text-center select-none">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 1.5))}
              className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              title="Aumentar tamaño"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {voucherTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => setVoucherType(type.value as VoucherType)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                voucherType === type.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cliente */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="relative">
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <input
                type="text"
                value={selectedClient ? selectedClient.name : clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value)
                  if (!e.target.value) setSelectedClient(null)
                }}
                placeholder="Cliente (buscar o seleccionar)"
                className="w-full px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                readOnly={!!selectedClient}
              />
              {selectedClient && (
                <div className="absolute inset-y-0 right-2 flex items-center gap-2">
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                    ✓ {selectedClient.document_number}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedClient(null)
                      setClientSearch('')
                    }}
                    className="text-gray-400 hover:text-red-600"
                    title="Quitar cliente"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowClientSelectorModal(true)} title="Seleccionar cliente">
              <Search size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowClientModal(true)} title="Nuevo cliente">
              <Plus size={16} />
            </Button>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Panel principal - Tablas */}
        <div className="lg:col-span-3 space-y-3">
          {/* TABLA SUPERIOR - Carrito */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Productos seleccionados ({items.length})
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[35vh] overflow-y-auto">
              <table className="w-full transition-all duration-200" style={{ fontSize: `${0.875 * zoomLevel}rem` }}>
                <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Código</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: `${5 * zoomLevel}rem` }}>Cant.</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Precio</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: `${5 * zoomLevel}rem` }}>Desc%</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Total</th>
                    <th className="px-3 py-2 w-10"></th>
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
                    items.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-3 py-2 font-medium">{item.code}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                            style={{ 
                              fontSize: `${0.875 * zoomLevel}rem`,
                              padding: `${0.25 * zoomLevel}rem ${0.375 * zoomLevel}rem`
                            }}
                            min={1}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">${item.sale_price.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.discount}
                            onChange={(e) => updateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                            className="w-full text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                            style={{ 
                              fontSize: `${0.875 * zoomLevel}rem`,
                              padding: `${0.25 * zoomLevel}rem ${0.375 * zoomLevel}rem`
                            }}
                            min={0}
                            max={100}
                            step={0.1}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          ${calculateItemTotal(item).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar - Enter/Doble Click: Seleccionar | ESC: Configurar y Cargar"
                  className="flex-1 text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300"
                />
              </div>
            </div>
            
            {/* Panel de preview de productos seleccionados temporalmente */}
            {tempSelectedProducts.length > 0 && (
              <div className="p-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
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
            <div ref={productListRef} className="overflow-x-auto max-h-[30vh] overflow-y-auto">
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
                          className={`cursor-pointer ${
                            isInTemp 
                              ? 'bg-green-100 dark:bg-green-900' 
                              : index === selectedProductIndex
                                ? 'bg-blue-100 dark:bg-blue-900'
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
                          <td className="px-3 py-2 text-right">${product.sale_price.toLocaleString()}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  ↑↓ Navegar | Enter o Doble Click Seleccionar/Deseleccionar | ESC Configurar
                </p>
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
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700 sticky top-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Resumen
            </h3>

            {/* Input de descuento general */}
            <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
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

            <div className="space-y-2 mb-4 text-xs">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>Subtotal items</span>
                <span className="font-medium">${subtotalItems.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              {generalDiscount > 0 && (
                <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                  <span>Descuento ({generalDiscount}%)</span>
                  <span className="font-medium">-${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              
              <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-200 dark:border-gray-700">
                <span className="font-medium">Subtotal</span>
                <span className="font-semibold">${subtotalAfterDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>IVA (21%)</span>
                <span className="font-medium">${iva.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t-2 border-gray-300 dark:border-gray-600">
                <span>TOTAL</span>
                <span>${total.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button 
                variant="primary" 
                size="sm" 
                className="w-full text-xs" 
                onClick={handleGenerateClick}
                disabled={isGenerating}
              >
                {isGenerating 
                  ? 'Procesando...' 
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
              <button
                onClick={() => setShowPendingQuotationsModal(true)}
                className="relative w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                <ClipboardList size={14} />
                Facturar Cotización / Remito
                {pendingQuotationsData && pendingQuotationsData.total > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">
                    {pendingQuotationsData.total > 99 ? '99+' : pendingQuotationsData.total}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal configuración de productos seleccionados */}
      <Modal 
        isOpen={showQuantityModal} 
        onClose={() => {
          setShowQuantityModal(false)
          // NO limpiamos tempSelectedProducts para que pueda volver a abrir con ESC
        }} 
        title="Configurar productos seleccionados"
        size="xl"
      >
        <div className="space-y-4">
          {tempSelectedProducts.length > 0 ? (
            <>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  <strong>Enter</strong> para navegar entre campos. Al completar el último campo, presioná <strong>Enter</strong> para agregar al carrito.
                </p>
              </div>

              <div className="max-h-96 overflow-y-auto border rounded-lg dark:border-gray-600">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
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
                      const subtotal = product.sale_price * product.tempQuantity
                      const discountAmount = subtotal * (product.tempDiscount / 100)
                      const total = subtotal - discountAmount
                      
                      // Índices de los inputs: cantidad = productIndex * 2, descuento = productIndex * 2 + 1
                      const quantityInputIndex = productIndex * 2
                      const discountInputIndex = productIndex * 2 + 1
                      
                      return (
                        <tr key={product.id}>
                          <td className="px-3 py-2 font-medium">{product.code}</td>
                          <td className="px-3 py-2">{product.description}</td>
                          <td className="px-3 py-2 text-right">${product.sale_price.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              ref={(el) => modalInputsRef.current[quantityInputIndex] = el}
                              type="number"
                              value={product.tempQuantity}
                              onChange={(e) => updateTempProduct(product.id, 'tempQuantity', parseInt(e.target.value) || 1)}
                              onKeyDown={(e) => handleModalInputKeyDown(e, quantityInputIndex)}
                              className="w-full text-right text-sm px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                              min={1}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              ref={(el) => modalInputsRef.current[discountInputIndex] = el}
                              type="number"
                              value={product.tempDiscount}
                              onChange={(e) => updateTempProduct(product.id, 'tempDiscount', parseFloat(e.target.value) || 0)}
                              onKeyDown={(e) => handleModalInputKeyDown(e, discountInputIndex)}
                              className="w-full text-right text-sm px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                              min={0}
                              max={100}
                              step={0.1}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeFromTemp(product.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Quitar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
                        Total:
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-lg text-gray-900 dark:text-white">
                        ${tempSelectedProducts.reduce((acc, p) => {
                          const subtotal = p.sale_price * p.tempQuantity
                          const discountAmount = subtotal * (p.tempDiscount / 100)
                          return acc + (subtotal - discountAmount)
                        }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex gap-2 pt-2">
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
                <Button variant="primary" onClick={confirmTempProducts} className="flex-1">
                  Agregar al Carrito
                </Button>
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
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
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
                        ${draft.total.toLocaleString()}
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
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {client.tax_condition}
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
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
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

                {/* Descuento General Editable */}
                <div className="pt-3 border-t border-blue-200 dark:border-blue-700">
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
                <div className="space-y-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Subtotal items:</span>
                    <span className="font-medium">${subtotalItems.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {generalDiscount > 0 && (
                    <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                      <span>Descuento ({generalDiscount}%):</span>
                      <span className="font-medium">-${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm font-medium pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-gray-700 dark:text-gray-300">Subtotal:</span>
                    <span>${subtotalAfterDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">IVA (21%):</span>
                    <span className="font-medium">${iva.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {/* Total final */}
                  <div className="flex justify-between pt-2 border-t-2 border-blue-300 dark:border-blue-600">
                    <span className="font-bold text-gray-900 dark:text-white text-base">TOTAL:</span>
                    <span className="font-bold text-xl text-blue-600 dark:text-blue-400">
                      ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
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
                <p className={`text-sm font-semibold ${isPaymentBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  ${assignedPaymentsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20' 
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <label className="flex items-center gap-2 min-w-[140px] shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleTogglePayment(method.id, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="flex flex-col">
                            <span className={`text-sm font-medium leading-tight ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>
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
                          <div className={`${method.name === 'Cheque' ? 'w-[25%]' : 'w-[40%]'}`}>
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

                          <div className={`flex gap-2 ${method.name === 'Cheque' ? 'w-[75%]' : 'w-[60%]'}`}>
                            {method.name === 'Cheque' ? (
                              <>
                                <Input
                                  type="text"
                                  value={selection?.reference || ''}
                                  onChange={(e) => handlePaymentReferenceChange(method.id, e.target.value)}
                                  placeholder="Nro Cheque"
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
                                placeholder={
                                  method.name === 'Transferencia' ? 'Nro de transferencia' :
                                  (method.name === 'Crédito' || method.name === 'Débito') ? 'Nro de cupón' :
                                  (method.requires_reference ? 'Obligatoria' : 'Opcional')
                                }
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
              <span className={`font-semibold ${isPaymentBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                ${paymentDifference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              {voucherType === 'invoice' ? 'Emitir Factura Electrónica' : 'Confirmar'}
            </Button>
          </div>
        </div>
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
                { value: 'receipt', label: 'Remitos' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setQuotationTypeFilter(opt.value as 'all' | 'quotation' | 'receipt')}
                  className={`flex-1 py-2 transition-colors ${
                    quotationTypeFilter === opt.value
                      ? 'bg-amber-500 text-white'
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
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-amber-400 focus:outline-none"
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
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-amber-400 focus:outline-none"
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
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-amber-400 focus:outline-none"
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
                  <div className="inline-block w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-sm">Cargando...</p>
                </div>
              ) : pendingQuotationsData.items.length === 0 ? (
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
                  {pendingQuotationsData.items.map((voucher) => {
                    const isQuotation = voucher.voucher_type === 'quotation'
                    return (
                      <button
                        key={voucher.id}
                        onClick={() => handleSelectQuotationToConvert(voucher)}
                        className="w-full grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center px-3 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-900/15 transition-colors group"
                      >
                        {/* Badge tipo */}
                        <div className="shrink-0">
                          <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isQuotation
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
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
                          <p className="text-[11px] text-gray-400 truncate leading-tight">
                            {voucher.client?.document_type}: {voucher.client?.document_number}
                            {voucher.client?.tax_condition && (
                              <span className="ml-1.5 text-blue-500 dark:text-blue-400">
                                · {voucher.client.tax_condition}
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
                            ${Number(voucher.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </p>
                          <span className="text-[10px] text-amber-500 dark:text-amber-400 group-hover:underline font-medium">
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
              {pendingQuotationsData.total} comprobante(s) pendiente(s)
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
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                }`}>
                  {selectedQuotation.voucher_type === 'receipt' ? 'REM' : 'COT'} {selectedQuotation.sale_point}-{selectedQuotation.number}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Cliente:</span>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedQuotation.client?.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedQuotation.client?.document_type}: {selectedQuotation.client?.document_number}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Condición IVA:</span>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedQuotation.client?.tax_condition}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    → Factura {selectedQuotation.client?.tax_condition === 'RI' ? 'A' : 'B'}
                  </p>
                </div>
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
                          ${Number(item.unit_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium text-gray-900 dark:text-white">
                          ${Number(item.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-right font-bold text-gray-900 dark:text-white">TOTAL:</td>
                      <td className="px-2 py-2 text-right font-bold text-blue-600 dark:text-blue-400 text-sm">
                        ${Number(selectedQuotation.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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
                  <p className="text-xs text-gray-500 dark:text-gray-400">Opcional</p>
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
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <label className="flex items-center gap-2 min-w-[140px] shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleConvertTogglePayment(method.id, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600"
                            />
                            <span className={`text-sm font-medium ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>
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
                              className={`w-32 text-right text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 ${!isSelected ? 'opacity-40' : ''}`}
                            />
                            {method.name === 'Cheque' ? (
                              <>
                                <input
                                  type="text"
                                  value={selection?.reference || ''}
                                  onChange={(e) => handleConvertPaymentReferenceChange(method.id, e.target.value)}
                                  placeholder="Nro Cheque"
                                  disabled={!isSelected}
                                  className={`flex-1 text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 ${!isSelected ? 'opacity-40' : ''}`}
                                />
                                <input
                                  type="date"
                                  value={selection?.extra_date || ''}
                                  onChange={(e) => handleConvertPaymentExtraDateChange(method.id, e.target.value)}
                                  disabled={!isSelected}
                                  className={`text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 ${!isSelected ? 'opacity-40' : ''}`}
                                  title="Fecha de vencimiento"
                                />
                              </>
                            ) : (
                              <input
                                type="text"
                                value={selection?.reference || ''}
                                onChange={(e) => handleConvertPaymentReferenceChange(method.id, e.target.value)}
                                placeholder={
                                  method.name === 'Transferencia' ? 'Nro de transferencia' :
                                  (method.name === 'Crédito' || method.name === 'Débito') ? 'Nro de cupón' :
                                  (method.requires_reference ? 'Obligatoria' : 'Opcional')
                                }
                                disabled={!isSelected}
                                className={`flex-1 text-sm px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 ${!isSelected ? 'opacity-40' : ''}`}
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
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={handleDownloadPdf}
                  className="flex-1"
                >
                  <Download size={16} className="mr-2" />
                  Descargar PDF
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handlePrintPdf}
                  className="flex-1"
                >
                  <Printer size={16} className="mr-2" />
                  Imprimir
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleClosePdfModal}
                  className="flex-1"
                >
                  <X size={16} className="mr-2" />
                  Cerrar
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
