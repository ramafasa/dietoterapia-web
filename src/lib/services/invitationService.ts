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
 * Service Layer dla logiki biznesowej zaproszeń (invitations)
 *
 * Odpowiedzialności:
 * - Walidacja reguł biznesowych (email nie może być już zajęty)
 * - Orchestracja operacji (check existing user, create invitation)
 * - Generowanie tokenu i daty wygaśnięcia
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
}

// Export singleton instance
export const invitationService = new InvitationService()
