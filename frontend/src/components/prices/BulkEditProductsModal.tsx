/**
 * Modal de edición masiva de productos - Estilo Excel.
 * Todos los campos editables en una tabla, con acciones rápidas de precios.
 */
import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, RotateCcw, Save, X, Zap, BookmarkCheck } from 'lucide-react'
import { Button } from '../ui'
import toast from 'react-hot-toast'
import priceUpdateDraftsService from '../../api/priceUpdateDraftsService'

interface Category {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

interface EditableProduct {
  id: string
  code: string
  description: string
  category_id?: string
  category_name?: string
  supplier_id?: string
  supplier_name?: string
  list_price: number
  discount_1: number
  discount_2: number
  discount_3: number
  discount_display?: string
  extra_cost: number
  sale_price: number
  current_stock: number
}

interface DraftFilters {
  category_id?: string
  category_name?: string
  supplier_id?: string
  supplier_name?: string
  search?: string
}

interface BulkEditProductsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (products: EditableProduct[]) => Promise<void>
  onSaveDraft?: (products: EditableProduct[]) => void
  onDraftSaved?: () => void  // callback para refrescar la lista de borradores
  products: EditableProduct[]
  categories: Category[]
  suppliers: Supplier[]
  draftFilters?: DraftFilters  // filtros activos al abrir el modal
  existingDraftId?: string     // si se cargó desde un borrador, su ID para actualizarlo
}

