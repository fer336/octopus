import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Product } from '../../types'

interface Props {
  product: Product
}

export default function ProductQrLabel({ product }: Props) {
  const [svgHtml, setSvgHtml] = useState('')

  useEffect(() => {
    const data = JSON.stringify({
      id: product.id,
      code: product.code,
      name: product.description,
      price: product.sale_price,
    })
    QRCode.toString(data, { type: 'svg', width: 100, margin: 1 }).then(setSvgHtml)
  }, [product.id, product.code, product.description, product.sale_price])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3mm',
        boxSizing: 'border-box',
        border: '1px dashed #bbb',
        height: '100%',
        gap: '1.5mm',
        backgroundColor: 'white',
      }}
    >
      <p
        style={{
          fontSize: '5.5pt',
          fontFamily: 'monospace',
          color: '#555',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {product.code}
      </p>
      <p
        style={{
          fontSize: '6.5pt',
          fontWeight: 700,
          textAlign: 'center',
          margin: 0,
          lineHeight: 1.25,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          maxWidth: '100%',
          wordBreak: 'break-word',
        }}
      >
        {product.description}
      </p>
      <div
        style={{ width: '26mm', height: '26mm', lineHeight: 0, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </div>
  )
}
