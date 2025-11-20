import type { Database } from '@/db';
import { weightEntries } from '@/db/schema';
import { subDays } from 'date-fns';

/**
 * Create a weight entry for testing
 */
export async function createWeightEntry(db: Database, options: {
  patientId: string;
  weight: number;
  measurementDate?: Date;
  notes?: string;
  isBackfill?: boolean;
  isOutlier?: boolean;
  outlierConfirmed?: boolean;
  source?: 'patient' | 'dietitian';
  createdBy?: string;
}) {
  const [entry] = await db.insert(weightEntries).values({
    patientId: options.patientId,
    weight: options.weight,
    measurementDate: options.measurementDate || new Date(),
    notes: options.notes,
    isBackfill: options.isBackfill || false,
    isOutlier: options.isOutlier || false,
    outlierConfirmed: options.outlierConfirmed || false,
    source: options.source || 'patient',
    createdBy: options.createdBy || options.patientId,
  }).returning();
  
  return entry;
}

/**
 * Create a series of weight entries for testing (e.g., weight loss journey)
 */
export async function createWeightEntrySeries(db: Database, options: {
  patientId: string;
  startWeight: number;
  endWeight: number;
  days: number;
  pattern?: 'stable' | 'decreasing' | 'increasing' | 'irregular';
}) {
  const { patientId, startWeight, endWeight, days, pattern = 'decreasing' } = options;
  const entries = [];
  
  for (let i = 0; i < days; i++) {
    let weight: number;
    
    switch (pattern) {
      case 'stable':
        weight = startWeight + (Math.random() * 0.4 - 0.2); // ±0.2 kg variation
        break;
      case 'decreasing':
        weight = startWeight - ((startWeight - endWeight) / days) * i + (Math.random() * 0.4 - 0.2);
        break;
      case 'increasing':
        weight = startWeight + ((endWeight - startWeight) / days) * i + (Math.random() * 0.4 - 0.2);
        break;
      case 'irregular':
        weight = startWeight + (Math.random() * 4 - 2); // ±2 kg variation
        break;
    }
    
    const entry = await createWeightEntry(db, {
      patientId,
      weight: Math.round(weight * 10) / 10, // Round to 1 decimal
      measurementDate: subDays(new Date(), days - i - 1),
    });
    
    entries.push(entry);
  }
  
  return entries;
}

/**
 * Create a weight entry with outlier for testing
 */
export async function createOutlierWeightEntry(db: Database, options: {
  patientId: string;
  previousWeight: number;
  jump: number; // kg difference from previous weight
  measurementDate?: Date;
  confirmed?: boolean;
}) {
  return createWeightEntry(db, {
    patientId: options.patientId,
    weight: options.previousWeight + options.jump,
    measurementDate: options.measurementDate || new Date(),
    isOutlier: true,
    outlierConfirmed: options.confirmed || false,
  });
}

