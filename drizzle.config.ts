import type { Config } from 'drizzle-kit'
import { config } from 'dotenv'

// Load .env.local file
config({ path: '.env.local' })

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
