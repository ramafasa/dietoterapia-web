import { db } from '@/db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { CreateUserCommand } from '../../types'
import type { User } from '../../db/schema'

/**
 * Repository Layer dla operacji na użytkownikach (users)
 *
 * Odpowiedzialności:
 * - Pobieranie użytkownika po emailu
 * - Tworzenie nowego użytkownika (rejestracja)
 * - Pobieranie użytkownika po ID
 */
export class UserRepository {
  /**
   * Sprawdza czy użytkownik o danym emailu już istnieje w systemie
   *
   * Używane do:
   * - Walidacji przed rejestracją (zapobieganie duplikatom)
   * - Logowania użytkownika
   *
   * @param email - Adres email do sprawdzenia (case-insensitive)
   * @returns Promise<User | null> - Użytkownik jeśli istnieje, null w przeciwnym razie
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1)

      return user ?? null
    } catch (error) {
      console.error('[UserRepository] Error finding user by email:', error)
      throw error
    }
  }

  /**
   * Tworzy nowego użytkownika w systemie
   *
   * Używane do:
   * - Rejestracji nowego pacjenta (signup)
   * - Utworzenia pierwszego dietetyka (seed)
   *
   * UWAGA: Ta funkcja NIE haszuje hasła - to powinno być zrobione przed wywołaniem
   *
   * @param command - CreateUserCommand z danymi użytkownika (zawiera zhaszowane hasło)
   * @returns Promise<User> - Utworzony użytkownik (bez hasła)
   * @throws Error jeśli email nie jest unikalny
   */
  async createUser(command: CreateUserCommand): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({
          email: command.email.toLowerCase(),
          passwordHash: command.password, // W command.password jest już hash
          role: command.role,
          firstName: command.firstName,
          lastName: command.lastName,
          age: command.age ?? null,
          gender: command.gender ?? null,
          status: command.status,
          // Note: goalWeight, pushEnabled, emailEnabled, reminderFrequency
          // are not in current schema - will be added in future migrations
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      return user
    } catch (error) {
      console.error('[UserRepository] Error creating user:', error)
      throw error
    }
  }

  /**
   * Pobiera użytkownika po ID
   *
   * Używane do:
   * - Pobrania danych użytkownika w sesji
   * - Weryfikacji właściciela zasobu
   *
   * @param userId - ID użytkownika
   * @returns Promise<User | null> - Użytkownik lub null jeśli nie znaleziono
   */
  async findById(userId: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      return user ?? null
    } catch (error) {
      console.error('[UserRepository] Error finding user by ID:', error)
      throw error
    }
  }
}

// Export singleton instance
export const userRepository = new UserRepository()
