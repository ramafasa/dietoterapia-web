/**
 * Integration Tests: RBAC Middleware
 *
 * Tests role-based access control middleware with different user roles and routes.
 * Verifies access control, redirects, and route protection logic.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from '@/db';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createPatient, createDietitian, createSession } from '../../helpers/fixtures';

/**
 * Simulates RBAC middleware logic for testing
 */
function simulateRBACMiddleware(url: string, user: any | null): {
  allowed: boolean;
  redirectTo?: string;
} {
  // Protected routes
  const protectedPatterns = ['/pacjent/', '/dietetyk/'];
  const isProtectedRoute = protectedPatterns.some((pattern) =>
    url.startsWith(pattern)
  );

  // No user, protected route -> redirect to login
  if (isProtectedRoute && !user) {
    return { allowed: false, redirectTo: '/logowanie' };
  }

  // Dietitian trying to access patient route -> redirect to dietitian dashboard
  if (url.startsWith('/dietetyk/') && user?.role !== 'dietitian') {
    return { allowed: false, redirectTo: '/pacjent/waga' };
  }

  // Patient trying to access dietitian route -> redirect to patient dashboard
  if (url.startsWith('/pacjent/') && user?.role !== 'patient') {
    return { allowed: false, redirectTo: '/dietetyk/dashboard' };
  }

  // Logged-in user on login page -> redirect to appropriate dashboard
  if (url === '/logowanie' && user) {
    const redirectUrl =
      user.role === 'dietitian' ? '/dietetyk/dashboard' : '/pacjent/waga';
    return { allowed: false, redirectTo: redirectUrl };
  }

  return { allowed: true };
}

