/**
 * Shop Account Service (sklep)
 *
 * Responsibilities (Task 4.2 – na razie tylko część potrzebna webhookowi płatności):
 * - resolveAccountLinkForOrder: jaki link „konto” wysłać w mailu potwierdzenia zamówienia
 *
 * TODO(4.2): attachOrdersByEmail, createAccountFromToken, handleAccountToken.
 */

import { sql } from 'drizzle-orm'
import type { Database } from '@/db'
import { users, type ShopOrder } from '@/db/schema'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { dbErrorLog } from '@/lib/shop/safeLog'
import type { AccountLink } from '@/lib/shop/mailer'

export class ShopAccountService {
  constructor(
    private db: Database,
    private tokens: Pick<ShopTokenService, 'createAccountToken'> = new ShopTokenService(db)
  ) {}

  /**
   * - order.userId ustawione (zakup zalogowanej) → none
   * - istnieje konto z tym e-mailem (dowolna rola, porównanie bez wielkości liter) → attach + token
   * - brak konta → create + token; emphasized = order.accountRequested (tylko wyeksponowanie w mailu)
   * Token: createAccountToken(order.email) – ten sam endpoint /sklep/konto/{token} w obu przypadkach.
   */
  async resolveAccountLinkForOrder(
    order: Pick<ShopOrder, 'id' | 'email' | 'userId' | 'accountRequested'>,
    now: Date = new Date()
  ): Promise<AccountLink> {
    if (order.userId) return { kind: 'none' }

    const email = order.email.trim().toLowerCase()
    let existing: { id: string } | undefined
    try {
      ;[existing] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1)
    } catch (error) {
      console.error('[ShopAccountService] Error looking up account for order:', {
        orderId: order.id,
        ...dbErrorLog(error),
      })
      throw new Error('Failed to resolve account link')
    }

    const token = await this.tokens.createAccountToken(email, now)
    return existing ? { kind: 'attach', token } : { kind: 'create', token, emphasized: order.accountRequested }
  }
}
