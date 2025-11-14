import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  password: z.string().min(1, 'Hasło jest wymagane'),
})

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
})

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

// Schema for new /api/auth/reset-password endpoint (API spec compliant)
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token jest wymagany'),
  newPassword: z
    .string()
    .min(8, 'Hasło musi mieć minimum 8 znaków')
    .regex(/[A-Z]/, 'Hasło musi zawierać wielką literę')
    .regex(/[a-z]/, 'Hasło musi zawierać małą literę')
    .regex(/[0-9]/, 'Hasło musi zawierać cyfrę'),
})

// Schema for POST /api/auth/signup endpoint
const consentSchema = z.object({
  type: z.string().min(1, 'Typ zgody jest wymagany'),
  text: z.string().min(1, 'Treść zgody jest wymagana'),
  accepted: z.boolean()
})

export const signupSchema = z.object({
  invitationToken: z.string().min(1, 'Token zaproszenia jest wymagany'),
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
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

export type LoginInput = z.infer<typeof loginSchema>
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type SignupInput = z.infer<typeof signupSchema>
