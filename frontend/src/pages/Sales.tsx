/**
 * Página de Ventas unificada.
 * Permite crear cotizaciones, remitos y facturas.
 */
import { useState, useEffect, useRef } from 'react'
import { ShoppingCart, FileText, Truck, Receipt, Plus, Trash2, Search, RotateCcw, Save, ZoomIn, ZoomOut, Download, Printer, X } from 'lucide-react'
import { Button, Modal, Select } from '../components/ui'
import { useQuery, useMutation } from '@tanstack/react-query'
import productsService from '../api/productsService'
import clientsService from '../api/clientsService'
import vouchersService, { VoucherCreate } from '../api/vouchersService'
import arcaService from '../api/arcaService'
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

  const allProducts = productsData?.items || []
  const allClients = clientsData?.items || []
  const [voucherType, setVoucherType] = useState<VoucherType>('quotation')
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [items, setItems] = useState<CartItem[]>([])
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100% (normal)
  const [isGenerating, setIsGenerating] = useState(false)
  
  // Descuento general
  const [generalDiscount, setGeneralDiscount] = useState(0) // Descuento % sobre subtotal

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
        const pdfBlob = await vouchersService.getPdf(data.id)
        const blobUrl = URL.createObjectURL(pdfBlob)
        
        // Guardar la URL y la info del comprobante
        setPdfUrl(blobUrl)
        setPdfVoucherInfo({
          type: data.voucher_type,
          number: data.number
        })
        
        // Abrir modal con el PDF
        setShowPdfModal(true)
        
      } catch (error) {
        toast.error('Error al abrir el PDF: ' + formatErrorMessage(error))
      }
      
      // Limpiar
      setItems([])
      setSelectedClient(null)
      setClientSearch('')
      setGeneralDiscount(0)
      setProductSearch('')
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
    setShowConfirmModal(false)
    
    if (!selectedClient) {
      toast.error('Debe seleccionar un cliente')
      return
    }
    
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
      items: items.map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.sale_price, // Enviamos el precio base, el backend recalcula o valida
        discount_percent: item.discount
      }))
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

  // Cálculos de totales con descuento general
  const subtotalItems = items.reduce((acc, item) => acc + calculateItemTotal(item), 0)
  const discountAmount = subtotalItems * (generalDiscount / 100)
  const subtotalAfterDiscount = subtotalItems - discountAmount
  const iva = subtotalAfterDiscount * 0.21
  const total = subtotalAfterDiscount + iva

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
            <div className="overflow-x-auto max-h-[30vh] overflow-y-auto">
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
      >
        <div className="space-y-4">
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
                  <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                  <span className="font-medium">${subtotalItems.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                {generalDiscount > 0 && (
                  <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                    <span>Descuento ({generalDiscount}%):</span>
                    <span className="font-medium">-${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-medium pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-700 dark:text-gray-300">Subtotal:</span>
                  <span>${subtotalAfterDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">IVA (21%):</span>
                  <span className="font-medium">${iva.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Total final */}
                <div className="flex justify-between pt-2 border-t-2 border-blue-300 dark:border-blue-600">
                  <span className="font-bold text-gray-900 dark:text-white text-base">TOTAL:</span>
                  <span className="font-bold text-xl text-blue-600 dark:text-blue-400">
                    ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Desglose de totales */}
              <div className="space-y-2 pt-3 border-t border-blue-200 dark:border-blue-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Subtotal items:</span>
                  <span className="font-medium">${subtotalItems.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Descuento general */}
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 dark:text-gray-400">Descuento general:</span>
                    <input
                      type="number"
                      value={generalDiscount}
                      onChange={(e) => setGeneralDiscount(parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-0.5 text-xs text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                      min={0}
                      max={100}
                      step={0.1}
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    -${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Subtotal después de descuentos */}
                <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">Subtotal:</span>
                  <span className="font-semibold">${subtotalAfterDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                {/* IVA */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">IVA (21%):</span>
                  <span className="font-medium">${iva.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Total final */}
                <div className="flex justify-between pt-2 border-t-2 border-blue-300 dark:border-blue-600">
                  <span className="font-bold text-gray-900 dark:text-white text-base">TOTAL:</span>
                  <span className="font-bold text-xl text-blue-600 dark:text-blue-400">
                    ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
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
