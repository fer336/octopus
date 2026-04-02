/**
 * Hooks de métodos de pago.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import paymentMethodsService, {
  type PaymentMethodCreate,
  type PaymentMethodUpdate,
} from '../api/paymentMethodsService'

const QUERY_KEY = 'payment-methods'

export function usePaymentMethods(activeOnly = true) {
  return useQuery({
    queryKey: [QUERY_KEY, { activeOnly }],
    queryFn: () => paymentMethodsService.getAll({ active_only: activeOnly }),
    staleTime: 30_000,
  })
}

export function useCreatePaymentMethod() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: PaymentMethodCreate) => paymentMethodsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['vouchers-payment-methods'] })
    },
  })
}

export function useUpdatePaymentMethod() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PaymentMethodUpdate }) =>
      paymentMethodsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['vouchers-payment-methods'] })
    },
  })
}

export function useUpdatePaymentMethodStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      paymentMethodsService.updateStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['vouchers-payment-methods'] })
    },
  })
}
