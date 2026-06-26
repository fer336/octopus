import { useState } from 'react'
import { Button, Input, Modal } from '../../components/ui'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: (percent: number) => void
  isPending: boolean
}

export default function BulkAdjustModal({ isOpen, onClose, onConfirm, isPending }: Props) {
  const [percent, setPercent] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    const val = parseFloat(percent)
    if (isNaN(val) || val < 0 || val > 1000) {
      setError('Ingresá un porcentaje válido entre 0 y 1000')
      return
    }
    setError('')
    onConfirm(val)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Aplicar aumento general" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Aumenta el precio base de todos los ítems de esta lista por el porcentaje indicado.
        </p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Porcentaje de aumento <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              max="1000"
              step="0.5"
              value={percent}
              onChange={(e) => { setPercent(e.target.value); setError('') }}
              placeholder="Ej: 15"
              autoFocus
            />
          </div>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} isLoading={isPending} disabled={!percent}>
            Aplicar aumento
          </Button>
        </div>
      </div>
    </Modal>
  )
}
