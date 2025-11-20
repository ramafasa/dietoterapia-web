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
│   ├── global-setup.ts # Global setup (runs once before all tests)
│   └── test-setup.ts   # Test environment setup (runs before each test file)
├── fixtures/           # Test data factories
│   ├── users.ts        # User creation helpers
│   ├── weight-entries.ts # Weight entry creation helpers
│   ├── invitations.ts  # Invitation creation helpers
│   └── password-reset.ts # Password reset token helpers
├── helpers/            # Test utilities
│   ├── db-container.ts # Testcontainers PostgreSQL setup
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
    ├── auth/           # Authentication flows
    ├── patient/        # Patient user flows
    └── dietitian/      # Dietitian user flows
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

Example:
```typescript
import { test, expect } from '@playwright/test';

test('patient can add weight entry', async ({ page }) => {
  await page.goto('/logowanie');
  await page.fill('input[name="email"]', 'patient@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/pacjent/waga');
  // Continue with weight entry flow...
});
```

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

### Testcontainers
- Start containers in `beforeAll` and stop in `afterAll`
- Clean database in `beforeEach` for test isolation
- Use fixtures to create test data instead of seed files
- Keep container instances minimal (one per test suite)

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

### Testcontainers Issues
- Ensure Docker is running
- Check Docker has enough resources (memory, disk)
- On CI, ensure Docker-in-Docker is properly configured

### E2E Test Failures
- Check if the dev server is running
- Verify environment variables are set correctly
- Use `--headed` and `--debug` flags to see what's happening
- Check trace files in `playwright-report/`

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

