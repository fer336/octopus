import { useMemo, useState } from 'react'
import { Bug, Lightbulb, MessageSquarePlus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

import feedbackService, { FeedbackStatus, FeedbackType } from '../api/feedbackService'
import { Button, Input, Select, Table } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'Nuevo',
  reviewing: 'En revisión',
  planned: 'Planificado',
  done: 'Resuelto',
  rejected: 'Descartado',
}

export default function Feedback() {
  const queryClient = useQueryClient()
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-feedback'],
    queryFn: () => feedbackService.list(),
  })

  const createMutation = useMutation({
    mutationFn: feedbackService.create,
    onSuccess: () => {
      toast.success('Feedback enviado. ¡Gracias!')
      setTitle('')
      setDescription('')
      setFeedbackType('bug')
      queryClient.invalidateQueries({ queryKey: ['tenant-feedback'] })
    },
    onError: (error) => toast.error(formatErrorMessage(error)),
  })

  const columns = useMemo(
    () => [
      {
        key: 'feedback_type',
        header: 'Tipo',
        render: (item: any) => (
          <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
            {item.feedback_type === 'bug' ? 'Bug' : 'Funcionalidad'}
          </span>
        ),
      },
      { key: 'title', header: 'Título' },
      {
        key: 'status',
        header: 'Estado',
        render: (item: any) => (
          <span className="text-sm text-gray-700 dark:text-gray-200">
            {STATUS_LABEL[item.status as FeedbackStatus]}
          </span>
        ),
      },
      {
        key: 'created_at',
        header: 'Fecha',
        render: (item: any) => new Date(item.created_at).toLocaleDateString('es-AR'),
      },
    ],
    []
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (title.trim().length < 3) {
      toast.error('El título debe tener al menos 3 caracteres')
      return
    }

    if (description.trim().length < 10) {
      toast.error('La descripción debe tener al menos 10 caracteres')
      return
    }

    createMutation.mutate({
      feedback_type: feedbackType,
      title: title.trim(),
      description: description.trim(),
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquarePlus className="w-5 h-5 text-primary-600" />
          Bugs y mejoras
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Reportá errores o pedí funcionalidades. El equipo lo revisa desde CMS.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Select
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
              options={[
                { value: 'bug', label: '🐛 Bug reportado' },
                { value: 'feature', label: '💡 Nueva funcionalidad' },
              ]}
            />
          </div>

          <div className="md:col-span-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título corto"
            />
          </div>

          <div className="md:col-span-6">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Contanos el detalle, pasos para reproducir o qué te gustaría sumar..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="md:col-span-6 flex justify-end">
            <Button type="submit" isLoading={createMutation.isPending}>
              {feedbackType === 'bug' ? <Bug size={16} /> : <Lightbulb size={16} />}
              Enviar
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Mis reportes</h3>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-500">Cargando...</div>
        ) : (
          <Table columns={columns as any} data={data?.items || []} emptyMessage="Todavía no enviaste reportes." />
        )}
      </div>
    </div>
  )
}
