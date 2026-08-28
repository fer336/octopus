/**
 * Modal de carga de Factura de Compra por IA.
 * Sube un PDF, la IA extrae los datos y crea un borrador (`source=ai`) que
 * el usuario siempre revisa/edita antes de confirmar — la IA nunca escribe
 * stock/precio directamente.
 */
import { useRef, useState } from 'react'
import axios from 'axios'
import { Sparkles, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Modal } from '../ui'
import purchaseInvoicesService, { PurchaseInvoice } from '../../api/purchaseInvoicesService'

interface Props {
  onClose: () => void
  onExtracted: (invoice: PurchaseInvoice) => void
}

export default function PurchaseInvoiceAIUploadModal({ onClose, onExtracted }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExtract = async () => {
    if (!file) return
    setIsExtracting(true)
    try {
      const invoice = await purchaseInvoicesService.aiExtract(file)
      toast.success('Factura extraída. Revisá los datos antes de confirmar.')
      onExtracted(invoice)
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      toast.error(typeof detail === 'string' ? detail : 'No se pudo extraer la factura del PDF')
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Cargar Factura por IA" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg px-3 py-2.5">
          <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
          <p className="text-sm text-violet-700 dark:text-violet-300">
            Subí el PDF de la factura del proveedor. La IA extrae los datos y crea un borrador
            editable — vos revisás y confirmás antes de que impacte stock o precios.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isExtracting}
          className="w-full flex items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {file ? file.name : 'Seleccionar PDF de la factura'}
        </button>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={isExtracting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={!file || isExtracting}
            isLoading={isExtracting}
            onClick={handleExtract}
          >
            Extraer con IA
          </Button>
        </div>
      </div>
    </Modal>
  )
}
