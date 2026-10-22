/**
 * Shop Token Service (sklep)
 *
 * Responsibilities:
 * - Download tokens: link "/sklep/pobierz/{token}" – ważny DOWNLOAD_TOKEN_TTL_DAYS, bez limitu pobrań
 *   (lastUsedAt aktualizowany przy każdym użyciu)
 * - Account tokens: link "/sklep/konto/{token}" – jednorazowy, ważny ACCOUNT_TOKEN_TTL_DAYS;
 *   peek (render formularza, bez zużycia) + consume (atomowe zużycie)
 *
 * Security:
 * - Raw token = 32 losowe bajty → 64 znaki hex; w bazie TYLKO SHA-256 hash.
 * - NIGDY nie logujemy surowego tokenu ani jego hasha; błędy DB logowane przez dbErrorLog.
 * - Token ważny, gdy now < expiresAt.
 *
 * Transactions: wewnątrz db.transaction twórz serwis z uchwytem transakcji
 * (`new ShopTokenService(tx as unknown as Database)`) – np. consumeAccountToken w tej samej
 * transakcji, która zakłada konto; rollback przywraca token do stanu niezużytego.
 */

import { randomBytes } from 'crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Database } from '@/db'
import { shopAccountTokens, shopDownloadTokens } from '@/db/schema'
import { hashToken } from '@/lib/crypto'
import { dbErrorLog } from '@/lib/shop/safeLog'
import { ACCOUNT_TOKEN_TTL_DAYS, DOWNLOAD_TOKEN_TTL_DAYS } from '@/lib/shop/constants'

const DAY_MS = 24 * 60 * 60 * 1000
const RAW_TOKEN_PATTERN = /^[0-9a-f]{64}$/

function generateRawToken(): string {
  return randomBytes(32).toString('hex')
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** Odrzuca wejście niebędące 64 znakami hex (małe litery) – bez zapytania do bazy. */
function isWellFormed(raw: unknown): raw is string {
  return typeof raw === 'string' && RAW_TOKEN_PATTERN.test(raw)
}

export class ShopTokenService {
  constructor(private db: Database) {}

  /** Tworzy token pobrania dla zamówienia; zwraca surowy token (tylko do linku w e-mailu). */
  async createDownloadToken(orderId: string, now: Date = new Date()): Promise<string> {
    const raw = generateRawToken()
    const tokenHash = await hashToken(raw)
    try {
      await this.db.insert(shopDownloadTokens).values({
        orderId,
        tokenHash,
        expiresAt: addDays(now, DOWNLOAD_TOKEN_TTL_DAYS),
        createdAt: now,
      })
    } catch (error) {
      console.error('[ShopTokenService] Error creating download token:', { orderId, ...dbErrorLog(error) })
      throw new Error('Failed to create download token')
    }
    return raw
  }

  /**
   * Waliduje token pobrania. Ważny → { orderId } + best-effort aktualizacja lastUsedAt
   * (błąd aktualizacji nie blokuje pobrania). Nieważny / wygasły / zniekształcony → null.
   */
  async validateDownloadToken(raw: string, now: Date = new Date()): Promise<{ orderId: string } | null> {
    if (!isWellFormed(raw)) return null
    const tokenHash = await hashToken(raw)

    let row: { id: string; orderId: string } | undefined
    try {
      ;[row] = await this.db
        .select({ id: shopDownloadTokens.id, orderId: shopDownloadTokens.orderId })
        .from(shopDownloadTokens)
        .where(and(eq(shopDownloadTokens.tokenHash, tokenHash), gt(shopDownloadTokens.expiresAt, now)))
        .limit(1)
    } catch (error) {
      console.error('[ShopTokenService] Error validating download token:', dbErrorLog(error))
      throw new Error('Failed to validate download token')
    }
    if (!row) return null

    try {
      await this.db
        .update(shopDownloadTokens)
        .set({ lastUsedAt: now })
        .where(eq(shopDownloadTokens.id, row.id))
    } catch (error) {
      console.error('[ShopTokenService] Error updating download token lastUsedAt:', {
        orderId: row.orderId,
        ...dbErrorLog(error),
      })
    }

    return { orderId: row.orderId }
  }

  /** Tworzy jednorazowy token konta dla e-maila (zapisywany lowercase); zwraca surowy token. */
  async createAccountToken(email: string, now: Date = new Date()): Promise<string> {
    const raw = generateRawToken()
    const tokenHash = await hashToken(raw)
    try {
      await this.db.insert(shopAccountTokens).values({
        email: email.trim().toLowerCase(),
        tokenHash,
        expiresAt: addDays(now, ACCOUNT_TOKEN_TTL_DAYS),
        createdAt: now,
      })
    } catch (error) {
      console.error('[ShopTokenService] Error creating account token:', dbErrorLog(error))
      throw new Error('Failed to create account token')
    }
    return raw
  }

  /**
   * Atomowo zużywa token konta: jeden UPDATE … WHERE used_at IS NULL AND expires_at > now RETURNING.
   * Dwa równoległe wywołania → dokładnie jedno zwraca { email }. W transakcji: patrz nagłówek pliku.
   */
  async consumeAccountToken(raw: string, now: Date = new Date()): Promise<{ email: string } | null> {
    if (!isWellFormed(raw)) return null
    const tokenHash = await hashToken(raw)
    try {
      const [row] = await this.db
        .update(shopAccountTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(shopAccountTokens.tokenHash, tokenHash),
            isNull(shopAccountTokens.usedAt),
            gt(shopAccountTokens.expiresAt, now)
          )
        )
        .returning({ email: shopAccountTokens.email })
      return row ? { email: row.email } : null
    } catch (error) {
      console.error('[ShopTokenService] Error consuming account token:', dbErrorLog(error))
      throw new Error('Failed to consume account token')
    }
  }

  /** Sprawdza token konta bez zużycia (render formularza). Zużyty / wygasły / zniekształcony → null. */
  async peekAccountToken(raw: string, now: Date = new Date()): Promise<{ email: string } | null> {
    if (!isWellFormed(raw)) return null
    const tokenHash = await hashToken(raw)
    try {
      const [row] = await this.db
        .select({ email: shopAccountTokens.email })
        .from(shopAccountTokens)
        .where(
          and(
            eq(shopAccountTokens.tokenHash, tokenHash),
            isNull(shopAccountTokens.usedAt),
            gt(shopAccountTokens.expiresAt, now)
          )
        )
        .limit(1)
      return row ? { email: row.email } : null
    } catch (error) {
      console.error('[ShopTokenService] Error peeking account token:', dbErrorLog(error))
      throw new Error('Failed to peek account token')
    }
  }
}
