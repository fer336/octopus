/**
 * Hook de caja.
 * Centraliza el estado de la caja activa y las mutaciones.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as cashService from '../api/cashService'
import type { AddMovementRequest, CloseCashRequest, OpenCashRequest } from '../types/cash'



const QUERY_KEY = 'cash-current'

/** Retorna la caja activa con polling cada 30 segundos para mantener is_expired actualizado. */
export function useCurrentCash() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: cashService.getCurrentCash,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

/** Abre una nueva caja. */
export function useOpenCash() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: OpenCashRequest) => cashService.openCash(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}

/** Cierra la caja activa. */
export function useCloseCash() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CloseCashRequest) => cashService.closeCash(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}

/** Agrega un movimiento manual (INCOME o EXPENSE). */
export function useAddMovement(cashRegisterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: AddMovementRequest) => cashService.addMovement(cashRegisterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}

/** Obtiene el resumen de totales de una caja. */
export function useCashSummary(cashRegisterId: string | undefined) {
  return useQuery({
    queryKey: ['cash-summary', cashRegisterId],
    queryFn: () => cashService.getCashSummary(cashRegisterId!),
    enabled: !!cashRegisterId,
    staleTime: 10_000,
  })
}

/** Retorna el historial de cajas cerradas. */
export function useCashHistory() {
  return useQuery({
    queryKey: ['cash-history'],
    queryFn: cashService.getCashHistory,
    staleTime: 60_000,
  })
}
