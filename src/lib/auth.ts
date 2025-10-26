import { Lucia } from 'lucia'
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle'
import { db } from '@/db'
import { sessions, users } from '@/db/schema'
import type { User } from '@/db/schema'

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users)

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: import.meta.env.PROD
    }
  },
  sessionExpiresIn: 30 * 24 * 60 * 60 * 1000, // 30 dni
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
      role: attributes.role,
      firstName: attributes.firstName,
      lastName: attributes.lastName,
      status: attributes.status
    }
  }
})

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia
    DatabaseUserAttributes: Omit<User, 'id' | 'passwordHash'>
  }
}
