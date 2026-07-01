/**
 * Thin wrapper around the existing `QrScanner` component, hosted at the
 * shell level and only reachable from `MobileProducts`' scan button.
 *
 * Does not reimplement scanning logic. Cancel/close is `QrScanner`'s
 * existing close (X) button — no separate "Cancelar" affordance is added
 * to avoid duplicating close controls; it is a true no-op (unmounts,
 * `onClose` fires, no other side effects). On a successful decode,
 * `onAddProduct` is forwarded as-is; the caller (`MobileShell`) decides
 * what to do with the matched product — Productos populates its search
 * query with the scanned code, it does NOT auto-add to cart (see
 * MobileShell.handleScanSuccess).
 */
import QrScanner from '../sales/QrScanner'
import type { Product } from '../../types'

interface ScannerOverlayProps {
  open: boolean
  onClose: () => void
  onAddProduct: (product: Product, quantity: number) => void
}

export default function ScannerOverlay({ open, onClose, onAddProduct }: ScannerOverlayProps) {
  if (!open) return null
  return <QrScanner onAddProduct={onAddProduct} onClose={onClose} />
}
