/**
 * Tipos e interfaces de TypeScript para el sistema.
 */

// Tipos base
export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
}

// Usuario
export interface User {
  id: string
  email: string
  name: string
  picture?: string
}

// Tokens de autenticación
export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  user?: User
}

// Producto
export interface Product extends BaseEntity {
  code: string
  supplier_code?: string
  description: string
  details?: string
  customer_terms?: string   // Jerga del cliente para matching con el agente IA
  category_id?: string
  supplier_id?: string
  cost_price: number
  list_price: number
  discount_1: number
  discount_2: number
  discount_3: number
  discount_display?: string
  net_price: number
  sale_price: number
  iva_rate: number
  current_stock: number
  minimum_stock: number
  unit: string
  is_active: boolean
}

// ── Tipos del Agente IA ───────────────────────────────────────

/** Nivel de confianza del match de un producto */
export type AIConfidence = 'HIGH' | 'MED' | 'LOW' | 'NONE'

/** Ítem extraído del presupuesto original */
export interface AIExtractedItem {
  qty: number
  unit: string
  description: string
  raw_original: string
}

/** Producto del catálogo matcheado por el agente */
export interface AIMatchedProduct {
  id: string
  code: string
  description: string
  sale_price: number
  net_price: number
  unit: string
  iva_rate: number
  customer_terms?: string
}

/** Ítem del draft de presupuesto generado por el agente */
export interface AIDraftItem {
  item: AIExtractedItem
  product: AIMatchedProduct | null
  confidence: AIConfidence
  confidence_score: number
  alternatives: AIMatchedProduct[]
  match_reason: string
  qty: number
  unit_price: number
  total: number
}

/** Draft completo retornado por el agente */
export interface AIDraft {
  items: AIDraftItem[]
  subtotal: number
  summary: {
    high: number
    med: number
    low: number
    none: number
  }
  total_items: number
}

/** Respuesta completa del endpoint /ai/parse-quote */
export interface AIParseQuoteResponse {
  draft: AIDraft
  needs_review: boolean
  errors: string[]
  raw_text: string
}

/** Tipo de entrada para el agente */
export type AIInputType = 'image' | 'audio' | 'pdf' | 'docx' | 'text'

// Cliente
export interface Client extends BaseEntity {
  name: string
  document_type: string
  document_number: string
  tax_condition: string
  street?: string
  street_number?: string
  floor?: string
  apartment?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  notes?: string
  current_balance: number
  credit_limit?: number
}

// Proveedor
export interface Supplier extends BaseEntity {
  name: string
  cuit?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  province?: string
  contact_name?: string
  notes?: string
  default_discount_1: number
  default_discount_2: number
  default_discount_3: number
}

// Categoría
export interface Category extends BaseEntity {
  name: string
  description?: string
  parent_id?: string
}

export interface CategoryWithChildren extends Category {
  subcategories: CategoryWithChildren[]
}

// Respuesta paginada
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

// Respuesta de mensaje
export interface MessageResponse {
  message: string
  success: boolean
}

// Parámetros de listado comunes
export interface ListParams {
  search?: string
  page?: number
  per_page?: number
}

// Condiciones fiscales
export const TAX_CONDITIONS = [
  { value: 'RI', label: 'Responsable Inscripto' },
  { value: 'MONO', label: 'Monotributista' },
  { value: 'CF', label: 'Consumidor Final' },
  { value: 'EX', label: 'Exento' },
] as const

// Tipos de documento
export const DOCUMENT_TYPES = [
  { value: 'CUIT', label: 'CUIT' },
  { value: 'CUIL', label: 'CUIL' },
  { value: 'DNI', label: 'DNI' },
] as const

// Alícuotas de IVA
export const IVA_RATES = [
  { value: 0, label: 'Exento (0%)' },
  { value: 10.5, label: 'IVA 10.5%' },
  { value: 21, label: 'IVA 21%' },
  { value: 27, label: 'IVA 27%' },
] as const
