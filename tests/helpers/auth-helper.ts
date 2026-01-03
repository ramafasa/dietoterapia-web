import type { User, Session } from 'lucia';

/**
 * Mock authenticated user context for testing
 *
 * @example
 * ```ts
 * const locals = createMockAuthContext({
 *   user: { id: 'user-1', role: 'patient', email: 'test@example.com' }
 * });
 * ```
 */
export function createMockAuthContext(options?: {
  user?: Partial<User> | null;
  session?: Partial<Session> | null;
}): { user: User | null; session: Session | null } {
  const { user, session } = options || {};

  return {
    user: user
      ? ({
          id: user.id || 'mock-user-id',
          email: user.email || 'mock@example.com',
          firstName: user.firstName || 'Mock',
          lastName: user.lastName || 'User',
          role: user.role || 'patient',
          status: user.status || 'active',
          createdAt: user.createdAt || new Date(),
          updatedAt: user.updatedAt || new Date(),
          endedAt: user.endedAt || null,
          scheduledDeletionAt: user.scheduledDeletionAt || null,
          ...user,
        } as User)
      : null,
    session: session
      ? ({
          id: session.id || 'mock-session-id',
          userId: session.userId || user?.id || 'mock-user-id',
          expiresAt: session.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          ...session,
        } as Session)
      : null,
  };
}

/**
 * Create a mock patient user context
 *
 * @example
 * ```ts
 * const locals = createMockPatient({ id: 'patient-1' });
 * ```
 */
export function createMockPatient(overrides?: Partial<User>) {
  return createMockAuthContext({
    user: {
      role: 'patient',
      ...overrides,
    },
  });
}

/**
 * Create a mock dietitian user context
 *
 * @example
 * ```ts
 * const locals = createMockDietitian({ id: 'dietitian-1' });
 * ```
 */
export function createMockDietitian(overrides?: Partial<User>) {
  return createMockAuthContext({
    user: {
      role: 'dietitian',
      email: 'paulina@example.com',
      firstName: 'Paulina',
      lastName: 'Maciak',
      ...overrides,
    },
  });
}

/**
 * Create a mock unauthenticated context (no user, no session)
 *
 * @example
 * ```ts
 * const locals = createMockUnauthenticated();
 * // locals.user === null, locals.session === null
 * ```
 */
export function createMockUnauthenticated() {
  return createMockAuthContext({
    user: null,
    session: null,
  });
}
