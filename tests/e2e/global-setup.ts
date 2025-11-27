/**
 * Playwright Global Setup
 *
 * This file runs once before all e2e tests start.
 * It sets up a PostgreSQL database using Testcontainers,
 * runs migrations, and seeds test users.
 *
 * The container and credentials are stored for use by:
 * - Tests (via test-credentials.ts)
 * - Global teardown (for cleanup)
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as schema from '../../src/db/schema'
import { createPatient, createDietitian } from '../fixtures/users'
import {
  setPatientCredentials,
  setDietitianCredentials,
  setTestDatabaseUrl,
} from './test-credentials'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default async function globalSetup() {
  console.log('\n🚀 Starting E2E Global Setup...\n')

  try {
    // 1. Start PostgreSQL container
    console.log('🐳 Starting PostgreSQL container...')
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('e2e_test_db')
      .withUsername('e2e_test_user')
      .withPassword('e2e_test_password')
      .start()

    const connectionString = container.getConnectionUri()
    console.log('✅ PostgreSQL container started')

    // Store container info for teardown
    const containerInfo = {
      id: container.getId(),
      connectionString,
    }

    const containerInfoPath = path.join(__dirname, '.container-info.json')
    fs.writeFileSync(containerInfoPath, JSON.stringify(containerInfo, null, 2))

    // Store database URL for tests
    setTestDatabaseUrl(connectionString)

    // 2. Create database connection
    console.log('🔌 Connecting to database...')
    const sql = postgres(connectionString, { max: 10 })
    const db = drizzle(sql, { schema })
    console.log('✅ Connected to database')

    // 3. Run migrations
    console.log('🔄 Running migrations...')
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('✅ Migrations completed')

    // 4. Generate dynamic credentials
    const timestamp = Date.now()
    const patientEmail = `patient-${timestamp}@example.com`
    const dietitianEmail = `dietitian-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    // 5. Seed test users
    console.log('👤 Seeding test users...')

    // Create patient
    const patient = await createPatient(db, {
      email: patientEmail,
      password: testPassword,
      firstName: 'Test',
      lastName: 'Patient',
      status: 'active',
    })
    console.log(`  ✅ Patient created: ${patient.email}`)

    // Create dietitian
    const dietitian = await createDietitian(db, {
      email: dietitianEmail,
      password: testPassword,
      firstName: 'Test',
      lastName: 'Dietitian',
    })
    console.log(`  ✅ Dietitian created: ${dietitian.email}`)

    // 6. Store credentials for tests
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

    // 7. Close database connection (container stays running)
    await sql.end({ timeout: 5 })
    console.log('✅ Database connection closed')

    console.log('\n✅ E2E Global Setup Complete!\n')
    console.log('📋 Test Credentials:')
    console.log(`   Patient:   ${patientEmail} / ${testPassword}`)
    console.log(`   Dietitian: ${dietitianEmail} / ${testPassword}`)
    console.log('')

    // Set environment variable to indicate setup is complete
    process.env.E2E_SETUP_COMPLETE = 'true'
  } catch (error) {
    console.error('❌ E2E Global Setup Failed:', error)
    throw error
  }
}
