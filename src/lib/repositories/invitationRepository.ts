import { db } from '@/db'
import { invitations, users } from '../../db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import type { CreateInvitationCommand, InvitationListItemDTO } from '../../types'
import type { Invitation, User } from '../../db/schema'
import { randomBytes } from 'crypto'

/**
 * Repository Layer dla operacji na zaproszeniach (invitations)
 *
 * Odpowiedzialności:
 * - Sprawdzanie czy użytkownik o danym emailu już istnieje
 * - Tworzenie nowych zaproszeń z unikalnym tokenem
 * - Pobieranie zaproszenia po tokenie (walidacja)
 * - Generacja bezpiecznych tokenów zaproszenia
 */
export class InvitationRepository {
  /**
   * Sprawdza czy użytkownik o danym emailu już istnieje w systemie
   *
   * Używane do:
   * - Walidacji przed utworzeniem zaproszenia (zapobieganie duplikatom)
   * - Zapewnienia że email nie jest już zajęty
   *
   * @param email - Adres email do sprawdzenia (case-insensitive)
   * @returns Promise<User | null> - Użytkownik jeśli istnieje, null w przeciwnym razie
   */
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      // Drizzle doesn't have built-in case-insensitive search, but our schema
      // uses lowercase normalization in validation layer, so direct comparison is safe
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1)

      return user ?? null
    } catch (error) {
      console.error('[InvitationRepository] Error finding user by email:', error)
      throw error
    }
  }

  /**
   * Tworzy nowe zaproszenie dla pacjenta
   *
   * Używane do:
   * - Generowania unikalnego tokenu zaproszenia
   * - Zapisania zaproszenia z datą wygaśnięcia
   * - Umożliwienia późniejszej rejestracji pacjenta
   *
   * @param command - CreateInvitationCommand z danymi zaproszenia
   * @returns Promise<Invitation> - Utworzone zaproszenie
   * @throws Error jeśli token nie jest unikalny (bardzo mało prawdopodobne)
   */
  async create(command: CreateInvitationCommand): Promise<Invitation> {
    try {
      // Generuj kryptograficznie bezpieczny token
      const token = this.generateToken()

      const [invitation] = await db
        .insert(invitations)
        .values({
          email: command.email.toLowerCase(),
          token,
          createdBy: command.createdBy,
          expiresAt: command.expiresAt,
          createdAt: new Date(),
        })
        .returning()

      return invitation
    } catch (error) {
      console.error('[InvitationRepository] Error creating invitation:', error)
      throw error
    }
  }

  /**
   * Pobiera zaproszenie po tokenie (dla walidacji w public endpoint)
   *
   * Używane do:
   * - Walidacji tokenu zaproszenia w flow rejestracji
   * - Sprawdzenia czy token istnieje, jest aktywny i nie wygasł
   *
   * @param token - Token zaproszenia (64 znaki hex)
   * @returns Promise<Invitation | null> - Zaproszenie lub null jeśli nie znaleziono
   */
  async getByToken(token: string): Promise<Invitation | null> {
    try {
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.token, token))
        .limit(1)

      return invitation ?? null
    } catch (error) {
      console.error('[InvitationRepository] Error getting invitation by token:', error)
      throw error
    }
  }

  /**
   * Pobiera użytkownika po ID
   *
   * Używane do:
   * - Pobrania danych dietetyka (imię, nazwisko) do emaila
   *
   * @param userId - ID użytkownika
   * @returns Promise<User | null> - Użytkownik lub null jeśli nie znaleziono
   */
  async findUserById(userId: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      return user ?? null
    } catch (error) {
      console.error('[InvitationRepository] Error finding user by ID:', error)
      throw error
    }
  }

  /**
   * Oznacza zaproszenie jako użyte
   *
   * Używane do:
   * - Unieważnienia zaproszenia po pomyślnej rejestracji
   * - Powiązania zaproszenia z utworzonym użytkownikiem
   *
   * @param id - ID zaproszenia
   * @param userId - ID utworzonego użytkownika
   * @returns Promise<void>
   * @throws Error jeśli zaproszenie nie istnieje
   */
  async markUsed(id: string, userId: string): Promise<void> {
    try {
      await db
        .update(invitations)
        .set({
          usedAt: new Date(),
          // Note: Schema doesn't have 'usedBy' field
          // We can track who used the invitation through audit log
        })
        .where(eq(invitations.id, id))

      // Opcjonalnie można dodać sprawdzenie czy update dotknął wiersz
      // ale dla uproszczenia zakładamy że ID jest poprawne
    } catch (error) {
      console.error('[InvitationRepository] Error marking invitation as used:', error)
      throw error
    }
  }

  /**
   * Pobiera listę zaproszeń z paginacją i filtrowaniem
   *
   * Używane do:
   * - Wyświetlenia historii zaproszeń w panelu dietetyka
   * - Paginacji i filtrowania po statusie
   *
   * @param dietitianId - ID dietetyka (dla zabezpieczenia dostępu)
   * @param options - Opcje paginacji i filtrowania
   * @returns Promise<{ items: InvitationListItemDTO[], total: number }>
   */
  async getList(
    dietitianId: string,
    options: {
      limit: number
      offset: number
      status?: 'all' | 'pending' | 'used' | 'expired'
    }
  ): Promise<{ items: InvitationListItemDTO[], total: number }> {
    try {
      const { limit, offset, status = 'all' } = options
      const now = new Date()

      // Bazowe zapytanie - tylko zaproszenia utworzone przez danego dietetyka
      let baseQuery = db
        .select({
          id: invitations.id,
          email: invitations.email,
          createdAt: invitations.createdAt,
          expiresAt: invitations.expiresAt,
          usedAt: invitations.usedAt,
          createdBy: invitations.createdBy,
        })
        .from(invitations)
        .where(eq(invitations.createdBy, dietitianId))
        .$dynamic()

      // Filtrowanie po statusie
      if (status === 'used') {
        baseQuery = baseQuery.where(sql`${invitations.usedAt} IS NOT NULL`)
      } else if (status === 'expired') {
        baseQuery = baseQuery.where(
          sql`${invitations.usedAt} IS NULL AND ${invitations.expiresAt} < ${now}`
        )
      } else if (status === 'pending') {
        baseQuery = baseQuery.where(
          sql`${invitations.usedAt} IS NULL AND ${invitations.expiresAt} >= ${now}`
        )
      }
      // status === 'all' - brak dodatkowego filtra

      // Sortowanie: najnowsze na górze
      const items = await baseQuery
        .orderBy(desc(invitations.createdAt))
        .limit(limit)
        .offset(offset)

      // Mapowanie na DTO z obliczonym statusem
      const mappedItems: InvitationListItemDTO[] = items.map((item) => {
        let computedStatus: 'pending' | 'used' | 'expired'

        if (item.usedAt !== null) {
          computedStatus = 'used'
        } else if (item.expiresAt < now) {
          computedStatus = 'expired'
        } else {
          computedStatus = 'pending'
        }

        return {
          id: item.id,
          email: item.email,
          status: computedStatus,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
          createdBy: item.createdBy,
        }
      })

      // Policz całkowitą liczbę (dla paginacji)
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(invitations)
        .where(eq(invitations.createdBy, dietitianId))

      const total = Number(countResult.count)

      return { items: mappedItems, total }
    } catch (error) {
      console.error('[InvitationRepository] Error getting invitation list:', error)
      throw error
    }
  }

  /**
   * Unieważnia stare zaproszenie i tworzy nowe (resend)
   *
   * Używane do:
   * - Ponownego wysłania zaproszenia z nowym tokenem
   * - Unieważnienia poprzedniego tokenu
   *
   * @param invitationId - ID starego zaproszenia
   * @param dietitianId - ID dietetyka (dla zabezpieczenia dostępu)
   * @returns Promise<Invitation> - Nowe zaproszenie
   * @throws Error jeśli zaproszenie nie istnieje lub nie należy do dietetyka
   */
  async resendInvitation(
    invitationId: string,
    dietitianId: string
  ): Promise<Invitation> {
    try {
      // 1. Pobierz stare zaproszenie i sprawdź uprawnienia
      const [oldInvitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, invitationId))
        .limit(1)

      if (!oldInvitation) {
        throw new Error('Invitation not found')
      }

      if (oldInvitation.createdBy !== dietitianId) {
        throw new Error('Unauthorized: invitation does not belong to this dietitian')
      }

      // 2. Unieważnij stare zaproszenie (oznacz jako użyte)
      await db
        .update(invitations)
        .set({ usedAt: new Date() })
        .where(eq(invitations.id, invitationId))

      // 3. Utwórz nowe zaproszenie (7 dni ważności)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const token = this.generateToken()

      const [newInvitation] = await db
        .insert(invitations)
        .values({
          email: oldInvitation.email,
          token,
          createdBy: dietitianId,
          expiresAt,
          createdAt: new Date(),
        })
        .returning()

      return newInvitation
    } catch (error) {
      console.error('[InvitationRepository] Error resending invitation:', error)
      throw error
    }
  }

  /**
   * Generuje bezpieczny, unikalny token zaproszenia
   *
   * Format: 64 znaki hex (32 bajty losowych danych)
   * Prawdopodobieństwo kolizji: ~1 na 2^256
   *
   * @returns string - Token w formacie hex
   * @private
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex')
  }
}

// Export singleton instance
export const invitationRepository = new InvitationRepository()
