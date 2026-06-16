import { useState, useEffect, useRef } from 'react'
import { Check, ChevronRight, ChevronLeft, Sparkles, ExternalLink, Search } from 'lucide-react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { Button, Input } from '../ui'
import meliService from '../../api/meliService'
import { productsService, type Product } from '../../api/productsService'
import type { MeliCategorySuggestion, MeliCategoryAttribute } from '../../types/meli'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type Step = 1 | 2 | 3 | 4

const STEPS = ['Producto', 'Categoría', 'Atributos', 'Precio y tipo'] as const

const LISTING_TYPES = [
  { id: 'gold_special', label: 'Clásica (oro especial)' },
  { id: 'gold_pro', label: 'Premium (oro profesional)' },
  { id: 'free', label: 'Gratuita' },
]

export default function PublishWizard({ isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>(1)

  // Step 1 — product selection
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [title, setTitle] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Step 2
  const [suggestions, setSuggestions] = useState<MeliCategorySuggestion[]>([])
  const [predicting, setPredicting] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<MeliCategorySuggestion | null>(null)

  // Step 3
  const [attributes, setAttributes] = useState<MeliCategoryAttribute[]>([])
  const [attrValues, setAttrValues] = useState<Record<string, string>>({})
  const [loadingAttrs, setLoadingAttrs] = useState(false)

  // Step 4
  const [markup, setMarkup] = useState('0')
  const [mlStock, setMlStock] = useState('')
  const [listingType, setListingType] = useState('gold_special')
  const [description, setDescription] = useState('')
  const [publishing, setPublishing] = useState(false)

  const salePrice = selectedProduct?.sale_price ?? 0
  const finalPrice = salePrice * (1 + parseFloat(markup || '0') / 100)

  // Reset all state when modal opens
  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    setProductSearch('')
    setProductResults([])
    setShowDropdown(false)
    setSelectedProduct(null)
    setTitle('')
    setSuggestions([])
    setSelectedCategory(null)
    setAttributes([])
    setAttrValues({})
    setMarkup('0')
    setMlStock('')
    setListingType('gold_special')
    setDescription('')
  }, [isOpen])

  // Debounced product search
  useEffect(() => {
    if (!productSearch.trim() || selectedProduct) {
      setProductResults([])
      setShowDropdown(false)
      return
    }
    const t = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const data = await productsService.getAll({ search: productSearch, per_page: 8, is_active: true })
        setProductResults(data.items)
        setShowDropdown(data.items.length > 0)
      } catch {
        // silently ignore transient search errors
      } finally {
        setSearchingProducts(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [productSearch, selectedProduct])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectProduct = (p: Product) => {
    setSelectedProduct(p)
    setTitle(p.description)
    setShowDropdown(false)
    setProductSearch('')
  }

  const clearProduct = () => {
    setSelectedProduct(null)
    setProductSearch('')
    setMlStock('')
    setTitle('')
  }

  const handlePredictCategory = async () => {
    if (!title.trim()) return
    setPredicting(true)
    try {
      const data = await meliService.predictCategory(title)
      setSuggestions(data.slice(0, 3))
    } catch {
      toast.error('No se pudo obtener sugerencias de categoría')
    } finally {
      setPredicting(false)
    }
  }

  const handleSelectCategory = async (cat: MeliCategorySuggestion) => {
    setSelectedCategory(cat)
  }

  const handleLoadAttributes = async () => {
    if (!selectedCategory) return
    setLoadingAttrs(true)
    try {
      const attrs = await meliService.getCategoryAttributes(selectedCategory.category_id)
      setAttributes(attrs)
    } catch {
      toast.error('Error al cargar atributos')
    } finally {
      setLoadingAttrs(false)
    }
  }

  const handleNext = async () => {
    if (step === 1) {
      if (!selectedProduct) { toast.error('Seleccioná un producto'); return }
      if (!title.trim()) { toast.error('Ingresá un título'); return }
      setStep(2)
    } else if (step === 2) {
      if (!selectedCategory) { toast.error('Seleccioná una categoría'); return }
      await handleLoadAttributes()
      setStep(3)
    } else if (step === 3) {
      setStep(4)
    }
  }

  const handlePublish = async () => {
    if (!selectedProduct || !selectedCategory) return
    const requiredMissing = attributes
      .filter((a) => a.tags?.required && !attrValues[a.id])
      .map((a) => a.name)
    if (requiredMissing.length > 0) {
      toast.error(`Completá los atributos requeridos: ${requiredMissing.join(', ')}`)
      return
    }

    setPublishing(true)
    try {
      const listing = await meliService.publish({
        product_id: selectedProduct.id,
        category_id: selectedCategory.category_id,
        listing_type_id: listingType,
        title: title || undefined,
        price_markup_pct: markup,
        description: description || undefined,
        available_quantity: mlStock ? parseInt(mlStock, 10) : undefined,
        attributes: Object.entries(attrValues)
          .filter(([, v]) => v)
          .map(([id, value_name]) => ({ id, value_name })),
        sync_price: true,
        sync_stock: true,
      })
      toast.success('Publicación creada en Mercado Libre')
      onSuccess()
      onClose()
      if (listing.meli_permalink) {
        window.open(listing.meli_permalink, '_blank')
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Error al publicar. Revisá los datos.')
    } finally {
      setPublishing(false)
    }
  }

  const confidenceLabel = (score: number | undefined) => {
    if (!score || score < 0.4) return { label: 'Baja coincidencia', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
    if (score < 0.75) return { label: 'Media coincidencia', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' }
    return { label: 'Alta coincidencia', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#d9caeb] dark:border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#fff159] flex items-center justify-center text-[10px] font-black text-[#2d3277]">ML</div>
            <h2 className="text-[18px] font-semibold text-[#121325] dark:text-white">Publicar en Mercado Libre</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-4 border-b border-[#d9caeb] dark:border-gray-700">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-[#d9caeb] dark:bg-gray-700 mx-8" />
            {STEPS.map((label, i) => {
              const n = (i + 1) as Step
              const done = step > n
              const active = step === n
              return (
                <div key={label} className="relative z-10 flex flex-col items-center gap-1.5">
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                    done && 'bg-[#5c3a8c] text-white',
                    active && 'bg-[#5c3a8c] text-white ring-4 ring-[#5c3a8c]/20',
                    !done && !active && 'bg-[#d9caeb] text-[#7b6b95] dark:bg-gray-700 dark:text-gray-400',
                  )}>
                    {done ? <Check size={14} strokeWidth={2.5} /> : n}
                  </div>
                  <span className={clsx('text-[11px] font-medium', active ? 'text-[#5c3a8c]' : 'text-[#7b6b95] dark:text-gray-500')}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                  Producto
                </label>
                {selectedProduct ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-[#f5f2fa] dark:bg-gray-800 border border-[#d9caeb] dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#121325] dark:text-white truncate">{selectedProduct.description}</p>
                      <p className="text-xs text-[#9d84bf] mt-0.5">
                        Stock: {selectedProduct.current_stock} · Código: {selectedProduct.code}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearProduct}
                      className="flex-shrink-0 text-[#9d84bf] hover:text-[#5c3a8c] transition-colors text-lg leading-none"
                      title="Cambiar producto"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={dropdownRef}>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9d84bf]" />
                      <Input
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Buscar producto por nombre o código..."
                        className="pl-8"
                        autoFocus
                      />
                      {searchingProducts && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-[#5c3a8c]" />
                        </div>
                      )}
                    </div>
                    {showDropdown && (
                      <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-[#d9caeb] dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {productResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectProduct(p)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#f5f2fa] dark:hover:bg-gray-700 transition-colors border-b border-[#f0eaf8] dark:border-gray-700 last:border-0"
                          >
                            <span className="font-medium text-[#121325] dark:text-white">{p.description}</span>
                            <span className="text-xs text-[#9d84bf] ml-2">· Stock: {p.current_stock}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {productSearch.trim() && !searchingProducts && !showDropdown && productResults.length === 0 && (
                      <p className="mt-1.5 text-xs text-[#9d84bf]">Sin resultados para "{productSearch}"</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                  Título de la publicación
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título que verán los compradores en ML"
                  maxLength={60}
                />
                <p className="text-xs text-[#9d84bf] mt-1">{title.length}/60 caracteres</p>
              </div>
              {salePrice > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#f5f2fa] dark:bg-gray-800 border border-[#d9caeb] dark:border-gray-700">
                  <div>
                    <p className="text-[11px] text-[#7b6b95] uppercase tracking-wide font-semibold">Precio local</p>
                    <p className="text-base font-semibold text-[#121325] dark:text-white">
                      ${salePrice.toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                  Título de la publicación
                </label>
                <div className="flex gap-2">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePredictCategory}
                    isLoading={predicting}
                    className="flex-shrink-0 gap-1.5"
                  >
                    <Sparkles size={14} />
                    Sugerir
                  </Button>
                </div>
              </div>

              {suggestions.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-2">
                    Sugerencias de Mercado Libre
                  </p>
                  <div className="space-y-2">
                    {suggestions.map((s) => {
                      const conf = confidenceLabel((s as any).domain_score ?? (s as any).score)
                      const selected = selectedCategory?.category_id === s.category_id
                      return (
                        <button
                          key={s.category_id}
                          type="button"
                          onClick={() => handleSelectCategory(s)}
                          className={clsx(
                            'w-full text-left p-3 rounded-lg border transition-all',
                            selected
                              ? 'border-[#5c3a8c] bg-[#f5f2fa] dark:bg-[#3a2459]/30'
                              : 'border-[#d9caeb] dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[#9d84bf]',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <div className={clsx(
                                'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all',
                                selected ? 'border-[#5c3a8c] bg-[#5c3a8c]' : 'border-[#d9caeb]',
                              )} />
                              <div>
                                <p className={clsx('text-sm font-medium', selected ? 'text-[#5c3a8c]' : 'text-[#121325] dark:text-white')}>
                                  {s.domain_name || s.category_name}
                                </p>
                                <p className="text-xs text-[#9d84bf] mt-0.5">{s.category_id}</p>
                              </div>
                            </div>
                            <span className={clsx('flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium', conf.cls)}>
                              {conf.label}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {suggestions.length === 0 && !predicting && (
                <div className="flex items-center justify-center py-8 text-[#9d84bf] text-sm">
                  Hacé clic en "Sugerir" para obtener categorías recomendadas
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {loadingAttrs ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5c3a8c]" />
                </div>
              ) : attributes.length === 0 ? (
                <div className="text-center py-8 text-[#9d84bf] text-sm">
                  Esta categoría no requiere atributos adicionales.
                </div>
              ) : (
                attributes.filter((a) => a.tags?.required || a.values).map((attr) => (
                  <div key={attr.id}>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                      {attr.name}
                      {attr.tags?.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {attr.values && attr.values.length > 0 ? (
                      <select
                        value={attrValues[attr.id] ?? ''}
                        onChange={(e) => setAttrValues((p) => ({ ...p, [attr.id]: e.target.value }))}
                        className="w-full border border-[#d9caeb] dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-[#121325] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5c3a8c]/40"
                      >
                        <option value="">Seleccionar...</option>
                        {attr.values.map((v) => (
                          <option key={v.id} value={v.name}>{v.name}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={attrValues[attr.id] ?? ''}
                        onChange={(e) => setAttrValues((p) => ({ ...p, [attr.id]: e.target.value }))}
                        placeholder={`Ingresá ${attr.name.toLowerCase()}`}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                  Markup sobre precio local (%)
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={markup}
                    onChange={(e) => setMarkup(e.target.value)}
                    className="w-32"
                  />
                  {salePrice > 0 && (
                    <div className="flex-1 p-3 rounded-lg bg-[#f5f2fa] dark:bg-gray-800 border border-[#d9caeb] dark:border-gray-700">
                      <p className="text-xs text-[#7b6b95]">Precio final en ML</p>
                      <p className="text-lg font-semibold text-[#5c3a8c]">
                        ${finalPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                  Stock a publicar en ML
                  <span className="ml-2 font-normal normal-case tracking-normal text-[#9d84bf]">
                    (disponible: {selectedProduct?.current_stock ?? 0})
                  </span>
                </label>
                <div className="flex items-start gap-3">
                  <Input
                    type="number"
                    min="1"
                    max={selectedProduct?.current_stock ?? undefined}
                    value={mlStock}
                    onChange={(e) => setMlStock(e.target.value)}
                    placeholder={String(selectedProduct?.current_stock ?? '')}
                    className="w-32"
                  />
                  <p className="text-xs text-[#9d84bf] pt-2.5 leading-relaxed">
                    Dejalo vacío para publicar todo el stock. Si el stock real llega a 0, la publicación se pausa automáticamente.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                  Tipo de publicación
                </label>
                <div className="space-y-2">
                  {LISTING_TYPES.map((lt) => (
                    <label
                      key={lt.id}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        listingType === lt.id
                          ? 'border-[#5c3a8c] bg-[#f5f2fa] dark:bg-[#3a2459]/30'
                          : 'border-[#d9caeb] dark:border-gray-700 hover:border-[#9d84bf]',
                      )}
                    >
                      <input
                        type="radio"
                        name="listing_type"
                        value={lt.id}
                        checked={listingType === lt.id}
                        onChange={() => setListingType(lt.id)}
                        className="accent-[#5c3a8c]"
                      />
                      <span className="text-sm text-[#121325] dark:text-white">{lt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
                  Descripción (opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Descripción detallada del producto..."
                  className="w-full border border-[#d9caeb] dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-[#121325] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5c3a8c]/40 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#d9caeb] dark:border-gray-700">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => step > 1 ? setStep((s) => (s - 1) as Step) : onClose()}
            className="gap-1"
          >
            <ChevronLeft size={15} />
            {step === 1 ? 'Cancelar' : 'Anterior'}
          </Button>

          <span className="text-xs text-[#9d84bf]">Paso {step} de 4</span>

          {step < 4 ? (
            <Button type="button" size="sm" onClick={handleNext} className="gap-1">
              Siguiente
              <ChevronRight size={15} />
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handlePublish} isLoading={publishing} className="gap-1.5">
              <ExternalLink size={14} />
              Publicar en ML
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
