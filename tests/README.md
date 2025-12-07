# Testing Documentation

## Overview

This directory contains all tests for the Dietoterapia Web application, including unit tests, integration tests, and end-to-end (E2E) tests.

## Setup

### Prerequisites

1. Copy `.env.test.example` to `.env.test` and update with your test configuration:
   ```bash
   cp .env.test.example .env.test
   ```

2. Install dependencies (if not already done):
   ```bash
   npm install
   ```

3. For E2E tests, Playwright browsers are required:
   ```bash
   npx playwright install chromium
   ```

## Running Tests

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### All Tests (Unit + Integration)
```bash
npm test
```

### E2E Tests
```bash
npm run test:e2e
```

### E2E Test Data Cleanup
```bash
# Manually clean up leftover e2e test data from database
npm run test:e2e:cleanup
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### UI Mode (interactive test runner)
```bash
npm run test:ui
```

### Coverage Report
```bash
npm run test:coverage
```

## Directory Structure

```
tests/
├── setup/              # Global test setup and configuration
│   ├── global-setup.ts # Global setup for unit/integration tests
│   └── test-setup.ts   # Test environment setup (runs before each test file)
├── fixtures/           # Test data factories
│   ├── users.ts        # User creation helpers
│   ├── weight-entries.ts # Weight entry creation helpers
│   ├── invitations.ts  # Invitation creation helpers
│   └── password-reset.ts # Password reset token helpers
├── helpers/            # Test utilities
│   ├── db-container.ts # Testcontainers PostgreSQL setup
│   ├── fixtures.ts     # Additional fixture helpers
│   └── test-utils.ts   # Common test utilities
├── unit/               # Unit tests (fast, isolated)
│   ├── services/       # Service layer tests
│   ├── utils/          # Utility function tests
│   └── hooks/          # React hooks tests
├── integration/        # Integration tests (with real DB)
│   ├── api/            # API endpoint tests
│   ├── middleware/     # Middleware tests
│   └── repositories/   # Repository tests
└── e2e/                # End-to-end tests (browser-based)
    ├── global-setup.ts     # E2E global setup (Testcontainers + seeding)
    ├── global-teardown.ts  # E2E global teardown (cleanup)
    ├── test-credentials.ts # Dynamic credentials management
    ├── page-objects/       # Page Object Model classes
    ├── auth/               # Authentication flows
    ├── patient/            # Patient user flows
    └── dietitian/          # Dietitian user flows
```

## Writing Tests

### Unit Tests

Unit tests should be fast, isolated, and test a single unit of code (function, class, hook).

Example:
```typescript
import { describe, it, expect } from 'vitest';
import { calculateBMI } from '@/utils/health';

describe('calculateBMI', () => {
  it('should calculate BMI correctly', () => {
    const result = calculateBMI(70, 1.75);
    expect(result).toBeCloseTo(22.86, 2);
  });
});
```

### Integration Tests

Integration tests use Testcontainers to spin up a real PostgreSQL database and test interactions between multiple components.

Example:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../helpers';
import { createPatient } from '../fixtures';

describe('Weight Entry Service', () => {
  let db;

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

  it('should create a weight entry', async () => {
    const patient = await createPatient(db, {});
    // Test weight entry creation...
  });
});
```

### E2E Tests

E2E tests use Playwright to test the application from a user's perspective in a real browser.

#### E2E Test Database Setup

E2E tests use the **local development database** (not Testcontainers). This ensures:
- Tests run against the same database schema as development
- Fast test execution (no container startup time)
- Easy debugging (can inspect database during test failures)

The setup happens automatically in `tests/e2e/global-setup.ts` which:
1. **Cleans up old e2e test data** (from previous failed/interrupted runs)
2. Seeds test users with **dynamic credentials** (unique per test run)
3. Stores credentials for tests to access
4. On teardown, deletes test users and their related data

**Important:** E2E tests automatically clean up data before and after each run. If tests are interrupted (Ctrl+C), you can manually clean up with `npm run test:e2e:cleanup`.

#### Using Dynamic Credentials

