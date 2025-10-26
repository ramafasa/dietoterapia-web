import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

if (!import.meta.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined')
}

const sql = neon(import.meta.env.DATABASE_URL)
export const db = drizzle(sql, { schema })
