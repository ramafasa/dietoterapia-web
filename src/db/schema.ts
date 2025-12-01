import { pgTable, uuid, varchar, timestamp, decimal, boolean, text, jsonb, integer, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ===== USERS TABLE =====
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'patient' | 'dietitian'

  // Profile
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  age: integer('age'),
  gender: varchar('gender', { length: 20 }), // 'male' | 'female'

  // Status
  status: varchar('status', { length: 20 }).default('active').notNull(),
  // 'active' | 'paused' | 'ended'
  endedAt: timestamp('ended_at', { withTimezone: true }), // Data nadania statusu 'ended'
  scheduledDeletionAt: timestamp('scheduled_deletion_at', { withTimezone: true }), // ended_at + 24 miesiące

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Composite index for patient queries (role + status)
  // Optimizes: WHERE role = 'patient' AND status = 'active'
  roleStatusIndex: index('idx_users_role_status').on(table.role, table.status),
}))

// ===== SESSIONS TABLE (Lucia Auth) =====
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

// ===== WEIGHT ENTRIES TABLE =====
export const weightEntries = pgTable('weight_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),

  // Weight data
  weight: decimal('weight', { precision: 4, scale: 1 }).notNull(), // 30.0 - 250.0
  measurementDate: timestamp('measurement_date', { withTimezone: true }).notNull(),

  // Metadata
  source: varchar('source', { length: 20 }).notNull(), // 'patient' | 'dietitian'
  isBackfill: boolean('is_backfill').default(false).notNull(),
  isOutlier: boolean('is_outlier').default(false).notNull(),
  outlierConfirmed: boolean('outlier_confirmed').default(false),
  note: varchar('note', { length: 200 }),

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
}, (table) => ({
  // Unique constraint: jeden wpis wagi dziennie per użytkownik (Europe/Warsaw timezone)
  oneEntryPerDay: uniqueIndex('idx_one_entry_per_day').on(
    table.userId,
    sql`DATE(${table.measurementDate} AT TIME ZONE 'Europe/Warsaw')`
  ),
  // Index dla optymalizacji GET /api/weight (keyset pagination)
  userDateIndex: index('idx_weight_entries_user_date').on(
    table.userId,
    sql`${table.measurementDate} DESC`
  ),
}))

// ===== EVENTS TABLE (Analytics) =====
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  eventType: varchar('event_type', { length: 50 }).notNull(),
  // view_add_weight, add_weight_patient, add_weight_dietitian, edit_weight,
  // reminder_sent, reminder_open, reminder_click, login, signup, consent_accept

  properties: jsonb('properties'), // {channel, source, flags, etc.}
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
})

// ===== AUDIT LOG TABLE =====
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),

  action: varchar('action', { length: 50 }).notNull(), // create, update, delete
  tableName: varchar('table_name', { length: 50 }).notNull(),
  recordId: uuid('record_id'),

  before: jsonb('before'), // Stary stan
  after: jsonb('after'),   // Nowy stan

  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
})

// ===== INVITATIONS TABLE =====
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).unique().notNull(),

  createdBy: uuid('created_by').references(() => users.id).notNull(), // Dietetyk
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== PASSWORD RESET TOKENS =====
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).unique().notNull(),

  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== PUSH SUBSCRIPTIONS TABLE =====
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  endpoint: text('endpoint').unique().notNull(),
  keys: jsonb('keys').notNull(), // {p256dh, auth}

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== CONSENTS TABLE (RODO) =====
export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  consentType: varchar('consent_type', { length: 50 }).notNull(),
  // 'data_processing', 'health_data', 'marketing', etc.

  consentText: text('consent_text').notNull(), // Treść zgody w momencie akceptacji
  accepted: boolean('accepted').notNull(),

  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
})

// ===== LOGIN ATTEMPTS TABLE (Rate Limiting) =====
export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),

  success: boolean('success').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv4/IPv6
  userAgent: text('user_agent'),

  attemptedAt: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== TYPES (export dla TypeScript) =====
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type WeightEntry = typeof weightEntries.$inferSelect
export type NewWeightEntry = typeof weightEntries.$inferInsert
export type Event = typeof events.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type Invitation = typeof invitations.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type Consent = typeof consents.$inferSelect
export type LoginAttempt = typeof loginAttempts.$inferSelect
