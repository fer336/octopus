import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Modal, Button, Input } from '../ui'
import meliService from '../../api/meliService'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  productId?: string
  onSuccess: () => void
}

export default function LinkListingModal({ isOpen, onClose, productId, onSuccess }: Props) {
  const [selectedProductId] = useState(productId ?? '')
  const [meliItemId, setMeliItemId] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const itemId = meliItemId.trim().toUpperCase().replace(/^.*?(MLA\d+).*$/i, '$1')
    if (!itemId.match(/^MLA\d+$/i)) {
      toast.error('Ingresá un MLA válido (ej: MLA1234567890)')
      return
    }
    if (!selectedProductId) {
      toast.error('Seleccioná un producto')
      return
    }
    setLoading(true)
    try {
      await meliService.linkListing({ product_id: selectedProductId, meli_item_id: itemId })
      toast.success('Publicación vinculada correctamente')
      onSuccess()
      onClose()
      setMeliItemId('')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Error al vincular la publicación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Vincular publicación existente" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="flex items-start gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800">
          <Link2 size={16} className="text-primary-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed">
            Vinculá un ítem de Mercado Libre ya existente con un producto local. OctopusTrack verificará que el ítem pertenezca a tu cuenta conectada.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#7b6b95] mb-1.5">
            MLA o URL de la publicación
          </label>
          <Input
            value={meliItemId}
            onChange={(e) => setMeliItemId(e.target.value)}
            placeholder="MLA1234567890 o https://articulo.mercadolibre.com.ar/..."
            required
          />
          <p className="text-xs text-gray-400 mt-1">Podés pegar la URL completa o solo el código MLA.</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" isLoading={loading}>
            Vincular
          </Button>
        </div>
      </form>
    </Modal>
  )
}
