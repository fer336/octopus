/**
 * Servicio API para Business (Negocio).
 */
import httpClient from './httpClient'

export interface Business {
  id: string
  name: string
  cuit: string
  tax_condition: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  logo_url?: string
  hide_business_name_in_pdf?: boolean
  logo_position?: 'left' | 'center' | 'right'
  logo_display_mode?: 'alongside_text' | 'replace_text'
  header_text?: string
  sale_point: string
  ai_agent_enabled: boolean
  whatsapp_enabled: boolean
  qr_scanner_enabled: boolean
  evolution_api_key?: string
  whatsapp_instance_name?: string | null
  current_account_mode: 'disabled' | 'automatic' | 'manual'
  invoicing_enabled: boolean
  receipts_enabled: boolean
  quotation_enabled: boolean
  inventory_enabled: boolean
  stockpile_enabled: boolean
  price_update_enabled: boolean
  reports_enabled: boolean
  sql_backup_enabled: boolean
  arca_environment?: string
  last_quotation_number: string
  last_receipt_number: string
  last_invoice_a_number: string
  last_invoice_b_number: string
  last_invoice_c_number: string
}

export interface BusinessUpdate {
  name?: string
  cuit?: string
  tax_condition?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  logo_url?: string
  hide_business_name_in_pdf?: boolean
  logo_position?: 'left' | 'center' | 'right'
  logo_display_mode?: 'alongside_text' | 'replace_text'
  header_text?: string
  sale_point?: string
  whatsapp_instance_name?: string | null
}

const businessService = {
  /**
   * Obtiene los datos del negocio del usuario actual.
   */
  async getMyBusiness(): Promise<Business> {
    const response = await httpClient.get('/business/me')
    return response.data
  },

  /**
   * Actualiza los datos del negocio del usuario actual.
   */
  async updateMyBusiness(data: BusinessUpdate): Promise<Business> {
    const response = await httpClient.put('/business/me', data)
    return response.data
  },
}

export default businessService
