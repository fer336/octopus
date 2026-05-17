import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Product } from '../../types'

interface Props {
  product: Product
}

export default function ProductQrLabel({ product }: Props) {
  const [svgHtml, setSvgHtml] = useState('')

  useEffect(() => {
    const url = `${window.location.origin}/p/${product.id}`
    QRCode.toString(url, { type: 'svg', width: 100, margin: 1 }).then(setSvgHtml)
  }, [product.id])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '3mm',
        boxSizing: 'border-box',
        border: '1px dashed #bbb',
        backgroundColor: 'white',
        gap: '1.5mm',
      }}
    >
      {/* Código interno — arriba, en negrita */}
      <p
        style={{
          fontSize: '6pt',
          fontFamily: 'monospace',
          fontWeight: 700,
          color: '#222',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Codigo: {product.code}
      </p>

      {/* QR code */}
      <div
        style={{ width: '26mm', height: '26mm', lineHeight: 0, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />

      {/* Código de fábrica/proveedor — debajo del QR */}
      {product.supplier_code && (
        <p
          style={{
            fontSize: '5.5pt',
            fontFamily: 'monospace',
            color: '#555',
            margin: 0,
            textAlign: 'center',
          }}
        >
          Cod. Fábrica: {product.supplier_code}
        </p>
      )}

      {/* Descripción — abajo de todo, sin truncar */}
      <p
        style={{
          fontSize: '6pt',
          fontWeight: 500,
          textAlign: 'center',
          margin: 0,
          lineHeight: 1.3,
          wordBreak: 'break-word',
          maxWidth: '100%',
        }}
      >
        {product.description}
      </p>
    </div>
  )
}
