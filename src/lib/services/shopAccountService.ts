/**
 * Shop Account Service (sklep)
 *
 * Responsibilities (Task 4.2):
 * - resolveAccountLinkForOrder: jaki link „konto” wysłać w mailu potwierdzenia zamówienia
 * - attachOrdersByEmail: przypięcie opłaconych zamówień gościa do konta
 * - createAccountFromToken: założenie konta `customer` linkiem z maila (decyzja 9)
 * - handleAccountToken: logika POST /sklep/konto/{token} (Task 4.4)
 *
 * Security:
 * - Token konta zużywany TYLKO razem z udaną akcją (ta sama transakcja DB – rollback przywraca token).
 * - attach tylko gdy e-mail sesji === e-mail tokenu (bez wielkości liter).
 * - Nigdy nie nadpisujemy istniejącego konta (sprawdzenie + unikalny e-mail → account_exists, pełny rollback).
 * - Nie logujemy e-maila, hasła/hasha ani tokenu – tylko identyfikatory i dbErrorLog.
 */

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Database } from '@/db'
import { auditLog, events, shopOrders, users, type ShopOrder } from '@/db/schema'
import { hashPasswordV2 } from '@/lib/password'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { dbErrorLog } from '@/lib/shop/safeLog'
import type { AccountLink } from '@/lib/shop/mailer'
import { resolveAccountTokenPageState, type AccountTokenPageState } from '@/lib/shop/accountTokenView'

const CLIENT_PASSWORD_HASH_PATTERN = /^[a-f0-9]{64}$/
const UNIQUE_VIOLATION = '23505'
// Nazwa ograniczenia z migracji (drizzle/*.sql: CONSTRAINT "users_email_unique" UNIQUE("email"))
const USERS_EMAIL_UNIQUE_CONSTRAINT = 'users_email_unique'

export type AccountSessionUser = { id: string; email: string; role: string }

export type CreateAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'account_exists' }

export type HandleAccountTokenResult =
  | { result: 'created_and_logged_in'; userId: string } // endpoint tworzy sesję
  | { result: 'attached'; count: number }
  | { result: 'login_required' } // konto istnieje, brak sesji / sesja innego konta
  | { result: 'different_account' } // brak konta dla e-maila tokenu, ale zalogowana na INNE konto
  | { result: 'password_required' }
  | { result: 'invalid' }

/**
 * Stan tokenu konta (bez zużycia) – wspólne źródło dla strony /sklep/konto/{token} (GET) i
 * handleAccountToken (POST). `email` (znormalizowany) tylko dla ważnego tokenu – strona go wyświetla.
 */
export type AccountTokenState = { state: 'invalid' } | { state: AccountTokenPageState; email: string }

export class InvalidPasswordHashError extends Error {
  constructor() {
    super('Invalid password hash format')
    this.name = 'InvalidPasswordHashError'
  }
}

/** Sygnał rollbacku: konto z e-mailem tokenu już istnieje. */
class AccountExistsRollback extends Error {}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Wyścig o ten sam e-mail: 23505 na `users_email_unique` (inne naruszenia unikalności to zwykłe błędy). */
export function isUsersEmailUniqueViolation(error: unknown): boolean {
  const { code, constraint } = dbErrorLog(error)
  return code === UNIQUE_VIOLATION && constraint === USERS_EMAIL_UNIQUE_CONSTRAINT
}

export class ShopAccountService {
  constructor(
    private db: Database,
    private tokens: Pick<ShopTokenService, 'createAccountToken' | 'peekAccountToken'> = new ShopTokenService(db)
  ) {}

  /**
   * - order.userId ustawione (zakup zalogowanej) → none
   * - istnieje konto z tym e-mailem (porównanie bez wielkości liter) → attach + token.
   *   Celowo DOWOLNA rola (patient, customer, także dietitian – Paulina kupująca własny e-book):
   *   konto istnieje, więc nie proponujemy zakładania drugiego.
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

  /**
   * Przypina do userId wszystkie OPŁACONE (status 'paid'), nieanonimizowane zamówienia z tym e-mailem
   * (bez wielkości liter), które nie mają jeszcze userId. Zwraca liczbę przypiętych.
   * `tx` – uchwyt transakcji wołającego (wtedy błąd przerywa jego transakcję).
   */
  async attachOrdersByEmail(userId: string, email: string, tx?: Database, now: Date = new Date()): Promise<number> {
    const handle = tx ?? this.db
    try {
      const rows = await handle
        .update(shopOrders)
        .set({ userId, updatedAt: now })
        .where(
          and(
            sql`lower(${shopOrders.email}) = ${normalizeEmail(email)}`,
            eq(shopOrders.status, 'paid'),
            isNull(shopOrders.userId),
            isNull(shopOrders.anonymizedAt)
          )
        )
        .returning({ id: shopOrders.id })
      return rows.length
    } catch (error) {
      console.error('[ShopAccountService] Error attaching orders:', { userId, ...dbErrorLog(error) })
      throw new Error('Failed to attach orders')
    }
  }

