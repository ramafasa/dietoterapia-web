import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import * as dotenv from 'dotenv'
import * as path from 'path'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

// Load environment variables from .env.local
// Note: Astro doesn't expose non-PUBLIC_ prefixed vars to import.meta.env,
// so we must load them explicitly using dotenv
const envPath = path.resolve(process.cwd(), '.env.local')
const result = dotenv.config({ path: envPath, override: true })

// Use the parsed value from dotenv (more reliable than process.env in Astro context)
const DATABASE_URL = result.parsed?.DATABASE_URL || process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error(`DATABASE_URL is not defined. Check your .env.local file.`)
}

// Initialize Postgres client and Drizzle ORM
const client = postgres(DATABASE_URL, { max: 1 })
export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema })
