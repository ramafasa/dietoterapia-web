import { z } from 'zod'

/**
 * Schemat walidacji dla POST /api/dietitian/invitations
 * Waliduje email nowego pacjenta do zaproszenia
 */
export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Nieprawidłowy adres email'),
})

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>
