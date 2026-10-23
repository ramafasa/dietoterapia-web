import { formatInTimeZone } from 'date-fns-tz'

const WARSAW_TZ = 'Europe/Warsaw'

/**
 * Numer zamówienia: ZAM-RRRR-NNNNN.
 *
 * - RRRR: rok w strefie Europe/Warsaw w chwili `at` (zamówienie z 00:30 1 stycznia czasu polskiego → nowy rok),
 * - NNNNN: wartość globalnej sekwencji shop_order_number_seq dopełniona zerami do 5 cyfr (dłuższa nie jest obcinana).
 *
 * @param seq - wartość z nextval() (postgres-js zwraca bigint jako string)
 */
export function formatOrderNumber(seq: number | string, at: Date): string {
  const n = typeof seq === 'string' && /^\d+$/.test(seq) ? Number(seq) : seq
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) {
    throw new Error(`Invalid order sequence value: ${seq}`)
  }
  const year = formatInTimeZone(at, WARSAW_TZ, 'yyyy')
  return `ZAM-${year}-${String(n).padStart(5, '0')}`
}