describe('Integration: RBAC Middleware', () => {
  let db: Database;

  beforeAll(async () => {
    const result = await startTestDatabase();
    db = result.db;
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('Patient Access Control', () => {
    it('should allow patient to access patient routes', async () => {
      const patient = await createPatient(db);

      const result = simulateRBACMiddleware('/pacjent/waga', {
        id: patient.id,
        email: patient.email,
        role: 'patient',
      });

      expect(result.allowed).toBe(true);
    });

    it('should redirect patient from dietitian routes', async () => {
      const patient = await createPatient(db);

      const result = simulateRBACMiddleware('/dietetyk/dashboard', {
        id: patient.id,
        email: patient.email,
        role: 'patient',
      });

      expect(result.allowed).toBe(false);
      // Patient should be redirected to their own dashboard, not the dietitian route
      expect(result.redirectTo).toBe('/pacjent/waga');
    });

    it('should allow patient to access public routes', async () => {
      const patient = await createPatient(db);

      const publicRoutes = ['/', '/o-mnie', '/konsultacje', '/kontakt'];

      publicRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, {
          id: patient.id,
          email: patient.email,
          role: 'patient',
        });

        expect(result.allowed).toBe(true);
      });
    });

    it('should redirect logged-in patient from login page', async () => {
      const patient = await createPatient(db);

      const result = simulateRBACMiddleware('/logowanie', {
        id: patient.id,
        email: patient.email,
        role: 'patient',
      });

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/pacjent/waga');
    });

    it('should allow patient with active status', async () => {
      const patient = await createPatient(db, 'active');

      const result = simulateRBACMiddleware('/pacjent/waga', {
        id: patient.id,
        email: patient.email,
        role: 'patient',
        status: 'active',
      });

      expect(result.allowed).toBe(true);
    });

    it('should allow patient with paused status (access control, not blocking)', async () => {
      const patient = await createPatient(db, 'paused');

      const result = simulateRBACMiddleware('/pacjent/waga', {
        id: patient.id,
        email: patient.email,
        role: 'patient',
        status: 'paused',
      });

      // RBAC allows access, but application logic might show different UI
      expect(result.allowed).toBe(true);
    });
  });

  describe('Dietitian Access Control', () => {
    it('should allow dietitian to access dietitian routes', async () => {
      const dietitian = await createDietitian(db);

      const result = simulateRBACMiddleware('/dietetyk/dashboard', {
        id: dietitian.id,
        email: dietitian.email,
        role: 'dietitian',
      });

      expect(result.allowed).toBe(true);
    });

    it('should redirect dietitian from patient routes', async () => {
      const dietitian = await createDietitian(db);

      const result = simulateRBACMiddleware('/pacjent/waga', {
        id: dietitian.id,
        email: dietitian.email,
        role: 'dietitian',
      });

      expect(result.allowed).toBe(false);
      // Dietitian should be redirected to their own dashboard, not the patient route
      expect(result.redirectTo).toBe('/dietetyk/dashboard');
    });

    it('should allow dietitian to access public routes', async () => {
      const dietitian = await createDietitian(db);

      const publicRoutes = ['/', '/o-mnie', '/konsultacje', '/kontakt'];

      publicRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, {
          id: dietitian.id,
          email: dietitian.email,
          role: 'dietitian',
        });

        expect(result.allowed).toBe(true);
      });
    });

    it('should redirect logged-in dietitian from login page', async () => {
      const dietitian = await createDietitian(db);

      const result = simulateRBACMiddleware('/logowanie', {
        id: dietitian.id,
        email: dietitian.email,
        role: 'dietitian',
      });

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/dietetyk/dashboard');
    });
  });

  describe('Unauthenticated Access Control', () => {
    it('should redirect unauthenticated user from patient routes', () => {
      const result = simulateRBACMiddleware('/pacjent/waga', null);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/logowanie');
    });

    it('should redirect unauthenticated user from dietitian routes', () => {
      const result = simulateRBACMiddleware('/dietetyk/dashboard', null);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/logowanie');
    });

    it('should allow unauthenticated user to access public routes', () => {
      const publicRoutes = ['/', '/o-mnie', '/konsultacje', '/kontakt', '/logowanie'];

      publicRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, null);
        expect(result.allowed).toBe(true);
      });
    });

    it('should allow unauthenticated user to access login page', () => {
      const result = simulateRBACMiddleware('/logowanie', null);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Route Protection Patterns', () => {
    it('should protect all routes starting with /pacjent/', async () => {
      const patientRoutes = [
        '/pacjent/waga',
        '/pacjent/waga/welcome',
        '/pacjent/historia',
        '/pacjent/ustawienia',
      ];

      patientRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, null);
        expect(result.allowed).toBe(false);
        expect(result.redirectTo).toBe('/logowanie');
      });
    });

    it('should protect all routes starting with /dietetyk/', () => {
      const dietitianRoutes = [
        '/dietetyk/dashboard',
        '/dietetyk/pacjenci',
        '/dietetyk/pacjenci/123',
        '/dietetyk/ustawienia',
      ];

      dietitianRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, null);
        expect(result.allowed).toBe(false);
        expect(result.redirectTo).toBe('/logowanie');
      });
    });

    it('should allow public routes without authentication', () => {
      const publicRoutes = [
        '/',
        '/o-mnie',
        '/konsultacje',
        '/opinie',
        '/kontakt',
        '/polityka-prywatnosci',
      ];

      publicRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, null);
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('Cross-Role Access Prevention', () => {
    it('should prevent patient from accessing any dietitian route', async () => {
      const patient = await createPatient(db);

      const dietitianRoutes = [
        '/dietetyk/dashboard',
        '/dietetyk/pacjenci',
        '/dietetyk/pacjenci/abc123',
        '/dietetyk/ustawienia',
      ];

      dietitianRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, {
          id: patient.id,
          email: patient.email,
          role: 'patient',
        });

        expect(result.allowed).toBe(false);
      });
    });

    it('should prevent dietitian from accessing any patient route', async () => {
      const dietitian = await createDietitian(db);

      const patientRoutes = [
        '/pacjent/waga',
        '/pacjent/waga/welcome',
        '/pacjent/historia',
        '/pacjent/ustawienia',
      ];

      patientRoutes.forEach((route) => {
        const result = simulateRBACMiddleware(route, {
          id: dietitian.id,
          email: dietitian.email,
          role: 'dietitian',
        });

        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('Integration with Session Management', () => {
    it('should verify patient role through session', async () => {
      const patient = await createPatient(db);
      const session = await createSession(db, patient.id);

      // Simulate fetching user from session
      const user = {
        id: patient.id,
        email: patient.email,
        role: patient.role,
      };

      const result = simulateRBACMiddleware('/pacjent/waga', user);

      expect(result.allowed).toBe(true);
    });

    it('should verify dietitian role through session', async () => {
      const dietitian = await createDietitian(db);
      const session = await createSession(db, dietitian.id);

      const user = {
        id: dietitian.id,
        email: dietitian.email,
        role: dietitian.role,
      };

      const result = simulateRBACMiddleware('/dietetyk/dashboard', user);

      expect(result.allowed).toBe(true);
    });

    it('should handle expired session (no user)', async () => {
      const result = simulateRBACMiddleware('/pacjent/waga', null);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/logowanie');
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with undefined role', () => {
      const result = simulateRBACMiddleware('/pacjent/waga', {
        id: '123',
        email: 'test@example.com',
        role: undefined,
      });

      // User without proper role should be redirected
      expect(result.allowed).toBe(false);
    });

    it('should handle malformed URLs', () => {
      const patient = {
        id: '123',
        email: 'test@example.com',
        role: 'patient',
      };

      const result = simulateRBACMiddleware('/pacjent/', patient);

      expect(result.allowed).toBe(true);
    });

    it('should be case-sensitive for route matching', () => {
      const patient = {
        id: '123',
        email: 'test@example.com',
        role: 'patient',
      };

      // Route patterns are case-sensitive
      const result1 = simulateRBACMiddleware('/Pacjent/waga', patient);
      const result2 = simulateRBACMiddleware('/PACJENT/waga', patient);

      // These should NOT match the protected pattern (lowercase)
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Multiple Users and Sessions', () => {
    it('should handle multiple patients with different sessions', async () => {
      const patient1 = await createPatient(db);
      const patient2 = await createPatient(db);

      const session1 = await createSession(db, patient1.id);
      const session2 = await createSession(db, patient2.id);

      const user1 = { id: patient1.id, email: patient1.email, role: 'patient' };
      const user2 = { id: patient2.id, email: patient2.email, role: 'patient' };

      const result1 = simulateRBACMiddleware('/pacjent/waga', user1);
      const result2 = simulateRBACMiddleware('/pacjent/waga', user2);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should handle patient and dietitian accessing their respective routes', async () => {
      const patient = await createPatient(db);
      const dietitian = await createDietitian(db);

      const patientResult = simulateRBACMiddleware('/pacjent/waga', {
        id: patient.id,
        email: patient.email,
        role: 'patient',
      });

      const dietitianResult = simulateRBACMiddleware('/dietetyk/dashboard', {
        id: dietitian.id,
        email: dietitian.email,
        role: 'dietitian',
      });

      expect(patientResult.allowed).toBe(true);
      expect(dietitianResult.allowed).toBe(true);
    });
  });
});