  /**
   * Zakłada konto `customer` z tokenu konta, w JEDNEJ transakcji:
   * zużycie tokenu → brak konta z tym e-mailem → insert (active, emailVerifiedAt = now, bcrypt nad hashem
   * klienta, firstName z najnowszego opłaconego zamówienia) → przypięcie zamówień → audit log.
   * Konto istnieje / wyścig o unikalny e-mail → account_exists, rollback (token pozostaje niezużyty).
   * Po commicie event `signup` (best-effort).
   *
   * Wołaj przez handleAccountToken (sprawdza istniejące konto i sesję) – bezpośrednio tylko w testach.
   * Tani peek tokenu przed bcrypt: nieważne tokeny nie kosztują hashowania (ochrona przed zalewem żądań).
   *
   * @param passwordHash SHA-256 hasła z klienta (64 znaki hex) – inaczej InvalidPasswordHashError
   */
  async createAccountFromToken(raw: string, passwordHash: string, now: Date = new Date()): Promise<CreateAccountResult> {
    if (typeof passwordHash !== 'string' || !CLIENT_PASSWORD_HASH_PATTERN.test(passwordHash)) {
      throw new InvalidPasswordHashError()
    }
    if (!(await this.tokens.peekAccountToken(raw, now))) return { ok: false, reason: 'invalid' }
    // bcrypt przed transakcją – nie trzymamy otwartej transakcji (i blokady tokenu) na czas hashowania
    const storedHash = await hashPasswordV2(passwordHash)

    let userId: string
    try {
      const created = await this.db.transaction(async (tx) => {
        const txDb = tx as unknown as Database
        const consumed = await new ShopTokenService(txDb).consumeAccountToken(raw, now)
        if (!consumed) return null
        const email = normalizeEmail(consumed.email)

        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1)
        if (existing) throw new AccountExistsRollback()

        const [latestOrder] = await tx
          .select({ firstName: shopOrders.firstName })
          .from(shopOrders)
          .where(
            and(
              sql`lower(${shopOrders.email}) = ${email}`,
              eq(shopOrders.status, 'paid'),
              isNotNull(shopOrders.firstName)
            )
          )
          .orderBy(desc(sql`coalesce(${shopOrders.paidAt}, ${shopOrders.createdAt})`), desc(shopOrders.createdAt))
          .limit(1)

        const [user] = await tx
          .insert(users)
          .values({
            email,
            passwordHash: storedHash,
            role: 'customer',
            status: 'active',
            emailVerifiedAt: now,
            firstName: latestOrder?.firstName ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: users.id, email: users.email, role: users.role, status: users.status })

        const attached = await this.attachOrdersByEmail(user.id, email, txDb, now)

        await tx.insert(auditLog).values({
          userId: user.id,
          action: 'create',
          tableName: 'users',
          recordId: user.id,
          before: null,
          after: {
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            source: 'shop_account_link',
            attachedOrders: attached,
          },
          timestamp: now,
        })

        return user.id
      })
      if (!created) return { ok: false, reason: 'invalid' }
      userId = created
    } catch (error) {
      if (error instanceof AccountExistsRollback) return { ok: false, reason: 'account_exists' }
      if (isUsersEmailUniqueViolation(error)) {
        console.warn('[ShopAccountService] Account creation race: users e-mail unique violation, rolled back')
        return { ok: false, reason: 'account_exists' }
      }
      console.error('[ShopAccountService] Error creating account from token:', dbErrorLog(error))
      throw new Error('Failed to create account')
    }

