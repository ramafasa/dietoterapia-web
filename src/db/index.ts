import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import * as dotenv from 'dotenv'
import * as path from 'path'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

// Export Database type for use in tests and other modules
export type Database = PostgresJsDatabase<typeof schema>

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
// For Neon Postgres in serverless environments (Vercel), we need proper timeout configuration
const isProduction = process.env.NODE_ENV === 'production'

const client = postgres(DATABASE_URL, {
  // Connection pool settings
  max: isProduction ? 1 : 10, // Serverless functions are short-lived

  // Timeout settings (critical for Neon on Vercel)
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Timeout connection attempts after 10 seconds

  // Disable prepared statements for better serverless compatibility
  // Neon recommends this for serverless environments
  prepare: false,

  // Enable keepalive to prevent connection drops
  ...(isProduction && {
    connection: {
      application_name: 'dietoterapia-web',
    }
  })
})

export const db: Database = drizzle(client, { schema })
