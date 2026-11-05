import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Client-side QR code as an inline SVG (no network, no image). */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 2},${y + 2}h1v1h-1z`;
    return { size: n + 4, path: d };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="h-40 w-40 rounded-lg bg-white" shapeRendering="crispEdges">
      <path d={path} fill="#2B2522" />
    </svg>
  );
}
