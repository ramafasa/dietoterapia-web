/**
 * DTO (Data Transfer Object) Types for Dietoterapia Weight Tracking API
 *
 * This file contains all request/response types used in API endpoints.
 * All DTOs are derived from database schema types (src/db/schema.ts).
 */

import type { User, Session, WeightEntry, Invitation, PushSubscription, Consent, AuditLog } from './db/schema'

// ===== COMMON TYPES =====

/** Generic API error response */
export type ApiError = {
  error: string
  message: string
  statusCode: number
}

/** Pagination for cursor-based navigation */
export type CursorPagination = {
  hasMore: boolean
  nextCursor: string | null
}

/** Pagination for offset-based navigation */
export type OffsetPagination = {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

// ===== AUTHENTICATION DTOs (Section 2.1) =====

/** POST /api/auth/signup - Request */
export type SignupRequest = {
  invitationToken: string
  email: string
  password: string
  firstName: string
  lastName: string
  age?: number
  gender?: 'male' | 'female' | 'other'
  consents: Array<{
    type: string
    text: string
    accepted: boolean
  }>
}

/** POST /api/auth/signup - Response */
export type SignupResponse = {
  user: Pick<User, 'id' | 'email' | 'role' | 'firstName' | 'lastName' | 'age' | 'gender' | 'status'>
  session: {
    id: string
    expiresAt: string
  }
}

/** POST /api/auth/login - Request */
export type LoginRequest = {
  email: string
  password: string
}

/** POST /api/auth/login - Response */
export type LoginResponse = {
  user: Pick<User, 'id' | 'email' | 'role' | 'firstName' | 'lastName' | 'status'>
  session: {
    id: string
    expiresAt: string
  }
}

/** POST /api/auth/forgot-password - Request */
export type ForgotPasswordRequest = {
  email: string
}

/** POST /api/auth/forgot-password - Response */
export type ForgotPasswordResponse = {
  message: string
}

/** POST /api/auth/reset-password - Request */
export type ResetPasswordRequest = {
  token: string
  newPassword: string
}

/** POST /api/auth/reset-password - Response */
export type ResetPasswordResponse = {
  message: string
}

// ===== INVITATION DTOs (Section 2.2) =====

/** POST /api/dietitian/invitations - Request */
export type CreateInvitationRequest = {
  email: string
}

/** POST /api/dietitian/invitations - Response */
export type CreateInvitationResponse = {
  invitation: Pick<Invitation, 'id' | 'email' | 'token' | 'expiresAt' | 'createdBy'>
  message: string
}

/** GET /api/invitations/:token - Response */
export type ValidateInvitationResponse = {
  valid: boolean
  email: string
  expiresAt: Date | null
}

// ===== WEIGHT ENTRIES - PATIENT DTOs (Section 2.3) =====

/** POST /api/weight - Request */
export type CreateWeightEntryRequest = {
  weight: number
  measurementDate: string
  note?: string
}

/** Anomaly warning returned when outlier detected */
export type AnomalyWarning = {
  type: 'anomaly_detected'
  message: string
  previousWeight: number
  previousDate: string
  change: number
}

/** POST /api/weight - Response */
export type CreateWeightEntryResponse = {
  entry: Pick<WeightEntry, 'id' | 'userId' | 'weight' | 'measurementDate' | 'source' | 'isBackfill' | 'isOutlier' | 'outlierConfirmed' | 'note' | 'createdAt' | 'createdBy'>
  warnings: AnomalyWarning[]
}

/** Weight entry DTO for list responses */
export type WeightEntryDTO = Pick<WeightEntry, 'id' | 'userId' | 'weight' | 'measurementDate' | 'source' | 'isBackfill' | 'isOutlier' | 'outlierConfirmed' | 'note' | 'createdAt' | 'updatedAt'>

/** GET /api/weight - Response */
export type GetWeightEntriesResponse = {
  entries: WeightEntryDTO[]
  pagination: CursorPagination
}

/** PATCH /api/weight/:id - Request */
export type UpdateWeightEntryRequest = {
  weight: number
  note?: string
}

/** PATCH /api/weight/:id - Response */
export type UpdateWeightEntryResponse = {
  entry: Pick<WeightEntry, 'id' | 'userId' | 'weight' | 'measurementDate' | 'source' | 'isBackfill' | 'isOutlier' | 'outlierConfirmed' | 'note' | 'createdAt' | 'updatedAt' | 'updatedBy'>
}

/** POST /api/weight/:id/confirm - Request */
export type ConfirmOutlierRequest = {
  confirmed: boolean
}

/** POST /api/weight/:id/confirm - Response */
export type ConfirmOutlierResponse = {
  entry: Pick<WeightEntry, 'id' | 'userId' | 'weight' | 'measurementDate' | 'source' | 'isBackfill' | 'isOutlier' | 'outlierConfirmed' | 'note' | 'createdAt' | 'updatedAt'>
}

// ===== WEIGHT ENTRIES - DIETITIAN DTOs (Section 2.4) =====

/** POST /api/dietitian/patients/:patientId/weight - Request */
export type CreateWeightEntryDietitianRequest = {
  weight: number
  measurementDate: string
  note?: string
}

/** POST /api/dietitian/patients/:patientId/weight - Response */
export type CreateWeightEntryDietitianResponse = {
  entry: Pick<WeightEntry, 'id' | 'userId' | 'weight' | 'measurementDate' | 'source' | 'isBackfill' | 'isOutlier' | 'outlierConfirmed' | 'note' | 'createdAt' | 'createdBy'>
}

/** Patient summary for dietitian views */
export type PatientSummaryDTO = {
  id: string
  firstName: string | null
  lastName: string | null
  status: string | null
}

/** GET /api/dietitian/patients/:patientId/weight - Response */
export type GetPatientWeightEntriesResponse = {
  patient: PatientSummaryDTO
  entries: WeightEntryDTO[]
  weeklyObligationMet: boolean
  pagination: CursorPagination
}

/** Chart data point for 7-day moving average */
export type ChartDataPoint = {
  date: string
  weight: number
  source: string
  isOutlier: boolean
  ma7: number
}

/** Weight statistics for chart */
export type WeightStatistics = {
  startWeight: number
  endWeight: number
  change: number
  changePercent: number
  avgWeeklyChange: number
  trendDirection: 'increasing' | 'decreasing' | 'stable'
}

/** GET /api/dietitian/patients/:patientId/chart - Response */
export type GetPatientChartResponse = {
  patient: PatientSummaryDTO
  chartData: {
    entries: ChartDataPoint[]
    statistics: WeightStatistics
    goalWeight: number | null
  }
}

// ===== PATIENT MANAGEMENT - DIETITIAN DTOs (Section 2.5) =====

/** Patient list item with compliance info */
export type PatientListItemDTO = {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  age: number | null
  gender: string | null
  status: string | null
  createdAt: Date
  lastWeightEntry: Date | null
  weeklyObligationMet: boolean
}

/** GET /api/dietitian/patients - Response */
export type GetPatientsResponse = {
  patients: PatientListItemDTO[]
  pagination: OffsetPagination
}

/** Patient statistics for detail view */
export type PatientStatistics = {
  totalEntries: number
  weeklyComplianceRate: number
  currentStreak: number
  longestStreak: number
  lastEntry: Date | null
}

/** GET /api/dietitian/patients/:patientId - Response */
export type GetPatientDetailsResponse = {
  patient: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'age' | 'gender' | 'status' | 'createdAt' | 'updatedAt'>
  statistics: PatientStatistics
}

/** PATCH /api/dietitian/patients/:patientId/status - Request */
export type UpdatePatientStatusRequest = {
  status: 'active' | 'paused' | 'ended'
  note?: string
}

/** PATCH /api/dietitian/patients/:patientId/status - Response */
export type UpdatePatientStatusResponse = {
  patient: {
    id: string
    firstName: string | null
    lastName: string | null
    status: string | null
    updatedAt: Date | null
  }
  message: string
}

// ===== PUSH NOTIFICATIONS DTOs (Section 2.6) =====

/** POST /api/push/subscribe - Request */
export type SubscribePushRequest = {
  subscription: {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  }
}

/** POST /api/push/subscribe - Response */
export type SubscribePushResponse = {
  subscription: Pick<PushSubscription, 'id' | 'userId' | 'endpoint' | 'createdAt'>
  message: string
}

/** DELETE /api/push/subscribe - Request */
export type UnsubscribePushRequest = {
  endpoint: string
}

// ===== USER PREFERENCES DTOs (Section 2.7) =====

/** User notification preferences (not in schema, will be stored in user table or separate table) */
export type UserPreferences = {
  userId: string
  pushEnabled: boolean
  emailEnabled: boolean
  reminderFrequency: 'default' | 'reduced' | 'disabled'
}

/** GET /api/preferences - Response */
export type GetPreferencesResponse = {
  preferences: UserPreferences
}

/** PATCH /api/preferences - Request */
export type UpdatePreferencesRequest = {
  pushEnabled?: boolean
  emailEnabled?: boolean
  reminderFrequency?: 'default' | 'reduced' | 'disabled'
}

/** PATCH /api/preferences - Response */
export type UpdatePreferencesResponse = {
  preferences: UserPreferences & {
    updatedAt: Date
  }
}

// ===== ANALYTICS - DIETITIAN DTOs (Section 2.8) =====

/** KPI metrics */
export type KPIMetrics = {
  weeklyComplianceRate: number
  totalWeeks: number
  weeksWithEntry: number
  activePatients: number
  totalEntries: number
  patientEntries: number
  dietitianEntries: number
}

/** Cohort comparison data */
export type CohortComparison = {
  previousPeriod: {
    weeklyComplianceRate: number
    change: number
    changePercent: number
  }
}

/** Reminder effectiveness metrics */
export type ReminderEffectiveness = {
  fridayReminders: {
    sent: number
    opened: number
    clicked: number
    openRate: number
    clickRate: number
    conversionRate: number
  }
  sundayReminders: {
    sent: number
    opened: number
    clicked: number
    openRate: number
    clickRate: number
    conversionRate: number
  }
}

/** GET /api/dietitian/analytics/kpi - Response */
export type GetKPIResponse = {
  kpi: {
    period: 'week' | 'month' | 'quarter'
    startDate: string
    endDate: string
    metrics: KPIMetrics
    cohortComparison: CohortComparison
    reminderEffectiveness: ReminderEffectiveness
  }
}

/** Cohort data */
export type CohortData = {
  cohortId: string
  startDate: string
  endDate: string
  activePatients: number
  weeklyComplianceRate: number
  avgEntriesPerPatient: number
  pushOptInRate: number
}

/** GET /api/dietitian/analytics/cohorts - Response */
export type GetCohortsResponse = {
  cohorts: CohortData[]
}

// ===== AUDIT & COMPLIANCE DTOs (Section 2.9) =====

/** Audit log entry DTO */
export type AuditLogEntryDTO = Pick<AuditLog, 'id' | 'userId' | 'action' | 'tableName' | 'recordId' | 'before' | 'after' | 'timestamp'>

/** GET /api/dietitian/audit - Response */
export type GetAuditLogResponse = {
  auditEntries: AuditLogEntryDTO[]
  pagination: OffsetPagination
}

/** DELETE /api/user/account - Request */
export type DeleteAccountRequest = {
  password: string
  confirmation: string
}

/** DELETE /api/user/account - Response */
export type DeleteAccountResponse = {
  message: string
  dataExportUrl: string
}

/** Weight entry for data export (minimal PII) */
export type WeightEntryExport = {
  weight: string
  measurementDate: Date
  note: string | null
  createdAt: Date
}

/** Consent for data export */
export type ConsentExport = {
  type: string
  accepted: boolean
  timestamp: Date
}

/** GET /api/user/export - Response */
export type ExportDataResponse = {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'age' | 'gender' | 'createdAt'>
  weightEntries: WeightEntryExport[]
  consents: ConsentExport[]
  exportedAt: Date
}

// ===== CRON JOBS DTOs (Section 2.10) =====

/** Reminder job results */
export type ReminderJobResults = {
  eligiblePatients: number
  remindersSent: number
  skipped: number
  errors: number
}

/** Reminder skip reasons */
export type ReminderSkipReasons = {
  alreadyEnteredThisWeek: number
  statusPaused: number
}

/** GET /api/cron/friday-reminder - Response */
export type FridayReminderResponse = {
  jobId: string
  timestamp: Date
  results: ReminderJobResults
  skippedReasons: ReminderSkipReasons
}

/** GET /api/cron/sunday-reminder - Response */
export type SundayReminderResponse = {
  jobId: string
  timestamp: Date
  results: ReminderJobResults
  skippedReasons: ReminderSkipReasons
}

/** Cleanup job results */
export type CleanupResults = {
  expiredSessions: number
  expiredInvitations: number
  expiredResetTokens: number
  accountsScheduledForDeletion: number
}

/** GET /api/cron/cleanup-expired-tokens - Response */
export type CleanupTokensResponse = {
  jobId: string
  timestamp: Date
  results: CleanupResults
}

// ===== COMMAND MODELS (Business Logic Operations) =====

/**
 * Command Models represent operations/mutations in the system.
 * These are used internally in service/repository layers.
 */

/** Create user command (from signup) */
export type CreateUserCommand = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'endedAt' | 'scheduledDeletionAt'> & {
  password: string
}

/** Create weight entry command (patient) */
export type CreateWeightEntryCommand = {
  userId: string
  weight: number
  measurementDate: Date
  source: 'patient' | 'dietitian'
  note?: string
  createdBy: string
}

/** Update weight entry command */
export type UpdateWeightEntryCommand = {
  id: string
  weight?: number
  note?: string
  updatedBy: string
}

/** Create invitation command */
export type CreateInvitationCommand = {
  email: string
  createdBy: string
  expiresAt: Date
}

/** Create push subscription command */
export type CreatePushSubscriptionCommand = {
  userId: string
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/** Update patient status command */
export type UpdatePatientStatusCommand = {
  patientId: string
  status: 'active' | 'paused' | 'ended'
  note?: string
  dietitianId: string
}

/** Create audit log command */
export type CreateAuditLogCommand = {
  userId: string | null
  action: 'create' | 'update' | 'delete'
  tableName: string
  recordId: string | null
  before?: unknown
  after?: unknown
}

/** Create event command (analytics) */
export type CreateEventCommand = {
  userId: string | null
  eventType: string
  properties?: Record<string, unknown>
}

/** Send reminder command */
export type SendReminderCommand = {
  userId: string
  channel: 'push' | 'email'
  day: 'friday' | 'sunday'
}