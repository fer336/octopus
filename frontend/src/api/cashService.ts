/**
 * Servicio de Caja.
 * Todas las llamadas HTTP al módulo de caja.
 */
import { httpClient } from './httpClient'
import type {
  AddMovementRequest,
  CashMovement,
  CashRegister,
  CashRegisterSummary,
  CashSummary,
  CloseCashRequest,
  OpenCashRequest,
} from '../types/cash'

/** Retorna la caja activa del día, o null si no hay. */
export async function getCurrentCash(): Promise<CashRegister | null> {
  const { data } = await httpClient.get<CashRegister | null>('/cash/current')
  return data
}

/** Abre una nueva caja. */
export async function openCash(payload: OpenCashRequest): Promise<CashRegister> {
  const { data } = await httpClient.post<CashRegister>('/cash/open', payload)
  return data
}

/** Cierra la caja activa. */
export async function closeCash(payload: CloseCashRequest): Promise<CashRegister> {
  const { data } = await httpClient.post<CashRegister>('/cash/close', payload)
  return data
}

/** Lista los movimientos de una caja específica. */
export async function getMovements(cashRegisterId: string): Promise<CashMovement[]> {
  const { data } = await httpClient.get<CashMovement[]>(`/cash/${cashRegisterId}/movements`)
  return data
}

/** Registra un movimiento manual (INCOME o EXPENSE). */
export async function addMovement(
  cashRegisterId: string,
  payload: AddMovementRequest
): Promise<CashMovement> {
  const { data } = await httpClient.post<CashMovement>(
    `/cash/${cashRegisterId}/movements`,
    payload
  )
  return data
}

/** Obtiene el resumen de totales por método de pago. */
export async function getCashSummary(cashRegisterId: string): Promise<CashSummary> {
  const { data } = await httpClient.get<CashSummary>(`/cash/${cashRegisterId}/summary`)
  return data
}

/** Retorna el historial de cajas cerradas (últimas 30). */
export async function getCashHistory(): Promise<CashRegisterSummary[]> {
  const { data } = await httpClient.get<CashRegisterSummary[]>('/cash/history')
  return data
}

/** Abre el PDF de cierre en una pestaña nueva del navegador. */
export async function openClosurePdf(cashRegisterId: string): Promise<void> {
  const response = await httpClient.get(`/cash/${cashRegisterId}/pdf`, {
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  window.open(url, '_blank')
  // Limpiamos después de un momento para darle tiempo al navegador de cargar el blob
  setTimeout(() => window.URL.revokeObjectURL(url), 10_000)
}
