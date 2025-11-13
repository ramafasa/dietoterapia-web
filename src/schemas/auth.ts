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

export type LoginInput = z.infer<typeof loginSchema>
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
