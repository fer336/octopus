import { useState } from 'react'
import { ChevronDown, ChevronUp, HelpCircle, CheckCircle2 } from 'lucide-react'

const STEPS = [
  {
    n: 1,
    label: 'Seleccioná un titular',
    detail:
      'Elegí un cliente del panel izquierdo. Solo aparecen los que tienen Cuenta Corriente habilitada.',
  },
  {
    n: 2,
    label: 'Marcá los remitos',
    detail:
      'Usá los checkboxes de la tabla para seleccionar los remitos a incluir. El checkbox del encabezado selecciona todos.',
  },
  {
    n: 3,
    label: 'Revisá el resumen (opcional)',
    detail:
      'La pestaña "Resumen" muestra el detalle de productos. Podés ajustar cantidades antes de cerrar.',
  },
  {
    n: 4,
    label: 'Cerrá la cuenta',
    detail:
      'Desde la barra inferior usá "Cerrar" para los seleccionados o "Cerrar todo" para todos los pendientes. Se genera un comprobante pendiente de facturar.',
  },
]

export interface ClosureGuideProps {
  hasSelectedTitular: boolean
  hasSelectedReceipts: boolean
  alwaysOpen?: boolean
}

export default function ClosureGuide({
  hasSelectedTitular,
  hasSelectedReceipts,
  alwaysOpen = false,
}: ClosureGuideProps) {
  const [open, setOpen] = useState(alwaysOpen)

  const activeStep = !hasSelectedTitular ? 1 : !hasSelectedReceipts ? 2 : 4

  return (
    <div className={alwaysOpen ? '' : 'border-t border-primary-100 dark:border-primary-800/50'}>
      {!alwaysOpen && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors cursor-pointer"
        >
          <HelpCircle size={13} />
          <span className="font-medium">¿Cómo cerrar la cuenta?</span>
          {open ? (
            <ChevronUp size={13} className="ml-auto" />
          ) : (
            <ChevronDown size={13} className="ml-auto" />
          )}
        </button>
      )}

      {open && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 ${alwaysOpen ? '' : 'px-3 pb-3 pt-1'}`}>
          {STEPS.map((step) => {
            const done =
              (step.n === 1 && hasSelectedTitular) || (step.n === 2 && hasSelectedReceipts)
            const active = step.n === activeStep

            return (
              <div
                key={step.n}
                className={[
                  'rounded-lg p-2.5 border text-xs',
                  done
                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                    : active
                      ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
                ].join(' ')}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {done ? (
                    <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  ) : (
                    <span
                      className={[
                        'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                        active
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300',
                      ].join(' ')}
                    >
                      {step.n}
                    </span>
                  )}
                  <span
                    className={[
                      'font-semibold leading-tight',
                      done
                        ? 'text-green-700 dark:text-green-300'
                        : active
                          ? 'text-primary-700 dark:text-primary-300'
                          : 'text-gray-600 dark:text-gray-400',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                </div>
                <p
                  className={[
                    'leading-relaxed',
                    done
                      ? 'text-green-600 dark:text-green-400'
                      : active
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-500 dark:text-gray-500',
                  ].join(' ')}
                >
                  {step.detail}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
