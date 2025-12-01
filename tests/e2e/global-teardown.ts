/**
 * Playwright Global Teardown
 *
 * This file runs once after all e2e tests complete.
 * It cleans up test users from the local database.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../src/db/schema'
import { users, consents, sessions, events } from '../../src/db/schema'
import { eq } from 'drizzle-orm'
import * as dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default async function globalTeardown() {
  console.log('\n🧹 Starting E2E Global Teardown...\n')

  try {
    // Read test user IDs saved during setup
    const testUsersPath = path.join(__dirname, '.test-users.json')

    if (!fs.existsSync(testUsersPath)) {
      console.log('⚠️  No test users file found. Users may have already been cleaned up.')
      return
    }

    const testUsers = JSON.parse(fs.readFileSync(testUsersPath, 'utf-8'))
    const { patientId, dietitianId } = testUsers

    // Connect to database
    const envPath = path.resolve(process.cwd(), '.env.local')
    const result = dotenv.config({ path: envPath })
    const connectionString = result.parsed?.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL not found in .env.local')
    }

    const sql = postgres(connectionString, { max: 10 })
    const db = drizzle(sql, { schema })

    console.log('🗑️  Deleting test users and related data...')

    // Delete in order of foreign key dependencies
    const userIds = [patientId, dietitianId].filter(Boolean)

    for (const userId of userIds) {
      // Delete sessions
      await db.delete(sessions).where(eq(sessions.userId, userId))

      // Delete consents
      await db.delete(consents).where(eq(consents.userId, userId))

      // Delete events
      await db.delete(events).where(eq(events.userId, userId))

      // Delete user
      await db.delete(users).where(eq(users.id, userId))
    }

    console.log(`✅ Deleted ${userIds.length} test user(s) and related data`)

    // Close database connection
    await sql.end({ timeout: 5 })

    // Clean up the test users file
    fs.unlinkSync(testUsersPath)
    console.log('✅ Test users file cleaned up')

    console.log('\n✅ E2E Global Teardown Complete!\n')
  } catch (error) {
    console.error('❌ E2E Global Teardown Failed:', error)
    // Don't throw - teardown errors shouldn't fail the test run
  }
}
