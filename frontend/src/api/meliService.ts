import httpClient, { getBackendUrl } from './httpClient'
import type {
  MeliConnectionStatus,
  MeliListingsPage,
  MeliListing,
  PublishListingRequest,
  LinkListingRequest,
  PatchListingRequest,
  MeliCategorySuggestion,
  MeliCategoryAttribute,
} from '../types/meli'

const base = () => `${getBackendUrl()}/api/v1/meli`

const meliService = {
  // ── Connection ──────────────────────────────────────────────────────────────

  async getStatus(): Promise<MeliConnectionStatus> {
    const { data } = await httpClient.get(`${base()}/status`)
    return data
  },

  async getAuthorizeUrl(): Promise<{ url: string }> {
    const { data } = await httpClient.get(`${base()}/oauth/authorize-url`)
    return data
  },

  async disconnect(): Promise<void> {
    await httpClient.delete(`${base()}/connection`)
  },

  // ── Listings ────────────────────────────────────────────────────────────────

  async getListings(params: {
    offset?: number
    limit?: number
    status?: string | null
    product_id?: string | null
  }): Promise<MeliListingsPage> {
    const { data } = await httpClient.get(`${base()}/listings`, { params })
    return data
  },

  async publish(body: PublishListingRequest): Promise<MeliListing> {
    const { data } = await httpClient.post(`${base()}/listings`, body)
    return data
  },

  async linkListing(body: LinkListingRequest): Promise<MeliListing> {
    const { data } = await httpClient.post(`${base()}/listings/link`, body)
    return data
  },

  async patchListing(listingId: string, body: PatchListingRequest): Promise<MeliListing> {
    const { data } = await httpClient.patch(`${base()}/listings/${listingId}`, body)
    return data
  },

  async pauseListing(listingId: string): Promise<void> {
    await httpClient.post(`${base()}/listings/${listingId}/pause`)
  },

  async activateListing(listingId: string): Promise<void> {
    await httpClient.post(`${base()}/listings/${listingId}/activate`)
  },

  // ── Categories ──────────────────────────────────────────────────────────────

  async predictCategory(title: string): Promise<MeliCategorySuggestion[]> {
    const { data } = await httpClient.get(`${base()}/categories/predict`, {
      params: { title },
    })
    return Array.isArray(data) ? data : [data]
  },

  async getCategoryAttributes(categoryId: string): Promise<MeliCategoryAttribute[]> {
    const { data } = await httpClient.get(`${base()}/categories/${categoryId}/attributes`)
    return data
  },

  // ── AI content generation ────────────────────────────────────────────────────

  async generateListingContent(productId: string): Promise<{ title: string; description: string; condition: string }> {
    const { data } = await httpClient.post(`${base()}/generate-listing-content`, { product_id: productId })
    return data
  },
}

export default meliService
