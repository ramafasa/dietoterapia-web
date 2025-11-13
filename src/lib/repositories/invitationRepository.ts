import { db } from '@/db'
import { invitations, users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { CreateInvitationCommand } from '../../types'
import type { Invitation, User } from '../../db/schema'
import { randomBytes } from 'crypto'

/**
 * Repository Layer dla operacji na zaproszeniach (invitations)
 *
 * Odpowiedzialności:
 * - Sprawdzanie czy użytkownik o danym emailu już istnieje
 * - Tworzenie nowych zaproszeń z unikalnym tokenem
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
