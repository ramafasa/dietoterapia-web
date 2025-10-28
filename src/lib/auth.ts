import { Lucia, TimeSpan } from 'lucia'
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
  sessionExpiresIn: new TimeSpan(30, 'd'), // 30 days
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

// Helper functions
export async function createSession(userId: string) {
  return await lucia.createSession(userId, {})
}

export async function validateSession(sessionId: string) {
  return await lucia.validateSession(sessionId)
}

export async function invalidateSession(sessionId: string) {
  await lucia.invalidateSession(sessionId)
}