    try {
      await this.db.insert(events).values({
        userId,
        eventType: 'signup',
        properties: { role: 'customer', source: 'shop_account_link' },
        timestamp: now,
      })
    } catch (error) {
      console.error('[ShopAccountService] Event tracking failed (signup):', { userId, ...dbErrorLog(error) })
    }

    return { ok: true, userId }
  }

  /**
   * POST /sklep/konto/{token} (Task 4.4). Token zużywany tylko przy `attached` i `created_and_logged_in`.
   * - token nieważny / wygasły / zużyty → invalid
   * - konto z e-mailem tokenu istnieje:
   *   - sesja na TEN e-mail (bez wielkości liter) → zużycie tokenu + attach w jednej transakcji → attached
   *   - brak sesji / sesja innego konta → login_required (bez ujawniania czegokolwiek więcej)
   * - brak konta:
   *   - sesja innego konta → different_account (nie zakładamy drugiego konta „pod” zalogowaną sesją;
   *     UI: wyloguj się, aby założyć konto dla {zamaskowany e-mail})
   *   - brak passwordHash → password_required
   *   - passwordHash → createAccountFromToken → created_and_logged_in (sesję tworzy endpoint),
   *     account_exists (wyścig) → login_required, token zużyty w międzyczasie → invalid
   */
  async handleAccountToken(
    raw: string,
    ctx: { sessionUser: AccountSessionUser | null; passwordHash?: string },
    now: Date = new Date()
  ): Promise<HandleAccountTokenResult> {
    const token = await this.resolveTokenState(raw, ctx.sessionUser, now)

    switch (token.state) {
      case 'invalid':
        return { result: 'invalid' }
      case 'attach':
        // `attach` tylko przy sesji na e-mail tokenu (resolveAccountTokenPageState)
        if (!ctx.sessionUser) return { result: 'login_required' }
        return this.consumeAndAttach(raw, ctx.sessionUser.id, now)
      case 'login':
      case 'switch_account':
        return { result: 'login_required' }
      case 'different_account':
        return { result: 'different_account' }
      case 'create': {
        if (!ctx.passwordHash) return { result: 'password_required' }
        const created = await this.createAccountFromToken(raw, ctx.passwordHash, now)
        if (created.ok === true) return { result: 'created_and_logged_in', userId: created.userId }
        return created.reason === 'account_exists' ? { result: 'login_required' } : { result: 'invalid' }
      }
    }
  }

  /**
   * Peek tokenu konta (bez zużycia) + czy istnieje konto z jego e-mailem + sesja → stan
   * (resolveAccountTokenPageState). Używane przez stronę /sklep/konto/{token} i handleAccountToken,
   * żeby strona zawsze pokazywała wariant zgodny z tym, co zrobi POST.
   */
  async resolveTokenState(
    raw: string,
    sessionUser: Pick<AccountSessionUser, 'email'> | null,
    now: Date = new Date()
  ): Promise<AccountTokenState> {
    const token = await this.tokens.peekAccountToken(raw, now)
    if (!token) return { state: 'invalid' }
    const email = normalizeEmail(token.email)

    let existing: { id: string } | undefined
    try {
      ;[existing] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1)
    } catch (error) {
      console.error('[ShopAccountService] Error looking up account for token:', dbErrorLog(error))
      throw new Error('Failed to resolve account token state')
    }

    const state = resolveAccountTokenPageState({
      tokenEmail: email,
      accountExists: !!existing,
      sessionEmail: sessionUser?.email ?? null,
    })
    return { state, email }
  }

  private async consumeAndAttach(raw: string, userId: string, now: Date): Promise<HandleAccountTokenResult> {
    try {
      const count = await this.db.transaction(async (tx) => {
        const txDb = tx as unknown as Database
        const consumed = await new ShopTokenService(txDb).consumeAccountToken(raw, now)
        if (!consumed) return null // zużyty w międzyczasie – nic nie zmieniamy
        // e-mail z ZUŻYTEGO tokenu (nie z wcześniejszego peeka) – attachOrdersByEmail normalizuje
        return this.attachOrdersByEmail(userId, consumed.email, txDb, now)
      })
      return count === null ? { result: 'invalid' } : { result: 'attached', count }
    } catch (error) {
      console.error('[ShopAccountService] Error attaching orders via token:', { userId, ...dbErrorLog(error) })
      throw new Error('Failed to attach orders')
    }
  }
}
