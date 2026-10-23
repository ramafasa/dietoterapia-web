/**
 * Account Deletion Service – usunięcie konta `customer` przez samą klientkę (Task 6.5, regulamin § 4 ust. 4)
 *
 * Konto (wiersz `users`) jest USUWANE, nie anonimizowane – adres e-mail wraca do puli, więc nowy link konta
 * z maila zakłada konto od nowa (bez `users_email_unique` / `account_exists`).
 * Zakupy zostają u sprzedawczyni (5 lat, decyzja 15): zamówienia i transakcje tracą tylko `user_id`,
 * e-booki dalej można dostać przez „Wyślij link ponownie” (po e-mailu zamówienia).
 *
 * Jedna transakcja DB:
 * 1. blokada wiersza użytkownika (SELECT … FOR UPDATE), ponowne sprawdzenie roli i e-maila z bazy,
 * 2. transakcja bez zamówienia sklepu (PZK – `chk_transactions_owner`) → conflict, nic nie zmieniamy,
 * 3. shop_orders.user_id = NULL, transactions.user_id = NULL (FK `restrict` – bez tego DELETE się nie uda),
 * 4. audit_log: wpisy tego konta (user_id = konto albo users/record_id = konto) tracą user_id (FK bez
 *    akcji) i dane osobowe w before/after (email, imię, nazwisko – tylko klucze najwyższego poziomu),
 *    events.properties tej osoby tracą ip / userAgent / email,
 * 5. login_attempts dla tego e-maila – usunięte (dane bezpieczeństwa konta, którego już nie ma),
 * 6. DELETE users – kaskadą: sessions, password_reset_tokens, consents, push_subscriptions,
 *    pzk_module_access / pzk_notes / pzk_reviews; events.user_id → NULL; shop_orders.user_id → NULL,
 * 7. nowy wpis audit_log { action: 'delete', tableName: 'users', recordId } bez danych osobowych.
 * Inne FK bez kaskady (weight_entries, invitations.created_by) nie dotyczą klientek sklepu – gdyby
 * jednak istniały, Postgres zgłosi 23503 na znanym ograniczeniu (BLOCKING_CONSTRAINTS) → conflict
 * (rollback, konto zostaje, log z nazwą ograniczenia). Każdy inny błąd → wyjątek (500).
 *
 * Nie logujemy e-maila – tylko identyfikatory i dbErrorLog.
 */

import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { Database } from '@/db'
import { auditLog, events, loginAttempts, shopOrders, transactions, users } from '@/db/schema'
import { dbErrorLog } from '@/lib/shop/safeLog'

const LOG = '[AccountDeletionService]'
const FOREIGN_KEY_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'

/** Klucze danych osobowych usuwane z audit_log.before/after przy usunięciu konta. */
export const AUDIT_PII_KEYS = ['email', 'firstName', 'lastName', 'first_name', 'last_name'] as const

/** Klucze danych osobowych usuwane z events.properties eventów tej osoby (login_success zapisuje `ip`). */
export const EVENT_PII_KEYS = ['ip', 'ipAddress', 'userAgent', 'email'] as const

/**
 * Znane ograniczenia, które mogą zablokować usunięcie (dane spoza sklepu) → 409 zamiast 500.
 * Nazwy z drizzle/*.sql. Każdy inny błąd DB → wyjątek (500).
 */
const BLOCKING_CONSTRAINTS = new Set([
  'weight_entries_user_id_users_id_fk',
  'weight_entries_created_by_users_id_fk',
  'weight_entries_updated_by_users_id_fk',
  'invitations_created_by_users_id_fk',
  'chk_transactions_owner',
])

export type DeleteAccountResult =
  | { result: 'deleted' }
  | { result: 'not_found' } // konto już nie istnieje (np. podwójne kliknięcie)
  | { result: 'forbidden' } // rola inna niż customer
  | { result: 'email_mismatch' }
  | { result: 'conflict' } // dane, których nie możemy odpiąć (np. transakcja PZK)

