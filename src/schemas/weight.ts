import { z } from 'zod'

/**
 * Schema walidacji dla dodawania wpisu wagi (POST /api/weight)
 *
 * Wymagania:
 * - weight: 30.0 - 250.0 kg (decimal 4,1)
 * - measurementDate: ISO 8601 string, max 7 dni wstecz
 * - note: opcjonalne, max 200 znaków
 */
export const createWeightEntrySchema = z.object({
  weight: z
    .number({
      required_error: 'Waga jest wymagana',
      invalid_type_error: 'Waga musi być liczbą',
    })
    .min(30.0, 'Waga musi wynosić co najmniej 30.0 kg')
    .max(250.0, 'Waga nie może przekraczać 250.0 kg')
    .refine(
      (val) => {
        // Sprawdzenie czy liczba ma max 1 miejsce po przecinku (zgodnie z decimal(4,1))
        const decimalPart = val.toString().split('.')[1]
        return !decimalPart || decimalPart.length <= 1
      },
      {
        message: 'Waga może mieć maksymalnie 1 miejsce po przecinku',
      }
    ),

  measurementDate: z
    .string({
      required_error: 'Data pomiaru jest wymagana',
      invalid_type_error: 'Data pomiaru musi być tekstem w formacie ISO 8601',
    })
    .refine(
      (val) => {
        // Check if string is in YYYY-MM-DD format or ISO 8601 format
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T.*)?$/
        if (!isoDateRegex.test(val)) {
          return false
        }
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      {
        message: 'Data pomiaru musi być w formacie ISO 8601 (np. 2025-10-30 lub 2025-10-30T08:00:00+02:00)',
      }
    )
    .refine(
      (val) => {
        // Cannot be future date (server-side validation)
        // Parse as local date to avoid timezone issues when comparing YYYY-MM-DD format
        let measurementDate: Date
        if (val.includes('T')) {
          // Full ISO 8601 with time
          measurementDate = new Date(val)
        } else {
          // YYYY-MM-DD format - parse as local date
          const [year, month, day] = val.split('-').map(Number)
          measurementDate = new Date(year, month - 1, day)
        }

        const now = new Date()
        now.setHours(23, 59, 59, 999) // End of today to allow current day
        return measurementDate <= now
      },
      {
        message: 'Nie można wybrać przyszłej daty',
      }
    )
    .refine(
      (val) => {
        // Max 7 days back (server-side validation)
        let measurementDate: Date
        if (val.includes('T')) {
          // Full ISO 8601 with time
          measurementDate = new Date(val)
        } else {
          // YYYY-MM-DD format - parse as local date
          const [year, month, day] = val.split('-').map(Number)
          measurementDate = new Date(year, month - 1, day)
        }

        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        sevenDaysAgo.setHours(0, 0, 0, 0)
        return measurementDate >= sevenDaysAgo
      },
      {
        message: 'Możesz dodać wagę maksymalnie 7 dni wstecz',
      }
    ),

  note: z
    .string()
    .max(200, 'Notatka może mieć maksymalnie 200 znaków')
    .optional(),
})

/**
 * Schema walidacji dla aktualizacji wpisu wagi (PATCH /api/weight/:id)
 */
export const updateWeightEntrySchema = z.object({
  weight: z
    .number({
      invalid_type_error: 'Waga musi być liczbą',
    })
    .min(30.0, 'Waga musi wynosić co najmniej 30.0 kg')
    .max(250.0, 'Waga nie może przekraczać 250.0 kg')
    .refine(
      (val) => {
        const decimalPart = val.toString().split('.')[1]
        return !decimalPart || decimalPart.length <= 1
      },
      {
        message: 'Waga może mieć maksymalnie 1 miejsce po przecinku',
      }
    ),

  note: z
    .string()
    .max(200, 'Notatka może mieć maksymalnie 200 znaków')
    .optional(),
})

/**
 * Schema dla potwierdzenia anomalii (POST /api/weight/:id/confirm)
 */
export const confirmOutlierSchema = z.object({
  confirmed: z.boolean({
    required_error: 'Pole "confirmed" jest wymagane',
    invalid_type_error: 'Pole "confirmed" musi być wartością logiczną',
  }),
})

/**
 * Schema walidacji dla query parameters GET /api/weight
 *
 * Parametry:
 * - startDate: ISO 8601 data (opcjonalne) - np. "2025-10-01"
 * - endDate: ISO 8601 data (opcjonalne) - np. "2025-10-30"
 * - limit: liczba wyników 1-100 (domyślnie 30)
 * - cursor: ISO 8601 timestamp dla keyset pagination (opcjonalne)
 */
export const getWeightHistoryQuerySchema = z.object({
  startDate: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true // Optional field
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      {
        message: 'startDate musi być w formacie ISO 8601 (np. 2025-10-01)',
      }
    ),

  endDate: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true // Optional field
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      {
        message: 'endDate musi być w formacie ISO 8601 (np. 2025-10-30)',
      }
    ),

  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 30))
    .pipe(
      z
        .number()
        .int('limit musi być liczbą całkowitą')
        .min(1, 'limit musi być co najmniej 1')
        .max(100, 'limit nie może przekraczać 100')
    ),

  cursor: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true // Optional field
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      {
        message: 'cursor musi być w formacie ISO 8601 timestamp',
      }
    ),
}).refine(
  (data) => {
    // Walidacja: startDate <= endDate (jeśli oba podane)
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate)
      const end = new Date(data.endDate)
      return start <= end
    }
    return true
  },
  {
    message: 'startDate nie może być późniejsza niż endDate',
    path: ['startDate'],
  }
)

// Export inferred types
export type CreateWeightEntryInput = z.infer<typeof createWeightEntrySchema>
export type UpdateWeightEntryInput = z.infer<typeof updateWeightEntrySchema>
export type ConfirmOutlierInput = z.infer<typeof confirmOutlierSchema>
export type GetWeightHistoryQuery = z.infer<typeof getWeightHistoryQuerySchema>
