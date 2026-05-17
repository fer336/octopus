/**
 * Modal selector de clientes con búsqueda.
 * Reutilizable para cualquier pantalla que necesite elegir un cliente.
 *
 * Props:
 * - isOpen / onClose: control de visibilidad
 * - clients: lista de clientes a filtrar
 * - onSelect: callback al seleccionar un cliente
 * - onCreateNew: callback opcional para crear un cliente nuevo (muestra botón en vacío)
 * - title: título del modal (default: "Seleccionar Cliente")
 */
import { useEffect, useMemo, useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { Modal, Button } from '../ui'
import { getTaxConditionLabel } from '../../types'

export interface ClientSelectorClient {
  id: string
  name: string
  document_type: string
  document_number: string
  tax_condition: string
  phone?: string | null
}

interface ClientSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  clients: ClientSelectorClient[]
  onSelect: (client: ClientSelectorClient) => void
  searchClients?: (query: string) => Promise<ClientSelectorClient[]>
  onCreateNew?: () => void
  title?: string
}

export default function ClientSelectorModal({
  isOpen,
  onClose,
  clients,
  onSelect,
  searchClients,
  onCreateNew,
  title = 'Seleccionar Cliente',
}: ClientSelectorModalProps) {
  const [search, setSearch] = useState('')
  const [remoteClients, setRemoteClients] = useState<ClientSelectorClient[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!isOpen || !searchClients || search.trim().length < 2) {
      setRemoteClients([])
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)
    const timeoutId = window.setTimeout(() => {
      searchClients(search.trim())
        .then((results) => {
          if (!cancelled) setRemoteClients(results)
        })
        .catch(() => {
          if (!cancelled) setRemoteClients([])
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isOpen, search, searchClients])

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients
    const q = search.toLowerCase()
    const localMatches = clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.document_number.toLowerCase().includes(q),
    )
    const options = new Map<string, ClientSelectorClient>()
    localMatches.forEach((client) => options.set(client.id, client))
    remoteClients.forEach((client) => options.set(client.id, client))
    return Array.from(options.values())
  }, [clients, remoteClients, search])

  const handleSelect = (client: ClientSelectorClient) => {
    setSearch('')
    onSelect(client)
  }

  const handleCreateNew = () => {
    setSearch('')
    onCreateNew?.()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o documento..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
        </div>

        <div className="max-h-96 overflow-y-auto border rounded-lg dark:border-gray-600">
          {isSearching ? (
            <div className="text-center py-8 text-gray-500">
              <p>Buscando clientes...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No se encontraron clientes</p>
              {onCreateNew && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleCreateNew}
                >
                  <Plus size={16} className="mr-2" />
                  Crear Nuevo Cliente
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y dark:divide-gray-700">
              {filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => handleSelect(client)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {client.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {client.document_type}: {client.document_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-primary-600 dark:text-primary-400">
                        {getTaxConditionLabel(client.tax_condition)}
                      </p>
                      {client.phone && (
                        <p className="text-xs text-gray-500">{client.phone}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
