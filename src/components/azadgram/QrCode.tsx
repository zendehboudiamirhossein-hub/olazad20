'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!value) { setDataUrl(null); return }
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: '#0A1F1F', light: '#FFFFFF' },
      errorCorrectionLevel: 'M'
    }).then(url => {
      if (!cancelled) setDataUrl(url)
    }).catch(() => {
      if (!cancelled) setDataUrl(null)
    })
    return () => { cancelled = true }
  }, [value, size])

  if (!dataUrl) {
    return <div className={className} style={{ width: size, height: size, background: '#F1F5F4', borderRadius: 12 }} />
  }
  return <img src={dataUrl} alt="QR" width={size} height={size} className={className} style={{ borderRadius: 12 }} />
}
