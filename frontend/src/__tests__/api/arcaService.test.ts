import { describe, it, expect, vi, beforeEach } from 'vitest'
import arcaService from '../../api/arcaService'
import httpClient from '../../api/httpClient'

vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

type MockedClient = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

const mockedClient = httpClient as unknown as MockedClient

const BUSINESS_ID = 'test-business-uuid-1234'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('arcaService.getConfig', () => {
  it('calls GET /arca/config/{id}', async () => {
    mockedClient.get.mockResolvedValueOnce({
      data: {
        afipsdk_access_token_configured: false,
        afip_cert_configured: false,
        afip_key_configured: false,
        arca_environment: 'testing',
        cuit: null,
        sale_point: '0001',
        business_name: 'Test Business',
        tax_condition: 'Monotributista',
      },
    })

    const result = await arcaService.getConfig(BUSINESS_ID)

    expect(mockedClient.get).toHaveBeenCalledWith(`/arca/config/${BUSINESS_ID}`)
    expect(result.afipsdk_access_token_configured).toBe(false)
    expect(result.arca_environment).toBe('testing')
  })
})

describe('arcaService.syncNumbers', () => {
  it('calls POST /arca/sync-numbers', async () => {
    mockedClient.post.mockResolvedValueOnce({
      data: { success: true, synced: { last_invoice_a: 5, last_invoice_b: 12 } },
    })

    const result = await arcaService.syncNumbers()

    expect(mockedClient.post).toHaveBeenCalledWith('/arca/sync-numbers')
    expect(result.success).toBe(true)
    expect(result.synced['last_invoice_a']).toBe(5)
  })
})

describe('arcaService.emitInvoice', () => {
  it('calls POST /arca/emit-invoice with voucher_id', async () => {
    const voucherId = 'voucher-uuid-5678'
    mockedClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Factura emitida correctamente',
        cae: '99887766554433',
        cae_expiration: '2026-12-31',
        voucher_number: '0012-00000001',
      },
    })

    const result = await arcaService.emitInvoice({ voucher_id: voucherId })

    expect(mockedClient.post).toHaveBeenCalledWith('/arca/emit-invoice', { voucher_id: voucherId })
    expect(result.success).toBe(true)
    expect(result.cae).toBe('99887766554433')
  })

  it('returns success=false on ARCA error without throwing', async () => {
    mockedClient.post.mockResolvedValueOnce({
      data: {
        success: false,
        message: 'Error al emitir factura',
        errors: ['(10016) El numero del comprobante no se corresponde.'],
      },
    })

    const result = await arcaService.emitInvoice({ voucher_id: 'any-id' })

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('10016')
  })
})

describe('arcaService.getLastVoucher', () => {
  it('calls GET /arca/last-voucher with default params', async () => {
    mockedClient.get.mockResolvedValueOnce({
      data: { success: true, lastVoucher: 7 },
    })

    const result = await arcaService.getLastVoucher(BUSINESS_ID)

    expect(mockedClient.get).toHaveBeenCalledWith(
      `/arca/last-voucher/${BUSINESS_ID}?sale_point=1&voucher_type=6`
    )
    expect(result.lastVoucher).toBe(7)
  })

  it('passes custom sale_point and voucher_type', async () => {
    mockedClient.get.mockResolvedValueOnce({ data: { success: true, lastVoucher: 3 } })

    await arcaService.getLastVoucher(BUSINESS_ID, 12, 1)

    expect(mockedClient.get).toHaveBeenCalledWith(
      `/arca/last-voucher/${BUSINESS_ID}?sale_point=12&voucher_type=1`
    )
  })
})
