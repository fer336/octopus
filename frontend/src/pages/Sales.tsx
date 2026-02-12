/**
 * Página de Ventas unificada.
 * Permite crear cotizaciones, remitos y facturas.
 */
import { useState, useEffect, useRef } from 'react'
import { ShoppingCart, FileText, Truck, Receipt, Plus, Trash2, Search, RotateCcw, Save, ZoomIn, ZoomOut } from 'lucide-react'
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
      
      // Descargar PDF con autenticación y abrirlo
      try {
        const pdfBlob = await vouchersService.getPdf(data.id)
        const pdfUrl = URL.createObjectURL(pdfBlob)
        window.open(pdfUrl, '_blank')
        
        // Limpiar la URL del blob después de un tiempo
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
      } catch (error) {
        toast.error('Error al abrir el PDF: ' + formatErrorMessage(error))
      }
      
      // Limpiar
      setItems([])
      setSelectedClient(null)
      setClientSearch('')
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

  // Producto seleccionado
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [discount, setDiscount] = useState('0')

  // Formulario de cliente
  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: '',
    document_type: 'CUIT',
    document_number: '',
    tax_condition: 'CF',
  })

  const searchInputRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const clientNameInputRef = useRef<HTMLInputElement>(null)

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
      if (showQuantityModal || showClientModal || showDraftsModal) return

      if (e.key === 'Escape' && filteredProducts.length > 0) {
        e.preventDefault()
        const product = filteredProducts[selectedProductIndex]
        if (product) {
          setSelectedProduct(product)
          setQuantity('1')
          setDiscount('0')
          setShowQuantityModal(true)
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
  }, [filteredProducts, selectedProductIndex, showQuantityModal, showClientModal, showDraftsModal])

  // Reset selected index cuando cambia la búsqueda
  useEffect(() => {
    setSelectedProductIndex(0)
  }, [productSearch])

  // Focus handlers
  useEffect(() => {
    if (showQuantityModal && quantityInputRef.current) {
      quantityInputRef.current.focus()
      quantityInputRef.current.select()
    }
  }, [showQuantityModal])

  useEffect(() => {
    if (showClientModal && clientNameInputRef.current) {
      clientNameInputRef.current.focus()
    }
  }, [showClientModal])

  // Cargar borradores al iniciar
  useEffect(() => {
    const savedDrafts = localStorage.getItem('sales-drafts')
    if (savedDrafts) {
      setDrafts(JSON.parse(savedDrafts))
    }
  }, [])

  const addItemToCart = () => {
    if (!selectedProduct) return

    const qty = parseInt(quantity) || 1
    const disc = parseFloat(discount) || 0

    const existing = items.find(i => i.id === selectedProduct.id)
    if (existing) {
      setItems(items.map(i =>
        i.id === selectedProduct.id
          ? { ...i, quantity: i.quantity + qty, discount: disc }
          : i
      ))
    } else {
      setItems([...items, { ...selectedProduct, quantity: qty, discount: disc }])
    }

    setShowQuantityModal(false)
    setSelectedProduct(null)
    setProductSearch('')
    searchInputRef.current?.focus()
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
      if (confirm('¿Está seguro de que desea limpiar la pantalla?')) {
        setItems([])
        setSelectedClient(null)
        setClientSearch('')
        setProductSearch('')
        setVoucherType('quotation')
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
    
    if (true) {
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
  }

  const handleSaveDraft = () => {
    if (items.length === 0) {
      alert('No hay productos para guardar')
      return
    }

    if (!selectedClient) {
      alert('Debe seleccionar un cliente antes de guardar el borrador')
      return
    }

    const draft: Draft = {
      id: Date.now().toString(),
      voucherType,
      client: selectedClient,
      items,
      subtotal,
      iva,
      total,
      createdAt: new Date().toISOString(),
    }

    const savedDrafts = [...drafts, draft]
    setDrafts(savedDrafts)
    localStorage.setItem('sales-drafts', JSON.stringify(savedDrafts))

    alert('Borrador guardado correctamente')

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
    setShowDraftsModal(false)
  }

  const deleteDraft = (draftId: string) => {
    if (confirm('¿Está seguro de eliminar este borrador?')) {
      const updatedDrafts = drafts.filter(d => d.id !== draftId)
      setDrafts(updatedDrafts)
      localStorage.setItem('sales-drafts', JSON.stringify(updatedDrafts))
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

  const subtotal = items.reduce((acc, item) => acc + calculateItemTotal(item), 0)
  const iva = subtotal * 0.21
  const total = subtotal + iva

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
              <table className="w-full transition-all duration-200" style={{ fontSize: `${0.75 * zoomLevel}rem` }}>
                <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Código</th>
                    <th className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="px-2 py-1 text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: `${4 * zoomLevel}rem` }}>Cant.</th>
                    <th className="px-2 py-1 text-right font-medium text-gray-600 dark:text-gray-400">Precio</th>
                    <th className="px-2 py-1 text-right font-medium text-gray-600 dark:text-gray-400" style={{ width: `${4 * zoomLevel}rem` }}>Desc%</th>
                    <th className="px-2 py-1 text-right font-medium text-gray-600 dark:text-gray-400">Total</th>
                    <th className="px-2 py-1 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-6 text-center text-gray-400">
                        <ShoppingCart className="mx-auto mb-1 opacity-50" size={24 * zoomLevel} />
                        <p>Sin productos</p>
                      </td>
                    </tr>
                  ) : (
                    items.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-2 py-1.5 font-medium">{item.code}</td>
                        <td className="px-2 py-1.5">{item.description}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                            style={{ 
                              fontSize: `${0.75 * zoomLevel}rem`,
                              padding: `${0.125 * zoomLevel}rem ${0.25 * zoomLevel}rem`
                            }}
                            min={1}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">${item.sale_price.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            value={item.discount}
                            onChange={(e) => updateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                            className="w-full text-right border rounded dark:bg-gray-700 dark:border-gray-600"
                            style={{ 
                              fontSize: `${0.75 * zoomLevel}rem`,
                              padding: `${0.125 * zoomLevel}rem ${0.25 * zoomLevel}rem`
                            }}
                            min={0}
                            max={100}
                            step={0.1}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          ${calculateItemTotal(item).toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 size={14 * zoomLevel} />
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
                  placeholder="Buscar producto - Presione ESC para agregar"
                  className="flex-1 text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300"
                />
              </div>
            </div>
            <div className="overflow-x-auto max-h-[30vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Código</th>
                    <th className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="px-2 py-1 text-right font-medium text-gray-600 dark:text-gray-400">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-6 text-center text-gray-400">
                        <p className="text-xs">
                          {productSearch ? 'No se encontraron productos' : 'Busque productos para agregar'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product, index) => (
                      <tr
                        key={product.id}
                        className={`cursor-pointer ${
                          index === selectedProductIndex
                            ? 'bg-blue-100 dark:bg-blue-900'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => {
                          setSelectedProduct(product)
                          setQuantity('1')
                          setDiscount('0')
                          setShowQuantityModal(true)
                        }}
                      >
                        <td className="px-2 py-1.5 font-medium">{product.code}</td>
                        <td className="px-2 py-1.5">{product.description}</td>
                        <td className="px-2 py-1.5 text-right">${product.sale_price.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500">
                ↑↓ Navegar | ESC Agregar producto
              </p>
            </div>
          </div>
        </div>

        {/* Panel lateral - Resumen */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700 sticky top-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Resumen
            </h3>

            <div className="space-y-2 mb-4 text-xs">
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>Subtotal</span>
                <span className="font-medium">${subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>IVA (21%)</span>
                <span className="font-medium">${iva.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span>
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

      {/* Modal cantidad */}
      <Modal isOpen={showQuantityModal} onClose={() => setShowQuantityModal(false)} title="Agregar producto">
        {selectedProduct && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedProduct.code} - {selectedProduct.description}
              </p>
              <p className="text-xs text-gray-500">
                Precio: ${selectedProduct.sale_price.toLocaleString()}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cantidad
              </label>
              <input
                ref={quantityInputRef}
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItemToCart()}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                min={1}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descuento adicional (%)
              </label>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItemToCart()}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                min={0}
                max={100}
                step={0.1}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowQuantityModal(false)} className="flex-1">
                Cancelar
              </Button>
              <Button variant="primary" onClick={addItemToCart} className="flex-1">
                Agregar
              </Button>
            </div>
          </div>
        )}
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
                      onClick={() => deleteDraft(draft.id)}
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
              <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-700">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Total:</span>
                <span className="font-bold text-lg text-gray-900 dark:text-white">
                  ${total.toLocaleString()}
                </span>
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
    </div>
  )
}
