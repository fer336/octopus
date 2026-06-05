/**
 * Modal for mapping Excel columns to canonical product fields before import.
 * Shows detected columns with sample values and lets the user assign each
 * to a product field (or ignore it). Validates that the three required fields
 * (code, description, list_price) are assigned before allowing continuation.
 */
import { useState, useMemo } from 'react'
import { AlertTriangle, Columns3 } from 'lucide-react'
import { Button, Modal } from '../ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MappableField {
  id: string
  label: string
  required?: true
}

const MAPPABLE_FIELDS: MappableField[] = [
  // Required
  { id: 'code', label: 'Código *', required: true },
  { id: 'description', label: 'Nombre *', required: true },
  { id: 'list_price', label: 'Precio Lista *', required: true },
  // Optional
  { id: 'supplier_code', label: 'Código Proveedor' },
  { id: 'bonificaciones', label: 'Bonificaciones (ej: 10+5+2)' },
  { id: 'extra_cost', label: 'Cargo Extra' },
  { id: 'profit_margin', label: 'Ganancia %' },
  { id: 'iva_rate', label: 'IVA %' },
  { id: 'current_stock', label: 'Stock' },
  { id: 'minimum_stock', label: 'Stock Mínimo' },
  { id: 'unit', label: 'Unidad' },
  { id: 'units_per_pack', label: 'Unidades x Pack' },
  { id: 'expiration_date', label: 'Vencimiento' },
  { id: 'category', label: 'Categoría (por nombre)' },
  { id: 'supplier', label: 'Proveedor (por nombre)' },
  { id: 'brand', label: 'Marca' },
  { id: 'cost_price', label: 'Precio Costo' },
  { id: 'details', label: 'Detalles' },
  { id: 'quantity_per_package', label: 'Cantidad por Compra' },
  { id: 'sell_per_unit', label: 'Fraccionado (venta por unidad)' },
]

const REQUIRED_FIELDS = new Set(['code', 'description', 'list_price'])

