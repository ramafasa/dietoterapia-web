/**
 * Shop Download Service (sklep)
 *
 * Jedno miejsce decydujące o wydaniu pliku e-booka. Trzy wejścia:
 * - 'token'    – link z maila /sklep/pobierz/{token} (api/sklep/pobierz/[token]/[itemId]),
 * - 'checkout' – ciasteczko strony sukcesu (api/sklep/orders/[id]/items/[itemId]/download),
 * - 'account'  – zalogowana klientka (api/konto/zakupy/[itemId]/download).
 *
 * Plik wydawany tylko, gdy:
 * - pozycja należy do zamówienia (albo do zamówienia zalogowanej osoby),
 * - zamówienie ma status 'paid' (zwrot / wygaśnięcie zamyka dostęp, także dla starych tokenów),
 * - potwierdzenie umowy zostało wysłane (confirmationSentAt != NULL – art. 21 ust. 1 u.p.k.),
 * - zamówienie nie jest zanonimizowane (koniec retencji).
 *
 * Wynik: presigned URL (R2, TTL PRESIGN_TTL_SECONDS, Content-Disposition: attachment) albo null.
 * Event 'shop_download' { orderId, itemId, actor } – best-effort, bez e-maila.
 * Błąd presign / DB → wyjątek (endpoint zwraca 500).
 */

import { and, eq, type SQL } from 'drizzle-orm'
import type { Database } from '@/db'
import { events, products, shopOrderItems, shopOrders } from '@/db/schema'
import { generatePresignedUrl, type PresignUrlParams } from '@/lib/storage/s3-presign'
import { isUuid } from '@/lib/shop/checkoutCookie'
import { PRESIGN_TTL_SECONDS } from '@/lib/shop/constants'
import { dbErrorLog } from '@/lib/shop/safeLog'

export type DownloadActor = 'token' | 'checkout' | 'account'

export const SHOP_DOWNLOAD_EVENT = 'shop_download'

const LOG = '[ShopDownloadService]'

export interface ShopDownloadDeps {
  presign?: (params: PresignUrlParams) => Promise<string>
}

interface DownloadRow {
  orderId: string
  userId: string | null
  status: string
  confirmationSentAt: Date | null
  anonymizedAt: Date | null
  itemObjectKey: string | null
  productObjectKey: string
  fileName: string
}

export class ShopDownloadService {
  private presign: (params: PresignUrlParams) => Promise<string>

  constructor(
    private db: Database,
    deps: ShopDownloadDeps = {}
  ) {
    this.presign = deps.presign ?? generatePresignedUrl
  }

  /** Wejście z tokenu / ciasteczka: pozycja musi należeć do `orderId`. */
  async getDownloadUrl(orderId: string, itemId: string, actor: DownloadActor): Promise<string | null> {
    if (!isUuid(orderId) || !isUuid(itemId)) return null
    const row = await this.loadItem(itemId, eq(shopOrders.id, orderId))
    return this.release(row, itemId, actor)
  }

  /** Wejście z konta: pozycja musi należeć do zamówienia z userId === `userId`. */
  async getDownloadUrlForUser(userId: string, itemId: string): Promise<string | null> {
    if (!isUuid(userId) || !isUuid(itemId)) return null
    const row = await this.loadItem(itemId, eq(shopOrders.userId, userId))
    return this.release(row, itemId, 'account')
  }

  private async loadItem(itemId: string, orderCondition: SQL): Promise<DownloadRow | null> {
    try {
      const [row] = await this.db
        .select({
          orderId: shopOrders.id,
          userId: shopOrders.userId,
          status: shopOrders.status,
          confirmationSentAt: shopOrders.confirmationSentAt,
          anonymizedAt: shopOrders.anonymizedAt,
          itemObjectKey: shopOrderItems.fileObjectKey,
          productObjectKey: products.fileObjectKey,
          fileName: products.fileName,
        })
        .from(shopOrderItems)
        .innerJoin(shopOrders, eq(shopOrderItems.orderId, shopOrders.id))
        .innerJoin(products, eq(shopOrderItems.productId, products.id))
        .where(and(eq(shopOrderItems.id, itemId), orderCondition))
        .limit(1)
      return row ?? null
    } catch (error) {
      console.error(`${LOG} Error loading order item:`, { itemId, ...dbErrorLog(error) })
      throw new Error('Failed to load order item')
    }
  }

  private async release(row: DownloadRow | null, itemId: string, actor: DownloadActor): Promise<string | null> {
    if (!row) return null
    if (row.status !== 'paid' || row.confirmationSentAt == null || row.anonymizedAt != null) return null

    const url = await this.presign({
      objectKey: row.itemObjectKey ?? row.productObjectKey,
      fileName: row.fileName,
      contentType: 'application/pdf',
      ttlSeconds: PRESIGN_TTL_SECONDS,
    })

    await this.recordEvent(row, itemId, actor)
    return url
  }

  private async recordEvent(row: DownloadRow, itemId: string, actor: DownloadActor): Promise<void> {
    try {
      await this.db.insert(events).values({
        userId: row.userId,
        eventType: SHOP_DOWNLOAD_EVENT,
        properties: { orderId: row.orderId, itemId, actor },
      })
    } catch (error) {
      console.error(`${LOG} Error recording download event:`, { orderId: row.orderId, itemId, ...dbErrorLog(error) })
    }
  }
}
