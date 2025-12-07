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
import { users, consents, sessions, events, weightEntries } from '../../src/db/schema'
import { createPatient, createDietitian } from '../fixtures/users'
import {
  setPatientCredentials,
  setDietitianCredentials,
} from './test-credentials'
import { like, eq } from 'drizzle-orm'
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

    // 3. Clean up old e2e test data from previous runs
    console.log('🧹 Cleaning up old e2e test data...')

    // Find all e2e test users (email pattern: e2e-%)
    const e2eUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(like(users.email, 'e2e-%'))

    if (e2eUsers.length > 0) {
      console.log(`   Found ${e2eUsers.length} old e2e test user(s) to clean up`)

      // Delete related data for each user (in order of foreign key dependencies)
      for (const user of e2eUsers) {
        // Delete weight entries
        await db.delete(weightEntries).where(eq(weightEntries.userId, user.id))

        // Delete sessions
        await db.delete(sessions).where(eq(sessions.userId, user.id))

        // Delete consents
        await db.delete(consents).where(eq(consents.userId, user.id))

        // Delete events
        await db.delete(events).where(eq(events.userId, user.id))
      }

      // Delete all e2e users at once
      await db.delete(users).where(like(users.email, 'e2e-%'))

      console.log(`   ✅ Cleaned up ${e2eUsers.length} old e2e test user(s)`)
    } else {
      console.log('   ✅ No old e2e test data found')
    }

    // 4. Generate dynamic credentials
    const timestamp = Date.now()
    const patientEmail = `e2e-patient-${timestamp}@example.com`
    const dietitianEmail = `e2e-dietitian-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    // 5. Seed test users
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

    // 6. Store credentials and IDs for tests and cleanup
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

    // 7. Close database connection
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