E2E tests use dynamically generated credentials to avoid conflicts between test runs. Import the credential helpers at the top of your test file:

```typescript
import { test, expect } from '@playwright/test';
import { getPatientCredentials, getDietitianCredentials } from '../test-credentials';

test('patient can add weight entry', async ({ page }) => {
  // Get dynamically generated credentials
  const { email, password } = getPatientCredentials();

  await page.goto('/logowanie');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/pacjent/waga');
  // Continue with weight entry flow...
});
```

**Note:** Never use hardcoded credentials (e.g., `patient@example.com`) in E2E tests. Always use `getPatientCredentials()` or `getDietitianCredentials()`.

#### E2E Test Lifecycle

1. **Global Setup** (once per test run)
   - Clean up old e2e test data (pattern: `e2e-%@example.com`)
   - Seed test users with dynamic credentials
   - Store credentials for tests to use

2. **Tests Execute** (parallel or sequential)
   - Dev server starts
   - Tests use dynamic credentials
   - Browser automation via Playwright

3. **Global Teardown** (once per test run)
   - Delete test users and related data
   - Clean up temporary files

**Note:** If tests are interrupted (Ctrl+C, crash, etc.), teardown doesn't run. The next test run will automatically clean up leftover data, or you can run `npm run test:e2e:cleanup` manually.

## Best Practices

### General
- Follow the AAA pattern: Arrange, Act, Assert
- Keep tests focused and test one thing at a time
- Use descriptive test names that explain the expected behavior
- Clean up after tests (use `afterEach` and `afterAll`)

### Vitest
- Use `vi.fn()` for function mocks
- Use `vi.spyOn()` to monitor existing functions
- Prefer spies over mocks when you only need to verify interactions
- Use inline snapshots for readable assertions

### Playwright
- Use Page Object Model for maintainable tests
- Use locators for resilient element selection
- Leverage the trace viewer for debugging test failures
- Run tests in parallel for faster execution

### Database Cleanup
- E2E tests automatically clean up before and after each run
- All e2e test users use the pattern `e2e-%@example.com` for easy identification
- If tests are interrupted, run `npm run test:e2e:cleanup` to manually clean up
- Integration tests use Testcontainers for isolation (see integration/README.md)

## Debugging

### Unit/Integration Tests
```bash
# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- path/to/test.test.ts

# Run tests matching pattern
npm test -- -t "pattern"

# Run with UI
npm run test:ui
```

### E2E Tests
```bash
# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug

# Open trace viewer for failed tests
npx playwright show-report
```

## CI/CD

Tests run automatically in CI on every push and pull request. The CI pipeline:

1. Runs linting and type checking
2. Runs unit tests
3. Runs integration tests (with Testcontainers)
4. Runs critical E2E tests (smoke tests)
5. Generates coverage reports

## Troubleshooting

### E2E Test Failures
- Check if the dev server is running
- Verify environment variables are set correctly
- Use `--headed` and `--debug` flags to see what's happening
- Check trace files in `playwright-report/`

#### Credentials Not Found Error
If you see `"Patient credentials not found. Make sure global setup has run successfully."`:
1. Check global setup logs for errors
2. Ensure `playwright.config.ts` has `globalSetup` configured
3. Try running with `--workers=1` to ensure serial execution
4. Verify `.env.local` has `DATABASE_URL` set

#### Database Connection Issues
If tests fail with database connection errors:
1. Verify `.env.local` has `DATABASE_URL` configured
2. Ensure database is accessible from your local machine
3. Check if old test data is blocking tests (run `npm run test:e2e:cleanup`)

#### Leftover Test Data
If you see many e2e test users in the database:
1. Run `npm run test:e2e:cleanup` to remove all e2e test data
2. Next test run will also automatically clean up old data
3. This can happen if tests were interrupted (Ctrl+C) before teardown completed

### Slow Tests
- Use `test.concurrent` for independent tests
- Mock external services instead of making real API calls
- Use smaller datasets in fixtures
- Consider splitting large test suites

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [Testcontainers Documentation](https://testcontainers.com/)

