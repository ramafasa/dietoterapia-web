import { formatInTimeZone } from 'date-fns-tz'
import { pl } from 'date-fns/locale'
import type { UserPurchase } from '@/lib/repositories/shopOrderRepository'

/**
 * Widok listy zakupów /konto/zakupy (Task 6.4) – czysta logika, bez Astro i bazy.
 *
 * - data: dzień zakupu w czasie polskim (paidAt, gdy brak – createdAt), np. „1 listopada 2026”,
 * - `ready`: potwierdzenie umowy wysłane (confirmationSentAt) – dopiero wtedy przycisk „Pobierz PDF”
 *   (endpoint i tak wydaje plik tylko wtedy, art. 21 ust. 1 u.p.k.); inaczej „potwierdzenie w drodze”,
 * - okładka z kolekcji `ebooks` po slugu produktu; brak wpisu → null (karta bez okładki).
 */

const TIME_ZONE = 'Europe/Warsaw'

export interface PurchaseItemView<C> {
  id: string
  title: string
  cover: C | null
  downloadHref: string
}

export interface PurchaseView<C> {
  id: string
  orderNumber: string
  dateLabel: string
  /** ISO 8601 dla <time datetime> */
  dateIso: string
  ready: boolean
  items: PurchaseItemView<C>[]
}

/** Endpoint pobrania z konta (302 → presigned URL). */
export function accountDownloadHref(itemId: string): string {
  return `/api/konto/zakupy/${encodeURIComponent(itemId)}/download`
}

export function formatPurchaseDate(date: Date): string {
  return formatInTimeZone(date, TIME_ZONE, 'd MMMM yyyy', { locale: pl })
}

export function buildPurchaseViews<C>(
  purchases: UserPurchase[],
  coverBySlug: ReadonlyMap<string, C>
): PurchaseView<C>[] {
  return purchases.map((purchase) => {
    const date = purchase.paidAt ?? purchase.createdAt
    return {
      id: purchase.id,
      orderNumber: purchase.orderNumber,
      dateLabel: formatPurchaseDate(date),
      dateIso: date.toISOString(),
      ready: purchase.confirmationSentAt != null,
      items: purchase.items.map((item) => ({
        id: item.id,
        title: item.title,
        cover: coverBySlug.get(item.slug) ?? null,
        downloadHref: accountDownloadHref(item.id),
      })),
    }
  })
}
