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
        // Check if string can be converted to valid Date
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      {
        message: 'Data pomiaru musi być w formacie ISO 8601 (np. 2025-10-30T08:00:00+02:00)',
      }
    )
    .refine(
      (val) => {
        // Cannot be future date (server-side validation)
        const date = new Date(val)
        const now = new Date()
        return date <= now
      },
      {
        message: 'Nie można wybrać przyszłej daty',
      }
    )
    .refine(
      (val) => {
        // Max 7 days back (server-side validation)
        const date = new Date(val)
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        sevenDaysAgo.setHours(0, 0, 0, 0)
        return date >= sevenDaysAgo
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

// Export inferred types
export type CreateWeightEntryInput = z.infer<typeof createWeightEntrySchema>
export type UpdateWeightEntryInput = z.infer<typeof updateWeightEntrySchema>
export type ConfirmOutlierInput = z.infer<typeof confirmOutlierSchema>
