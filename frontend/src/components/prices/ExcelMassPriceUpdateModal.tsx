/**
 * Modal de actualización masiva de precios por Excel de proveedor.
 * Permite detectar columnas, mapear código/precio, previsualizar impacto y aplicar con progreso real.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Columns3, FileSpreadsheet, Loader2, RefreshCw, UploadCloud, X } from 'lucide-react'
import toast from 'react-hot-toast'
import productsService from '../../api/productsService'
import priceUpdateService, {
  ExcelColumnPreviewResponse,
  ExcelPriceUpdatePreviewItem,
  ExcelPriceUpdatePreviewResponse,
} from '../../api/priceUpdateService'
import { Button, ConfirmModal } from '../ui'

interface ExcelMassPriceUpdateModalProps {
  isOpen: boolean
  onClose: () => void
  onCompleted: () => void | Promise<void>
}

const formatMoney = (value?: number | null) => `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const inferColumn = (columns: string[], candidates: string[]) => {
  const normalized = columns.map((column) => ({ raw: column, value: column.toLowerCase().replace(/\s+/g, '_') }))
  return normalized.find((column) => candidates.some((candidate) => column.value.includes(candidate)))?.raw || ''
}

export default function ExcelMassPriceUpdateModal({ isOpen, onClose, onCompleted }: ExcelMassPriceUpdateModalProps) {
  const [filePreview, setFilePreview] = useState<ExcelColumnPreviewResponse | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [codeColumn, setCodeColumn] = useState('')
  const [priceColumn, setPriceColumn] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [preview, setPreview] = useState<ExcelPriceUpdatePreviewResponse | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [progressValue, setProgressValue] = useState(0)
  const [progressLabel, setProgressLabel] = useState('Esperando confirmación')
  const [summary, setSummary] = useState<{ updated: number; errors: string[] } | null>(null)

  const matchedItems = useMemo(
    () => preview?.items.filter((item) => item.status === 'matched' && item.product_id && item.imported_list_price) ?? [],
    [preview]
  )

  if (!isOpen) return null

  const resetAndClose = () => {
    setFilePreview(null)
    setSelectedFileName('')
    setCodeColumn('')
    setPriceColumn('')
    setSupplierName('')
    setPreview(null)
    setSummary(null)
    setProgressValue(0)
    setProgressLabel('Esperando confirmación')
    setConfirmOpen(false)
    onClose()
  }

  const handleFileSelected = async (file?: File) => {
    if (!file) return

    setIsReading(true)
    setPreview(null)
    setSummary(null)
    try {
      const result = await priceUpdateService.previewExcelColumns(file)
      setFilePreview(result)
      setSelectedFileName(result.file_name)
      setCodeColumn(inferColumn(result.columns, ['codigo_proveedor', 'cod_proveedor', 'proveedor', 'codigo', 'code']))
      setPriceColumn(inferColumn(result.columns, ['precio_lista', 'precio', 'lista', 'price']))
      toast.success(`Excel leído: ${result.total_rows} filas detectadas`, { icon: '📄' })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'No se pudo leer el Excel')
    } finally {
      setIsReading(false)
    }
  }

  const handlePreview = async () => {
    if (!filePreview || !codeColumn || !priceColumn) {
      toast.error('Mapeá al menos la columna de código y la de precio')
      return
    }

    setIsPreviewing(true)
    setSummary(null)
    try {
      const result = await priceUpdateService.previewExcelMapping({
        rows: filePreview.rows,
        code_column: codeColumn,
        price_column: priceColumn,
        supplier_name: supplierName || undefined,
      })
      setPreview(result)
      toast.success(`${result.matched_count} productos encontrados para actualizar`, { icon: '🔎' })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'No se pudo generar la vista previa')
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleApply = async () => {
    setConfirmOpen(false)
    setIsApplying(true)
    setProgressValue(0)
    setProgressLabel('Iniciando actualización')

    const errors: string[] = []
    let updated = 0

    for (let index = 0; index < matchedItems.length; index += 1) {
      const item = matchedItems[index]
      setProgressLabel(`Actualizando ${item.product_code || item.supplier_code}`)

      try {
        await productsService.update(item.product_id!, { list_price: Number(item.imported_list_price) })
        updated += 1
      } catch (error: any) {
        errors.push(`${item.supplier_code}: ${error.response?.data?.detail || error.message}`)
      }

      setProgressValue(Math.round(((index + 1) / matchedItems.length) * 100))
    }

    setProgressLabel('Actualización finalizada')
    setSummary({ updated, errors })
    setIsApplying(false)
    await onCompleted()
  }

  const renderSampleValue = (row: Record<string, any>, column: string) => {
    const value = row[column]
    if (value === null || value === undefined || value === '') return '—'
    return String(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-primary-200 bg-white shadow-2xl dark:border-primary-900/60 dark:bg-gray-900">
        <div className="bg-gradient-to-r from-primary-700 via-primary-600 to-primary-500 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <RefreshCw className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/70">Actualización masiva</p>
                <h3 className="mt-1 text-2xl font-black">Precios por Excel de proveedor</h3>
                <p className="mt-1 max-w-2xl text-sm text-white/80">Mapeá código y precio, revisá el impacto y aplicá cambios con progreso producto a producto.</p>
              </div>
            </div>
            <button onClick={resetAndClose} className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-primary-50/40 px-6 py-5 dark:bg-gray-950/40">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
            <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm dark:border-primary-900/60 dark:bg-gray-900">
              <div className="mb-3 flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                <h4 className="font-black text-gray-900 dark:text-white">1. Subir Excel</h4>
              </div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50 px-4 py-8 text-center transition hover:border-primary-500 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/30 dark:hover:bg-primary-900/40">
                {isReading ? <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary-600" /> : <FileSpreadsheet className="mb-3 h-9 w-9 text-primary-600" />}
                <span className="text-sm font-bold text-primary-800 dark:text-primary-100">{selectedFileName || 'Seleccionar archivo .xlsx / .xls'}</span>
                <span className="mt-1 text-xs text-primary-700/70 dark:text-primary-200/70">Detectamos columnas automáticamente, vos decidís el mapeo.</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => void handleFileSelected(event.target.files?.[0])} />
              </label>
            </div>

            <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm dark:border-primary-900/60 dark:bg-gray-900">
              <div className="mb-3 flex items-center gap-2">
                <Columns3 className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                <h4 className="font-black text-gray-900 dark:text-white">2. Mapear columnas</h4>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Código proveedor *</label>
                  <select value={codeColumn} onChange={(e) => setCodeColumn(e.target.value)} className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-primary-800 dark:bg-gray-950 dark:text-white">
                    <option value="">Seleccionar</option>
                    {filePreview?.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Precio base *</label>
                  <select value={priceColumn} onChange={(e) => setPriceColumn(e.target.value)} className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-primary-800 dark:bg-gray-950 dark:text-white">
                    <option value="">Seleccionar</option>
                    {filePreview?.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Proveedor detectado</label>
                  <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Ej: FV" className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-primary-800 dark:bg-gray-950 dark:text-white" />
                </div>
              </div>
              <Button onClick={handlePreview} disabled={!filePreview || isPreviewing} className="mt-4 w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800">
                {isPreviewing ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cruzando productos...</span> : 'Generar vista previa'}
              </Button>
            </div>
          </div>

          {filePreview && (
            <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm dark:border-primary-900/60 dark:bg-gray-900">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="font-black text-gray-900 dark:text-white">Columnas detectadas</h4>
                <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">{filePreview.total_rows} filas</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="min-w-full divide-y divide-gray-200 text-xs dark:divide-gray-800">
                  <thead className="bg-primary-50 text-primary-800 dark:bg-primary-950/40 dark:text-primary-200">
                    <tr>{filePreview.columns.map((column) => <th key={column} className="px-3 py-2 text-left font-black">{column}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                    {filePreview.sample_rows.map((row, index) => (
                      <tr key={index}>{filePreview.columns.map((column) => <td key={column} className="max-w-[180px] truncate px-3 py-2 text-gray-600 dark:text-gray-300">{renderSampleValue(row, column)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview && (
            <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm dark:border-primary-900/60 dark:bg-gray-900">
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-primary-50 p-3 dark:bg-primary-950/30"><p className="text-xs font-bold uppercase text-primary-600">Proveedor</p><p className="text-xl font-black text-primary-900 dark:text-primary-100">{preview.supplier_name || 'No indicado'}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/20"><p className="text-xs font-bold uppercase text-emerald-600">Afectados</p><p className="text-xl font-black text-emerald-700">{preview.matched_count}</p></div>
                <div className="rounded-xl bg-red-50 p-3 dark:bg-red-950/20"><p className="text-xs font-bold uppercase text-red-600">Errores</p><p className="text-xl font-black text-red-700">{preview.error_count}</p></div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><p className="text-xs font-bold uppercase text-gray-500">Total Excel</p><p className="text-xl font-black text-gray-900 dark:text-white">{preview.total_rows}</p></div>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="min-w-full divide-y divide-gray-200 text-xs dark:divide-gray-800">
                  <thead className="sticky top-0 bg-gray-50 text-gray-600 dark:bg-gray-950 dark:text-gray-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Lista actual</th>
                      <th className="px-3 py-2 text-right">Lista Excel</th>
                      <th className="px-3 py-2 text-right">Venta nueva</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.items.slice(0, 120).map((item: ExcelPriceUpdatePreviewItem) => (
                      <tr key={`${item.row_number}-${item.supplier_code}`} className={item.status === 'matched' ? '' : 'bg-red-50/60 dark:bg-red-950/10'}>
                        <td className="px-3 py-2 font-bold text-gray-900 dark:text-white">{item.supplier_code || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{item.description || item.error_message}</td>
                        <td className="px-3 py-2 text-right">{item.current_list_price ? formatMoney(item.current_list_price) : '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-primary-700 dark:text-primary-300">{item.imported_list_price ? formatMoney(item.imported_list_price) : '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-700">{item.new_sale_price ? formatMoney(item.new_sale_price) : '—'}</td>
                        <td className="px-3 py-2">{item.status === 'matched' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700"><CheckCircle2 size={12} /> OK</span> : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700"><AlertTriangle size={12} /> Revisar</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isApplying && (
                <div className="mt-4 rounded-2xl bg-primary-50 p-4 dark:bg-primary-950/30">
                  <div className="mb-2 flex items-center justify-between text-sm font-bold text-primary-800 dark:text-primary-100"><span>{progressLabel}</span><span>{progressValue}%</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-950"><div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-700 transition-all" style={{ width: `${progressValue}%` }} /></div>
                </div>
              )}

              {summary && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                  <p className="font-black">Resumen: {summary.updated} productos actualizados correctamente · {summary.errors.length} errores</p>
                  {summary.errors.length > 0 && <p className="mt-1 text-xs">Primer error: {summary.errors[0]}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-primary-100 bg-white px-6 py-4 dark:border-primary-900/60 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" onClick={resetAndClose} disabled={isApplying}>Cancelar</Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={matchedItems.length === 0 || isApplying} className="bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800">
            Confirmar actualización ({matchedItems.length})
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleApply()}
        title="Confirmar actualización masiva"
        description="Vas a actualizar precios de productos existentes usando el Excel importado. Esta acción impacta la base de datos."
        confirmText="Confirmar"
        cancelText="Cancelar"
        variant="info"
      >
        <div className="mb-5 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-left dark:border-primary-800 dark:bg-primary-900/20">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-600 dark:text-primary-300">Productos afectados</p>
          <p className="mt-1 text-3xl font-black text-primary-800 dark:text-primary-100">{matchedItems.length}</p>
          <p className="mt-1 text-xs text-primary-700/80 dark:text-primary-200/80">Proveedor: {supplierName || preview?.supplier_name || 'No indicado'}</p>
        </div>
      </ConfirmModal>
    </div>
  )
}
