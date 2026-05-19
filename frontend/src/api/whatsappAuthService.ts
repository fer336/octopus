import { httpClient } from './httpClient'

export interface WhatsAppAuthRequest {
  id: string
  client_id?: string | null
  client_name: string
  client_phone: string
  requester_name: string
  description: string
  status: 'pending' | 'authorized' | 'cancelled' | 'expired'
  jwt_token?: string | null
  whatsapp_instance?: string | null
  evolution_message_id?: string | null
  created_at: string
  responded_at?: string | null
  expires_at: string
}

export interface WhatsAppAuthCreate {
  client_id?: string
  client_name: string
  client_phone: string
  requester_name: string
  description?: string
}

export interface WhatsAppAuthListResponse {
  items: WhatsAppAuthRequest[]
  total: number
  page: number
  per_page: number
  pages: number
}

export async function createRequest(data: WhatsAppAuthCreate): Promise<WhatsAppAuthRequest> {
  const response = await httpClient.post<WhatsAppAuthRequest>('/whatsapp-auth/requests', data)
  return response.data
}

export async function listRequests(
  page = 1,
  statusFilter?: string,
): Promise<WhatsAppAuthRequest[]> {
  const params: Record<string, string | number> = { page }
  if (statusFilter) params.status = statusFilter
  const response = await httpClient.get<WhatsAppAuthRequest[]>('/whatsapp-auth/requests', { params })
  return response.data
}

export async function updateStatus(id: string, status: string): Promise<WhatsAppAuthRequest> {
  const response = await httpClient.patch<WhatsAppAuthRequest>(`/whatsapp-auth/requests/${id}`, {
    status,
  })
  return response.data
}