// Inference candidates — longest/most-specific first to avoid false positives
const INFERENCE_MAP: Record<string, string[]> = {
  code:           ['codigo', 'code', 'cod', 'sku'],
  description:    ['nombre', 'descripcion', 'description', 'producto', 'name'],
  list_price:     ['precio_lista', 'precio', 'price', 'lista', 'pvp'],
  supplier_code:  ['cod_proveedor', 'codigo_proveedor', 'prov'],
  category:       ['categoria', 'category', 'rubro'],
  supplier:       ['proveedor', 'supplier'],
  brand:          ['marca', 'brand'],
  unit:           ['unidad', 'unit', 'um'],
  current_stock:  ['stock', 'cantidad', 'qty', 'existencia'],
  iva_rate:       ['iva', 'impuesto', 'tax'],
  bonificaciones: ['bonif', 'descuento', 'discount', 'dto'],
  profit_margin:        ['ganancia', 'margen', 'margin'],
  quantity_per_package: ['cantidad_por_compra', 'cantidad_compra', 'cant_compra'],
  sell_per_unit:        ['fraccionado', 'fraccionar', 'venta_unitaria'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the first field id whose candidates match the normalised column name. */
function inferFieldId(column: string): string {
  const normalised = column.toLowerCase().replace(/\s+/g, '_')
  for (const [fieldId, candidates] of Object.entries(INFERENCE_MAP)) {
    if (candidates.some((c) => normalised.includes(c))) {
      return fieldId
    }
  }
  return ''
}

/** Builds the initial mapping from column names using inference. */
function buildInitialMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const usedFields = new Set<string>()
  for (const col of columns) {
    const fieldId = inferFieldId(col)
    if (fieldId && !usedFields.has(fieldId)) {
      mapping[col] = fieldId
      usedFields.add(fieldId)
    } else {
      mapping[col] = ''
    }
  }
  return mapping
}

// ---------------------------------------------------------------------------
// Sub-component: row badge pill
// ---------------------------------------------------------------------------

function ColumnPill({ column, fieldId }: { column: string; fieldId: string }) {
  const isRequired = REQUIRED_FIELDS.has(fieldId)
  const isMapped = fieldId !== ''

  let pillClass = 'rounded-full px-3 py-1 text-xs font-bold '
  if (!isMapped) {
    pillClass += 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
  } else if (isRequired) {
    pillClass += 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
  } else {
    pillClass += 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
  }

  return <span className={pillClass}>{column}</span>
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ColumnMapperModalProps {
  file: File
  columns: string[]
  sampleRows: (string | null)[][]
  onConfirm: (columnMapping: Record<string, string>) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ColumnMapperModal({
  columns,
  sampleRows,
  onConfirm,
  onCancel,
}: ColumnMapperModalProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => buildInitialMapping(columns))
  const [showValidation, setShowValidation] = useState(false)

  // Set of currently assigned field ids (for duplicate detection)
  const assignedFields = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean)),
    [mapping]
  )

  // Missing required fields
  const missingRequired = useMemo(
    () => [...REQUIRED_FIELDS].filter((f) => !assignedFields.has(f)),
    [assignedFields]
  )

  const isValid = missingRequired.length === 0

  const handleFieldChange = (column: string, newFieldId: string) => {
    setMapping((prev) => {
      const next = { ...prev }
      // Replace semantics: if another column already has this field, clear it
      if (newFieldId) {
        for (const [col, fid] of Object.entries(next)) {
          if (fid === newFieldId && col !== column) {
            next[col] = ''
          }
        }
      }
      next[column] = newFieldId
      return next
    })
  }

  const handleConfirm = () => {
    if (!isValid) {
      setShowValidation(true)
      return
    }
    // Build output: only non-ignored mappings
    const result: Record<string, string> = {}
    for (const [col, fieldId] of Object.entries(mapping)) {
      if (fieldId) result[col] = fieldId
    }
    onConfirm(result)
  }

  // Column index → array of up to 3 sample values
  const samplesByColumn: Record<string, (string | null)[]> = useMemo(() => {
    const out: Record<string, (string | null)[]> = {}
    for (let ci = 0; ci < columns.length; ci++) {
      out[columns[ci]] = sampleRows.slice(0, 3).map((row) => row[ci] ?? null)
    }
    return out
  }, [columns, sampleRows])

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title="Mapear columnas del Excel"
      size="lg"
    >
      {/* Header info */}
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary-50 px-4 py-3 dark:bg-primary-950/30">
        <Columns3 className="h-5 w-5 flex-shrink-0 text-primary-600 dark:text-primary-300" />
        <p className="text-sm text-primary-800 dark:text-primary-100">
          Asigná cada columna del Excel a un campo del producto. Los campos marcados con{' '}
          <span className="font-bold">*</span> son obligatorios.
        </p>
      </div>

      {/* Validation banner */}
      {showValidation && !isValid && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Faltan asignar los campos obligatorios:{' '}
            <strong>
              {missingRequired
                .map((f) => MAPPABLE_FIELDS.find((mf) => mf.id === f)?.label ?? f)
                .join(', ')}
            </strong>
          </span>
        </div>
      )}

      {/* Mapping table */}
      <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Columna Excel
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Valores de muestra
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Campo del producto
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {columns.map((col) => {
              const fieldId = mapping[col] ?? ''
              const isRequired = REQUIRED_FIELDS.has(fieldId)
              const isMapped = fieldId !== ''

              let rowBg = ''
              if (!isMapped) {
                rowBg = ''
              } else if (isRequired) {
                rowBg = 'bg-green-50 dark:bg-green-950/20'
              } else {
                rowBg = 'bg-blue-50 dark:bg-blue-950/20'
              }

              const samples = samplesByColumn[col] ?? []

              return (
                <tr key={col} className={rowBg}>
                  {/* Column name pill */}
                  <td className="px-4 py-3 align-top">
                    <ColumnPill column={col} fieldId={fieldId} />
                  </td>

                  {/* Sample values */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-0.5">
                      {samples.length === 0 ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                      ) : (
                        samples.map((v, i) => (
                          <span
                            key={i}
                            className="max-w-[160px] truncate text-xs text-gray-500 dark:text-gray-400"
                          >
                            {v === null || v === '' ? '—' : v}
                          </span>
                        ))
                      )}
                    </div>
                  </td>

                  {/* Field selector */}
                  <td className="px-4 py-3 align-top">
                    <select
                      value={fieldId}
                      onChange={(e) => handleFieldChange(col, e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:border-primary-400"
                    >
                      <option value="">— Ignorar —</option>
                      {MAPPABLE_FIELDS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Required field status */}
        <div className="flex flex-wrap gap-2">
          {(['code', 'description', 'list_price'] as const).map((fid) => {
            const mapped = assignedFields.has(fid)
            const label = MAPPABLE_FIELDS.find((f) => f.id === fid)?.label ?? fid
            return (
              <span
                key={fid}
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  mapped
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200'
                    : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                }`}
              >
                {mapped ? '✓' : '✗'} {label}
              </span>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3 sm:flex-row-reverse">
          <Button
            onClick={handleConfirm}
            disabled={showValidation && !isValid}
            className="bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800"
          >
            Continuar
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
