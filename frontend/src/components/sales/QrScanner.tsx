import { useEffect, useRef, useState } from 'react'
import { X, Camera } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import productsService from '../../api/productsService'
import type { Product } from '../../types'

interface Props {
  onAddProduct: (product: Product, quantity: number) => void
  onClose: () => void
}

const SCANNER_DIV_ID = 'qr-scanner-viewport'

export default function QrScanner({ onAddProduct, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const processingRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [snack, setSnack] = useState<string | null>(null)
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
      processingRef.current = false
      return
    }

    scannerRef.current?.pause(true)
    setIsLookingUp(true)

    try {
      const product = await productsService.getById(productId)
      if (navigator.vibrate) navigator.vibrate(40)
      onAddProduct(product, 1)
      setSnack(product.description)
      setTimeout(() => {
        setSnack(null)
        processingRef.current = false
        scannerRef.current?.resume()
      }, 1500)
    } catch {
      processingRef.current = false
      scannerRef.current?.resume()
    } finally {
      setIsLookingUp(false)
    }
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
          {!isLookingUp && !snack && (
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

          {/* Scan confirmation snackbar */}
          {snack && (
            <div className="absolute bottom-6 left-4 right-4 flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-2xl backdrop-blur-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-base">✓</span>
              <p className="truncate text-sm font-semibold text-gray-900">{snack}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
