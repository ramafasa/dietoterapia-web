/**
 * Authentication Service
 *
 * Business logic for authentication operations:
 * - Signup (patient registration)
 * - Login
 * - Password reset
 */

import bcrypt from 'bcrypt'
import { db } from '@/db'
import { userRepository } from '../repositories/userRepository'
import { invitationRepository } from '../repositories/invitationRepository'
import { consentRepository } from '../repositories/consentRepository'
import { auditLogRepository } from '../repositories/auditLogRepository'
import { eventRepository } from '../repositories/eventRepository'
import {
  InvalidInvitationError,
  EmailConflictError,
  MissingRequiredConsentsError,
} from '../errors'
import type { SignupRequest, SignupResponse, CreateUserCommand } from '../../types'

/**
 * Signup Service - Rejestracja nowego pacjenta
 *
 * Przepływ:
 * 1. Walidacja invitation token (istnieje, nie wygasł, nie został użyty)
 * 2. Sprawdzenie konfliktu email
 * 3. Walidacja wymaganych zgód (data_processing, health_data)
 * 4. Hashowanie hasła (bcrypt)
 * 5. Transakcja DB:
 *    - Utworzenie użytkownika (patient)
 *    - Zapisanie zgód
 *    - Oznaczenie zaproszenia jako użyte
 *    - Audit log (create user, use invitation)
 * 6. Event tracking (signup)
 * 7. Zwrot danych użytkownika (bez sesji - sesja tworzona w endpoincie)
 *
 * @param input - SignupRequest (już zwalidowane przez Zod)
 * @returns Promise<{ user, userId }> - Dane użytkownika + ID (do utworzenia sesji)
 * @throws InvalidInvitationError - token nieprawidłowy/wygasły/użyty
 * @throws EmailConflictError - email już zarejestrowany
 * @throws MissingRequiredConsentsError - brak wymaganych zgód
 * @throws Error - błąd DB lub nieoczekiwany
 */
export async function signup(input: SignupRequest): Promise<{
  user: SignupResponse['user']
  userId: string
}> {
  // 1. Sprawdź invitation token
  const invitation = await invitationRepository.getByToken(input.invitationToken)

  if (!invitation) {
    throw new InvalidInvitationError('Token zaproszenia nie istnieje')
  }

  if (invitation.usedAt) {
    throw new InvalidInvitationError('Token zaproszenia został już użyty')
  }

  if (invitation.expiresAt < new Date()) {
    throw new InvalidInvitationError('Token zaproszenia wygasł')
  }

  // Opcjonalnie: sprawdź czy email w zaproszeniu pasuje do emaila w rejestracji
  // (jeśli zaproszenie jest powiązane z konkretnym emailem)
  if (invitation.email && invitation.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new InvalidInvitationError(
      'Adres email nie pasuje do zaproszenia. Użyj adresu email, na który otrzymałeś zaproszenie.'
    )
  }

  // 2. Sprawdź konflikt email
  const existingUser = await userRepository.findByEmail(input.email)

  if (existingUser) {
    throw new EmailConflictError()
  }

  // 3. Walidacja wymaganych zgód
  // Zod już to waliduje, ale dodajemy double-check dla bezpieczeństwa
  const requiredConsentTypes = ['data_processing', 'health_data']
  const acceptedConsentTypes = input.consents
    .filter((c) => c.accepted)
    .map((c) => c.type)

  const missingConsents = requiredConsentTypes.filter(
    (type) => !acceptedConsentTypes.includes(type)
  )

  if (missingConsents.length > 0) {
    throw new MissingRequiredConsentsError(
      `Brak wymaganych zgód: ${missingConsents.join(', ')}`
    )
  }

  // 4. Hash hasła (bcrypt, 10 salt rounds)
  const passwordHash = await bcrypt.hash(input.password, 10)

  // 5. Transakcja DB
  try {
    const result = await db.transaction(async (tx) => {
      // 5a. Utwórz użytkownika
      const createUserCommand: CreateUserCommand = {
        email: input.email,
        password: passwordHash, // CreateUserCommand.password to hash
        role: 'patient',
        firstName: input.firstName,
        lastName: input.lastName,
        age: input.age,
        gender: input.gender,
        status: 'active',
        // Note: goalWeight, pushEnabled, emailEnabled, reminderFrequency
        // will be added in future schema migrations
      }

      const user = await userRepository.createUser(createUserCommand)

      // 5b. Zapisz zgody
      await consentRepository.createMany(user.id, input.consents)

      // 5c. Oznacz zaproszenie jako użyte
      await invitationRepository.markUsed(invitation.id, user.id)

      // 5d. Audit log - create user
      try {
        await auditLogRepository.create({
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
          },
        })
      } catch (auditError) {
        // Audit log nie powinien blokować transakcji (best-effort)
        console.error('[authService.signup] Audit log failed (create user):', auditError)
      }

      // 5e. Audit log - use invitation
      try {
        await auditLogRepository.create({
          userId: user.id,
          action: 'update',
          tableName: 'invitations',
          recordId: invitation.id,
          before: { usedAt: null },
          after: { usedAt: new Date() },
        })
      } catch (auditError) {
        console.error('[authService.signup] Audit log failed (use invitation):', auditError)
      }

      return user
    })

    // 6. Event tracking (signup) - best-effort, nie blokuje odpowiedzi
    try {
      await eventRepository.create({
        userId: result.id,
        eventType: 'signup',
        properties: {
          role: 'patient',
          invitationId: invitation.id,
        },
      })
    } catch (eventError) {
      console.error('[authService.signup] Event tracking failed:', eventError)
    }

    // 7. Zwróć dane użytkownika
    return {
      user: {
        id: result.id,
        email: result.email,
        role: result.role,
        firstName: result.firstName,
        lastName: result.lastName,
        age: result.age,
        gender: result.gender,
        status: result.status,
      },
      userId: result.id,
    }
  } catch (error) {
    console.error('[authService.signup] Transaction failed:', error)
    throw error
  }
}
