import { invitationRepository } from '../repositories/invitationRepository'
import { auditLogRepository } from '../repositories/auditLogRepository'
import { eventRepository } from '../repositories/eventRepository'
import type { CreateInvitationCommand } from '../../types'
import type { Invitation } from '../../db/schema'
import { addDays } from 'date-fns'

/**
 * Custom error dla konfliktu - email już istnieje (409 Conflict)
 */
export class EmailAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailAlreadyExistsError'
  }
}

/**
 * Result type dla validateToken
 */
type ValidateTokenResult =
  | { valid: true; email: string; expiresAt: Date }
  | { valid: false; reason: 'not_found' | 'expired_or_used' }

/**
 * Service Layer dla logiki biznesowej zaproszeń (invitations)
 *
 * Odpowiedzialności:
 * - Walidacja reguł biznesowych (email nie może być już zajęty)
 * - Orchestracja operacji (check existing user, create invitation)
 * - Generowanie tokenu i daty wygaśnięcia
 * - Walidacja tokenu zaproszenia (public endpoint)
 * - Asynchroniczne logowanie (audit log, analytics events)
 */
export class InvitationService {
  private readonly INVITATION_EXPIRY_DAYS = 7

  /**
   * Tworzy nowe zaproszenie dla pacjenta
   *
   * Flow:
   * 1. Sprawdzenie czy użytkownik o tym emailu już istnieje
   * 2. Jeśli istnieje → rzuć EmailAlreadyExistsError (409)
   * 3. Generacja daty wygaśnięcia (teraz + 7 dni)
   * 4. Utworzenie zaproszenia przez repository
   * 5. Asynchroniczne logowanie (audit log + event)
   * 6. Zwrot utworzonego zaproszenia
   *
   * @param data - { email: string, createdBy: string }
   * @returns Promise<Invitation> - Utworzone zaproszenie z tokenem
   * @throws EmailAlreadyExistsError - Jeśli email jest już zajęty
   */
  async createInvitation(data: {
    email: string
    createdBy: string
  }): Promise<Invitation> {
    // 1. Sprawdź czy użytkownik już istnieje
    const existingUser = await invitationRepository.findUserByEmail(data.email)

    if (existingUser) {
      throw new EmailAlreadyExistsError(
        'Użytkownik o tym adresie email już istnieje w systemie'
      )
    }

    // 2. Generuj datę wygaśnięcia (+7 dni)
    const expiresAt = addDays(new Date(), this.INVITATION_EXPIRY_DAYS)

    // 3. Utwórz zaproszenie
    const command: CreateInvitationCommand = {
      email: data.email,
      createdBy: data.createdBy,
      expiresAt,
    }

    const invitation = await invitationRepository.create(command)

    // 4. Asynchroniczne logowanie (nie blokuj głównego flow)
    this.logInvitationCreation(invitation, data.createdBy).catch((error) => {
      console.error('[InvitationService] Failed to log invitation creation:', error)
      // Nie rzucaj błędu - główna operacja się powiodła
    })

    return invitation
  }

  /**
   * Waliduje token zaproszenia (public endpoint dla rejestracji)
   *
   * Flow:
   * 1. Pobierz zaproszenie po tokenie z repository
   * 2. Jeśli nie istnieje → { valid: false, reason: 'not_found' }
   * 3. Jeśli usedAt != null lub expiresAt < now → { valid: false, reason: 'expired_or_used' }
   * 4. Jeśli wszystko OK → { valid: true, email, expiresAt }
   * 5. Opcjonalnie: zaloguj zdarzenie (nieblokujące)
   *
   * @param token - Token zaproszenia z URL
   * @returns Promise<ValidateTokenResult>
   */
  async validateToken(token: string): Promise<ValidateTokenResult> {
    // 1. Pobierz zaproszenie z DB
    const invite = await invitationRepository.getByToken(token)

    let result: ValidateTokenResult

    // 2. Token nie istnieje w bazie
    if (!invite) {
      result = { valid: false, reason: 'not_found' }

      // Opcjonalnie: zaloguj zdarzenie (nieblokujące)
      this.logValidationEvent('not_found').catch(() => {
        // Silent fail - event tracking nie powinno blokować operacji
      })

      return result
    }

    const now = new Date()

    // 3. Sprawdź czy token został już wykorzystany lub wygasł
    if (invite.usedAt !== null || invite.expiresAt < now) {
      result = { valid: false, reason: 'expired_or_used' }

      // Opcjonalnie: zaloguj zdarzenie (nieblokujące)
      this.logValidationEvent('expired_or_used').catch(() => {
        // Silent fail
      })

      return result
    }

    // 4. Token jest prawidłowy
    result = {
      valid: true,
      email: invite.email,
      expiresAt: invite.expiresAt
    }

    // Opcjonalnie: zaloguj zdarzenie (nieblokujące)
    this.logValidationEvent('valid').catch(() => {
      // Silent fail
    })

    return result
  }

  /**
   * Loguje utworzenie zaproszenia do audit log i events
   *
   * @param invitation - Utworzone zaproszenie
   * @param createdBy - ID dietetyka, który utworzył zaproszenie
   * @private
   */
  private async logInvitationCreation(
    invitation: Invitation,
    createdBy: string
  ): Promise<void> {
    // Audit log - RODO compliance
    await auditLogRepository.create({
      userId: createdBy,
      action: 'create',
      tableName: 'invitations',
      recordId: invitation.id,
      before: undefined,
      after: {
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
        createdBy: invitation.createdBy,
      },
    })

    // Analytics event
    await eventRepository.create({
      userId: createdBy,
      eventType: 'invitation_created',
      properties: {
        method: 'dietitian_panel',
        email: invitation.email, // Bezpieczne - tylko dietetyk ma dostęp
      },
    })
  }

  /**
   * Loguje walidację tokenu zaproszenia (analytics)
   *
   * Używane do:
   * - Śledzenia popularności flow rejestracji
   * - Wykrywania problemów (np. wiele 'not_found' może oznaczać źle wysłane linki)
   *
   * BEZPIECZEŃSTWO:
   * - NIE logujemy surowego tokenu (prywatność)
   * - NIE logujemy e-maila (public endpoint)
   * - Logujemy tylko wynik walidacji (valid/not_found/expired_or_used)
   *
   * @param result - Wynik walidacji ('valid' | 'not_found' | 'expired_or_used')
   * @private
   */
  private async logValidationEvent(
    result: 'valid' | 'not_found' | 'expired_or_used'
  ): Promise<void> {
    await eventRepository.create({
      userId: null, // Public endpoint - brak userId
      eventType: 'invitation_validate',
      properties: {
        result,
        // Opcjonalnie można dodać ipHash dla rate limiting analysis
        // ipHash: crypto.createHash('sha256').update(ip).digest('hex')
      },
    })
  }
}

// Export singleton instance
export const invitationService = new InvitationService()
