/**
 * Zod Validation Schemas
 *
 * Centralized validation schemas for API endpoints and forms.
 */

import { z } from 'zod'

// ===== AUTHENTICATION SCHEMAS =====

/**
 * Consent schema - validates single consent object
 */
const consentSchema = z.object({
  type: z.string().min(1, 'Typ zgody jest wymagany'),
  text: z.string().min(1, 'Treść zgody jest wymagana'),
  accepted: z.boolean()
})

/**
 * Signup request schema
 * Validates POST /api/auth/signup payload
 */
export const signupSchema = z.object({
  invitationToken: z.string().min(1, 'Token zaproszenia jest wymagany'),
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
  firstName: z.string().min(1, 'Imię jest wymagane'),
  lastName: z.string().min(1, 'Nazwisko jest wymagane'),
  age: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  consents: z.array(consentSchema).min(1, 'Wymagana jest co najmniej jedna zgoda')
}).refine(
  (data) => {
    // Sprawdzenie czy wymagane prawnie zgody są zaakceptowane
    // Zakładamy, że wymagane są: data_processing i health_data
    const requiredTypes = ['data_processing', 'health_data']
    const acceptedTypes = data.consents
      .filter(c => c.accepted)
      .map(c => c.type)

    return requiredTypes.every(type => acceptedTypes.includes(type))
  },
  {
    message: 'Wymagane prawnie zgody (przetwarzanie danych i danych zdrowotnych) muszą być zaakceptowane',
    path: ['consents']
  }
)

/**
 * Login request schema
 */
export const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z.string().min(1, 'Hasło jest wymagane')
})

/**
 * Forgot password request schema
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email('Nieprawidłowy format adresu e-mail')
})

/**
 * Reset password request schema
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token resetowania hasła jest wymagany'),
  newPassword: z.string().min(8, 'Nowe hasło musi mieć co najmniej 8 znaków')
})

// ===== INVITATION SCHEMAS =====

/**
 * Create invitation request schema
 */
export const createInvitationSchema = z.object({
  email: z.string().email('Nieprawidłowy format adresu e-mail')
})

// ===== WEIGHT ENTRY SCHEMAS =====

/**
 * Create weight entry request schema
 */
export const createWeightEntrySchema = z.object({
  weight: z.number().positive('Waga musi być liczbą dodatnią').max(500, 'Waga nie może przekraczać 500 kg'),
  measurementDate: z.string().datetime('Nieprawidłowy format daty'),
  note: z.string().max(200, 'Notatka nie może przekraczać 200 znaków').optional()
})

/**
 * Update weight entry request schema
 */
export const updateWeightEntrySchema = z.object({
  weight: z.number().positive('Waga musi być liczbą dodatnią').max(500, 'Waga nie może przekraczać 500 kg'),
  note: z.string().max(200, 'Notatka nie może przekraczać 200 znaków').optional()
})

/**
 * Confirm outlier request schema
 */
export const confirmOutlierSchema = z.object({
  confirmed: z.boolean()
})

// ===== PATIENT MANAGEMENT SCHEMAS =====

/**
 * Update patient status request schema
 */
export const updatePatientStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'ended']),
  note: z.string().max(500, 'Notatka nie może przekraczać 500 znaków').optional()
})

// ===== PUSH NOTIFICATION SCHEMAS =====

/**
 * Subscribe to push notifications request schema
 */
export const subscribePushSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url('Nieprawidłowy format endpoint'),
    keys: z.object({
      p256dh: z.string().min(1, 'Klucz p256dh jest wymagany'),
      auth: z.string().min(1, 'Klucz auth jest wymagany')
    })
  })
})

/**
 * Unsubscribe from push notifications request schema
 */
export const unsubscribePushSchema = z.object({
  endpoint: z.string().url('Nieprawidłowy format endpoint')
})

// ===== USER PREFERENCES SCHEMAS =====

/**
 * Update preferences request schema
 */
export const updatePreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  reminderFrequency: z.enum(['default', 'reduced', 'disabled']).optional()
})

// ===== ACCOUNT MANAGEMENT SCHEMAS =====

/**
 * Delete account request schema
 */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Hasło jest wymagane'),
  confirmation: z.string().min(1, 'Potwierdzenie jest wymagane')
}).refine(
  (data) => data.confirmation === 'USUŃ KONTO',
  {
    message: 'Proszę wpisać "USUŃ KONTO" aby potwierdzić',
    path: ['confirmation']
  }
)

// ===== DIETITIAN ENDPOINTS SCHEMAS =====

/**
 * Get patient chart query params schema
 * Validates GET /api/dietitian/patients/:patientId/chart
 */
export const getPatientChartParamsSchema = z.object({
  patientId: z.string().uuid('Nieprawidłowy format UUID pacjenta')
})

export const getPatientChartQuerySchema = z.object({
  period: z.enum(['30', '90'], {
    errorMap: () => ({ message: 'Okres musi być 30 lub 90 dni' })
  }).optional().default('30')
})
