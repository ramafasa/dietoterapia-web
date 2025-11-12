import { endOfDay, addDays } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Europe/Warsaw';

/**
 * Check if an entry is within the edit window
 * Edit window: until the end of the day following the measurement date
 * Example: measurement on 2025-01-10 → can edit until 2025-01-11 23:59:59 CET
 */
export function isWithinEditWindow(measurementDate: Date | string): boolean {
  const now = new Date();

  // Convert measurement date to Date object if needed
  const measurement = typeof measurementDate === 'string'
    ? new Date(measurementDate)
    : measurementDate;

  // Get the measurement date in Warsaw timezone
  const measurementInWarsaw = toZonedTime(measurement, TIMEZONE);

  // Calculate end of next day in Warsaw timezone
  const nextDay = addDays(measurementInWarsaw, 1);
  const endOfNextDay = endOfDay(nextDay);

  // Convert end of next day back to UTC for comparison
  const endOfNextDayUTC = fromZonedTime(endOfNextDay, TIMEZONE);

  return now <= endOfNextDayUTC;
}
