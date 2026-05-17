import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'

interface PublicProduct {
  id: string
  code: string
  description: string
  sale_price: number
  unit: string | null
  photo_url: string | null
  supplier_code: string | null
}

export default function ProductPublicPage() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<PublicProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    // Use the same base URL as the API — derive from VITE_BACKEND_URL or current origin
    const apiBase = import.meta.env.VITE_BACKEND_URL || window.location.origin
    fetch(`${apiBase}/api/public/products/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then(setProduct)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
        <Package size={48} className="text-gray-300" />
        <p className="text-lg font-semibold text-gray-600">Producto no encontrado</p>
        <p className="text-sm text-gray-400">El QR puede estar desactualizado o el producto ya no está disponible.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        {product.photo_url ? (
          <img
            src={product.photo_url}
            alt={product.description}
            className="h-56 w-full object-cover"
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center bg-gray-100">
            <Package size={64} className="text-gray-300" />
          </div>
        )}

        <div className="p-5">
          <p className="font-mono text-xs font-medium text-gray-400 uppercase tracking-wider">
            {product.code}
            {product.supplier_code && (
              <span className="ml-2 text-gray-300">· Prov: {product.supplier_code}</span>
            )}
          </p>
          <h1 className="mt-1 text-xl font-bold leading-snug text-gray-900">
            {product.description}
          </h1>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Precio</p>
              <p className="text-3xl font-extrabold text-violet-600">
                ${product.sale_price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            {product.unit && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                por {product.unit}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-center text-xs text-gray-400">
            Precio válido al momento de consulta
          </p>
        </div>
      </div>
    </div>
  )
}
