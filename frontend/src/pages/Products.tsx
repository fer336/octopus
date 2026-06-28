/**
 * Página de Productos.
 * Lista, búsqueda y gestión de productos con cálculo de precio final.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Edit, Trash2, Calculator, Upload, Download, Search, AlertTriangle, FileCode, RotateCcw, Loader2, Package, ChevronDown, QrCode, Layers } from 'lucide-react'
import { Button, Pagination, Modal, Select } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useDebounce } from '../hooks/useDebounce'
import productsService, { ProductCreate, ProductUpdate, Product, ProductImportRow, ImportPreviewResponse, SyncPriceFromLotResponse } from '../api/productsService'
import categoriesService from '../api/categoriesService'
import suppliersService from '../api/suppliersService'
import brandsService from '../api/brandsService'
import businessService from '../api/businessService'
import ImportPreviewModal from '../components/products/ImportPreviewModal'
import ColumnMapperModal from '../components/products/ColumnMapperModal'
import QrPrintPreview from '../components/products/QrPrintPreview'
import BulkDeleteModal from '../components/products/BulkDeleteModal'
import ImportProgressModal from '../components/products/ImportProgressModal'
import exchangeRateService from '../api/exchangeRateService'
import meliService from '../api/meliService'
import type { MeliListing } from '../types/meli'

type ProductFormData = Partial<Product> & {
  expiration_date?: string
}

const todayISODate = () => new Date().toISOString().slice(0, 10)

import { descriptionToGroupCode, buildGroupSuggestions } from '../utils/similarityGroup'

export default function Products() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('')
  const [showLowStock, setShowLowStock] = useState(() => searchParams.get('low_stock') === 'true')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<ImportPreviewResponse | null>(null)
  const [showColumnMapper, setShowColumnMapper] = useState(false)
  const [columnMapperData, setColumnMapperData] = useState<{
    file: File
    columns: string[]
    sampleRows: (string | null)[][]
  } | null>(null)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [showImportProgress, setShowImportProgress] = useState(false)
  const [selectedForQr, setSelectedForQr] = useState<Set<string>>(new Set())
  const [showQrPreview, setShowQrPreview] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStatus, setImportStatus] = useState<'importing' | 'success' | 'error'>('importing')
  const [importTotal, setImportTotal] = useState(0)
  const [importMessage, setImportMessage] = useState('')
  const [isSqlImporting, setIsSqlImporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportCategoryId, setExportCategoryId] = useState('')
  const [exportSupplierId, setExportSupplierId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lotQuantityRef = useRef<HTMLInputElement>(null)
  const lotCodeRef = useRef<HTMLInputElement>(null)
  const lotCostRef = useRef<HTMLInputElement>(null)
  const lotReceivedDateRef = useRef<HTMLInputElement>(null)
  const lotExpirationDateRef = useRef<HTMLInputElement>(null)
  const lotSubmitRef = useRef<HTMLButtonElement>(null)
  const [rateType, setRateType] = useState<'blue' | 'oficial'>('blue')

  // Preview del grupo de similitud en el formulario
  const [similarGroupPreview, setSimilarGroupPreview] = useState<Product[]>([])
  const [similarGroupLoading, setSimilarGroupLoading] = useState(false)
  const similarGroupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSimilarityGroupChange = (code: string) => {
    setFormData(prev => ({ ...prev, similarity_group_code: code }))
    if (similarGroupDebounceRef.current) clearTimeout(similarGroupDebounceRef.current)
    if (!code.trim()) { setSimilarGroupPreview([]); return }
    similarGroupDebounceRef.current = setTimeout(async () => {
      setSimilarGroupLoading(true)
      try {
        const result = await productsService.getAll({
          similarity_group_code: code.trim(),
          per_page: 5,
          is_active: undefined,
        })
        setSimilarGroupPreview(result.items.filter(p => p.id !== editingId))
      } catch {
        setSimilarGroupPreview([])
      } finally {
        setSimilarGroupLoading(false)
      }
    }, 400)
  }

  // Estado de alternativas por similitud
  const [alternativesProductId, setAlternativesProductId] = useState<string | null>(null)
  const [alternativesData, setAlternativesData] = useState<Product[]>([])
  const [alternativesLoading, setAlternativesLoading] = useState(false)

  const [originalSimilarityGroupCode, setOriginalSimilarityGroupCode] = useState<string | null>(null)
  const [originalGroupMembers, setOriginalGroupMembers] = useState<Product[]>([])
  const [showGroupChangeDialog, setShowGroupChangeDialog] = useState(false)
  const [pendingSubmitData, setPendingSubmitData] = useState<ProductUpdate | null>(null)

  const [descSuggestions, setDescSuggestions] = useState<string[]>([])
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleViewAlternatives = async (productId: string) => {
    if (alternativesProductId === productId) {
      setAlternativesProductId(null)
      return
    }
    setAlternativesProductId(productId)
    setAlternativesLoading(true)
    try {
      const data = await productsService.getAlternatives(productId)
      setAlternativesData(data)
    } catch {
      setAlternativesData([])
    } finally {
      setAlternativesLoading(false)
    }
  }

  const handleViewEquivalencias = async (productId: string, groupCode: string) => {
    if (alternativesProductId === productId) {
      setAlternativesProductId(null)
      return
    }
    setAlternativesProductId(productId)
    setAlternativesLoading(true)
    try {
      const result = await productsService.getAll({ similarity_group_code: groupCode, is_active: undefined, per_page: 10 })
      setAlternativesData(result.items.filter(p => p.id !== productId))
    } catch {
      setAlternativesData([])
    } finally {
      setAlternativesLoading(false)
    }
  }

  const handleConfirmGroupChange = async (scope: 'single' | 'all') => {
    setShowGroupChangeDialog(false)
    if (!pendingSubmitData || !editingId) return

    updateMutation.mutate({ id: editingId, data: pendingSubmitData })

    if (scope === 'all' && originalGroupMembers.length > 0) {
      try {
        await productsService.bulkUpdate(
          originalGroupMembers.map(p => ({
            id: p.id,
            similarity_group_code: formData.similarity_group_code?.trim() || null,
          }))
        )
        queryClient.invalidateQueries({ queryKey: ['products'] })
      } catch {
        toast.error('Error al actualizar los productos del grupo')
      }
    }

    setPendingSubmitData(null)
  }

  // Estado del modal de lotes
  const [showLotModal, setShowLotModal] = useState(false)
  const [lotModalProduct, setLotModalProduct] = useState<Product | null>(null)
  const [lots, setLots] = useState<any[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)
  const [showNewLotForm, setShowNewLotForm] = useState(false)
  const [lotFormData, setLotFormData] = useState({
    quantity: 0,
    expiration_date: '',
    cost_price: '',
    code: '',
    has_expiration: true,
    received_date: todayISODate(),
  })

  // Estado de sincronización de precio desde lote
  const [syncPricePreview, setSyncPricePreview] = useState<SyncPriceFromLotResponse | null>(null)
  const [syncingLotId, setSyncingLotId] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)

  // React Query para productos con filtros
  const { data: productsData, isLoading, isFetching, error } = useQuery({
    queryKey: ['products', page, debouncedSearch, selectedCategory, selectedSupplier, selectedBrand, showLowStock],
    queryFn: () => productsService.getAll({
      page,
      per_page: 20,
      search: debouncedSearch,
      category_id: selectedCategory || undefined,
      supplier_id: selectedSupplier || undefined,
      brand_id: selectedBrand || undefined,
      low_stock: showLowStock || undefined,
    }),
    placeholderData: keepPreviousData,
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

  const { data: brandsData } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsService.getAll({ per_page: 100 }),
    retry: false,
    enabled: !!productsData || !error,
  })

  const { data: business } = useQuery({
    queryKey: ['business-me-products'],
    queryFn: () => businessService.getMyBusiness(),
    staleTime: 60_000,
  })
  const sqlBackupEnabled = business?.sql_backup_enabled ?? false
  const qrScannerEnabled = business?.qr_scanner_enabled ?? true

  const { data: exchangeRates } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => exchangeRateService.getRates(),
    staleTime: 10 * 60 * 1000,
  })
  const blueRate = exchangeRates?.blue.promedio ?? 0
  const activeRate = rateType === 'blue' ? blueRate : (exchangeRates?.oficial.promedio ?? 0)

  // Query para estado de publicaciones ML (falla silenciosamente si ML no está configurado)
  const { data: meliListingsData } = useQuery({
    queryKey: ['meli-listings-index'],
    queryFn: () => meliService.getListings({ limit: 200 }),
    staleTime: 30_000,
    gcTime: 60_000,
    retry: 0,
  })

  const meliListingsMap = useMemo(() => {
    const map = new Map<string, MeliListing>()
    for (const listing of meliListingsData?.items ?? []) {
      // Primer listing gana (resultados ordenados por created_at desc → más reciente primero)
      if (!map.has(listing.product_id)) {
        map.set(listing.product_id, listing)
      }
    }
    return map
  }, [meliListingsData])

  const getMeliBadgeProps = (listing: MeliListing | undefined) => {
    if (!listing) return null
    if (listing.status === 'active') {
      return { cls: 'bg-[#fff159] text-[#2d3277]', title: 'Publicado en ML (activo)' }
    }
    if (listing.status === 'paused') {
      return { cls: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400', title: 'Publicado en ML (pausado)' }
    }
    return { cls: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400', title: `ML: ${listing.status}` }
  }

  // Valores seguros con fallback a array vacío
  const categories = Array.isArray(categoriesData) ? categoriesData : []
  const suppliers = Array.isArray(suppliersData?.items) ? suppliersData.items : []
  const brands = Array.isArray(brandsData?.items) ? brandsData.items : []

  // Mutation para crear producto
  const createMutation = useMutation({
    mutationFn: (data: ProductCreate) => productsService.create(data),
    onSuccess: async (newProduct) => {
      if (selectedPhotoFile) {
        try {
          await productsService.uploadPhoto(newProduct.id, selectedPhotoFile)
        } catch {
          toast.error('Producto creado, pero no se pudo subir la foto.')
        }
      }
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Producto creado correctamente', {
        duration: 3000,
        icon: '✅',
      })
      setSelectedPhotoFile(null)
      setPhotoPreview(null)
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
    onSuccess: async (updatedProduct) => {
      if (selectedPhotoFile) {
        try {
          await productsService.uploadPhoto(updatedProduct.id, selectedPhotoFile)
        } catch {
          toast.error('Producto actualizado, pero no se pudo subir la foto.')
        }
      }
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Producto actualizado correctamente', {
        duration: 3000,
        icon: '✅',
      })
      setSelectedPhotoFile(null)
      setPhotoPreview(null)
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Manejo de importación Excel - Detecta columnas y abre el mapper
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]

      setIsImporting(true)

      try {
        const detected = await productsService.detectColumns(file)
        setColumnMapperData({
          file,
          columns: detected.columns,
          sampleRows: detected.sample_rows,
        })
        setShowColumnMapper(true)
      } catch (error: any) {
        toast.error('Error al leer archivo: ' + (error.response?.data?.detail || error.message))
      } finally {
        setIsImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
  }

  // Usuario confirmó el mapping → llama preview con el mapping
  const handleColumnMapperConfirm = async (columnMapping: Record<string, string>) => {
    if (!columnMapperData) return

    setShowColumnMapper(false)

    // Mostrar modal de loading mientras se parsea
    setShowImportProgress(true)
    setImportProgress(0)
    setImportStatus('importing')
    setImportMessage('Leyendo archivo Excel...')

    // Simular progreso de lectura
    const readInterval = setInterval(() => {
      setImportProgress((prev) => {
        if (prev >= 80) return prev
        return prev + 20
      })
    }, 200)

    try {
      const preview = await productsService.previewImport(columnMapperData.file, columnMapping)

      clearInterval(readInterval)
      setImportProgress(100)
      setImportMessage('Archivo procesado correctamente')

      setTimeout(() => {
        setShowImportProgress(false)
        setImportPreviewData(preview)
        setShowImportPreview(true)
        toast.success(`${preview.total_rows} productos encontrados`, { icon: '📄' })
      }, 500)
    } catch (error: any) {
      clearInterval(readInterval)
      setImportStatus('error')
      setImportMessage('Error al leer archivo')
      toast.error('Error al leer archivo: ' + (error.response?.data?.detail || error.message))
      setTimeout(() => {
        setShowImportProgress(false)
      }, 2000)
    }
  }

  // Confirmar importación después del preview - CON PROGRESO REAL
  const handleConfirmImport = async (rows: ProductImportRow[]) => {
    // Mostrar modal de progreso
    setShowImportProgress(true)
    setImportProgress(0)
    setImportStatus('importing')
    setImportTotal(rows.length)
    setImportMessage('Preparando importación...')
    setShowImportPreview(false) // Cerrar el preview

    try {
      // Dividir en lotes de 50 productos
      const BATCH_SIZE = 50
      const batches = []
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        batches.push(rows.slice(i, i + BATCH_SIZE))
      }
      
      let totalProcessed = 0
      let totalCreated = 0
      let totalUpdated = 0
      const allErrors: string[] = []
      
      // Procesar cada lote
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        setImportMessage(`Importando lote ${i + 1} de ${batches.length}...`)
        
        const result = await productsService.confirmImport({ rows: batch })
        
        totalCreated += result.created
        totalUpdated += result.updated
        totalProcessed += batch.length
        
        if (result.errors) {
          allErrors.push(...result.errors)
        }
        
        // Actualizar progreso real
        const progress = Math.round((totalProcessed / rows.length) * 100)
        setImportProgress(progress)
      }
      
      setImportProgress(100)
      setImportStatus('success')
      setImportMessage(`${totalCreated} creados, ${totalUpdated} actualizados`)
      
      toast.success(`Importación completada: ${totalCreated} creados, ${totalUpdated} actualizados.`, {
        duration: 5000,
        icon: '✅'
      })
      
      if (allErrors.length > 0) {
        toast.error(`Hubo ${allErrors.length} errores. Revisa la consola.`)
        console.error("Errores de importación:", allErrors)
      }
      
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      setImportPreviewData(null)
      
      // Cerrar modal de progreso después de 2 segundos
      setTimeout(() => {
        setShowImportProgress(false)
        setImportProgress(0)
      }, 2000)
      
    } catch (error: any) {
      setImportStatus('error')
      setImportMessage('Error al importar')
      toast.error('Error al confirmar importación: ' + (error.response?.data?.detail || error.message))
      
      // Cerrar modal de progreso después de 3 segundos
      setTimeout(() => {
        setShowImportProgress(false)
        setImportProgress(0)
        setShowImportPreview(true) // Re-abrir el preview para que puedan corregir
      }, 3000)
      
      throw error
    }
  }

  // Manejo de exportación Excel
  const handleExport = async () => {
    try {
      const params: { category_id?: string; supplier_id?: string } = {}
      if (exportCategoryId) params.category_id = exportCategoryId
      if (exportSupplierId) params.supplier_id = exportSupplierId

      const blob = await productsService.exportExcel(params)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      const categoryLabel = exportCategoryId
        ? categories.find(c => c.id === exportCategoryId)?.name ?? ''
        : ''
      const supplierLabel = exportSupplierId
        ? suppliers.find(s => s.id === exportSupplierId)?.name ?? ''
        : ''
      const suffix = [categoryLabel, supplierLabel].filter(Boolean).join('-')
      const date = new Date().toISOString().split('T')[0]
      a.download = suffix ? `productos-${suffix}-${date}.xlsx` : `productos-${date}.xlsx`

      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setShowExportModal(false)
      setExportCategoryId('')
      setExportSupplierId('')
      toast.success('Exportación exitosa')
    } catch (error) {
      toast.error('Error al exportar productos')
    }
  }

  // Manejo de export SQL
  const handleExportSQL = async () => {
    try {
      toast.loading('Generando backup SQL...', { id: 'sql-backup' })
      const blob = await productsService.exportSQL()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-sql-${new Date().toISOString().split('T')[0]}.sql`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Backup SQL descargado', { id: 'sql-backup' })
    } catch (error) {
      toast.error('Error al generar backup SQL', { id: 'sql-backup' })
    }
  }

  // Manejo de import SQL
  const handleImportSQL = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.sql'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      
      let progressInterval: ReturnType<typeof setInterval> | null = null

      try {
        setIsSqlImporting(true)
        setShowImportProgress(true)
        setImportStatus('importing')
        setImportTotal(100)
        setImportProgress(10)
        setImportMessage('Cargando archivo SQL...')
        toast.loading('Importando SQL...', { id: 'sql-import' })

        const text = await file.text()
        setImportProgress(25)
        setImportMessage('Validando estructura del backup...')

        progressInterval = setInterval(() => {
          setImportProgress((prev) => (prev < 90 ? prev + 5 : prev))
        }, 250)

        setImportMessage('Importando productos, categorías y proveedores...')
        const result = await productsService.importSQL(text)

        if (progressInterval) clearInterval(progressInterval)
        setImportProgress(100)
        
        // Mostrar resultado detallado
        const details = [
          `${result.imported} productos`,
          `${result.imported_categories || 0} categorías`,
          `${result.imported_suppliers || 0} proveedores`
        ].join(', ')
        
        if (result.errors && result.errors.length > 0) {
          setImportStatus('error')
          setImportMessage(`Finalizado con errores (${result.total_errors || result.errors.length})`)
          // Mostrar los primeros errores
          const errorMsg = result.errors.slice(0, 3).join('\n')
          const totalErrors = result.total_errors || result.errors.length
          toast.error(`${details}\nErrores (${totalErrors}):\n${errorMsg}`, { id: 'sql-import', duration: 8000 })
          setTimeout(() => setShowImportProgress(false), 2600)
        } else {
          setImportStatus('success')
          setImportMessage(`Importación completada: ${details}`)
          toast.success(`Importación SQL completada: ${details}`, { id: 'sql-import' })
          setTimeout(() => setShowImportProgress(false), 1200)
        }

        queryClient.invalidateQueries({ queryKey: ['products'] })
      } catch (error: any) {
        if (progressInterval) clearInterval(progressInterval)
        setImportStatus('error')
        setImportProgress(100)
        setImportMessage('Error durante la importación SQL')
        console.error('SQL Import error:', error)
        const errorMsg = error.response?.data?.detail || error.message || JSON.stringify(error)
        toast.error('Error al importar SQL: ' + errorMsg, { id: 'sql-import', duration: 8000 })
        setTimeout(() => setShowImportProgress(false), 2600)
      } finally {
        setIsSqlImporting(false)
      }
    }
    input.click()
  }

  // ── Lotes ─────────────────────────────────────────────────────

  const handleOpenLotModal = async (product: Product) => {
    setLotModalProduct(product)
    setShowLotModal(true)
    setShowNewLotForm(false)
    setLotFormData({ quantity: 0, expiration_date: '', cost_price: '', code: '', has_expiration: true, received_date: todayISODate() })
    setSyncPricePreview(null)
    setSyncingLotId(null)
    setLotsLoading(true)
    try {
      const lotList = await productsService.getLots(product.id)
      setLots(lotList)
    } catch (error: any) {
      toast.error('Error al cargar lotes: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLotsLoading(false)
    }
  }

  const handleCloseLotModal = () => {
    setShowLotModal(false)
    setLotModalProduct(null)
    setLots([])
    setShowNewLotForm(false)
    setSyncPricePreview(null)
    setSyncingLotId(null)
  }

  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lotModalProduct) return
    if (lotFormData.quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    try {
      const newLot = await productsService.createLot(lotModalProduct.id, {
        quantity: lotFormData.quantity,
        expiration_date: lotFormData.has_expiration ? (lotFormData.expiration_date || null) : null,
        cost_price: lotFormData.cost_price ? parseFloat(lotFormData.cost_price) : null,
        code: lotFormData.code || null,
        received_date: lotFormData.received_date || null,
      })
      toast.success('Stock ingresado correctamente', { icon: '✅' })

      // Refetch lotes y producto
      const lotList = await productsService.getLots(lotModalProduct.id)
      setLots(lotList)
      queryClient.invalidateQueries({ queryKey: ['products'] })

      setShowNewLotForm(false)
      setLotFormData({ quantity: 0, expiration_date: '', cost_price: '', code: '', has_expiration: true, received_date: todayISODate() })

      // Si el lote tiene cost_price, ofrecer sincronizar precio
      if (newLot.cost_price && newLot.cost_price > 0) {
        setSyncingLotId(newLot.id)
        // Mostrar preview de sincronización
        try {
          setSyncLoading(true)
          const preview = await productsService.syncPriceFromLot(lotModalProduct.id, {
            lot_id: newLot.id,
            confirm: false,
          })
          setSyncPricePreview(preview)
        } catch {
          // Si falla el preview, no mostrar error — el lote ya se creó OK
          setSyncPricePreview(null)
        } finally {
          setSyncLoading(false)
        }
      }
    } catch (error: any) {
      toast.error(formatErrorMessage(error))
    }
  }

  const handleConfirmSyncPrice = async () => {
    if (!lotModalProduct || !syncingLotId) return
    try {
      setSyncLoading(true)
      const result = await productsService.syncPriceFromLot(lotModalProduct.id, {
        lot_id: syncingLotId,
        confirm: true,
      })
      toast.success('Precio sincronizado desde lote', { icon: '✅' })
      setSyncPricePreview(result)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (error: any) {
      toast.error(formatErrorMessage(error))
    } finally {
      setSyncLoading(false)
    }
  }

  const handlePreviewSyncPriceFromLot = async (lot: any) => {
    if (!lotModalProduct) return

    if (lot.cost_price == null || Number(lot.cost_price) <= 0) {
      toast.error('Este lote no tiene costo unitario para usar como precio de lista')
      return
    }

    try {
      setSyncLoading(true)
      setSyncingLotId(lot.id)
      const preview = await productsService.syncPriceFromLot(lotModalProduct.id, {
        lot_id: lot.id,
        confirm: false,
      })
      setSyncPricePreview(preview)
    } catch (error: any) {
      toast.error(formatErrorMessage(error))
      setSyncPricePreview(null)
      setSyncingLotId(null)
    } finally {
      setSyncLoading(false)
    }
  }

  // ── Fin Lotes ──────────────────────────────────────────────
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
  const [formData, setFormData] = useState<ProductFormData>({
    code: '',
    description: '',
    customer_terms: '',
    supplier_code: '',
    meli_sku: '',
    similarity_group_code: '',
    category_id: '',
    supplier_id: '',
    brand_id: '',
    brand: '',
    list_price: 0,
    discount_1: 0,
    discount_2: 0,
    discount_3: 0,
    extra_cost: 0,
    profit_margin: 0,
    iva_rate: 21,
    current_stock: 0,
    expiration_date: '',
    minimum_stock: 0,
    unit: 'unidad',
    units_per_pack: null as number | null,
    quantity_per_package: null as number | null,
    sell_per_unit: true as boolean,
    is_active: true,
  })

  const [discountsInput, setDiscountsInput] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<'ARS' | 'USD'>('ARS')
  const [listPriceUsd, setListPriceUsd] = useState<string>('')
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Refs para navegación con Enter
  const codeRef = useRef<HTMLInputElement>(null)
  const supplierCodeRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const listPriceRef = useRef<HTMLInputElement>(null)
  const discountsRef = useRef<HTMLInputElement>(null)
  const extraCostRef = useRef<HTMLInputElement>(null)
  const profitRef = useRef<HTMLInputElement>(null)
  const taxRef = useRef<HTMLInputElement>(null)
  const brandRef = useRef<HTMLSelectElement>(null)
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
      customer_terms: '',
      supplier_code: '',
      meli_sku: '',
      similarity_group_code: '',
      category_id: '',
      supplier_id: '',
      brand_id: '',
      brand: '',
      list_price: 0,
      discount_1: 0,
      discount_2: 0,
      discount_3: 0,
      extra_cost: 0,
      profit_margin: 0,
      iva_rate: 21,
      current_stock: 0,
      expiration_date: '',
      minimum_stock: 0,
      unit: 'unidad',
      units_per_pack: null as number | null,
      quantity_per_package: null as number | null,
      sell_per_unit: true as boolean,
      is_active: true,
    })
    setDiscountsInput('')
    setPriceCurrency('ARS')
    setRateType('blue')
    setListPriceUsd('')
    setSelectedPhotoFile(null)
    setPhotoPreview(null)
    setOriginalSimilarityGroupCode(null)
    setOriginalGroupMembers([])
    setShowGroupChangeDialog(false)
    setPendingSubmitData(null)
    setDescSuggestions([])
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
  }

  // Focus en el primer campo al abrir el modal
  useEffect(() => {
    if (showModal && codeRef.current) {
      setTimeout(() => codeRef.current?.focus(), 100)
    }
  }, [showModal])

  useEffect(() => {
    if (showNewLotForm && lotQuantityRef.current) {
      setTimeout(() => lotQuantityRef.current?.focus(), 80)
    }
  }, [showNewLotForm])

  useEffect(() => {
    if (descDebounceRef.current) clearTimeout(descDebounceRef.current)
    const desc = formData.description?.trim() ?? ''

    if (formData.similarity_group_code?.trim() || desc.length < 4) {
      setDescSuggestions([])
      return
    }

    descDebounceRef.current = setTimeout(async () => {
      const generated = descriptionToGroupCode(desc)
      try {
        const result = await productsService.getAll({ search: desc, per_page: 8, is_active: undefined })
        setDescSuggestions(buildGroupSuggestions(result.items, editingId, generated))
      } catch {
        setDescSuggestions(generated ? [generated] : [])
      }
    }, 400)

    return () => { if (descDebounceRef.current) clearTimeout(descDebounceRef.current) }
  }, [formData.description, formData.similarity_group_code, editingId])

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

  const handleLotNumericKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    nextRef?: React.RefObject<any>,
  ) => {
    const input = e.currentTarget
    const currentValue = input.value

    if (e.key === 'Enter' && nextRef) {
      e.preventDefault()
      nextRef.current?.focus()
      return
    }

    if (currentValue === '0') {
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        input.value = e.key
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
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
      setPriceCurrency(product.price_currency ?? 'ARS')
      setRateType('blue')
      setListPriceUsd(product.list_price_usd?.toString() ?? '')
      setSelectedPhotoFile(null)
      setPhotoPreview(null)
      setOriginalSimilarityGroupCode(product.similarity_group_code ?? null)
      if (product.similarity_group_code) {
        productsService.getAll({
          similarity_group_code: product.similarity_group_code,
          is_active: undefined,
          per_page: 20,
        }).then(r => setOriginalGroupMembers(r.items.filter(p => p.id !== product.id)))
          .catch(() => setOriginalGroupMembers([]))
      } else {
        setOriginalGroupMembers([])
      }
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

    const resolvedListPrice = priceCurrency === 'USD' && activeRate > 0
      ? Math.round(Number(listPriceUsd) * activeRate * 100) / 100
      : (formData.list_price ?? 0)

    if (priceCurrency === 'USD' && Number(listPriceUsd) <= 0) {
      toast.error('El precio en USD debe ser mayor a 0')
      listPriceRef.current?.focus()
      return
    }

    if (priceCurrency === 'ARS' && resolvedListPrice <= 0) {
      toast.error('El precio de lista debe ser mayor a 0')
      listPriceRef.current?.focus()
      return
    }

    // Preparar datos para enviar al backend
    if (isEditing && editingId) {
      // En edición NO se envía current_stock (se gestiona por lotes)
      const dataToSend: ProductUpdate = {
        code: formData.code!.trim(),
        supplier_code: formData.supplier_code?.trim() || undefined,
        meli_sku: formData.meli_sku?.trim() || null,
        similarity_group_code: formData.similarity_group_code?.trim() || null,
        description: formData.description!.trim(),
        customer_terms: formData.customer_terms?.trim() || undefined,
        category_id: formData.category_id || undefined,
        supplier_id: formData.supplier_id || undefined,
        brand_id: formData.brand_id || undefined,
        brand: formData.brand?.trim() || undefined,
        list_price: resolvedListPrice,
        price_currency: priceCurrency,
        list_price_usd: priceCurrency === 'USD' ? Number(listPriceUsd) : null,
        discount_1: formData.discount_1 || 0,
        discount_2: formData.discount_2 || 0,
        discount_3: formData.discount_3 || 0,
        extra_cost: formData.extra_cost || 0,
        profit_margin: formData.profit_margin || 0,
        iva_rate: formData.iva_rate || 21,
        minimum_stock: formData.minimum_stock || 0,
        unit: formData.unit || 'unidad',
        units_per_pack: formData.units_per_pack || null,
        quantity_per_package: formData.quantity_per_package || null,
        sell_per_unit: formData.sell_per_unit !== false,
      }
      // Interceptar si el similarity_group_code cambió y el grupo tiene otros miembros
      const similarityChanged =
        originalSimilarityGroupCode !== null &&
        (formData.similarity_group_code?.trim() || '') !== originalSimilarityGroupCode &&
        originalGroupMembers.length > 0

      if (similarityChanged) {
        setPendingSubmitData(dataToSend)
        setShowGroupChangeDialog(true)
        return
      }

      updateMutation.mutate({ id: editingId, data: dataToSend })
    } else {
      // En creación se envía current_stock para crear lote inicial
      const dataToSend: ProductCreate = {
        code: formData.code!.trim(),
        supplier_code: formData.supplier_code?.trim() || undefined,
        meli_sku: formData.meli_sku?.trim() || null,
        similarity_group_code: formData.similarity_group_code?.trim() || null,
        description: formData.description!.trim(),
        customer_terms: formData.customer_terms?.trim() || undefined,
        category_id: formData.category_id || undefined,
        supplier_id: formData.supplier_id || undefined,
        brand_id: formData.brand_id || undefined,
        brand: formData.brand?.trim() || undefined,
        list_price: resolvedListPrice,
        price_currency: priceCurrency,
        list_price_usd: priceCurrency === 'USD' ? Number(listPriceUsd) : null,
        discount_1: formData.discount_1 || 0,
        discount_2: formData.discount_2 || 0,
        discount_3: formData.discount_3 || 0,
        extra_cost: formData.extra_cost || 0,
        profit_margin: formData.profit_margin || 0,
        iva_rate: formData.iva_rate || 21,
        current_stock: formData.current_stock || 0,
        expiration_date: formData.expiration_date || null,
        minimum_stock: formData.minimum_stock || 0,
        unit: formData.unit || 'unidad',
        units_per_pack: formData.units_per_pack || null,
        quantity_per_package: formData.quantity_per_package || null,
        sell_per_unit: formData.sell_per_unit !== false,
      }
      createMutation.mutate(dataToSend)
    }
  }

  const toggleExpandedProduct = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }

  const formatUnit = (item: Product) => (
    item.unit === 'pack' && item.units_per_pack ? `Pack x${item.units_per_pack}` : item.unit
  )

  const formatMoney = (value: number | null | undefined, currency: 'ARS' | 'USD') => {
    const amount = Number(value ?? 0)
    const prefix = currency === 'USD' ? 'U$S ' : '$'

    return `${prefix}${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const isDollarPricedProduct = (item: Product) => item.price_currency === 'USD' && item.list_price_usd != null

  const renderExpirationBadge = (item: Product) => {
    if (!item.next_expiration) {
      return <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">Sin venc.</span>
    }

    const expDate = new Date(item.next_expiration)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntilExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const formattedDate = expDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })

    if (daysUntilExp < 0) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Vencido · {formattedDate}
        </span>
      )
    }

    if (daysUntilExp <= 30) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {daysUntilExp}d · {formattedDate}
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {formattedDate}
      </span>
    )
  }

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

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return null
    return categories.find((c) => c.id === categoryId)?.name || null
  }

  const getSupplierName = (supplierId?: string) => {
    if (!supplierId) return null
    return suppliers.find((s) => s.id === supplierId)?.name || null
  }

  // Indicator inline cuando se está buscando (evita full-page spinner)
  const showInlineLoader = isFetching && !isLoading

  return (
    <div className="space-y-3">
      {/* Indicador de búsqueda/carga inline */}
      {showInlineLoader && (
        <div className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 rounded-lg border border-primary-200 dark:border-primary-800 animate-pulse">
          <Loader2 size={14} className="animate-spin" />
          <span>Buscando...</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-end -mt-1">
        <div className="flex items-center gap-1.5" data-tour-products-actions>
          {/* Botones de acción — solo iconos con tooltip */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
            accept=".xlsx, .xls"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            title="Importar Excel"
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <Upload size={17} />
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            title="Exportar Excel"
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Download size={17} />
          </button>
          {sqlBackupEnabled && (
            <>
              <button
                onClick={handleImportSQL}
                disabled={isSqlImporting || isImporting}
                title="Importar SQL"
                className="p-2 rounded-lg border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors"
                data-tour-products-import-sql
              >
                <RotateCcw size={17} />
              </button>
              <button
                onClick={handleExportSQL}
                title="Exportar SQL"
                className="p-2 rounded-lg border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                <FileCode size={17} />
              </button>
            </>
          )}
          <button
            onClick={() => setShowBulkDeleteModal(true)}
            title="Borrar Productos"
            className="p-2 rounded-lg border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <AlertTriangle size={17} />
          </button>
          <Button onClick={() => handleOpenModal()} className="ml-1" data-tour-products-new>
            <Plus size={17} className="mr-1.5" />
            Nuevo
          </Button>
        </div>
      </div>

      {/* Barra de Filtros Completa */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Buscar por código o descripción..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500"
            data-tour-products-search
          />
        </div>
        
        <Select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value)
            setPage(1)
          }}
          options={[
            { value: '', label: 'Todas las Categorías' },
            ...categories.map(c => ({ value: c.id, label: c.name }))
          ]}
        />
        
        <Select
          value={selectedSupplier}
          onChange={(e) => {
            setSelectedSupplier(e.target.value)
            setPage(1)
          }}
          options={[
            { value: '', label: 'Todos los Proveedores' },
            ...suppliers.map(s => ({ value: s.id, label: s.name }))
          ]}
        />

        <Select
          value={selectedBrand}
          onChange={(e) => {
            setSelectedBrand(e.target.value)
            setPage(1)
          }}
          options={[
            { value: '', label: 'Todas las Marcas' },
            ...brands.map(brand => ({ value: brand.id, label: brand.name }))
          ]}
        />

        <button
          type="button"
          onClick={() => { setShowLowStock(v => !v); setPage(1) }}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${showLowStock ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300' : 'border-gray-200 bg-white text-gray-600 hover:border-red-200 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
        >
          <AlertTriangle size={14} />
          Stock bajo
        </button>
      </div>

      {/* Tabla desktop */}
      <div className="hidden lg:block" data-tour-products-table>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="grid min-w-[1020px] grid-cols-[32px_64px_88px_minmax(220px,1.35fr)_110px_110px_92px_82px_64px_98px] items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
            <span />
            <span>Código</span>
            <span>Cód. proveedor</span>
            <span>Descripción</span>
            <span>Categoría</span>
            <span>Proveedor</span>
            <span className="text-center">Lista</span>
            <span>Venta</span>
            <span>Stock</span>
            <span className="text-right">Acciones</span>
          </div>

          {products.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No se encontraron productos con estos filtros.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((item) => {
                const categoryName = getCategoryName(item.category_id)
                const supplierName = getSupplierName(item.supplier_id)
                const lowStock = item.current_stock <= item.minimum_stock
                const isExpanded = expandedProductIds.has(item.id)

                return (
                  <article key={item.id} className={`group bg-white transition-colors hover:bg-gray-50/80 dark:bg-gray-900 dark:hover:bg-gray-800/60 ${selectedForQr.has(item.id) ? 'ring-1 ring-inset ring-violet-400 dark:ring-violet-600' : ''}`}>
                    <div className="grid min-w-[1020px] grid-cols-[32px_64px_88px_minmax(220px,1.35fr)_110px_110px_92px_82px_64px_98px] items-center gap-2 px-4 py-3">
                      {qrScannerEnabled ? (
                        <input
                          type="checkbox"
                          checked={selectedForQr.has(item.id)}
                          onChange={() =>
                            setSelectedForQr((prev) => {
                              const next = new Set(prev)
                              next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                              return next
                            })
                          }
                          className="h-4 w-4 cursor-pointer rounded accent-violet-600"
                        />
                      ) : (
                        <span />
                      )}
                      <span className="inline-flex w-fit rounded-lg bg-gray-100 px-2 py-1 font-mono text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {item.code}
                      </span>
                      <span className="truncate font-mono text-xs text-gray-600 dark:text-gray-300" title={item.supplier_code || undefined}>
                        {item.supplier_code || '—'}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {item.description}
                          </h3>
                          {lowStock && (
                            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800">
                              Bajo
                            </span>
                          )}
                          {item.similarity_group_code && (
                            <button
                              type="button"
                              onClick={() => lowStock
                                ? handleViewAlternatives(item.id)
                                : handleViewEquivalencias(item.id, item.similarity_group_code!)
                              }
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 hover:opacity-80 transition-opacity ${
                                lowStock
                                  ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800'
                                  : 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-800'
                              }`}
                              title={lowStock ? 'Ver alternativas con stock disponible' : 'Ver productos equivalentes del mismo grupo'}
                            >
                              {alternativesProductId === item.id ? 'Ocultar' : (lowStock ? 'Alternativas' : 'Equivalencias')}
                            </button>
                          )}
                          {(() => {
                            const badge = getMeliBadgeProps(meliListingsMap.get(item.id))
                            return badge ? (
                              <span title={badge.title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black leading-none ${badge.cls}`}>
                                ML
                              </span>
                            ) : null
                          })()}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                          <span>{formatUnit(item)}</span>
                        </div>
                      </div>

                      <span className="truncate text-xs text-gray-600 dark:text-gray-300" title={categoryName || undefined}>
                        {categoryName || 'Sin categoría'}
                      </span>
                      <span className="truncate text-xs text-gray-600 dark:text-gray-300" title={supplierName || undefined}>
                        {supplierName || 'Sin proveedor'}
                      </span>

                      <span className="flex flex-col items-center gap-0.5 font-mono text-xs text-gray-700 dark:text-gray-300">
                        <span className="flex items-center gap-1">
                          {isDollarPricedProduct(item)
                            ? formatMoney(item.list_price_usd, 'USD')
                            : formatMoney(item.list_price, 'ARS')}
                          {isDollarPricedProduct(item) && (
                            <span className="rounded bg-blue-100 px-1 text-[9px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">USD</span>
                          )}
                        </span>
                        {isDollarPricedProduct(item) && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {formatMoney(item.list_price, 'ARS')} calc.
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-sm font-semibold text-primary-700 dark:text-primary-300">
                        ${item.sale_price.toLocaleString('es-AR')}
                      </span>
                      <span className={`inline-flex w-fit rounded-lg px-2.5 py-1 text-sm font-bold ${lowStock ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'}`}>
                        {item.current_stock}
                      </span>

                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                          onClick={() => toggleExpandedProduct(item.id)}
                          title="Ver más datos"
                        >
                          <ChevronDown size={17} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        <button
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20 dark:hover:text-amber-300"
                          title="Ver lotes"
                          onClick={() => handleOpenLotModal(item)}
                        >
                          <Package size={17} />
                        </button>
                        <button
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/20 dark:hover:text-primary-300"
                          onClick={() => handleOpenModal(item)}
                          title="Editar producto"
                        >
                          <Edit size={17} />
                        </button>
                        <button className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300" title="Eliminar producto">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-[88px_1fr] gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
                        <span />
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">Vencimiento</p>
                            <div className="mt-1">{renderExpirationBadge(item)}</div>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">Bonificación</p>
                            <p className="mt-0.5 font-semibold text-green-700 dark:text-green-300">{item.discount_display ? `${item.discount_display}%` : '—'}</p>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">Extra</p>
                            <p className="mt-0.5 font-semibold text-orange-700 dark:text-orange-300">{item.extra_cost > 0 ? `${item.extra_cost}%` : '—'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {alternativesProductId === item.id && (
                      <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-900/10">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          Alternativas disponibles — grupo "{item.similarity_group_code}"
                        </p>
                        {alternativesLoading ? (
                          <p className="text-xs text-gray-500">Cargando…</p>
                        ) : alternativesData.length === 0 ? (
                          <p className="text-xs text-gray-500">No hay alternativas con stock disponible.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {alternativesData.map((alt) => (
                              <div key={alt.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 dark:border-amber-800 dark:bg-gray-900">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{alt.description}</p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    {alt.brand_name || alt.brand || 'Sin marca'} · {alt.quality_tier || 'Sin nivel'} · Cód: {alt.code}
                                  </p>
                                </div>
                                <span className="ml-4 shrink-0 rounded-md bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700 ring-1 ring-green-200 dark:bg-green-900/20 dark:text-green-300 dark:ring-green-800">
                                  {alt.current_stock} {alt.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cards mobile */}
      <div className="lg:hidden space-y-2" data-tour-products-table data-tour-products-cards>
        {products.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            No se encontraron productos con estos filtros.
          </div>
        ) : (
          products.map((item) => {
            const categoryName = getCategoryName(item.category_id)
            const supplierName = getSupplierName(item.supplier_id)
            const lowStock = item.current_stock <= item.minimum_stock

            return (
              <article
                key={item.id}
                className={`rounded-xl border bg-white p-3 shadow-sm dark:bg-gray-800 ${selectedForQr.has(item.id) ? 'border-violet-400 dark:border-violet-600' : 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {qrScannerEnabled && (
                      <input
                        type="checkbox"
                        checked={selectedForQr.has(item.id)}
                        onChange={() =>
                          setSelectedForQr((prev) => {
                            const next = new Set(prev)
                            next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                            return next
                          })
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-violet-600"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {item.code}
                      </span>
                      {lowStock && (
                        <span className="inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          Stock bajo
                        </span>
                      )}
                      {(() => {
                        const badge = getMeliBadgeProps(meliListingsMap.get(item.id))
                        return badge ? (
                          <span title={badge.title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black leading-none ${badge.cls}`}>
                            ML
                          </span>
                        ) : null
                      })()}
                    </div>
                    <h3 className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {item.description}
                    </h3>
                  </div>
                  </div>{/* end min-w-0 flex-1 wrapper */}

                  <div className="flex items-center gap-1">
                    <button
                      className="rounded-md p-1.5 text-gray-500 hover:bg-amber-50 hover:text-amber-600 dark:text-gray-300 dark:hover:bg-amber-900/30 dark:hover:text-amber-300"
                      onClick={() => handleOpenLotModal(item)}
                      aria-label="Ver lotes"
                    >
                      <Package size={16} />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-gray-500 hover:bg-primary-50 hover:text-primary-600 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                      onClick={() => handleOpenModal(item)}
                      aria-label="Editar producto"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                      aria-label="Eliminar producto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {categoryName ? (
                    <span className="inline-flex rounded-md bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                      {categoryName}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      Sin categoría
                    </span>
                  )}

                  {supplierName ? (
                    <span className="inline-flex rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {supplierName}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      Sin proveedor
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Lista {isDollarPricedProduct(item) && <span className="text-blue-600 dark:text-blue-400">(USD)</span>}
                    </p>
                    <p className="font-medium text-gray-800 dark:text-gray-200">
                      {isDollarPricedProduct(item)
                        ? formatMoney(item.list_price_usd, 'USD')
                        : formatMoney(item.list_price, 'ARS')}
                    </p>
                    {isDollarPricedProduct(item) && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {formatMoney(item.list_price, 'ARS')} calc.
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-primary-200 bg-primary-50 px-2 py-1.5 dark:border-primary-800 dark:bg-primary-900/20">
                    <p className="text-[10px] text-primary-700 dark:text-primary-300">Venta</p>
                    <p className="font-semibold text-primary-800 dark:text-primary-200">${item.sale_price.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Bonif</p>
                    <p className="font-medium text-green-700 dark:text-green-300">{item.discount_display ? `${item.discount_display}%` : '-'}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Extra</p>
                    <p className="font-medium text-orange-700 dark:text-orange-300">{item.extra_cost > 0 ? `${item.extra_cost}%` : '-'}</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Stock</span>
                  <span className={`text-sm font-semibold ${lowStock ? 'text-red-600 dark:text-red-300' : 'text-gray-800 dark:text-gray-200'}`}>
                    {item.current_stock}
                  </span>
                </div>
              </article>
            )
          })
        )}
      </div>

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
        size="full"
        containerClassName="max-w-[1180px] w-[96vw]"
        headerClassName="px-4 py-3"
        contentClassName="px-4 py-3"
      >
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1.5fr]">
          {/* Descripción — full width, campo hero */}
          <div className="lg:col-span-2">
            <label htmlFor="prod-desc" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              id="prod-desc"
              ref={descriptionRef}
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              onKeyDown={(e) => handleEnterKey(e, listPriceRef)}
              placeholder="Nombre completo del producto"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
              required
            />
          </div>

          <div className="space-y-3">
          {/* Sección 1: Identificación */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2">
              <Package size={13} className="text-primary-500 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Identificación</span>
            </div>
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prod-code" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Código interno <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="prod-code"
                    ref={codeRef}
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    onKeyDown={(e) => handleEnterKey(e, supplierCodeRef)}
                    placeholder="PLO-001"
                    className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="prod-supplier-code" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Cód. Proveedor
                  </label>
                  <input
                    id="prod-supplier-code"
                    ref={supplierCodeRef}
                    type="text"
                    value={formData.supplier_code || ''}
                    onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                    onKeyDown={(e) => handleEnterKey(e, descriptionRef)}
                    placeholder="Opcional"
                    className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  />
                </div>
              </div>

              {/* SKU MercadoLibre */}
              <div>
                <label htmlFor="prod-meli-sku" className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1 rounded bg-[#FFE600] px-1 py-0.5 text-[10px] font-black text-[#1A1A1A] leading-none">ML</span>
                  SKU MercadoLibre
                </label>
                <input
                  id="prod-meli-sku"
                  type="text"
                  value={formData.meli_sku || ''}
                  onChange={(e) => setFormData({ ...formData, meli_sku: e.target.value })}
                  placeholder="MLB123456789"
                  className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                />
              </div>

              {/* Familia / Equivalencias con preview */}
              <div>
                <label htmlFor="prod-sim-group" className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  <Layers size={11} className="text-primary-500 shrink-0" />
                  Familia / Equivalencias
                  <span className="ml-auto text-[10px] font-normal text-gray-400">Mismo artículo en otra marca o calidad</span>
                </label>
                <input
                  id="prod-sim-group"
                  type="text"
                  value={formData.similarity_group_code || ''}
                  onChange={(e) => handleSimilarityGroupChange(e.target.value)}
                  placeholder="Ej: CANILLA-3/4"
                  className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                />
                {/* Sugerencias basadas en la descripción */}
                {!formData.similarity_group_code?.trim() && descSuggestions.length > 0 && (
                  <div className="mt-2 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 mb-1.5">
                      Sugerencias para este producto
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {descSuggestions.map(code => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => handleSimilarityGroupChange(code)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono font-medium rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                          title="Click para usar este código de familia"
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview del grupo */}
                {formData.similarity_group_code?.trim() && (
                  <div className="mt-2 rounded-lg border border-primary-100 dark:border-primary-900/40 bg-primary-50/50 dark:bg-primary-900/10 px-3 py-2">
                    {similarGroupLoading ? (
                      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" />
                        Buscando equivalencias…
                      </p>
                    ) : similarGroupPreview.length === 0 ? (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">Código libre.</span>
                        {' '}Asignalo a otros productos equivalentes para agruparlos.
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400 mb-1.5">
                          Equivalencias en este grupo ({similarGroupPreview.length}):
                        </p>
                        <div className="flex flex-col gap-1">
                          {similarGroupPreview.map(p => (
                            <div key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-mono text-gray-500 dark:text-gray-400 shrink-0">{p.code}</span>
                              <span className="truncate text-gray-700 dark:text-gray-300 font-medium">{p.description}</span>
                              <span className="shrink-0 font-medium text-primary-600 dark:text-primary-400">{p.brand_name || p.brand || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Sección 3: Marca, Categorización */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2">
              <Search size={13} className="text-primary-500 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Categorización</span>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label htmlFor="prod-brand" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Marca
                </label>
                <select
                  id="prod-brand"
                  ref={brandRef}
                  value={formData.brand_id || ''}
                  onChange={(e) => {
                    const selected = brands.find(brand => brand.id === e.target.value)
                    setFormData({
                      ...formData,
                      brand_id: e.target.value,
                      brand: selected?.name || '',
                    })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); categoryRef.current?.focus() }
                  }}
                  className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow cursor-pointer"
                >
                  <option value="">Nueva o sin marca...</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
                {!formData.brand_id && (
                  <input
                    type="text"
                    value={formData.brand || ''}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Escribir nueva marca: FV, Ferrum, Andina"
                    className="mt-2 w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prod-category" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Categoría
                  </label>
                  <select
                    id="prod-category"
                    ref={categoryRef}
                    value={formData.category_id || ''}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); supplierRef.current?.focus() }
                    }}
                    className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow cursor-pointer"
                  >
                    <option value="">Seleccionar...</option>
                    {(categories || []).map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="prod-supplier" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Proveedor
                  </label>
                  <select
                    id="prod-supplier"
                    ref={supplierRef}
                    value={formData.supplier_id || ''}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); submitBtnRef.current?.focus() }
                    }}
                    className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow cursor-pointer"
                  >
                    <option value="">Seleccionar...</option>
                    {(suppliers || []).map((sup) => (
                      <option key={sup.id} value={sup.id}>{sup.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

          <div className="space-y-2">
          {/* Sección 2: Precios */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2">
              <Calculator size={13} className="text-primary-500 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Precios</span>
            </div>

            <div className="p-3">
            {/* Moneda selector */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">Moneda:</span>
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setPriceCurrency('ARS')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    priceCurrency === 'ARS'
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  $ Pesos ARS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPriceCurrency('USD')
                    if (!listPriceUsd && activeRate > 0 && (formData.list_price ?? 0) > 0) {
                      setListPriceUsd(String(Math.round(((formData.list_price ?? 0) / activeRate) * 100) / 100))
                    }
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    priceCurrency === 'USD'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  U$ Dólares USD
                </button>
              </div>
            </div>

            {/* Cotización selector — solo cuando USD */}
            {priceCurrency === 'USD' && (
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">Cotización:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRateType('blue')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      rateType === 'blue'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${rateType === 'blue' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    Blue
                    {exchangeRates && (
                      <span className="font-mono">${exchangeRates.blue.promedio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRateType('oficial')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      rateType === 'oficial'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-500'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${rateType === 'oficial' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    Oficial
                    {exchangeRates && (
                      <span className="font-mono">${exchangeRates.oficial.promedio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Inputs de precios */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {priceCurrency === 'USD' ? 'Precio USD *' : 'P. Lista *'}
                </label>
                {priceCurrency === 'ARS' ? (
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
                ) : (
                  <input
                    ref={listPriceRef}
                    type="number"
                    value={listPriceUsd}
                    onChange={(e) => setListPriceUsd(e.target.value)}
                    onFocus={handleNumericFocus}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); discountsRef.current?.focus() } }}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full px-2 py-1.5 text-sm border border-blue-300 dark:border-blue-600 rounded-lg dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              <div>
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
                  onKeyDown={(e) => handleNumericKeyDown(e, 'extra_cost', profitRef)}
                  placeholder="0"
                  step="0.1"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ganancia %
                </label>
                <input
                  ref={profitRef}
                  type="number"
                  value={formData.profit_margin}
                  onChange={(e) => setFormData({ ...formData, profit_margin: parseFloat(e.target.value) || 0 })}
                  onFocus={handleNumericFocus}
                  onKeyDown={(e) => handleNumericKeyDown(e, 'profit_margin', taxRef)}
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
                  onKeyDown={(e) => handleNumericKeyDown(e, 'iva_rate', brandRef)}
                  placeholder="21"
                  step="0.1"
                  className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Banner de conversión USD → ARS */}
            {priceCurrency === 'USD' && activeRate > 0 && Number(listPriceUsd) > 0 && (
              <div className="mt-2.5 flex items-center gap-2.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <span className="text-base">💱</span>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-mono font-semibold">U$S {Number(listPriceUsd).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  <span className="mx-1.5 opacity-60">×</span>
                  <span className="font-mono">${activeRate.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  <span className="mx-1 opacity-60">({rateType})</span>
                  <span className="mx-1.5 opacity-60">=</span>
                  <span className="font-mono font-bold text-blue-800 dark:text-blue-100">
                    ${(Math.round(Number(listPriceUsd) * activeRate * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                  </span>
                </p>
              </div>
            )}

            {/* Cálculo de precio final - Desglose completo */}
            {((priceCurrency === 'USD' ? Number(listPriceUsd) > 0 && activeRate > 0 : (formData.list_price ?? 0) > 0)) && (() => {
              const listPrice = priceCurrency === 'USD' && activeRate > 0
                ? Math.round(Number(listPriceUsd) * activeRate * 100) / 100
                : (formData.list_price || 0)
              const d1 = formData.discount_1 || 0
              const d2 = formData.discount_2 || 0
              const d3 = formData.discount_3 || 0
              const extra = formData.extra_cost || 0
              const profit = formData.profit_margin || 0
              const iva = formData.iva_rate || 21

              // Cálculo paso a paso
              const netBase = listPrice * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
              const netWithExtra = netBase * (1 + extra / 100)
              const netWithProfit = netWithExtra * (1 + profit / 100)
              const ivaAmount = netWithProfit * (iva / 100)
              const finalPrice = netWithProfit + ivaAmount
              const qtyPerPkg = ['m', 'm2', 'kg', 'litro'].includes(formData.unit ?? '') &&
                (formData.quantity_per_package ?? 0) > 0 &&
                formData.sell_per_unit !== false
                  ? formData.quantity_per_package!
                  : null
              const unitFinalPrice = qtyPerPkg ? Math.round((finalPrice / qtyPerPkg) * 100) / 100 : finalPrice

              return (
                <div className="mt-3 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/10 dark:to-primary-900/10 rounded-lg p-2.5 border border-primary-200 dark:border-primary-700">
                  <div className="flex flex-col gap-2 lg:flex-row lg:justify-between lg:items-start">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">Desglose de Precio:</p>
                      <div className="text-xs space-y-0.5 text-gray-600 dark:text-gray-400">
                        <div className="flex justify-between">
                          <span>Precio Lista:</span>
                          <span className="font-mono">${listPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {(d1 > 0 || d2 > 0 || d3 > 0) && (
                          <div className="flex justify-between text-green-600 dark:text-green-400">
                            <span>- Bonificaciones ({[d1, d2, d3].filter(d => d > 0).join('+')}%):</span>
                            <span className="font-mono">-${(listPrice - netBase).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {extra > 0 && (
                          <div className="flex justify-between text-orange-600 dark:text-orange-400">
                            <span>+ Cargo Extra ({extra}%):</span>
                            <span className="font-mono">+${(netWithExtra - netBase).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {profit > 0 && (
                          <div className="flex justify-between text-yellow-600 dark:text-yellow-400">
                            <span>+ Ganancia ({profit}%):</span>
                            <span className="font-mono">+${(netWithProfit - netWithExtra).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-gray-300 dark:border-gray-600 pt-0.5">
                          <span>Neto sin IVA:</span>
                          <span className="font-mono font-medium">${netWithProfit.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-primary-600 dark:text-primary-400">
                          <span>+ IVA ({iva}%):</span>
                          <span className="font-mono">+${ivaAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {qtyPerPkg && (
                          <div className="flex justify-between text-blue-600 dark:text-blue-400 border-t border-gray-300 dark:border-gray-600 pt-0.5">
                            <span>÷ {qtyPerPkg} {formData.unit} (precio por 1 {formData.unit}):</span>
                            <span className="font-mono font-bold">${unitFinalPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-primary-200 bg-white/70 px-3 py-2 text-right dark:border-primary-700 dark:bg-gray-800/60 lg:min-w-[170px]">
                      <p className="text-xs text-primary-600 dark:text-primary-400 font-medium mb-1">Precio Final:</p>
                      <p className="text-xl lg:text-2xl font-bold text-primary-700 dark:text-primary-300 break-words">
                        ${unitFinalPrice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Sección: Operativo */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2">
              <Package size={13} className="text-primary-500 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Operativo</span>
            </div>
            <div className="p-3 space-y-3">
              {/* Unidad + Stock actual + Stock mínimo */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="prod-unit" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Unidad
                  </label>
                  <select
                    id="prod-unit"
                    value={formData.unit}
                    name="unit-select"
                    onChange={(e) => {
                      const newUnit = e.target.value
                      setFormData({
                        ...formData,
                        unit: newUnit,
                        quantity_per_package: ['m', 'm2', 'kg', 'litro'].includes(newUnit) ? formData.quantity_per_package : null,
                        units_per_pack: newUnit === 'pack' ? formData.units_per_pack : null,
                      })
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow cursor-pointer"
                  >
                    <option value="unidad">Unidad</option>
                    <option value="m">Metro (m)</option>
                    <option value="m2">Metro² (m²)</option>
                    <option value="kg">Kilogramo (kg)</option>
                    <option value="litro">Litro</option>
                    <option value="pack">Pack</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="prod-stock" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {isEditing ? 'Stock actual' : 'Stock inicial'}
                  </label>
                  {isEditing ? (
                    <div className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <span className="font-semibold">{formData.current_stock}</span>
                      <span className="text-[10px] text-gray-400 truncate">lotes</span>
                    </div>
                  ) : (
                    <input
                      id="prod-stock"
                      ref={stockRef}
                      type="number"
                      value={formData.current_stock}
                      onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) || 0 })}
                      onFocus={handleNumericFocus}
                      onKeyDown={(e) => handleNumericKeyDown(e, 'current_stock', submitBtnRef)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="prod-min-stock" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Stock mínimo
                  </label>
                  <input
                    id="prod-min-stock"
                    type="number"
                    min={0}
                    value={formData.minimum_stock ?? 0}
                    onChange={(e) => setFormData({ ...formData, minimum_stock: parseInt(e.target.value) || 0 })}
                    onFocus={handleNumericFocus}
                    placeholder="0"
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  />
                </div>
              </div>

              {formData.unit === 'pack' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Unidades por Pack
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.units_per_pack ?? ''}
                    onChange={(e) => setFormData({ ...formData, units_per_pack: parseInt(e.target.value) || null })}
                    placeholder="Ej: 12"
                    className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  />
                </div>
              )}
              {['m', 'm2', 'kg', 'litro'].includes(formData.unit ?? '') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {formData.unit === 'kg' ? 'kg por bolsa / compra'
                      : formData.unit === 'litro' ? 'Litros por envase'
                      : formData.unit === 'm2' ? 'm² por unidad'
                      : 'Metros por rollo'}
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={formData.quantity_per_package ?? ''}
                    onChange={(e) => setFormData({ ...formData, quantity_per_package: parseFloat(e.target.value) || null })}
                    placeholder="Ej: 20"
                    className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  />
                  {(formData.quantity_per_package ?? 0) > 0 && (
                    <div className="mt-1.5 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, sell_per_unit: true })}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${formData.sell_per_unit !== false ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-400 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                      >
                        Vender por {formData.unit}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, sell_per_unit: false })}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${formData.sell_per_unit === false ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-400 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                      >
                        {formData.quantity_per_package} {formData.unit}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!isEditing && (formData.current_stock || 0) > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Vencimiento del lote inicial
                  </label>
                  <input
                    type="date"
                    value={formData.expiration_date || ''}
                    onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  />
                </div>
              )}

              {/* Términos IA */}
              <div>
                <label htmlFor="prod-terms" className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Términos del cliente
                  <span className="ml-0.5 rounded bg-primary-100 dark:bg-primary-900/40 px-1 py-0.5 text-[9px] font-semibold text-primary-600 dark:text-primary-400 leading-none">IA</span>
                </label>
                <textarea
                  id="prod-terms"
                  value={formData.customer_terms || ''}
                  onChange={(e) => setFormData({ ...formData, customer_terms: e.target.value })}
                  placeholder="Ej: rosca tuerca pp, entrerosca plastica, niple pp"
                  rows={1}
                  className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow resize-none"
                />
              </div>

              {/* Foto del producto */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Foto del producto
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {(photoPreview || (formData as any).photo_url) && (
                    <img
                      src={photoPreview || (formData as any).photo_url}
                      alt="foto"
                      className="h-10 w-10 rounded-lg object-cover border border-gray-200 shrink-0"
                    />
                  )}
                  <label className="cursor-pointer rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:border-primary-400 hover:text-primary-600 dark:border-gray-600 dark:text-gray-400 transition-colors">
                    {photoPreview || (formData as any).photo_url ? 'Cambiar foto' : 'Subir foto'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (file.size > 2 * 1024 * 1024) {
                          toast.error('La imagen no puede superar 2 MB.')
                          return
                        }
                        setSelectedPhotoFile(file)
                        setPhotoPreview(URL.createObjectURL(file))
                      }}
                    />
                  </label>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={() => { setSelectedPhotoFile(null); setPhotoPreview(null) }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Quitar
                    </button>
                  )}
                  <span className="text-[10px] text-gray-400">JPG, PNG o WebP · 2 MB máx.</span>
                </div>
              </div>
            </div>
          </div>

          </div>

          {/* Panel de confirmación de cambio de grupo */}
          {showGroupChangeDialog && (
            <div className="lg:col-span-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                    Este producto pertenece al grupo &quot;{originalSimilarityGroupCode}&quot;
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                    {originalGroupMembers.length === 1
                      ? 'Hay 1 producto más en este grupo:'
                      : `Hay ${originalGroupMembers.length} productos más en este grupo:`}
                  </p>
                  <div className="flex flex-col gap-1 mb-3">
                    {originalGroupMembers.slice(0, 3).map(p => (
                      <div key={p.id} className="text-xs text-amber-700 dark:text-amber-300 flex gap-2 truncate">
                        <span className="font-mono shrink-0">{p.code}</span>
                        <span className="truncate">{p.description}</span>
                        {(p.brand_name || p.brand) && (
                          <span className="text-amber-500 shrink-0">{p.brand_name || p.brand}</span>
                        )}
                      </div>
                    ))}
                    {originalGroupMembers.length > 3 && (
                      <div className="text-xs text-amber-500">...y {originalGroupMembers.length - 3} más</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirmGroupChange('single')}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                    >
                      Solo este producto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmGroupChange('all')}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer"
                    >
                      {formData.similarity_group_code?.trim()
                        ? `Cambiar todo el grupo (${originalGroupMembers.length + 1})`
                        : `Disolver el grupo (${originalGroupMembers.length + 1})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGroupChangeDialog(false)}
                      className="px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Botones con indicadores */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-700 lg:col-span-2">
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
                className="bg-gradient-to-r from-primary-600 to-primary-600 hover:from-primary-700 hover:to-primary-700"
              >
                ✓ {isEditing ? 'Actualizar' : 'Guardar'}
              </Button>
            </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal de filtros para exportar Excel */}
      <Modal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false)
          setExportCategoryId('')
          setExportSupplierId('')
        }}
        title="Exportar productos a Excel"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Podés filtrar la exportación por categoría y/o proveedor. Si no seleccionás ninguno, se exportan todos los productos.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Categoría
              </label>
              <Select
                value={exportCategoryId}
                onChange={(e) => setExportCategoryId(e.target.value)}
                options={[
                  { value: '', label: 'Todas las categorías' },
                  ...categories.map(c => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Proveedor
              </label>
              <Select
                value={exportSupplierId}
                onChange={(e) => setExportSupplierId(e.target.value)}
                options={[
                  { value: '', label: 'Todos los proveedores' },
                  ...suppliers.map(s => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setShowExportModal(false)
                setExportCategoryId('')
                setExportSupplierId('')
              }}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors flex items-center gap-2"
            >
              <Download size={15} />
              Descargar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de mapeo de columnas Excel */}
      {showColumnMapper && columnMapperData && (
        <ColumnMapperModal
          file={columnMapperData.file}
          columns={columnMapperData.columns}
          sampleRows={columnMapperData.sampleRows}
          onConfirm={(mapping) => void handleColumnMapperConfirm(mapping)}
          onCancel={() => {
            setShowColumnMapper(false)
            setColumnMapperData(null)
          }}
        />
      )}

      {/* Modal de Preview de Importación */}
      <ImportPreviewModal
        isOpen={showImportPreview}
        onClose={() => {
          setShowImportPreview(false)
          setImportPreviewData(null)
        }}
        onConfirm={handleConfirmImport}
        previewData={importPreviewData}
        categories={categories}
        suppliers={suppliers}
      />

      {/* Modal de confirmación de borrado masivo */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDeleteConfirm}
        totalProducts={productsData?.total || 0}
      />

      {/* Modal de progreso de importación */}
      <ImportProgressModal
        isOpen={showImportProgress}
        progress={importProgress}
        currentItem={Math.round((importProgress / 100) * importTotal)}
        totalItems={importTotal}
        status={importStatus}
        message={importMessage}
        errorMessage="Error al importar productos. Revisa los datos e intenta nuevamente."
      />

      {/* Modal de Lotes */}
      <Modal
        isOpen={showLotModal}
        onClose={handleCloseLotModal}
        title={lotModalProduct ? `Lotes de ${lotModalProduct.description}` : 'Lotes'}
        size="lg"
      >
        <div className="space-y-4">
          {lotsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : lots.length === 0 && !showNewLotForm ? (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              <Package size={40} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p>Este producto no tiene lotes registrados.</p>
              <p className="text-xs mt-1">Ingresá stock para crear el primer lote.</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {lots.map((lot: any) => {
                  const expirationEl = lot.expiration_date ? (() => {
                    const exp = new Date(lot.expiration_date)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    if (days < 0) return <span className="text-red-600 font-semibold">{lot.expiration_date}</span>
                    if (days <= 30) return <span className="text-amber-500 font-semibold">{lot.expiration_date}</span>
                    return <span className="text-gray-700 dark:text-gray-300">{lot.expiration_date}</span>
                  })() : <span className="text-gray-400">—</span>

                  return (
                    <div key={lot.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200 truncate max-w-[60%]">
                          {lot.code || <span className="italic text-gray-400">Sin código</span>}
                        </span>
                        <span className="ml-2 flex-shrink-0 rounded-full bg-violet-100 dark:bg-violet-900/30 px-3 py-0.5 text-sm font-bold text-violet-700 dark:text-violet-300">
                          {lot.quantity} uds.
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-gray-400 dark:text-gray-500">Costo</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {lot.cost_price != null ? `$${Number(lot.cost_price).toLocaleString()}` : '—'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-gray-400 dark:text-gray-500">Vence</span>
                          <span className="font-medium">{expirationEl}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-gray-400 dark:text-gray-500">Recibido</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{lot.received_date || '—'}</span>
                        </div>
                      </div>
                      {lot.cost_price != null && Number(lot.cost_price) > 0 && (
                        <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                          <button
                            type="button"
                            onClick={() => handlePreviewSyncPriceFromLot(lot)}
                            disabled={syncLoading && syncingLotId === lot.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100 disabled:opacity-60 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                          >
                            <Calculator size={12} />
                            {syncLoading && syncingLotId === lot.id ? 'Calculando...' : 'Usar costo'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Código</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Cantidad</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Vence</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Costo</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Recibido</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {lots.map((lot: any) => (
                      <tr key={lot.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-3 py-2 font-mono text-gray-800 dark:text-gray-200">{lot.code || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{lot.quantity}</td>
                        <td className="px-3 py-2 text-center">
                          {lot.expiration_date ? (
                            (() => {
                              const exp = new Date(lot.expiration_date)
                              const today = new Date()
                              today.setHours(0, 0, 0, 0)
                              const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                              if (days < 0) return <span className="text-red-600 font-medium">{lot.expiration_date}</span>
                              if (days <= 30) return <span className="text-amber-600 font-medium">{lot.expiration_date}</span>
                              return <span>{lot.expiration_date}</span>
                            })()
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {lot.cost_price != null ? `$${Number(lot.cost_price).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500">{lot.received_date}</td>
                        <td className="px-3 py-2 text-right">
                          {lot.cost_price != null && Number(lot.cost_price) > 0 ? (
                            <button
                              type="button"
                              onClick={() => handlePreviewSyncPriceFromLot(lot)}
                              disabled={syncLoading && syncingLotId === lot.id}
                              className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700 transition hover:bg-green-100 disabled:opacity-60 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30"
                              title="Usar este costo como precio de lista"
                            >
                              <Calculator size={12} />
                              {syncLoading && syncingLotId === lot.id ? 'Calculando' : 'Usar costo'}
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Formulario de ingreso de stock */}
          {showNewLotForm && (
            <form onSubmit={handleCreateLot} className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-amber-50 p-3 shadow-sm dark:border-amber-800 dark:from-amber-900/10 dark:via-gray-900 dark:to-amber-900/10">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ingresar stock</h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Enter avanza campo por campo para cargar más rápido.</p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Nuevo lote
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cantidad *
                  </label>
                  <input
                    ref={lotQuantityRef}
                    type="number"
                    min={1}
                    value={lotFormData.quantity || ''}
                    onChange={(e) => setLotFormData({ ...lotFormData, quantity: parseInt(e.target.value) || 0 })}
                    onFocus={handleNumericFocus}
                    onKeyDown={(e) => handleLotNumericKeyDown(e, lotCodeRef)}
                    className="w-full px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-amber-500"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Costo unitario
                  </label>
                  <input
                    ref={lotCostRef}
                    type="number"
                    min={0}
                    step="0.01"
                    value={lotFormData.cost_price}
                    onChange={(e) => setLotFormData({ ...lotFormData, cost_price: e.target.value })}
                    onFocus={handleNumericFocus}
                    onKeyDown={(e) => handleLotNumericKeyDown(e, lotReceivedDateRef)}
                    placeholder="0.00"
                    className="w-full px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Código de lote
                  </label>
                  <input
                    ref={lotCodeRef}
                    type="text"
                    value={lotFormData.code}
                    onChange={(e) => setLotFormData({ ...lotFormData, code: e.target.value })}
                    onKeyDown={(e) => handleEnterKey(e, lotCostRef)}
                    placeholder="Opcional"
                    className="w-full px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recibido
                  </label>
                  <input
                    ref={lotReceivedDateRef}
                    type="date"
                    value={lotFormData.received_date}
                    onChange={(e) => setLotFormData({ ...lotFormData, received_date: e.target.value })}
                    onKeyDown={(e) => handleEnterKey(e, lotFormData.has_expiration ? lotExpirationDateRef : lotSubmitRef)}
                    className="w-full px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <input
                      type="checkbox"
                      checked={lotFormData.has_expiration}
                      onChange={(e) => {
                        setLotFormData({
                          ...lotFormData,
                          has_expiration: e.target.checked,
                          expiration_date: e.target.checked ? lotFormData.expiration_date : '',
                        })
                      }}
                      className="rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
                    />
                    Este lote tiene vencimiento
                  </label>
                  {lotFormData.has_expiration && (
                    <input
                      ref={lotExpirationDateRef}
                      type="date"
                      value={lotFormData.expiration_date}
                      onChange={(e) => setLotFormData({ ...lotFormData, expiration_date: e.target.value })}
                      onKeyDown={(e) => handleEnterKey(e, lotSubmitRef)}
                      className="w-full px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-amber-500"
                    />
                  )}
                  {!lotFormData.has_expiration && (
                    <div className="flex h-[42px] md:h-[34px] items-center rounded-lg border border-dashed border-gray-300 bg-white/70 px-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                      Sin vencimiento para este lote
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-2 border-t border-amber-100 pt-3 dark:border-amber-900/40">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  La fecha de recepción puede ser distinta al día de carga.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowNewLotForm(false)} type="button" className="flex-1 md:flex-none">
                    Cancelar
                  </Button>
                  <Button ref={lotSubmitRef} size="sm" type="submit" className="flex-1 md:flex-none bg-amber-600 hover:bg-amber-700 text-white">
                    ✓ Ingresar stock
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* Sincronización de precio desde lote */}
          {syncPricePreview && !syncPricePreview.confirmed && (
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-green-600" />
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Sincronizar precio desde lote
                </h4>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Lote seleccionado: <strong>{lots.find((lot: any) => lot.id === syncingLotId)?.code || 'Sin código'}</strong>. El precio de lista se actualizará a <strong>${Number(syncPricePreview.preview_list_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>, resultando en un precio de venta de <strong>${Number(syncPricePreview.preview_sale_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleConfirmSyncPrice}
                  disabled={syncLoading}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs"
                >
                  {syncLoading ? 'Sincronizando...' : '✓ Aplicar precio'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSyncPricePreview(null)}
                  className="text-xs"
                >
                  Descartar
                </Button>
              </div>
            </div>
          )}

          {syncPricePreview?.confirmed && (
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
              <p className="text-green-700 dark:text-green-300 font-medium">
                ✓ Precio actualizado: ${Number(syncPricePreview.preview_sale_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {syncPricePreview.message}
              </p>
            </div>
          )}

          {/* Botones inferiores */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
            {!showNewLotForm ? (
              <Button
                size="sm"
                onClick={() => setShowNewLotForm(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                + Ingresar stock
              </Button>
            ) : (
              <div /> /* Empty div to keep spacing */
            )}
            <Button variant="outline" size="sm" onClick={handleCloseLotModal}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* QR selection floating action bar */}
      {qrScannerEnabled && selectedForQr.size > 0 && (
        <div className="fixed bottom-[54px] left-1/2 z-40 -translate-x-1/2 md:bottom-6">
          <div className="flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl ring-1 ring-white/10 dark:bg-gray-800">
            <span className="text-sm font-semibold text-white">
              {selectedForQr.size} seleccionado(s)
            </span>
            <button
              onClick={() => setSelectedForQr(new Set())}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-white"
            >
              Limpiar
            </button>
            <button
              onClick={() => setShowQrPreview(true)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 active:scale-95"
            >
              <QrCode size={16} />
              Generar QR
            </button>
          </div>
        </div>
      )}

      {/* QR print preview fullscreen */}
      {qrScannerEnabled && showQrPreview && (
        <QrPrintPreview
          products={products.filter((p) => selectedForQr.has(p.id))}
          onClose={() => setShowQrPreview(false)}
        />
      )}
    </div>
  )
}
