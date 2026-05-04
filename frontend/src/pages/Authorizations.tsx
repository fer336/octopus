/**
 * Página de Autorizaciones Pendientes.
 * Panel para que managers/owners aprueben o rechacen solicitudes de eliminación de devoluciones.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, Check, X, FileText, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import vouchersService from '../api/vouchersService'
import { Button, ConfirmModal, Input } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'

interface AuthorizationItem {
  id: string
  requested_by_user_id: string
  authorization_type: string
  resource_id: string
  reason: string
  created_at: string | null
}

export default function Authorizations() {
  const queryClient = useQueryClient()
  const [selectedAuth, setSelectedAuth] = useState<AuthorizationItem | null>(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectReasonError, setRejectReasonError] = useState('')

  // Query para obtener autorizaciones pendientes
  const { data, isLoading, error } = useQuery({
    queryKey: ['pending-authorizations'],
    queryFn: () => vouchersService.getPendingAuthorizations(),
    refetchInterval: 30000,
    retry: false,
  })

  // Mutation para aprobar
  const approveMutation = useMutation({
    mutationFn: (authorizationId: string) =>
      vouchersService.approveAuthorization(authorizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-authorizations'] })
      queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      toast.success('Autorización aprobada y comprobante eliminado', { icon: '✅' })
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Mutation para rechazar
  const rejectMutation = useMutation({
    mutationFn: ({ authorizationId, reason }: { authorizationId: string; reason: string }) =>
      vouchersService.rejectAuthorization(authorizationId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-authorizations'] })
      toast.success('Solicitud rechazada', { icon: '✅' })
      setShowRejectModal(false)
      setSelectedAuth(null)
      setRejectReason('')
      setRejectReasonError('')
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const handleApprove = (auth: AuthorizationItem) => {
    approveMutation.mutate(auth.id)
  }

  const handleOpenReject = (auth: AuthorizationItem) => {
    setSelectedAuth(auth)
    setShowRejectModal(true)
    setRejectReason('')
    setRejectReasonError('')
  }

  const handleConfirmReject = () => {
    if (!rejectReason.trim()) {
      setRejectReasonError('El motivo del rechazo es obligatorio.')
      return
    }
    if (!selectedAuth) return

    rejectMutation.mutate({
      authorizationId: selectedAuth.id,
      reason: rejectReason.trim(),
    })
  }

  const authorizations = data?.items || []
  const isEmpty = authorizations.length === 0 && !isLoading
  const isAuthenticatedError = error?.message?.includes('403')

  return (
    <div className="w-full max-w-none space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gradient-to-r from-amber-50 to-amber-50 dark:from-amber-900/20 dark:to-amber-900/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
        <div>
          <h1 className="text-xl font-bold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Autorizaciones Pendientes
          </h1>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Solicitudes de eliminación de devoluciones que requieren tu aprobación.
          </p>
        </div>
        <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">
          {authorizations.length} pendiente{authorizations.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Mensaje de error de permisos */}
      {isAuthenticatedError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-700 dark:text-red-300">
            No tenés permiso para ver esta página. Solo los usuarios con rol Owner o Manager pueden acceder.
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      )}

      {/* Vacío */}
      {isEmpty && !error && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <ShieldAlert className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No hay autorizaciones pendientes
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Las solicitudes de eliminación de devoluciones aparecerán aquí cuando requieran aprobación.
          </p>
        </div>
      )}

      {/* Lista de autorizaciones */}
      {!isLoading && !isAuthenticatedError && authorizations.length > 0 && (
        <div className="grid gap-4">
          {authorizations.map((auth) => (
            <div
              key={auth.id}
              className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-800 dark:bg-gray-800"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <span className="font-mono font-medium text-gray-900 dark:text-white">
                      ID: {auth.resource_id.slice(0, 8)}...
                    </span>
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {auth.authorization_type === 'voucher_return_deletion'
                        ? 'Eliminación de devolución'
                        : auth.authorization_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                    <strong>Motivo:</strong> {auth.reason}
                  </p>
                  {auth.created_at && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Solicitado el:{' '}
                      {new Date(auth.created_at).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 sm:flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                    onClick={() => handleOpenReject(auth)}
                    disabled={rejectMutation.isPending}
                  >
                    <X size={16} className="mr-1" />
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(auth)}
                    disabled={approveMutation.isPending}
                  >
                    <Check size={16} className="mr-1" />
                    Aprobar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de rechazo */}
      <ConfirmModal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false)
          setSelectedAuth(null)
          setRejectReason('')
          setRejectReasonError('')
        }}
        title="Rechazar Solicitud"
        description=""
        onConfirm={handleConfirmReject}
        confirmText={rejectMutation.isPending ? 'Rechazando...' : 'Confirmar Rechazo'}
        variant="danger"
        isLoading={rejectMutation.isPending}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ¿Estás seguro de que deseas rechazar esta solicitud de autorización?
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Motivo del rechazo (obligatorio)
            </label>
            <Input
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value)
                if (rejectReasonError) setRejectReasonError('')
              }}
              placeholder="Ej: No corresponde eliminar esta devolución..."
              error={rejectReasonError}
            />
          </div>
        </div>
      </ConfirmModal>
    </div>
  )
}