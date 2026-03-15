/**
 * Pantalla de revisión del presupuesto analizado por el agente IA.
 * Muestra los productos matcheados con semáforo de confianza:
 * 🟢 HIGH — match seguro
 * 🟡 MED/LOW — requiere revisión
 * 🔴 NONE — no encontrado, buscar manualmente
 */
import { useState, useCallback, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, Plus, Minus, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { AIConfidence, AIDraftItem, AIMatchedProduct, AIParseQuoteResponse } from '../../types'
import AILearnToast from './AILearnToast'

interface AIQuoteReviewProps {
  result: AIParseQuoteResponse
  onBack: () => void
  onClose: () => void
}

// Configuración visual del semáforo según confianza
const CONFIDENCE_CONFIG: Record<AIConfidence, {
  border: string
  bg: string
  badge: string
  badgeText: string
  icon: ReactNode
  label: string
}> = {
  HIGH: {
    border: 'border-l-green-500',
    bg: 'bg-green-50 dark:bg-green-900/10',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    badgeText: 'Alta confianza',
    icon: <CheckCircle size={14} className="text-green-500" />,
    label: 'Alta confianza',
  },
  MED: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/10',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
    badgeText: 'Revisar',
    icon: <AlertTriangle size={14} className="text-yellow-500" />,
    label: 'Revisión sugerida',
  },
  LOW: {
    border: 'border-l-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/10',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
    badgeText: 'Baja confianza',
    icon: <AlertTriangle size={14} className="text-orange-500" />,
    label: 'Baja confianza',
  },
  NONE: {
    border: 'border-l-red-500',
    bg: 'bg-red-50 dark:bg-red-900/10',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    badgeText: 'Sin coincidencia',
    icon: <XCircle size={14} className="text-red-500" />,
    label: 'No encontrado',
  },
}

export default function AIQuoteReview({ result, onBack, onClose }: AIQuoteReviewProps) {
  // Estado local de los ítems (el usuario puede editar cantidades y productos)
  const [items, setItems] = useState<AIDraftItem[]>(result.draft?.items ?? [])
  
  // Estado para el toast de aprendizaje
  const [learnToast, setLearnToast] = useState<{
    productId: string
    productName: string
    term: string
  } | null>(null)

  // Calcular total en tiempo real
  const total = items.reduce((sum, item) => {
    const price = item.product?.sale_price ?? 0
    return sum + item.qty * price
  }, 0)

  const hasUnresolved = items.some(
    (item) => item.confidence === 'NONE' && !item.product
  )

  // ── Cambiar cantidad ─────────────────────────────────────────
  const handleQtyChange = useCallback((index: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, qty: Math.max(0.5, item.qty + delta) }
          : item
      )
    )
  }, [])

  // ── Seleccionar alternativa ──────────────────────────────────
  const handleSelectAlternative = useCallback(
    (index: number, alternative: AIMatchedProduct, originalTerm: string) => {
      setItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                product: alternative,
                confidence: 'MED', // Baja la confianza al cambiar manualmente
                unit_price: alternative.sale_price,
              }
            : item
        )
      )

      // Ofrecer guardar el término aprendido si el ítem original tenía baja confianza
      if (items[index].confidence !== 'HIGH') {
        setLearnToast({
          productId: alternative.id,
          productName: alternative.description,
          term: originalTerm,
        })
      }
    },
    [items]
  )

  // ── Crear cotización ─────────────────────────────────────────
  const handleCreateQuote = () => {
    // TODO: Navegar a la pantalla de ventas con los ítems precargados
    // Por ahora muestra confirmación
    toast.success('Presupuesto creado. Redirigiendo a Ventas...', {
      icon: '🎉',
      duration: 3000,
    })
    onClose()
  }

  const { summary } = result.draft

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header con resumen */}
      <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
        {/* Título */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Revisión del Presupuesto
            </h3>
            <p className="text-xs text-gray-500">
              {items.length} producto{items.length !== 1 ? 's' : ''} detectado{items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Chips de resumen del semáforo */}
        <div className="flex gap-2 flex-wrap">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.map((item, index) => (
          <ReviewItem
            key={index}
            item={item}
            index={index}
            onQtyChange={handleQtyChange}
            onSelectAlternative={handleSelectAlternative}
          />
        ))}

        {/* Errores del agente (no fatales) */}
        {(result.errors ?? []).length > 0 && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">
              Advertencias del agente:
            </p>
            {(result.errors ?? []).map((err, i) => (
              <p key={i} className="text-xs text-yellow-600 dark:text-yellow-500">• {err}</p>
            ))}
          </div>
        )}
      </div>

      {/* Footer fijo con total y botones */}
      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">Total estimado</span>
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            ${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreateQuote}
            disabled={hasUnresolved}
            className={`
              flex-2 flex-grow py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all
              ${hasUnresolved
                ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-md shadow-cyan-500/20'
              }
            `}
          >
            {hasUnresolved ? 'Resolver items sin match' : 'Crear Cotización →'}
          </button>
        </div>
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

