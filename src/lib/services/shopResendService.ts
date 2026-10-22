/**
 * Shop Resend Service (sklep) – „Wyślij link ponownie” (Task 4.5)
 *
 * resend(email):
 * - wszystkie opłacone, nieanonimizowane zamówienia z tym e-mailem (dowolny userId – także po
 *   usunięciu konta, decyzja 15); brak → nic nie robimy ({ sent: false }),
 * - po jednym NOWYM tokenie pobrania na zamówienie (stare linki pozostają ważne do wygaśnięcia),
 * - sekcja konta (link konta liczony po e-mailu, nie po zamówieniu):
 *   - żadne z tych zamówień nie jest bez userId → none („Zakupy masz też w koncie”),
 *   - są zamówienia bez userId, konto z tym e-mailem istnieje → attach + nowy token konta,
 *   - są zamówienia bez userId, brak konta → create + nowy token konta (emphasized, gdy któreś
 *     z nich miało zaznaczone „Załóż konto”),
 *   To jedyna droga do nowego linku konta po jego wygaśnięciu (regulamin § 4 ust. 3).
 * - jeden mail `sendDownloadLinks` ze wszystkimi zamówieniami i sekcją konta.
 *
 * Nie rzuca przy błędach maila (log z identyfikatorami). Błędy DB rzuca – endpoint i tak odpowiada
 * tym samym komunikatem. Nie logujemy e-maila ani tokenów.
 *
 * Zamówienia opłacone, ale jeszcze bez potwierdzenia umowy (confirmationSentAt NULL) też dostają link:
 * plik i tak nie zostanie wydany, dopóki potwierdzenie nie wyjdzie (strona pokaże „potwierdzenie w drodze”).
 */

import { sql } from 'drizzle-orm'
import type { Database } from '@/db'
import { users } from '@/db/schema'
import { ShopOrderRepository, type ShopOrderWithItems } from '@/lib/repositories/shopOrderRepository'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { pendingShopMailer, type AccountLink, type ShopMailer } from '@/lib/shop/mailer'
import { dbErrorLog } from '@/lib/shop/safeLog'

const LOG = '[ShopResendService]'

export type ResendResult = { sent: boolean }

export interface ShopResendDeps {
  mailer?: Pick<ShopMailer, 'sendDownloadLinks'>
  tokens?: Pick<ShopTokenService, 'createDownloadToken' | 'createAccountToken'>
  orders?: Pick<ShopOrderRepository, 'findPaidOrdersWithItemsByEmail'>
}

export class ShopResendService {
  private mailer: Pick<ShopMailer, 'sendDownloadLinks'>
  private tokens: Pick<ShopTokenService, 'createDownloadToken' | 'createAccountToken'>
  private orders: Pick<ShopOrderRepository, 'findPaidOrdersWithItemsByEmail'>

  constructor(
    private db: Database,
    deps: ShopResendDeps = {}
  ) {
    // TODO(5.2): domyślnie ShopMailService zamiast pendingShopMailer
    this.mailer = deps.mailer ?? pendingShopMailer
    this.tokens = deps.tokens ?? new ShopTokenService(db)
    this.orders = deps.orders ?? new ShopOrderRepository(db)
  }

  async resend(email: string, now: Date = new Date()): Promise<ResendResult> {
    const normalized = email.trim().toLowerCase()
    const paid = await this.orders.findPaidOrdersWithItemsByEmail(normalized)
    if (paid.length === 0) return { sent: false }

    const downloads = []
    for (const { order, items } of paid) {
      downloads.push({ order, items, downloadToken: await this.tokens.createDownloadToken(order.id, now) })
    }

    const accountLink = await this.resolveAccountLink(normalized, paid, now)
    const orderIds = paid.map((p) => p.order.id)

    try {
      const sent = await this.mailer.sendDownloadLinks(normalized, downloads, accountLink)
      if (!sent) console.warn(`${LOG} Download links e-mail not sent`, { orderIds })
      return { sent }
    } catch (error) {
      console.error(`${LOG} Error sending download links e-mail:`, {
        orderIds,
        name: error instanceof Error ? error.name : typeof error,
      })
      return { sent: false }
    }
  }

  private async resolveAccountLink(email: string, paid: ShopOrderWithItems[], now: Date): Promise<AccountLink> {
    const unattached = paid.filter((p) => !p.order.userId).map((p) => p.order)
    if (unattached.length === 0) return { kind: 'none' }

    let existing: { id: string } | undefined
    try {
      ;[existing] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1)
    } catch (error) {
      console.error(`${LOG} Error looking up account:`, dbErrorLog(error))
      throw new Error('Failed to resolve account link')
    }

    const token = await this.tokens.createAccountToken(email, now)
    return existing
      ? { kind: 'attach', token }
      : { kind: 'create', token, emphasized: unattached.some((o) => o.accountRequested) }
  }
}
