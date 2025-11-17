import { z } from 'zod'

/**
 * Schema for GET /api/dietitian/patients query parameters
 * Validates status filter, pagination limit and offset
 */
export const getPatientsQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'ended', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type GetPatientsQuery = z.infer<typeof getPatientsQuerySchema>

/**
 * Schema for GET /api/dietitian/patients/:patientId path parameter
 * Validates that patientId is a valid UUID v4
 */
export const getPatientDetailsParamsSchema = z.object({
  patientId: z.string().uuid({ message: 'Invalid uuid' }),
})

export type GetPatientDetailsParams = z.infer<typeof getPatientDetailsParamsSchema>
