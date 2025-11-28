/**
 * Authentication Service
 *
 * Business logic for authentication operations:
 * - Signup (patient registration)
 * - Login
 * - Password reset
 */

import bcrypt from 'bcrypt'
import { db as defaultDb, type Database } from '@/db'
import {
  UserRepository,
  userRepository as defaultUserRepository
} from '../repositories/userRepository'
import {
  InvitationRepository,
  invitationRepository as defaultInvitationRepository
} from '../repositories/invitationRepository'
import {
  ConsentRepository,
  consentRepository as defaultConsentRepository
} from '../repositories/consentRepository'
import {
  AuditLogRepository,
  auditLogRepository as defaultAuditLogRepository
} from '../repositories/auditLogRepository'
import {
  EventRepository,
  eventRepository as defaultEventRepository
} from '../repositories/eventRepository'
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
 * @param db - Database instance (dla testów można przekazać mock)
 * @returns Promise<{ user, userId }> - Dane użytkownika + ID (do utworzenia sesji)
 * @throws InvalidInvitationError - token nieprawidłowy/wygasły/użyty
 * @throws EmailConflictError - email już zarejestrowany
 * @throws MissingRequiredConsentsError - brak wymaganych zgód
 * @throws Error - błąd DB lub nieoczekiwany
 */
export async function signup(
  input: SignupRequest,
  db: Database = defaultDb,
  // Repository instances for dependency injection (mainly for testing)
  invitationRepositoryParam = defaultInvitationRepository,
  userRepositoryParam = defaultUserRepository,
  consentRepositoryParam = defaultConsentRepository,
  auditLogRepositoryParam = defaultAuditLogRepository,
  eventRepositoryParam = defaultEventRepository
): Promise<{
  user: SignupResponse['user']
  userId: string
}> {
  // If a custom db is passed (e.g., for integration tests), create new repository instances
  // Otherwise use the provided/default singleton instances
  const invitationRepository = db !== defaultDb
    ? new InvitationRepository(db)
    : invitationRepositoryParam
  const userRepository = db !== defaultDb
    ? new UserRepository(db)
    : userRepositoryParam
  const consentRepository = db !== defaultDb
    ? new ConsentRepository(db)
    : consentRepositoryParam
  const auditLogRepository = db !== defaultDb
    ? new AuditLogRepository(db)
    : auditLogRepositoryParam
  const eventRepository = db !== defaultDb
    ? new EventRepository(db)
    : eventRepositoryParam

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
      // For integration tests with real db, create repository instances with transaction context
      // For unit tests with mocked db.transaction, this creates instances that will use the mocked context
      const txUserRepository = db === defaultDb ? userRepository : new UserRepository(tx as unknown as Database)
      const txConsentRepository = db === defaultDb ? consentRepository : new ConsentRepository(tx as unknown as Database)
      const txInvitationRepository = db === defaultDb ? invitationRepository : new InvitationRepository(tx as unknown as Database)
      const txAuditLogRepository = db === defaultDb ? auditLogRepository : new AuditLogRepository(tx as unknown as Database)

      // 5a. Utwórz użytkownika
      const createUserCommand: CreateUserCommand = {
        email: input.email,
        password: input.password,
        passwordHash: passwordHash,
        role: 'patient',
        firstName: input.firstName,
        lastName: input.lastName,
        age: input.age,
        gender: input.gender,
        status: 'active',
        // Note: goalWeight, pushEnabled, emailEnabled, reminderFrequency
        // will be added in future schema migrations
      }

      const user = await txUserRepository.createUser(createUserCommand)

      // 5b. Zapisz zgody
      await txConsentRepository.createMany(user.id, input.consents)

      // 5c. Oznacz zaproszenie jako użyte
      await txInvitationRepository.markUsed(invitation.id, user.id)

      // 5d. Audit log - create user
      try {
        await txAuditLogRepository.create({
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
        await txAuditLogRepository.create({
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