/** Rollback z wynikiem (bez wyjątku na zewnątrz). */
class Abort extends Error {
  constructor(readonly outcome: DeleteAccountResult) {
    super(outcome.result)
  }
}

export function normalizeConfirmEmail(value: string): string {
  return value.trim().toLowerCase()
}

export class AccountDeletionService {
  constructor(private db: Database) {}

  async deleteCustomerAccount(userId: string, confirmEmail: string, now: Date = new Date()): Promise<DeleteAccountResult> {
    try {
      await this.db.transaction(async (tx) => {
        const [user] = await tx
          .select({ id: users.id, email: users.email, role: users.role })
          .from(users)
          .where(eq(users.id, userId))
          .for('update')
        if (!user) throw new Abort({ result: 'not_found' })
        if (user.role !== 'customer') throw new Abort({ result: 'forbidden' })
        if (normalizeConfirmEmail(user.email) !== normalizeConfirmEmail(confirmEmail)) {
          throw new Abort({ result: 'email_mismatch' })
        }

        const [unlinkable] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), isNull(transactions.shopOrderId)))
          .limit(1)
        if (unlinkable) {
          console.error(`${LOG} Account not deleted – non-shop transaction:`, {
            userId,
            transactionId: unlinkable.id,
            constraint: 'chk_transactions_owner',
          })
          throw new Abort({ result: 'conflict' })
        }

        await tx.update(shopOrders).set({ userId: null, updatedAt: now }).where(eq(shopOrders.userId, userId))
        await tx.update(transactions).set({ userId: null, updatedAt: now }).where(eq(transactions.userId, userId))

        // Tylko klucze najwyższego poziomu (płaskie wpisy create/update users) – zagnieżdżone obiekty
        // nie są przeszukiwane. Guard jsonb_typeof: `-` na tablicy/skalarze usuwałby elementy albo rzucał.
        const auditKeys = sql.param([...AUDIT_PII_KEYS])
        await tx
          .update(auditLog)
          .set({
            userId: null,
            before: sql`case when jsonb_typeof(${auditLog.before}) = 'object' then ${auditLog.before} - ${auditKeys}::text[] else ${auditLog.before} end`,
            after: sql`case when jsonb_typeof(${auditLog.after}) = 'object' then ${auditLog.after} - ${auditKeys}::text[] else ${auditLog.after} end`,
          })
          .where(
            or(eq(auditLog.userId, userId), and(eq(auditLog.tableName, 'users'), eq(auditLog.recordId, userId)))
          )

        // Eventy tej osoby zostają (analityka, user_id → NULL kaskadą), ale bez danych osobowych
        // (np. `ip` w login_success). Też tylko klucze najwyższego poziomu.
        const eventKeys = sql.param([...EVENT_PII_KEYS])
        await tx
          .update(events)
          .set({
            properties: sql`${events.properties} - ${eventKeys}::text[]`,
          })
          .where(and(eq(events.userId, userId), sql`jsonb_typeof(${events.properties}) = 'object'`))

        await tx.delete(loginAttempts).where(sql`lower(${loginAttempts.email}) = ${normalizeConfirmEmail(user.email)}`)

        await tx.delete(users).where(eq(users.id, userId))

        await tx.insert(auditLog).values({
          userId: null,
          action: 'delete',
          tableName: 'users',
          recordId: userId,
          before: { role: 'customer' },
          after: { source: 'self_service' },
          timestamp: now,
        })
      })
      return { result: 'deleted' }
    } catch (error) {
      if (error instanceof Abort) return error.outcome
      const { code, constraint } = dbErrorLog(error)
      if ((code === FOREIGN_KEY_VIOLATION || code === CHECK_VIOLATION) && constraint && BLOCKING_CONSTRAINTS.has(constraint)) {
        console.error(`${LOG} Account not deleted – blocked by constraint:`, { userId, ...dbErrorLog(error) })
        return { result: 'conflict' }
      }
      console.error(`${LOG} Error deleting account:`, { userId, ...dbErrorLog(error) })
      throw new Error('Failed to delete account')
    }
  }
}
