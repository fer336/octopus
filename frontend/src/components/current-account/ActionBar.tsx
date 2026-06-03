/**
 * ActionBar — sticky bottom bar for CC workspace.
 * Shows selection summary, notes input, preview and close buttons.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, XCircle, ShieldCheck, SlidersHorizontal, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../ui'
import vouchersService from '../../api/vouchersService'
import { formatErrorMessage } from '../../utils/errorHelpers'

export interface ActionBarProps {
  selectedCount: number
  selectedTotal: number
  titularId: string | null
  closureNotes: string
  onNotesChange: (notes: string) => void
  itemQuantityOverrides: Map<string, number>
  selectedReceiptIds: Set<string>
  onCloseSuccess: () => void
  onOpenPreview?: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
}

export default function ActionBar({
  selectedCount,
  selectedTotal,
  titularId,
  closureNotes,
  onNotesChange,
  itemQuantityOverrides,
  selectedReceiptIds,
  onCloseSuccess,
  onOpenPreview,
  onSaveDraft,
  isSavingDraft,
}: ActionBarProps) {
  const queryClient = useQueryClient()

  // Build item_quantity_overrides array for the API
  const buildOverridesPayload = () =>
    Array.from(itemQuantityOverrides.entries()).map(([voucher_item_id, quantity]) => ({
      voucher_item_id,
      quantity,
    }))

  const closeSelectedMutation = useMutation({
    mutationFn: () => {
      if (!titularId) throw new Error('No titular selected')
      return vouchersService.closeCurrentAccount({
        billing_client_id: titularId,
        receipt_ids: Array.from(selectedReceiptIds),
        close_all: false,
        notes: closureNotes.trim() || undefined,
        item_quantity_overrides: buildOverridesPayload(),
      })
    },
    onSuccess: (voucher) => {
      queryClient.invalidateQueries({ queryKey: ['current-account-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['current-account-history'] })
      queryClient.invalidateQueries({ queryKey: ['pending-quotations'] })
      toast.success(
        `Cierre generado: ${voucher.sale_point}-${voucher.number} (pendiente de facturar)`
      )
      onCloseSuccess()
    },
    onError: (error: unknown) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const closeAllMutation = useMutation({
    mutationFn: () => {
      if (!titularId) throw new Error('No titular selected')
      return vouchersService.closeCurrentAccount({
        billing_client_id: titularId,
        close_all: true,
        notes: closureNotes.trim() || undefined,
        item_quantity_overrides: buildOverridesPayload(),
      })
    },
    onSuccess: (voucher) => {
      queryClient.invalidateQueries({ queryKey: ['current-account-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['current-account-history'] })
      queryClient.invalidateQueries({ queryKey: ['pending-quotations'] })
      toast.success(
        `Cierre total generado: ${voucher.sale_point}-${voucher.number}`
      )
      onCloseSuccess()
    },
    onError: (error: unknown) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const handlePreview = async () => {
    if (!titularId) {
      toast.error('Seleccioná un titular primero')
      return
    }
    if (selectedCount === 0) {
      toast.error('Seleccioná al menos un remito para previsualizar')
      return
    }

    try {
      toast.loading('Generando PDF...', { id: 'preview-pdf' })
      const blob = await vouchersService.previewCurrentAccountClosePdf({
        billing_client_id: titularId,
        receipt_ids: Array.from(selectedReceiptIds),
        close_all: false,
        notes: closureNotes.trim() || undefined,
        item_quantity_overrides: buildOverridesPayload(),
      })
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')
      toast.success('PDF generado', { id: 'preview-pdf' })
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { detail?: unknown } } }
      const status = axiosError?.response?.status
      const detail = axiosError?.response?.data?.detail
      if (status === 400) {
        toast.error(
          typeof detail === 'string' ? detail : 'No hay remitos disponibles para previsualizar.',
          { id: 'preview-pdf' }
        )
      } else {
        toast.error(formatErrorMessage(error), { id: 'preview-pdf' })
      }
    }
  }

  const handleCloseSelected = () => {
    if (!titularId) {
      toast.error('Seleccioná un titular primero')
      return
    }
    if (selectedCount === 0) {
      toast.error('Seleccioná al menos un remito')
      return
    }
    closeSelectedMutation.mutate()
  }

  const handleCloseAll = () => {
    if (!titularId) {
      toast.error('Seleccioná un titular primero')
      return
    }
    closeAllMutation.mutate()
  }

  const isBusy = closeSelectedMutation.isPending || closeAllMutation.isPending

  return (
    <div className="sticky bottom-0 z-10 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 py-2 flex flex-wrap items-center gap-2">
      {/* Selection summary */}
      <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 mr-auto">
        <span className="font-semibold">
          {selectedCount} sel.
        </span>
        <span>
          Total:{' '}
          <strong className="font-mono">
            $
            {selectedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </strong>
        </span>
      </div>

      {/* Notes input */}
      <input
        type="text"
        value={closureNotes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Observaciones del cierre..."
        className="hidden sm:block w-48 px-2 py-1.5 text-xs border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
      />

      {/* Action buttons */}
      {onSaveDraft && titularId && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveDraft}
          isLoading={isSavingDraft}
          title="Guardar estado actual como borrador"
        >
          <Save size={14} className="mr-1" />
          Guardar borrador
        </Button>
      )}

      {onOpenPreview && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenPreview}
          disabled={selectedCount === 0 || !titularId}
          title="Ver resumen de la selección"
        >
          <SlidersHorizontal size={14} className="mr-1" />
          Ver selección
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handlePreview}
        disabled={selectedCount === 0 || !titularId}
        title="Vista previa PDF de los remitos seleccionados"
      >
        <Eye size={14} className="mr-1" />
        Preview
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleCloseSelected}
        isLoading={closeSelectedMutation.isPending}
        disabled={selectedCount === 0 || !titularId || isBusy}
        title="Cerrar los remitos seleccionados"
      >
        <XCircle size={14} className="mr-1" />
        Cerrar ({selectedCount})
      </Button>

      <Button
        size="sm"
        onClick={handleCloseAll}
        isLoading={closeAllMutation.isPending}
        disabled={!titularId || isBusy}
        title="Cerrar todos los remitos pendientes del titular"
      >
        <ShieldCheck size={14} className="mr-1" />
        Cerrar todo
      </Button>
    </div>
  )
}
