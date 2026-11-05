/**
 * Minimal Code 39 barcode as inline SVG, so job sheets carry a scannable order number without a
 * QR/barcode dependency. Supports 0-9, A-Z, space and - . ; other characters are dropped.
 * Each symbol is 9 elements (bar,space,...) where 'w' is wide (3 units) and 'n' narrow (1 unit).
 */
const PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn',
  F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn',
  P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
};

export function code39Svg(value: string, heightPx = 40): string {
  const clean = value.toUpperCase().split('').filter(c => c in PATTERNS && c !== '*').join('');
  const symbols = `*${clean}*`.split('');
  const unit = 2;
  let x = 0;
  const bars: string[] = [];
  symbols.forEach((symbol, i) => {
    PATTERNS[symbol].split('').forEach((w, idx) => {
      const width = (w === 'w' ? 3 : 1) * unit;
      if (idx % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="${heightPx}"/>`);
      x += width;
    });
    if (i < symbols.length - 1) x += unit; // inter-character gap
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${heightPx}" viewBox="0 0 ${x} ${heightPx}" role="img" aria-label="Barcode ${clean}">${bars.join('')}</svg>`;
}
