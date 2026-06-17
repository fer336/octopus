export interface MeliConnectionStatus {
  connected: boolean
  status: 'connected' | 'revoked' | 'error' | 'disconnected' | null
  meli_user_id: number | null
  meli_nickname: string | null
  expires_at: string | null
}

export interface MeliListing {
  id: string
  product_id: string
  meli_item_id: string
  meli_permalink: string | null
  listing_type_id: string | null
  status: 'active' | 'paused' | 'closed' | 'under_review'
  sync_price: boolean
  sync_stock: boolean
  price_markup_pct: string | null
  last_synced_at: string | null
  last_sync_error: string | null
}

export interface MeliListingsPage {
  items: MeliListing[]
  total: number
  offset: number
  limit: number
}

export interface PublishListingRequest {
  product_id: string
  category_id: string
  listing_type_id?: string
  price?: number | null
  title?: string | null
  attributes?: { id: string; value_name: string }[]
  pictures?: string[]
  condition?: string
  description?: string | null
  price_markup_pct?: string
  sync_price?: boolean
  sync_stock?: boolean
  available_quantity?: number
}

export interface LinkListingRequest {
  product_id: string
  meli_item_id: string
}

export interface PatchListingRequest {
  sync_price?: boolean | null
  sync_stock?: boolean | null
  price_markup_pct?: string | null
}

export interface MeliCategorySuggestion {
  domain_id: string
  domain_name: string
  category_id: string
  category_name: string
  attributes?: MeliCategoryAttribute[]
}

export interface MeliCategoryAttribute {
  id: string
  name: string
  value_type: string
  tags: { required?: boolean; variation_attribute?: boolean }
  values?: { id: string; name: string }[]
  allowed_units?: { id: string; name: string }[]
}