export default function BulkEditProductsModal({
  isOpen,
  onClose,
  onSave,
  onSaveDraft,
  onDraftSaved,
  products: initialProducts,
  categories,
  suppliers,
  draftFilters,
  existingDraftId,
}: BulkEditProductsModalProps) {
  const [products, setProducts] = useState<EditableProduct[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (initialProducts) {
      setProducts(initialProducts.map(p => ({
        ...p,
        list_price: Number(p.list_price),
        discount_1: Number(p.discount_1),
        discount_2: Number(p.discount_2),
        discount_3: Number(p.discount_3),
        extra_cost: Number(p.extra_cost),
        sale_price: Number(p.sale_price),
        current_stock: Number(p.current_stock),
      })))
    }
  }, [initialProducts])

  // State para acciones rápidas
  const [quickPercentage, setQuickPercentage] = useState('10')
  const [quickCategory, setQuickCategory] = useState('')
  const [quickSupplier, setQuickSupplier] = useState('')
  const [quickDiscount, setQuickDiscount] = useState('')
  const [quickCargo, setQuickCargo] = useState('')
  const [quickStock, setQuickStock] = useState('')

  // Acciones rápidas de precios
  const applyPriceChange = (type: 'increase' | 'decrease' | 'remove_increase') => {
    const percentage = parseFloat(quickPercentage)
    if (!percentage || percentage <= 0) {
      toast.error('Ingresa un porcentaje válido')
      return
    }

    setProducts(prev => prev.map(p => {
      let newPrice = p.list_price
      
      if (type === 'increase') {
        newPrice = p.list_price * (1 + percentage / 100)
      } else if (type === 'decrease') {
        newPrice = p.list_price * (1 - percentage / 100)
      } else if (type === 'remove_increase') {
        newPrice = p.list_price / (1 + percentage / 100)
      }
      
      return {
        ...p,
        list_price: Math.round(newPrice * 100) / 100,
      }
    }))
    
    toast.success(`Precios ${type === 'increase' ? 'aumentados' : type === 'decrease' ? 'disminuidos' : 'ajustados'} ${percentage}%`, { icon: '💰' })
  }

  // Calcular precio final con IVA (aplicando bonificaciones EN CADENA)
  const calculateFinalPrice = (product: EditableProduct): number => {
    // Precio con bonificaciones aplicadas en cadena
    let price = product.list_price
    if (product.discount_1 > 0) price = price * (1 - product.discount_1 / 100)
    if (product.discount_2 > 0) price = price * (1 - product.discount_2 / 100)
    if (product.discount_3 > 0) price = price * (1 - product.discount_3 / 100)
    
    // Aplicar cargo extra
    const netWithExtra = price * (1 + product.extra_cost / 100)
    
    // Aplicar IVA 21%
    const finalPrice = netWithExtra * 1.21
    
    return Math.round(finalPrice * 100) / 100
  }

  // Aplicar categoría a todos
  const applyBulkCategory = () => {
    if (!quickCategory) return
    
    const category = categories.find(c => c.id === quickCategory)
    setProducts(prev => prev.map(p => ({
      ...p,
      category_id: quickCategory,
      category_name: category?.name,
    })))
    
    toast.success(`Categoría "${category?.name}" aplicada a ${products.length} productos`, { icon: '🏷️' })
  }

  // Aplicar proveedor a todos
  const applyBulkSupplier = () => {
    if (!quickSupplier) return
    
    const supplier = suppliers.find(s => s.id === quickSupplier)
    setProducts(prev => prev.map(p => ({
      ...p,
      supplier_id: quickSupplier,
      supplier_name: supplier?.name,
    })))
    
    toast.success(`Proveedor "${supplier?.name}" aplicado a ${products.length} productos`, { icon: '📦' })
  }

  // Aplicar descuento a todos
  const applyBulkDiscount = () => {
    if (!quickDiscount) return
    
    const discounts = quickDiscount.split('+').map(d => parseFloat(d.trim()) || 0).filter(d => d > 0)
    
    setProducts(prev => prev.map(p => ({
      ...p,
      discount_1: discounts[0] || 0,
      discount_2: discounts[1] || 0,
      discount_3: discounts[2] || 0,
      discount_display: quickDiscount,
    })))
    
    toast.success(`Bonificación "${quickDiscount}" aplicada a ${products.length} productos`, { icon: '💸' })
  }

  // Aplicar cargo a todos
  const applyBulkCargo = () => {
    const cargo = parseFloat(quickCargo)
    if (!cargo && cargo !== 0) return
    
    setProducts(prev => prev.map(p => ({
      ...p,
      extra_cost: cargo,
    })))
    
    toast.success(`Cargo ${cargo}% aplicado a ${products.length} productos`, { icon: '📊' })
  }

  // Aplicar stock a todos
  const applyBulkStock = () => {
    const stock = parseInt(quickStock)
    if (!stock && stock !== 0) return
    
    setProducts(prev => prev.map(p => ({
      ...p,
      current_stock: stock,
    })))
    
    toast.success(`Stock ${stock} aplicado a ${products.length} productos`, { icon: '📦' })
  }

  const updateProduct = (index: number, field: keyof EditableProduct, value: any) => {
    setProducts(prev => prev.map((p, i) => {
      if (i !== index) return p
      
      const updated = { ...p, [field]: value }
      
      // Si cambia bonificaciones, parsear
      if (field === 'discount_display') {
        const discounts = value.split('+').map((d: string) => parseFloat(d.trim()) || 0).filter((d: number) => d > 0)
        updated.discount_1 = discounts[0] || 0
        updated.discount_2 = discounts[1] || 0
        updated.discount_3 = discounts[2] || 0
      }
      
      return updated
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(products)
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const handleSaveDraft = async () => {
    setIsSavingDraft(true)
    try {
      // Nombre automático basado en filtros
      const nameParts = [
        draftFilters?.category_name,
        draftFilters?.supplier_name,
        draftFilters?.search,
      ].filter(Boolean)
      const autoName = nameParts.length > 0
        ? nameParts.join(' · ')
        : `Borrador ${new Date().toLocaleDateString('es-AR')}`

      const payload = {
        name: autoName,
        filters: draftFilters,
        products,
      }

      if (existingDraftId) {
        // Actualizar borrador existente
        await priceUpdateDraftsService.update(existingDraftId, payload)
        toast.success(`Borrador "${autoName}" actualizado`, { icon: '💾' })
      } else {
        // Crear nuevo borrador
        await priceUpdateDraftsService.save(payload)
        toast.success(`Borrador "${autoName}" guardado (${products.length} productos)`, { icon: '💾' })
      }

      onDraftSaved?.()

      // No cerramos el modal — el usuario puede seguir editando
    } catch (error: any) {
      toast.error('Error al guardar el borrador: ' + (error.response?.data?.detail || error.message))
    } finally {
      setIsSavingDraft(false)
    }
  }

  if (!isOpen) return null

  return (
    // Overlay fullscreen propio — NO usa <Modal> para tener control del layout
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50 animate-fadeIn">
      {/* Panel central — flex-col, ocupa toda la pantalla */}
      <div className="relative flex flex-col w-full h-full bg-white dark:bg-gray-900">

        {/* ── Header fijo ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Editar {products.length} Productos
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Contenido scrollable ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">

          {/* Acciones Rápidas */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-orange-600" />
              <h3 className="font-bold text-gray-900 dark:text-white">Acciones Rápidas - Aplicar a Todos</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Precios */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Precios</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={quickPercentage}
                    onChange={(e) => setQuickPercentage(e.target.value)}
                    placeholder="%"
                    className="w-16 px-2 py-1.5 text-center font-bold border-2 border-orange-300 dark:border-orange-600 rounded dark:bg-gray-700 text-sm"
                    step="0.1"
                  />
                  <div className="flex gap-1">
                    <button onClick={() => applyPriceChange('increase')} className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium" title="Aumentar">
                      <TrendingUp size={14} />
                    </button>
                    <button onClick={() => applyPriceChange('decrease')} className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium" title="Disminuir">
                      <TrendingDown size={14} />
                    </button>
                    <button onClick={() => applyPriceChange('remove_increase')} className="px-2 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded text-xs font-medium" title="Quitar Aumento">
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Categoría */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Categoría</label>
                <div className="flex gap-2">
                  <select value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)} className="flex-1 px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Seleccionar...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={applyBulkCategory} disabled={!quickCategory} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded text-xs font-medium">Aplicar</button>
                </div>
              </div>

              {/* Proveedor */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Proveedor</label>
                <div className="flex gap-2">
                  <select value={quickSupplier} onChange={(e) => setQuickSupplier(e.target.value)} className="flex-1 px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Seleccionar...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={applyBulkSupplier} disabled={!quickSupplier} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded text-xs font-medium">Aplicar</button>
                </div>
              </div>

              {/* Bonificaciones */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Bonificaciones</label>
                <div className="flex gap-2">
                  <input type="text" value={quickDiscount} onChange={(e) => setQuickDiscount(e.target.value)} placeholder="10+5+2" className="flex-1 px-2 py-1.5 text-xs text-center border rounded dark:bg-gray-700 dark:border-gray-600" />
                  <button onClick={applyBulkDiscount} disabled={!quickDiscount} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded text-xs font-medium">Aplicar</button>
                </div>
              </div>

              {/* Cargo Extra */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Cargo Extra %</label>
                <div className="flex gap-2">
                  <input type="number" value={quickCargo} onChange={(e) => setQuickCargo(e.target.value)} placeholder="5" className="flex-1 px-2 py-1.5 text-xs text-center border rounded dark:bg-gray-700 dark:border-gray-600" step="0.1" />
                  <button onClick={applyBulkCargo} disabled={!quickCargo && quickCargo !== '0'} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded text-xs font-medium">Aplicar</button>
                </div>
              </div>

              {/* Stock */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Stock</label>
                <div className="flex gap-2">
                  <input type="number" value={quickStock} onChange={(e) => setQuickStock(e.target.value)} placeholder="100" className="flex-1 px-2 py-1.5 text-xs text-center border rounded dark:bg-gray-700 dark:border-gray-600" />
                  <button onClick={applyBulkStock} disabled={!quickStock && quickStock !== '0'} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white rounded text-xs font-medium">Aplicar</button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla Editable */}
          <div className="overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-3 text-left sticky left-0 bg-gray-50 dark:bg-gray-800 z-30 w-28">Código</th>
                  <th className="px-3 py-3 text-left w-64">Nombre</th>
                  <th className="px-3 py-3 text-left w-40">Categoría</th>
                  <th className="px-3 py-3 text-left w-40">Proveedor</th>
                  <th className="px-3 py-3 text-center w-28">P. Lista</th>
                  <th className="px-3 py-3 text-center w-24">Bonif.</th>
                  <th className="px-3 py-3 text-center w-24">Cargo %</th>
                  <th className="px-3 py-3 text-center w-20">Stock</th>
                  <th className="px-3 py-3 text-center bg-blue-100 dark:bg-blue-900/30 w-28">P. Final</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, index) => (
                  <tr key={product.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-3 py-2.5 sticky left-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{product.code}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input type="text" value={product.description} onChange={(e) => updateProduct(index, 'description', e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </td>
                    <td className="px-3 py-2.5">
                      <select value={product.category_id || ''} onChange={(e) => { const c = categories.find(x => x.id === e.target.value); updateProduct(index, 'category_id', e.target.value); updateProduct(index, 'category_name', c?.name) }} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="">Sin categoría</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select value={product.supplier_id || ''} onChange={(e) => { const s = suppliers.find(x => x.id === e.target.value); updateProduct(index, 'supplier_id', e.target.value); updateProduct(index, 'supplier_name', s?.name) }} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="">Sin proveedor</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="number" value={product.list_price} onChange={(e) => updateProduct(index, 'list_price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center font-medium" step="0.01" />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="text" value={product.discount_display || ''} onChange={(e) => updateProduct(index, 'discount_display', e.target.value)} placeholder="10+5" className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center" />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="number" value={product.extra_cost} onChange={(e) => updateProduct(index, 'extra_cost', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center" step="0.1" />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="number" value={product.current_stock} onChange={(e) => updateProduct(index, 'current_stock', parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center" />
                    </td>
                    <td className="px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-center">
                      <span className="font-bold text-sm text-blue-700 dark:text-blue-300">${calculateFinalPrice(product).toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              💡 Usa las <span className="font-bold">Acciones Rápidas</span> para modificar todos los precios a la vez,
              o editá cada campo manualmente en la tabla.
            </p>
          </div>
        </div>

        {/* ── Footer fijo — SIEMPRE VISIBLE ────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-t-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          {/* Cancelar */}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1"
          >
            <X size={16} className="mr-2" />
            Cancelar
          </Button>

          {/* Guardar borrador */}
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSaving || isSavingDraft}
            className="flex-1 border-amber-400 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/20"
          >
            {isSavingDraft ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600 mr-2" />Guardando...</>
            ) : (
              <><BookmarkCheck size={16} className="mr-2" />{existingDraftId ? 'Actualizar borrador' : 'Guardar borrador'}</>
            )}
          </Button>

          {/* Guardar cambios */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-[2] bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Save size={16} className="mr-2" />
                Guardar {products.length} Cambios
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}
