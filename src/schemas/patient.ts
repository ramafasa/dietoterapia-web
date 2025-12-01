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

/**
 * Helper function to validate ISO date format (YYYY-MM-DD)
 */
const isValidISODate = (val: string | undefined) => {
  if (!val) return true
  return /^\d{4}-\d{2}-\d{2}$/.test(val)
}

/**
 * Helper function to validate ISO 8601 timestamp for cursor
 */
const isValidISOTimestamp = (val: string | undefined) => {
  if (!val) return true
  const date = new Date(val)
  return !isNaN(date.getTime()) && val === date.toISOString()
}

/**
 * Schema for GET /api/dietitian/patients/:patientId/weight query parameters
 * Validates view type, date ranges, pagination limit and cursor
 */
export const getPatientWeightQuerySchema = z
  .object({
    view: z.enum(['today', 'week', 'range']).default('week'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Validate date formats
    if (data.startDate && !isValidISODate(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startDate must be in YYYY-MM-DD format',
        path: ['startDate'],
      })
    }
    if (data.endDate && !isValidISODate(data.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must be in YYYY-MM-DD format',
        path: ['endDate'],
      })
    }

    // Validate cursor format
    if (data.cursor && !isValidISOTimestamp(data.cursor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cursor must be a valid ISO 8601 timestamp',
        path: ['cursor'],
      })
    }

    // For 'range' view, startDate and endDate are required
    if (data.view === 'range') {
      if (!data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'startDate is required when view=range',
          path: ['startDate'],
        })
      }
      if (!data.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endDate is required when view=range',
          path: ['endDate'],
        })
      }

      // Validate startDate <= endDate
      if (data.startDate && data.endDate && data.startDate > data.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'startDate must be before or equal to endDate',
          path: ['startDate'],
        })
      }
    }
  })

export type GetPatientWeightQuery = z.infer<typeof getPatientWeightQuerySchema>

/**
 * Schema for GET /api/dietitian/patients/:patientId/chart query parameters
 * Validates period parameter (30 or 90 days)
 */
export const getPatientChartQuerySchema = z.object({
  period: z.enum(['30', '90'], {
    errorMap: () => ({ message: 'Period must be 30 or 90 days' }),
  }).default('30'),
})

export type GetPatientChartQuery = z.infer<typeof getPatientChartQuerySchema>
