#!/usr/bin/env tsx
/**
 * Standalone E2E Test Data Cleanup Script
 *
 * This script removes all e2e test users and their related data from the database.
 * It can be run manually if tests are interrupted or fail.
 *
 * Usage:
 *   npx tsx tests/e2e/cleanup-e2e-data.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../src/db/schema'
import { users, consents, sessions, events, weightEntries } from '../../src/db/schema'
import { like, eq } from 'drizzle-orm'
import * as dotenv from 'dotenv'
import path from 'path'

async function cleanupE2EData() {
  console.log('\n🧹 E2E Test Data Cleanup Script\n')

  try {
    // Load DATABASE_URL
    const envPath = path.resolve(process.cwd(), '.env.local')
    const result = dotenv.config({ path: envPath })
    const connectionString = result.parsed?.DATABASE_URL || process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL not found in .env.local or environment variables')
    }

    console.log('📦 Using local development database')
    console.log(`   Database: ${connectionString.split('@')[1]?.split('?')[0] || 'unknown'}\n`)

    // Connect to database
    const sql = postgres(connectionString, { max: 10 })
    const db = drizzle(sql, { schema })

    // Find all e2e test users
    const e2eUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(like(users.email, 'e2e-%'))

    if (e2eUsers.length === 0) {
      console.log('✅ No e2e test data found. Database is clean.\n')
      await sql.end({ timeout: 5 })
      return
    }

    console.log(`📊 Found ${e2eUsers.length} e2e test user(s):`)
    e2eUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.id})`)
    })
    console.log('')

    // Delete related data for each user
    let weightEntriesDeleted = 0
    let sessionsDeleted = 0
    let consentsDeleted = 0
    let eventsDeleted = 0

    for (const user of e2eUsers) {
      // Delete weight entries
      const deletedWeightEntries = await db.delete(weightEntries)
        .where(eq(weightEntries.userId, user.id))
        .returning()
      weightEntriesDeleted += deletedWeightEntries.length

      // Delete sessions
      const deletedSessions = await db.delete(sessions)
        .where(eq(sessions.userId, user.id))
        .returning()
      sessionsDeleted += deletedSessions.length

      // Delete consents
      const deletedConsents = await db.delete(consents)
        .where(eq(consents.userId, user.id))
        .returning()
      consentsDeleted += deletedConsents.length

      // Delete events
      const deletedEvents = await db.delete(events)
        .where(eq(events.userId, user.id))
        .returning()
      eventsDeleted += deletedEvents.length
    }

    // Delete all e2e users
    await db.delete(users).where(like(users.email, 'e2e-%'))

    console.log('🗑️  Deleted:')
    console.log(`   - ${e2eUsers.length} user(s)`)
    console.log(`   - ${weightEntriesDeleted} weight entry/entries`)
    console.log(`   - ${sessionsDeleted} session(s)`)
    console.log(`   - ${consentsDeleted} consent(s)`)
    console.log(`   - ${eventsDeleted} event(s)`)
    console.log('')

    // Close database connection
    await sql.end({ timeout: 5 })

    console.log('✅ E2E test data cleanup complete!\n')
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    process.exit(1)
  }
}

// Run cleanup
cleanupE2EData()
