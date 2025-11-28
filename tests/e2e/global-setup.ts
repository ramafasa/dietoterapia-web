/**
 * Playwright Global Setup
 *
 * This file runs once before all e2e tests start.
 * It uses the local development database and seeds test users.
 *
 * Test user credentials are stored for use by:
 * - Tests (via test-credentials.ts)
 * - Global teardown (for cleanup)
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../src/db/schema'
import { createPatient, createDietitian } from '../fixtures/users'
import {
  setPatientCredentials,
  setDietitianCredentials,
} from './test-credentials'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default async function globalSetup() {
  console.log('\n🚀 Starting E2E Global Setup...\n')

  try {
    // 1. Load DATABASE_URL from .env.local or environment (for CI)
    const envPath = path.resolve(process.cwd(), '.env.local')
    const result = dotenv.config({ path: envPath })
    const connectionString = result.parsed?.DATABASE_URL || process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL not found in .env.local or environment variables')
    }

    console.log('📦 Using local development database')
    console.log(`   Database: ${connectionString.split('@')[1]?.split('?')[0] || 'unknown'}`)

    // 2. Create database connection
    console.log('🔌 Connecting to database...')
    const sql = postgres(connectionString, { max: 10 })
    const db = drizzle(sql, { schema })
    console.log('✅ Connected to database')

    // 3. Generate dynamic credentials
    const timestamp = Date.now()
    const patientEmail = `e2e-patient-${timestamp}@example.com`
    const dietitianEmail = `e2e-dietitian-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    // 4. Seed test users
    console.log('👤 Seeding test users...')

    // Create patient
    const patient = await createPatient(db, {
      email: patientEmail,
      password: testPassword,
      firstName: 'E2E Test',
      lastName: 'Patient',
      status: 'active',
    })
    console.log(`  ✅ Patient created: ${patient.email}`)

    // Create dietitian
    const dietitian = await createDietitian(db, {
      email: dietitianEmail,
      password: testPassword,
      firstName: 'E2E Test',
      lastName: 'Dietitian',
    })
    console.log(`  ✅ Dietitian created: ${dietitian.email}`)

    // 5. Store credentials and IDs for tests and cleanup
    setPatientCredentials({
      email: patient.email,
      password: testPassword,
      id: patient.id,
    })

    setDietitianCredentials({
      email: dietitian.email,
      password: testPassword,
      id: dietitian.id,
    })

    // Store user IDs and credentials for cleanup and tests
    const testUsersPath = path.join(__dirname, '.test-users.json')
    fs.writeFileSync(testUsersPath, JSON.stringify({
      patientId: patient.id,
      dietitianId: dietitian.id,
      patientEmail: patient.email,
      patientPassword: testPassword,
      dietitianEmail: dietitian.email,
      dietitianPassword: testPassword,
    }, null, 2))

    // 6. Close database connection
    await sql.end({ timeout: 5 })
    console.log('✅ Database connection closed')

    console.log('\n✅ E2E Global Setup Complete!\n')
    console.log('📋 Test Credentials:')
    console.log(`   Patient:   ${patientEmail} / ${testPassword}`)
    console.log(`   Dietitian: ${dietitianEmail} / ${testPassword}`)
    console.log('')
  } catch (error) {
    console.error('❌ E2E Global Setup Failed:', error)
    throw error
  }
}
