/**
 * Página de Productos.
 * Lista, búsqueda y gestión de productos con cálculo de precio final.
 */
import { useState, useEffect, useRef } from 'react'
import { Plus, Edit, Trash2, Calculator, Upload, Download, Search, Database, AlertTriangle } from 'lucide-react'
import { Button, Table, Pagination, Modal, Select } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import productsService, { ProductCreate, ProductUpdate, Product, ProductImportRow, ImportPreviewResponse } from '../api/productsService'
import categoriesService from '../api/categoriesService'
import suppliersService from '../api/suppliersService'
import ImportPreviewModal from '../components/products/ImportPreviewModal'
import BulkDeleteModal from '../components/products/BulkDeleteModal'

export default function Products() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<ImportPreviewResponse | null>(null)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // React Query para productos con filtros
  const { data: productsData, isLoading, error } = useQuery({
    queryKey: ['products', page, search, selectedCategory, selectedSupplier],
    queryFn: () => productsService.getAll({ 
      page, 
      per_page: 20, 
      search,
      category_id: selectedCategory || undefined,
      supplier_id: selectedSupplier || undefined
    }),
    retry: false,
  })

  // Query para categorías - deshabilitar si no hay auth
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesService.getAll(),
    retry: false,
    enabled: !!productsData || !error,
  })

  // Query para proveedores - deshabilitar si no hay auth
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersService.getAll({ per_page: 100 }),
    retry: false,
    enabled: !!productsData || !error,
  })

  // Valores seguros con fallback a array vacío
  const categories = Array.isArray(categoriesData) ? categoriesData : []
  const suppliers = Array.isArray(suppliersData?.items) ? suppliersData.items : []

  // Mutation para crear producto
  const createMutation = useMutation({
    mutationFn: (data: ProductCreate) => productsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Producto creado correctamente', {
        duration: 3000,
        icon: '✅',
      })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Mutation para actualizar producto
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductUpdate }) =>
      productsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Producto actualizado correctamente', {
        duration: 3000,
        icon: '✅',
      })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Manejo de importación Excel - Ahora con preview
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setIsImporting(true)
      try {
        // Llamar al endpoint de preview
        const preview = await productsService.previewImport(file)
        setImportPreviewData(preview)
        setShowImportPreview(true)
        
        toast.success(`Archivo parseado: ${preview.total_rows} filas encontradas`, {
          icon: '📄'
        })
      } catch (error: any) {
        toast.error('Error al leer archivo: ' + (error.response?.data?.detail || error.message))
      } finally {
        setIsImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
  }

  // Confirmar importación después del preview
  const handleConfirmImport = async (rows: ProductImportRow[]) => {
    try {
      const result = await productsService.confirmImport({ rows })
      
      toast.success(`Importación completada: ${result.created} creados, ${result.updated} actualizados.`, {
        duration: 5000,
        icon: '✅'
      })
      
      if (result.errors && result.errors.length > 0) {
        toast.error(`Hubo ${result.errors.length} errores. Revisa la consola.`)
        console.error("Errores de importación:", result.errors)
      }
      
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowImportPreview(false)
      setImportPreviewData(null)
    } catch (error: any) {
      toast.error('Error al confirmar importación: ' + (error.response?.data?.detail || error.message))
      throw error
    }
  }

  // Manejo de exportación Excel
  const handleExport = async () => {
    try {
      const blob = await productsService.exportExcel()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `productos-${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Exportación exitosa')
    } catch (error) {
      toast.error('Error al exportar productos')
    }
  }

  // Manejo de backup completo
  const handleBackup = async () => {
    try {
      const blob = await productsService.exportBackup()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-completo-${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Backup completo descargado')
    } catch (error) {
      toast.error('Error al generar backup')
    }
  }

  // Manejo de borrado total
  const handleBulkDeleteConfirm = async () => {
    try {
      const result = await productsService.bulkDelete()
      toast.success(result.message, {
        duration: 5000,
        icon: '🗑️'
      })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (error: any) {
      console.error('Bulk delete error:', error)
      console.error('Error response:', error.response)
      const errorMsg = error.response?.data?.detail || error.message || JSON.stringify(error)
      toast.error('Error al eliminar productos: ' + errorMsg)
      throw error
    }
  }

  // Formulario de producto
  const [formData, setFormData] = useState<Partial<Product>>({
    code: '',
    description: '',
    supplier_code: '',
    category_id: '',
    supplier_id: '',
    list_price: 0,
    discount_1: 0,
    discount_2: 0,
    discount_3: 0,
    extra_cost: 0,
    iva_rate: 21,
    current_stock: 0,
    minimum_stock: 0,
    unit: 'unidad',
    is_active: true,
  })

  const [discountsInput, setDiscountsInput] = useState('')

  // Refs para navegación con Enter
  const codeRef = useRef<HTMLInputElement>(null)
  const supplierCodeRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const listPriceRef = useRef<HTMLInputElement>(null)
  const discountsRef = useRef<HTMLInputElement>(null)
  const extraCostRef = useRef<HTMLInputElement>(null)
  const taxRef = useRef<HTMLInputElement>(null)
  const categoryRef = useRef<HTMLSelectElement>(null)
  const supplierRef = useRef<HTMLSelectElement>(null)
  const stockRef = useRef<HTMLInputElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setFormData({
      code: '',
      description: '',
      supplier_code: '',
      category_id: '',
      supplier_id: '',
      list_price: 0,
      discount_1: 0,
      discount_2: 0,
      discount_3: 0,
      extra_cost: 0,
      iva_rate: 21,
      current_stock: 0,
      minimum_stock: 0,
      unit: 'unidad',
      is_active: true,
    })
    setDiscountsInput('')
  }

  // Parsear input de bonificaciones (ej: "10+10+5")
  const parseDiscounts = (input: string): number[] => {
    if (!input.trim()) return []

    return input
      .split('+')
      .map(d => parseFloat(d.trim()))
      .filter(d => !isNaN(d) && d > 0 && d <= 100)
  }

  // Actualizar descuentos cuando cambia el input
  const handleDiscountsChange = (input: string) => {
    setDiscountsInput(input)
    const discounts = parseDiscounts(input)
    setFormData(prev => ({
      ...prev,
      discount_1: discounts[0] || 0,
      discount_2: discounts[1] || 0,
      discount_3: discounts[2] || 0,
    }))
  }

  // Handler cuando cambia el proveedor
  const handleSupplierChange = (supplierId: string) => {
    setFormData(prev => ({ ...prev, supplier_id: supplierId }))
    
    // Si seleccionó un proveedor, cargar sus descuentos por defecto
    if (supplierId) {
      const supplier = suppliers.find(s => s.id === supplierId)
      if (supplier) {
        // Construir el string de descuentos
        const discounts = [
          supplier.default_discount_1,
          supplier.default_discount_2,
          supplier.default_discount_3
        ].filter(d => d > 0)
        
        if (discounts.length > 0) {
          const discountStr = discounts.join('+')
          setDiscountsInput(discountStr)
          setFormData(prev => ({
            ...prev,
            discount_1: discounts[0] || 0,
            discount_2: discounts[1] || 0,
            discount_3: discounts[2] || 0,
          }))
          
          toast.success(`Descuentos aplicados: ${discountStr}%`, {
            duration: 2000,
            icon: '🏷️'
          })
        }
      }
    }
  }

  // Calcular precio de venta estimado en frontend (solo visual)
  const calculateEstimatedPrice = () => {
    const listPrice = formData.list_price || 0
    const d1 = formData.discount_1 || 0
    const d2 = formData.discount_2 || 0
    const d3 = formData.discount_3 || 0
    const extra = formData.extra_cost || 0
    const iva = formData.iva_rate || 21

    // Neto base
    const netBase = listPrice * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
    
    // Con extra
    const netWithExtra = netBase * (1 + extra / 100)
    
    // Con IVA
    const finalPrice = netWithExtra * (1 + iva / 100)
    
    return finalPrice
  }

  // Focus en el primer campo al abrir el modal
  useEffect(() => {
    if (showModal && codeRef.current) {
      setTimeout(() => codeRef.current?.focus(), 100)
    }
  }, [showModal])

  // Navegar al siguiente campo con Enter
  const handleEnterKey = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      nextRef.current?.focus()
    }
  }

  // Seleccionar todo el texto al hacer focus en un campo numérico
  const handleNumericFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select()
  }

  // Limpiar el campo si tiene valor 0 y el usuario empieza a escribir un número
  const handleNumericKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    fieldName: keyof typeof formData,
    nextRef?: React.RefObject<any>
  ) => {
    const input = e.currentTarget
    const currentValue = input.value
    const numericValue = parseFloat(currentValue)

    // Si presiona Enter, navegar al siguiente campo
    if (e.key === 'Enter' && nextRef) {
      e.preventDefault()
      nextRef.current?.focus()
      return
    }

    // Si el campo tiene valor 0 y el usuario presiona un número (excepto 0)
    // O si presiona Backspace/Delete cuando el valor es 0, limpiar el campo
    if (numericValue === 0 || currentValue === '0') {
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const newValue = parseFloat(e.key)
        setFormData({ ...formData, [fieldName]: newValue as any })
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        setFormData({ ...formData, [fieldName]: '' as any })
      }
    }
  }

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setIsEditing(true)
      setEditingId(product.id)
      setFormData(product)
      // Construir el string de descuentos
      const discounts = [product.discount_1, product.discount_2, product.discount_3].filter(d => d > 0)
      setDiscountsInput(discounts.join('+'))
    } else {
      resetForm()
    }
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validación de campos obligatorios
    if (!formData.code?.trim()) {
      toast.error('El código del producto es obligatorio')
      codeRef.current?.focus()
      return
    }
    
    if (!formData.description?.trim()) {
      toast.error('La descripción del producto es obligatoria')
      descriptionRef.current?.focus()
      return
    }

    if ((formData.list_price ?? 0) <= 0) {
      toast.error('El precio de lista debe ser mayor a 0')
      listPriceRef.current?.focus()
      return
    }

    // Preparar datos para enviar al backend
    const dataToSend: ProductCreate | ProductUpdate = {
      code: formData.code!.trim(),
      supplier_code: formData.supplier_code?.trim() || undefined,
      description: formData.description!.trim(),
      category_id: formData.category_id || undefined,
      supplier_id: formData.supplier_id || undefined,
      list_price: formData.list_price!,
      discount_1: formData.discount_1 || 0,
      discount_2: formData.discount_2 || 0,
      discount_3: formData.discount_3 || 0,
      extra_cost: formData.extra_cost || 0,
      iva_rate: formData.iva_rate || 21,
      current_stock: formData.current_stock || 0,
      minimum_stock: formData.minimum_stock || 0,
      unit: formData.unit || 'unidad',
      cost_price: 0, // Se calcula en el backend
    }

    // Ejecutar mutation correspondiente
    if (isEditing && editingId) {
      updateMutation.mutate({ id: editingId, data: dataToSend })
    } else {
      createMutation.mutate(dataToSend as ProductCreate)
    }
  }

  const columns = [
    { key: 'code', header: 'Código' },
    { key: 'description', header: 'Descripción' },
    {
      key: 'category_id',
      header: 'Categoría',
      render: (item: Product) => {
        const category = categories.find(c => c.id === item.category_id)
        return category ? (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
            {category.name}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">-</span>
        )
      },
    },
    {
      key: 'supplier_id',
      header: 'Proveedor',
      render: (item: Product) => {
        const supplier = suppliers.find(s => s.id === item.supplier_id)
        return supplier ? (
          <span className="text-xs">{supplier.name}</span>
        ) : (
          <span className="text-gray-400 text-xs">-</span>
        )
      },
    },
    {
      key: 'list_price',
      header: 'P. Lista',
      render: (item: Product) => (
        <span className="text-xs">${item.list_price.toLocaleString()}</span>
      ),
    },
    {
      key: 'sale_price',
      header: 'P. Venta',
      render: (item: Product) => (
        <div className="flex flex-col">
          <span className="font-medium">${item.sale_price.toLocaleString()}</span>
          {item.discount_display && (
            <span className="text-[10px] text-green-600">Bonif: {item.discount_display}%</span>
          )}
          {item.extra_cost > 0 && (
            <span className="text-[10px] text-orange-600">Extra: {item.extra_cost}%</span>
          )}
        </div>
      ),
    },
    {
      key: 'current_stock',
      header: 'Stock',
      render: (item: Product) => (
        <span className={item.current_stock < 10 ? 'text-red-600 font-medium' : ''}>
          {item.current_stock}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item: Product) => (
        <div className="flex gap-2">
          <button
            className="text-gray-400 hover:text-primary-600"
            onClick={() => handleOpenModal(item)}
          >
            <Edit size={18} />
          </button>
          <button className="text-gray-400 hover:text-red-600">
            <Trash2 size={18} />
          </button>
        </div>
      ),
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    const isUnauthorized = errorMessage.includes('401') || errorMessage.includes('Unauthorized')
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">
            {isUnauthorized ? 'No estás autenticado' : 'Error al cargar productos'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {isUnauthorized 
              ? 'Por favor inicia sesión con Google para continuar' 
              : errorMessage}
          </p>
          {isUnauthorized && (
            <Button 
              onClick={() => window.location.href = '/login'} 
              className="mt-4"
            >
              Ir al Login
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Los productos ya vienen filtrados del backend si se usan los parámetros
  const products = productsData?.items || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Productos
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Gestión del inventario con cálculo automático de precios
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Botones de acción */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            className="hidden" 
            accept=".xlsx, .xls" 
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            <Upload size={18} className="mr-2" />
            {isImporting ? 'Importando...' : 'Importar'}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download size={18} className="mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={handleBackup} className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20">
            <Database size={18} className="mr-2" />
            Backup Completo
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowBulkDeleteModal(true)} 
            className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <AlertTriangle size={18} className="mr-2" />
            Borrar Todo
          </Button>
          <Button onClick={() => handleOpenModal()}>
            <Plus size={18} className="mr-2" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Barra de Filtros Completa */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o descripción..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <Select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          options={[
            { value: '', label: 'Todas las Categorías' },
            ...categories.map(c => ({ value: c.id, label: c.name }))
          ]}
        />
        
        <Select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          options={[
            { value: '', label: 'Todos los Proveedores' },
            ...suppliers.map(s => ({ value: s.id, label: s.name }))
          ]}
        />
      </div>

      {/* Tabla */}
      <Table
        columns={columns}
        data={products}
        keyExtractor={(item) => item.id}
        emptyMessage="No se encontraron productos con estos filtros."
      />

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={productsData?.pages || 1}
        totalItems={productsData?.total || 0}
        onPageChange={setPage}
      />

      {/* Modal de producto - Diseño compacto y rápido */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? 'Editar Producto' : 'Nuevo Producto'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Sección 1: Identificación - 2 columnas */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 p-3 rounded-lg">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Código *
                </label>
                <input
                  ref={codeRef}
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  onKeyDown={(e) => handleEnterKey(e, supplierCodeRef)}
                  placeholder="PLO-001"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cód. Proveedor
                </label>
                <input
                  ref={supplierCodeRef}
                  type="text"
                  value={formData.supplier_code || ''}
                  onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                  onKeyDown={(e) => handleEnterKey(e, descriptionRef)}
                  placeholder="Opcional"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Stock
                </label>
                <input
                  ref={stockRef}
                  type="number"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) || 0 })}
                  onFocus={handleNumericFocus}
                  onKeyDown={(e) => handleNumericKeyDown(e, 'current_stock', submitBtnRef)}
                  placeholder="0"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descripción *
              </label>
              <input
                ref={descriptionRef}
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onKeyDown={(e) => handleEnterKey(e, listPriceRef)}
                placeholder="Nombre completo del producto"
                className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Sección 2: Precios - Layout compacto */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="text-green-600" size={16} />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Configuración de Precios
              </h3>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  P. Lista *
                </label>
                <input
                  ref={listPriceRef}
                  type="number"
                  value={formData.list_price}
                  onChange={(e) => setFormData({ ...formData, list_price: parseFloat(e.target.value) || 0 })}
                  onFocus={handleNumericFocus}
                  onKeyDown={(e) => handleNumericKeyDown(e, 'list_price', discountsRef)}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bonif. (10+5)
                </label>
                <input
                  ref={discountsRef}
                  type="text"
                  value={discountsInput}
                  onChange={(e) => handleDiscountsChange(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, extraCostRef)}
                  placeholder="10+5"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cargo Extra %
                </label>
                <input
                  ref={extraCostRef}
                  type="number"
                  value={formData.extra_cost}
                  onChange={(e) => setFormData({ ...formData, extra_cost: parseFloat(e.target.value) || 0 })}
                  onFocus={handleNumericFocus}
                  onKeyDown={(e) => handleNumericKeyDown(e, 'extra_cost', taxRef)}
                  placeholder="0"
                  step="0.1"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  IVA %
                </label>
                <input
                  ref={taxRef}
                  type="number"
                  value={formData.iva_rate}
                  onChange={(e) => setFormData({ ...formData, iva_rate: parseFloat(e.target.value) || 21 })}
                  onFocus={handleNumericFocus}
                  onKeyDown={(e) => handleNumericKeyDown(e, 'iva_rate', categoryRef)}
                  placeholder="21"
                  step="0.1"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Cálculo de precio final - Desglose completo */}
            {((formData.list_price ?? 0) > 0) && (() => {
              const listPrice = formData.list_price || 0
              const d1 = formData.discount_1 || 0
              const d2 = formData.discount_2 || 0
              const d3 = formData.discount_3 || 0
              const extra = formData.extra_cost || 0
              const iva = formData.iva_rate || 21

              // Cálculo paso a paso
              const netBase = listPrice * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
              const netWithExtra = netBase * (1 + extra / 100)
              const ivaAmount = netWithExtra * (iva / 100)
              const finalPrice = netWithExtra + ivaAmount

              return (
                <div className="mt-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 flex-1">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Desglose de Precio:</p>
                      <div className="text-xs space-y-0.5 text-gray-600 dark:text-gray-400">
                        <div className="flex justify-between">
                          <span>Precio Lista:</span>
                          <span className="font-mono">${listPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {(d1 > 0 || d2 > 0 || d3 > 0) && (
                          <div className="flex justify-between text-green-600 dark:text-green-400">
                            <span>- Bonificaciones ({[d1, d2, d3].filter(d => d > 0).join('+')  }%):</span>
                            <span className="font-mono">-${(listPrice - netBase).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {extra > 0 && (
                          <div className="flex justify-between text-orange-600 dark:text-orange-400">
                            <span>+ Cargo Extra ({extra}%):</span>
                            <span className="font-mono">+${(netWithExtra - netBase).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-gray-300 dark:border-gray-600 pt-0.5">
                          <span>Neto sin IVA:</span>
                          <span className="font-mono font-medium">${netWithExtra.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-purple-600 dark:text-purple-400">
                          <span>+ IVA ({iva}%):</span>
                          <span className="font-mono">+${ivaAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Precio Final:</p>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        ${finalPrice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Sección 3: Categorización */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/10 dark:to-pink-900/10 p-3 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Categoría
                </label>
                <select
                  ref={categoryRef}
                  value={formData.category_id || ''}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  onKeyDown={(e) => handleEnterKey(e, supplierRef)}
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Seleccionar...</option>
                  {(categories || []).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Proveedor
                </label>
                <select
                  ref={supplierRef}
                  value={formData.supplier_id || ''}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, stockRef)}
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Seleccionar...</option>
                  {(suppliers || []).map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                      {/* Mostrar descuentos si tiene */}
                      {(() => {
                        const discounts = [sup.default_discount_1, sup.default_discount_2, sup.default_discount_3].filter(d => d > 0)
                        return discounts.length > 0 ? ` (${discounts.join('+')})` : ''
                      })()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Botones con indicadores */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500">
              <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">Enter</kbd> siguiente campo
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)} type="button" size="sm">
                Cancelar
              </Button>
              <Button
                ref={submitBtnRef}
                type="submit"
                size="sm"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                ✓ {isEditing ? 'Actualizar' : 'Guardar'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal de Preview de Importación */}
      <ImportPreviewModal
        isOpen={showImportPreview}
        onClose={() => {
          setShowImportPreview(false)
          setImportPreviewData(null)
        }}
        onConfirm={handleConfirmImport}
        previewData={importPreviewData}
      />

      {/* Modal de confirmación de borrado masivo */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDeleteConfirm}
        totalProducts={productsData?.total || 0}
      />
    </div>
  )
}