// ── Sub-componente: Ítem individual con semáforo ─────────────
interface ReviewItemProps {
  item: AIDraftItem
  index: number
  onQtyChange: (index: number, delta: number) => void
  onSelectAlternative: (index: number, alt: AIMatchedProduct, term: string) => void
}

function ReviewItem({ item, index, onQtyChange, onSelectAlternative }: ReviewItemProps) {
  const config = CONFIDENCE_CONFIG[item.confidence]
  const price = item.product?.sale_price ?? 0
  const subtotal = item.qty * price

  return (
    <div
      className={`
        rounded-xl border-l-4 border border-gray-100 dark:border-gray-800 p-4
        ${config.border} ${config.bg}
      `}
    >
      {/* Encabezado del ítem */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          {item.product ? (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {item.product.description}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Código: {item.product.code}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-gray-500 italic">
              "{item.item.raw_original}"
            </p>
          )}
        </div>

        {/* Badge de confianza */}
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 flex-shrink-0 ${config.badge}`}>
          {config.icon}
          {config.badgeText}
          {item.confidence_score > 0 && ` ${item.confidence_score}%`}
        </span>
      </div>

      {/* Texto original */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Original: "{item.item.raw_original}"
      </p>

      {/* Controles de cantidad y precio */}
      {item.product && (
        <div className="flex items-center justify-between">
          {/* Selector de cantidad */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onQtyChange(index, -1)}
              className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <Minus size={12} />
            </button>
            <span className="text-sm font-semibold text-gray-900 dark:text-white w-8 text-center">
              {item.qty}
            </span>
            <button
              onClick={() => onQtyChange(index, 1)}
              className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <Plus size={12} />
            </button>
            <span className="text-xs text-gray-400">{item.product.unit}</span>
          </div>

          {/* Precios */}
          <div className="text-right">
            <p className="text-xs text-gray-500">
              ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Alternativas para MED/LOW */}
      {item.alternatives.length > 0 && item.confidence !== 'HIGH' && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">Alternativas sugeridas:</p>
          <div className="flex flex-wrap gap-2">
            {item.alternatives.slice(0, 3).map((alt) => (
              <button
                key={alt.id}
                onClick={() => onSelectAlternative(index, alt, item.item.raw_original)}
                className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-cyan-400 hover:text-cyan-600 transition-colors truncate max-w-[150px]"
                title={alt.description}
              >
                {alt.description.length > 25
                  ? alt.description.slice(0, 25) + '…'
                  : alt.description}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Botón buscar manualmente para NONE */}
      {item.confidence === 'NONE' && (
        <div className="mt-3">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 hover:border-cyan-400 hover:text-cyan-500 transition-colors w-full justify-center">
            <Search size={14} />
            Buscar producto manualmente
          </button>
        </div>
      )}
    </div>
  )
}
