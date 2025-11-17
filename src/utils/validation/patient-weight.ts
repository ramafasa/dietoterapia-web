/**
 * Validation utilities for patient weight entry form (dietitian)
 */

/**
 * Validate weight value
 * Rules: 30.0 - 250.0 kg, precision 0.1
 */
export function validateWeight(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return 'Waga jest wymagana'
  }

  const weight = parseFloat(value)

  if (isNaN(weight)) {
    return 'Waga musi być liczbą'
  }

  if (weight < 30.0 || weight > 250.0) {
    return 'Waga musi być w zakresie 30.0 - 250.0 kg'
  }

  // Check precision (max 1 decimal place)
  const decimalPart = value.split('.')[1]
  if (decimalPart && decimalPart.length > 1) {
    return 'Waga może mieć maksymalnie 1 miejsce po przecinku'
  }

  return undefined
}

/**
 * Validate measurement date
 * Rules:
 * - Not in future
 * - Max 7 days in the past (backfill limit)
 * - ISO format YYYY-MM-DD
 */
export function validateMeasurementDate(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return 'Data pomiaru jest wymagana'
  }

  // Validate ISO format
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!isoDateRegex.test(value)) {
    return 'Data musi być w formacie YYYY-MM-DD'
  }

  const measurementDate = new Date(value)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Check if valid date
  if (isNaN(measurementDate.getTime())) {
    return 'Nieprawidłowa data'
  }

  // Check if in future
  if (measurementDate > today) {
    return 'Data nie może być w przyszłości'
  }

  // Check backfill limit (max 7 days in the past)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  if (measurementDate < sevenDaysAgo) {
    return 'Data nie może być starsza niż 7 dni wstecz'
  }

  return undefined
}

/**
 * Validate note for dietitian weight entry
 * Rules: Min 10 chars, max 200 chars (UX requirement)
 */
export function validateDietitianNote(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return 'Notatka jest wymagana'
  }

  const trimmedValue = value.trim()

  if (trimmedValue.length < 10) {
    return 'Notatka musi mieć co najmniej 10 znaków'
  }

  if (trimmedValue.length > 200) {
    return 'Notatka może mieć maksymalnie 200 znaków'
  }

  return undefined
}

/**
 * Validate status change note
 * Rules: Optional, max 500 chars
 */
export function validateStatusNote(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return undefined // Optional
  }

  if (value.length > 500) {
    return 'Notatka może mieć maksymalnie 500 znaków'
  }

  return undefined
}

/**
 * Validate date range (for history filters)
 */
export function validateDateRange(
  startDate: string,
  endDate: string
): { startDate?: string; endDate?: string } | undefined {
  const errors: { startDate?: string; endDate?: string } = {}

  // Validate format
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

  if (!startDate || !isoDateRegex.test(startDate)) {
    errors.startDate = 'Data początkowa jest wymagana (YYYY-MM-DD)'
  }

  if (!endDate || !isoDateRegex.test(endDate)) {
    errors.endDate = 'Data końcowa jest wymagana (YYYY-MM-DD)'
  }

  if (errors.startDate || errors.endDate) {
    return errors
  }

  // Validate relation
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime())) {
    errors.startDate = 'Nieprawidłowa data początkowa'
  }

  if (isNaN(end.getTime())) {
    errors.endDate = 'Nieprawidłowa data końcowa'
  }

  if (errors.startDate || errors.endDate) {
    return errors
  }

  if (start > end) {
    errors.endDate = 'Data końcowa musi być późniejsza niż początkowa'
  }

  return Object.keys(errors).length > 0 ? errors : undefined
}
