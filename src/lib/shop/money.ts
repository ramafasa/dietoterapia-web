// Kwoty w bazie: decimal(10,2) jako string (np. "29.00"). Obliczenia: integer grosze,
// żeby uniknąć błędów zmiennoprzecinkowych (0.1 + 0.2 !== 0.3).
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/

/** "29.00" | "29.5" | "29" → 2900 | 2950 | 2900. Rzuca dla formatów innych niż kropka i max 2 miejsca. */
export function toGrosze(value: string): number {
  if (!DECIMAL_RE.test(value)) throw new Error(`Invalid amount: ${value}`)
  const [zl, gr = ''] = value.split('.')
  const result = Number(zl) * 100 + Number(gr.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) throw new Error(`Amount out of range: ${value}`)
  return result
}

/** 2900 → "29.00". Rzuca dla wartości ujemnych lub niecałkowitych. */
export function fromGrosze(grosze: number): string {
  if (!Number.isSafeInteger(grosze) || grosze < 0) throw new Error(`Invalid grosze: ${grosze}`)
  return `${Math.floor(grosze / 100)}.${String(grosze % 100).padStart(2, '0')}`
}

/** Suma kwot decimal-string bez błędów float; [] → "0.00". */
export function sumPrices(prices: string[]): string {
  return fromGrosze(prices.reduce((acc, p) => acc + toGrosze(p), 0))
}

/** "29.00" → "29,00 zł" (do wyświetlania). */
export function formatPLN(value: string): string {
  return `${value.replace('.', ',')} zł`
}
