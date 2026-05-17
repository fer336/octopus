import { useEffect, useRef, useState } from 'react'
import { X, Camera } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import toast from 'react-hot-toast'
import productsService from '../../api/productsService'
import type { Product } from '../../types'

interface Props {
  onAddProduct: (product: Product, quantity: number) => void
  onClose: () => void
}

interface PendingProduct {
  product: Product
  quantity: number
}

const SCANNER_DIV_ID = 'qr-scanner-viewport'

export default function QrScanner({ onAddProduct, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const processingRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingProduct | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)

  useEffect(() => {
    // Block body scroll
    document.body.style.overflow = 'hidden'

    const scanner = new Html5Qrcode(SCANNER_DIV_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        handleScan,
        () => {}, // per-frame fail is normal — ignore
      )
      .catch((err: unknown) => {
        const msg = String(err).toLowerCase()
        if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
          setCameraError(
            'Permiso de cámara denegado. Habilitá el acceso en la configuración del navegador e intentá de nuevo.',
          )
        } else {
          setCameraError('No se pudo acceder a la cámara en este dispositivo.')
        }
      })

    return () => {
      document.body.style.overflow = ''
      scanner.stop().catch(() => {})
    }
  }, [])

  async function handleScan(decodedText: string) {
    if (processingRef.current) return
    processingRef.current = true

    let productId: string | undefined

    // New format: URL like https://app.octopustrack.shop/p/{uuid}
    const urlMatch = decodedText.match(/\/p\/([0-9a-f-]{36})/i)
    if (urlMatch) {
      productId = urlMatch[1]
    } else {
      // Legacy format: JSON payload
      try {
        const qrData: { id?: string } = JSON.parse(decodedText)
        productId = qrData.id
      } catch {
        processingRef.current = false
        return
      }
    }

    if (!productId) {
      toast('QR no reconocido', { icon: '⚠️', duration: 1500 })
      processingRef.current = false
      return
    }

    scannerRef.current?.pause(true)
    setIsLookingUp(true)

    try {
      const product = await productsService.getById(productId)
      if (navigator.vibrate) navigator.vibrate(40)
      setPending({ product, quantity: 1 })
    } catch {
      toast.error('Producto no encontrado en el catálogo')
      processingRef.current = false
      scannerRef.current?.resume()
    } finally {
      setIsLookingUp(false)
    }
  }

  function handleConfirm() {
    if (!pending) return
    onAddProduct(pending.product, pending.quantity)
    setPending(null)
    processingRef.current = false
    // Small delay so the card animation feels intentional
    setTimeout(() => scannerRef.current?.resume(), 250)
  }

  function handleCancelPending() {
    setPending(null)
    processingRef.current = false
    scannerRef.current?.resume()
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black">
      {/* Header bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold text-white">Escanear producto</p>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-white/80 hover:bg-white/10 active:scale-95"
          aria-label="Cerrar escáner"
        >
          <X size={22} />
        </button>
      </div>

      {/* Camera permission error */}
      {cameraError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Camera size={44} className="text-white/30" />
          <p className="text-sm leading-relaxed text-white/70">{cameraError}</p>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <>
          {/* html5-qrcode renders the video inside this div */}
          <div
            id={SCANNER_DIV_ID}
            className="flex-1 overflow-hidden"
            style={{ minHeight: 0 }}
          />

          {/* Hint text */}
          {!pending && !isLookingUp && (
            <p className="no-print shrink-0 py-3 text-center text-xs text-white/50">
              Apuntá la cámara al QR del producto
            </p>
          )}

          {/* Looking up overlay */}
          {isLookingUp && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <p className="text-sm font-medium text-white">Buscando producto…</p>
            </div>
          )}

          {/* Confirmation bottom sheet */}
          {pending && (
            <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white px-4 pb-6 pt-4 shadow-2xl">
              {/* Handle */}
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />

              {/* Product info */}
              <div className="mb-4">
                <p className="font-mono text-xs font-medium text-gray-400">{pending.product.code}</p>
                <p className="mt-0.5 text-base font-bold text-gray-900 leading-tight">
                  {pending.product.description}
                </p>
                <p className="mt-1 text-lg font-bold text-green-600">
                  ${pending.product.sale_price.toLocaleString('es-AR')}
                </p>
              </div>

              {/* Quantity input */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Cantidad
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={pending.quantity}
                  onChange={(e) =>
                    setPending((p) =>
                      p ? { ...p, quantity: Math.max(1, Number(e.target.value) || 1) } : p,
                    )
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-xl font-bold text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  autoFocus={false}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCancelPending}
                  className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700 active:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white active:bg-violet-700"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
