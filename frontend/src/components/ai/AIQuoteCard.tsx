/**
 * Card de cotización inline para el chat del Asistente IA.
 * Muestra el draft generado por el agente con semáforo de confianza,
 * edición de cantidades inline (+/-) y botón "Abrir en Ventas".
 */
import { useState, useCallback } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Plus, Minus, ExternalLink, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AIParseQuoteResponse, AIDraftItem, AIMatchedProduct, AIConfidence } from '../../types'
import { useSalesStore } from '../../stores/salesStore'
import { useAIStore } from '../../stores/aiStore'
import AILearnToast from './AILearnToast'

interface AIQuoteCardProps {
  quoteResponse: AIParseQuoteResponse
}

// Semáforo de confianza — igual que en AIQuoteReview original
const CONFIDENCE_CONFIG: Record<AIConfidence, {
  border: string
  bg: string
  badge: string
  icon: React.ReactNode
  label: string
}> = {
  HIGH: {
    border: 'border-l-green-500',
    bg: 'bg-green-50 dark:bg-green-900/10',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    icon: <CheckCircle size={12} className="text-green-500" />,
    label: 'Alta confianza',
  },
  MED: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/10',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
    icon: <AlertTriangle size={12} className="text-yellow-500" />,
    label: 'Revisar',
  },
  LOW: {
    border: 'border-l-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/10',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
    icon: <AlertTriangle size={12} className="text-orange-500" />,
    label: 'Baja confianza',
  },
  NONE: {
    border: 'border-l-red-500',
    bg: 'bg-red-50 dark:bg-red-900/10',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    icon: <XCircle size={12} className="text-red-500" />,
    label: 'Sin coincidencia',
  },
}

export default function AIQuoteCard({ quoteResponse }: AIQuoteCardProps) {
  const navigate = useNavigate()
  const preloadItems = useSalesStore((s) => s.preloadItems)
  const close = useAIStore((s) => s.close)

  // Copia local editable de los ítems
  const [items, setItems] = useState<AIDraftItem[]>(
    quoteResponse?.draft?.items ?? []
  )

  const [learnToast, setLearnToast] = useState<{
    productId: string
    productName: string
    term: string
  } | null>(null)

  // Total en tiempo real
  const total = items.reduce((sum, item) => {
    return sum + item.qty * (item.product?.sale_price ?? 0)
  }, 0)

  const hasUnresolved = items.some(
    (item) => item.confidence === 'NONE' && !item.product
  )

  const { summary } = quoteResponse.draft

  // Cambiar cantidad inline
  const handleQtyChange = useCallback((index: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, qty: Math.max(0.5, item.qty + delta) }
          : item
      )
    )
  }, [])

  // Seleccionar alternativa
  const handleSelectAlternative = useCallback(
    (index: number, alternative: AIMatchedProduct) => {
      const originalTerm = items[index]?.item?.raw_original ?? ''
      const wasLowConfidence = items[index]?.confidence !== 'HIGH'

      setItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? { ...item, product: alternative, confidence: 'MED', unit_price: alternative.sale_price }
            : item
        )
      )

      if (wasLowConfidence) {
        setLearnToast({
          productId: alternative.id,
          productName: alternative.description,
          term: originalTerm,
        })
      }
    },
    [items]
  )

  // Abrir en Ventas: precarga los ítems y navega
  const handleOpenInSales = () => {
    try {
      sessionStorage.setItem('ai-sales-preload', JSON.stringify(items))
    } catch {
      // no-op: best effort fallback
    }

    preloadItems(items)
    close()
    navigate('/sales')
    toast.success('Presupuesto cargado en Ventas', { icon: '🛒', duration: 3000 })
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-4 text-center">
        <p className="text-sm text-gray-400">No se pudo generar el presupuesto.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      {/* Header del card */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
        <div className="flex flex-wrap gap-1.5">
          {summary.high > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
              ✓ {summary.high} seguro{summary.high !== 1 ? 's' : ''}
            </span>
          )}
          {(summary.med + summary.low) > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
              ⚠ {summary.med + summary.low} revisar
            </span>
          )}
          {summary.none > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
              ✗ {summary.none} sin match
            </span>
          )}
        </div>
      </div>

      {/* Lista de ítems */}
      <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-72 overflow-y-auto">
        {items.map((item, index) => {
          const config = CONFIDENCE_CONFIG[item.confidence]
          const price = item.product?.sale_price ?? 0
          const subtotal = item.qty * price

          return (
            <div
              key={index}
              className={`px-3 py-2.5 border-l-4 ${config.border} ${config.bg}`}
            >
              {/* Nombre + badge */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  {item.product ? (
                    <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                      {item.product.description}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-gray-400 italic truncate">
                      "{item.item.raw_original}"
                    </p>
                  )}
                </div>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-0.5 flex-shrink-0 ${config.badge}`}>
                  {config.icon}
                  {config.label}
                </span>
              </div>

              {/* Controles inline */}
              {item.product ? (
                <div className="flex items-center justify-between mt-1.5">
                  {/* +/- cantidad */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleQtyChange(index, -1)}
                      className="w-6 h-6 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="text-xs font-bold text-gray-900 dark:text-white w-6 text-center">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => handleQtyChange(index, 1)}
                      className="w-6 h-6 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Plus size={10} />
                    </button>
                    <span className="text-[10px] text-gray-400">{item.product.unit}</span>
                  </div>

                  {/* Subtotal */}
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">
                      ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u
                    </p>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                      ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ) : (
                /* Botón buscar manualmente para NONE */
                <button className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400 hover:text-cyan-500 transition-colors">
                  <Search size={10} />
                  Buscar manualmente
                </button>
              )}

              {/* Alternativas para MED/LOW */}
              {item.alternatives.length > 0 && item.confidence !== 'HIGH' && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.alternatives.slice(0, 3).map((alt) => (
                    <button
                      key={alt.id}
                      onClick={() => handleSelectAlternative(index, alt)}
                      className="px-2 py-0.5 text-[10px] rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-cyan-400 hover:text-cyan-600 transition-colors truncate max-w-[120px]"
                      title={alt.description}
                    >
                      {alt.description.length > 20
                        ? alt.description.slice(0, 20) + '…'
                        : alt.description}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: total + botón */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs text-gray-500">Total estimado</span>
          <span className="text-base font-bold text-gray-900 dark:text-white">
            ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <button
          onClick={handleOpenInSales}
          disabled={hasUnresolved}
          className={`
            w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all
            ${hasUnresolved
              ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-md shadow-cyan-500/20'
            }
          `}
        >
          <ExternalLink size={14} />
          {hasUnresolved ? 'Resolver ítems sin match primero' : 'Abrir en Ventas'}
        </button>
      </div>

      {/* Toast de aprendizaje */}
      {learnToast && (
        <AILearnToast
          productId={learnToast.productId}
          productName={learnToast.productName}
          term={learnToast.term}
          onDismiss={() => setLearnToast(null)}
        />
      )}
    </div>
  )
}
