/**
 * Test Credentials Management
 *
 * This module provides centralized access to test user credentials
 * that are dynamically generated during global setup.
 *
 * Credentials are stored in process.env (for backward compatibility)
 * and in .test-users.json file (for cross-process access).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  // Try process.env first (for backward compatibility)
  let email = process.env.TEST_PATIENT_EMAIL
  let password = process.env.TEST_PATIENT_PASSWORD
  let id = process.env.TEST_PATIENT_ID

  // Fallback to reading from file (for cross-process access)
  if (!email || !password) {
    const testUsersPath = path.join(__dirname, '.test-users.json')
    if (fs.existsSync(testUsersPath)) {
      const testUsers = JSON.parse(fs.readFileSync(testUsersPath, 'utf-8'))
      email = testUsers.patientEmail
      password = testUsers.patientPassword
      id = testUsers.patientId
    }
  }

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
  // Try process.env first (for backward compatibility)
  let email = process.env.TEST_DIETITIAN_EMAIL
  let password = process.env.TEST_DIETITIAN_PASSWORD
  let id = process.env.TEST_DIETITIAN_ID

  // Fallback to reading from file (for cross-process access)
  if (!email || !password) {
    const testUsersPath = path.join(__dirname, '.test-users.json')
    if (fs.existsSync(testUsersPath)) {
      const testUsers = JSON.parse(fs.readFileSync(testUsersPath, 'utf-8'))
      email = testUsers.dietitianEmail
      password = testUsers.dietitianPassword
      id = testUsers.dietitianId
    }
  }

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
