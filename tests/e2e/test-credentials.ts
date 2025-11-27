/**
 * Test Credentials Management
 *
 * This module provides centralized access to test user credentials
 * that are dynamically generated during global setup.
 *
 * Credentials are stored in process.env and shared across all tests
 * in a single test run.
 */

export interface TestCredentials {
  email: string
  password: string
  id?: string
}

/**
 * Store patient test credentials
 * Called by global setup
 */
export function setPatientCredentials(credentials: TestCredentials): void {
  process.env.TEST_PATIENT_EMAIL = credentials.email
  process.env.TEST_PATIENT_PASSWORD = credentials.password
  if (credentials.id) {
    process.env.TEST_PATIENT_ID = credentials.id
  }
}

/**
 * Store dietitian test credentials
 * Called by global setup
 */
export function setDietitianCredentials(credentials: TestCredentials): void {
  process.env.TEST_DIETITIAN_EMAIL = credentials.email
  process.env.TEST_DIETITIAN_PASSWORD = credentials.password
  if (credentials.id) {
    process.env.TEST_DIETITIAN_ID = credentials.id
  }
}

/**
 * Store test database URL
 * Called by global setup
 */
export function setTestDatabaseUrl(url: string): void {
  process.env.TEST_DATABASE_URL = url
}

/**
 * Get patient test credentials
 * Used by tests to access the seeded patient user
 */
export function getPatientCredentials(): TestCredentials {
  const email = process.env.TEST_PATIENT_EMAIL
  const password = process.env.TEST_PATIENT_PASSWORD
  const id = process.env.TEST_PATIENT_ID

  if (!email || !password) {
    throw new Error(
      'Patient credentials not found. Make sure global setup has run successfully.'
    )
  }

  return { email, password, id }
}

/**
 * Get dietitian test credentials
 * Used by tests to access the seeded dietitian user
 */
export function getDietitianCredentials(): TestCredentials {
  const email = process.env.TEST_DIETITIAN_EMAIL
  const password = process.env.TEST_DIETITIAN_PASSWORD
  const id = process.env.TEST_DIETITIAN_ID

  if (!email || !password) {
    throw new Error(
      'Dietitian credentials not found. Make sure global setup has run successfully.'
    )
  }

  return { email, password, id }
}

/**
 * Get test database URL
 * Used by tests or helper functions that need database access
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL

  if (!url) {
    throw new Error(
      'Test database URL not found. Make sure global setup has run successfully.'
    )
  }

  return url
}

/**
 * Check if test credentials are available
 * Useful for debugging setup issues
 */
export function hasTestCredentials(): boolean {
  return !!(
    process.env.TEST_PATIENT_EMAIL &&
    process.env.TEST_PATIENT_PASSWORD &&
    process.env.TEST_DIETITIAN_EMAIL &&
    process.env.TEST_DIETITIAN_PASSWORD
  )
}
