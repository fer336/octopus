import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Mail, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui'
import priceListsService from '../../api/priceListsService'
import { formatErrorMessage } from '../../utils/errorHelpers'

interface Props {
  priceListId: string
}

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: Phone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'manual', label: 'Manual', icon: MessageSquare },
]

export default function PriceListSendLogPanel({ priceListId }: Props) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['price-list-send-logs', priceListId],
    queryFn: () => priceListsService.getSendLogs(priceListId),
  })

  const logMutation = useMutation({
    mutationFn: ({ channel }: { channel: string }) =>
      priceListsService.createSendLog(priceListId, {
        channel,
        message_preview: message.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-send-logs', priceListId] })
      toast.success('Envío registrado', { duration: 3000 })
      setMessage('')
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Registrar envío</h3>
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Observación (opcional)</label>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ej: Enviada a cliente X por WA"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            size="sm"
            variant="outline"
            onClick={() => logMutation.mutate({ channel: key })}
            isLoading={logMutation.isPending}
          >
            <Icon size={13} className="mr-1" />
            {label}
          </Button>
        ))}
      </div>

      {logs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Historial de envíos</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {isLoading ? (
              <div className="h-8 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-gray-700 capitalize dark:text-gray-300">
                      {log.channel}
                    </span>
                    {log.message_preview && (
                      <p className="truncate text-xs text-gray-400">{log.message_preview}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(log.sent_at).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
