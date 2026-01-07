import { z } from 'zod'

// ===== CLIENT-SIDE SCHEMAS (for forms in browser) =====
// These accept plain text passwords that will be hashed client-side

export const loginSchemaClient = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  password: z.string().min(1, 'Hasło jest wymagane'),
})

export const signupSchemaClient = z.object({
  invitationToken: z.string().min(1, 'Token zaproszenia jest wymagany').optional(), // Opcjonalne dla publicznej rejestracji
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
  confirmPassword: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
  firstName: z.string().min(1, 'Imię jest wymagane'),
  lastName: z.string().min(1, 'Nazwisko jest wymagane'),
  age: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female']).optional(),
  consents: z.array(z.object({
    type: z.string().min(1, 'Typ zgody jest wymagany'),
    text: z.string().min(1, 'Treść zgody jest wymagana'),
    accepted: z.boolean()
  })).min(1, 'Wymagana jest co najmniej jedna zgoda')
})
.refine(
  (data) => data.password === data.confirmPassword,
  {
    message: 'Podane hasła nie są zgodne',
    path: ['confirmPassword']
  }
)
.refine(
  (data) => {
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

// ===== SERVER-SIDE SCHEMAS (for API endpoints) =====
// These require SHA-256 hashed passwords from the client

export const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  password: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowy format hasła (wymagany SHA-256 hash)'),
})

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
})

// Client-side schema for password reset form (validates plain text password)
export const passwordResetConfirmSchema = z.object({
  password: z
    .string()
    .min(8, 'Hasło musi mieć minimum 8 znaków')
    .regex(/[A-Z]/, 'Hasło musi zawierać wielką literę')
    .regex(/[a-z]/, 'Hasło musi zawierać małą literę')
    .regex(/[0-9]/, 'Hasło musi zawierać cyfrę'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Hasła muszą być identyczne',
  path: ['confirmPassword'],
})

// Server-side schema for /api/auth/password-reset-confirm (accepts SHA-256 hash)
export const passwordResetConfirmSchemaServer = z.object({
  token: z.string().min(1, 'Token jest wymagany'),
  password: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowy format hasła (wymagany SHA-256 hash)'),
})

// Schema for new /api/auth/reset-password endpoint (API spec compliant)
// Accepts SHA-256 hash from client (password strength validated client-side)
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token jest wymagany'),
  newPassword: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowy format hasła (wymagany SHA-256 hash)'),
})

// Schema for POST /api/auth/signup endpoint
const consentSchema = z.object({
  type: z.string().min(1, 'Typ zgody jest wymagany'),
  text: z.string().min(1, 'Treść zgody jest wymagana'),
  accepted: z.boolean()
})

export const signupSchema = z.object({
  invitationToken: z.string().min(1, 'Token zaproszenia jest wymagany').optional(), // Opcjonalne dla publicznej rejestracji
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowy format hasła (wymagany SHA-256 hash)'),
  firstName: z.string().min(1, 'Imię jest wymagane'),
  lastName: z.string().min(1, 'Nazwisko jest wymagane'),
  age: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female']).optional(),
  consents: z.array(consentSchema).min(1, 'Wymagana jest co najmniej jedna zgoda')
}).refine(
  (data) => {
    // Sprawdzenie czy wymagane prawnie zgody są zaakceptowane
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

// Type exports
export type LoginInput = z.infer<typeof loginSchemaClient> // For forms (plain text password)
export type SignupInput = z.infer<typeof signupSchemaClient> // For forms (plain text password)
export type LoginInputServer = z.infer<typeof loginSchema> // For API (SHA-256 hash)
export type SignupInputServer = z.infer<typeof signupSchema> // For API (SHA-256 hash)
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema> // Client-side (plain text)
export type PasswordResetConfirmInputServer = z.infer<typeof passwordResetConfirmSchemaServer> // Server-side (SHA-256 hash)
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
