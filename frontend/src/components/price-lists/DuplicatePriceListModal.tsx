import { useState } from 'react'
import { Button, Input, Modal } from '../../components/ui'

interface Props {
  isOpen: boolean
  originalName: string
  onClose: () => void
  onConfirm: (name: string, validFrom: string, validUntil: string) => void
  isPending: boolean
}

export default function DuplicatePriceListModal({ isOpen, originalName, onClose, onConfirm, isPending }: Props) {
  const [name, setName] = useState(`Copia de ${originalName}`)
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')

  const handleSubmit = () => {
    if (!name.trim()) return
    onConfirm(name.trim(), validFrom, validUntil)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Duplicar lista" size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nombre de la nueva lista <span className="text-red-500">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Vigencia desde
            </label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Vigencia hasta
            </label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Se copia la lista como borrador con versión incrementada. La lista original no se modifica.
        </p>
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} isLoading={isPending} disabled={!name.trim()}>
            Duplicar lista
          </Button>
        </div>
      </div>
    </Modal>
  )
}
