# Testing Setup Guide

This guide will help you get started with the testing environment for the Dietoterapia Web application.

## 🎯 Overview

The testing setup includes:
- **Vitest** for unit and integration tests
- **Playwright** for E2E tests
- **Testing Library** for React component testing
- **Testcontainers** for integration tests with PostgreSQL

## 📋 Prerequisites

1. **Node.js 20+** (recommended)
2. **Docker** (required for integration tests with Testcontainers)
3. **npm** or **pnpm**

## 🚀 Quick Start

### 1. Install Dependencies

All testing dependencies have been installed. If you need to reinstall:

```bash
npm install
```

### 2. Setup Environment Variables

Create a `.env.test` file from the example:

```bash
cp .env.test.example .env.test
```

Edit `.env.test` with your test configuration. The default values should work for most cases.

### 3. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## 📁 Project Structure

```
tests/
├── setup/              # Test configuration
│   ├── global-setup.ts
│   └── test-setup.ts
├── fixtures/           # Test data factories
│   ├── users.ts
│   ├── weight-entries.ts
│   ├── invitations.ts
│   └── password-reset.ts
├── helpers/            # Test utilities
│   ├── db-container.ts
│   └── test-utils.ts
├── unit/               # Unit tests
│   ├── utils/
│   ├── hooks/
│   └── services/
├── integration/        # Integration tests
│   ├── api/
│   ├── services/
│   └── middleware/
└── e2e/                # E2E tests
    ├── auth/
    ├── patient/
    └── dietitian/
```

## 🧪 Writing Tests

### Unit Tests

Unit tests are fast and isolated. They test individual functions, hooks, or components.

**Example: Testing a utility function**

```typescript
// tests/unit/utils/dates.test.ts
import { describe, it, expect } from 'vitest';
import { formatDate } from '@/utils/dates';

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2024-01-15');
    expect(formatDate(date, 'dd.MM.yyyy')).toBe('15.01.2024');
  });
});
```

**Example: Testing a React hook**

```typescript
// tests/unit/hooks/usePasswordStrength.test.tsx
import { renderHook } from '@testing-library/react';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';

describe('usePasswordStrength', () => {
  it('should return weak for short password', () => {
    const { result } = renderHook(() => usePasswordStrength('short'));
    expect(result.current.strength).toBe('weak');
  });
});
```

### Integration Tests

Integration tests use Testcontainers to spin up a real PostgreSQL database.

```typescript
// tests/integration/services/weight-entry.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers';
import { createPatient, createWeightEntry } from '../../fixtures';

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

  it('should create weight entry', async () => {
    const patient = await createPatient(db, {});
    const entry = await createWeightEntry(db, {
      patientId: patient.id,
      weight: 70.5,
    });
    
    expect(entry.weight).toBe(70.5);
  });
});
```

### E2E Tests

E2E tests use Playwright to test the application from a user's perspective.

```typescript
// tests/e2e/auth/login.test.ts
import { test, expect } from '@playwright/test';

test('should display login form', async ({ page }) => {
  await page.goto('/logowanie');
  
  await expect(page.locator('h1')).toContainText('Logowanie');
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});
```

## 🔧 Configuration Files

### vitest.config.ts

Main configuration for Vitest. Includes:
- Test environment (jsdom)
- Coverage settings
- Test patterns
- Global setup

### playwright.config.ts

Configuration for Playwright E2E tests. Includes:
- Browser configuration (Chromium by default)
- Base URL
- Retry settings
- Reporter configuration

### tests/setup/test-setup.ts

Runs before each test file. Sets up:
- Testing Library matchers
- Global mocks (fetch, IntersectionObserver, etc.)
- Environment variables

### tests/setup/global-setup.ts

Runs once before all tests. Loads `.env.test` file.

## 🐳 Testcontainers

Integration tests use Testcontainers to automatically start and stop PostgreSQL containers.

**Benefits:**
- Real database for integration tests
- Automatic cleanup
- Isolated test environment
- No manual database setup required

**Requirements:**
- Docker must be running
- Sufficient Docker resources (memory, disk)

**Usage:**

```typescript
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../helpers';

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
```

## 📊 Test Fixtures

Fixtures are helper functions to create test data. They're located in `tests/fixtures/`.

**Available fixtures:**

- `createDietitian(db, options)` - Create a dietitian user
- `createPatient(db, options)` - Create a patient user
- `createWeightEntry(db, options)` - Create a weight entry
- `createWeightEntrySeries(db, options)` - Create multiple weight entries
- `createInvitation(db, options)` - Create an invitation
- `createPasswordResetToken(db, options)` - Create a password reset token

**Example:**

```typescript
const patient = await createPatient(db, {
  email: 'test@example.com',
  status: 'active',
});

const entries = await createWeightEntrySeries(db, {
  patientId: patient.id,
  startWeight: 80,
  endWeight: 70,
  days: 30,
  pattern: 'decreasing',
});
```

## 🎭 Playwright Tips

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run in debug mode
npm run test:e2e:debug

# Run with UI
npm run test:e2e:ui
```

### Debugging

```bash
# Generate trace for failed tests
npx playwright test --trace on

# View trace
npx playwright show-report
```

### Page Object Model

For complex pages, consider using the Page Object Model:

```typescript
// tests/e2e/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/logowanie');
  }

  async login(email: string, password: string) {
    await this.page.fill('input[name="email"]', email);
    await this.page.fill('input[name="password"]', password);
    await this.page.click('button[type="submit"]');
  }
}
```

## 🔍 Coverage

Generate and view coverage reports:

```bash
# Generate coverage
npm run test:coverage

# Open coverage report in browser
open coverage/index.html
```

Coverage thresholds are configured in `vitest.config.ts`:
- Lines: 70%
- Functions: 70%
- Branches: 70%
- Statements: 70%

## 🚦 CI/CD

Tests run automatically in GitHub Actions on:
- Push to `main`, `develop`, or `weight-tracking` branches
- Pull requests to `main` or `develop`

The CI pipeline runs:
1. Type checking
2. Linting (if configured)
3. Unit tests
4. Integration tests
5. E2E tests (critical paths only)

See `.github/workflows/test.yml` for configuration.

## 🐛 Troubleshooting

### Docker Issues

**Problem:** Testcontainers can't connect to Docker

**Solution:**
- Ensure Docker is running
- Check Docker socket permissions
- On macOS: Docker Desktop must be running

### Slow Tests

**Problem:** Tests are running slowly

**Solution:**
- Run unit tests separately: `npm run test:unit`
- Use `test.concurrent` for independent tests
- Reduce test data size in fixtures
- Check Docker resources

### E2E Test Failures

**Problem:** E2E tests fail randomly

**Solution:**
- Use `--headed` to see what's happening
- Check if dev server is running
- Verify environment variables
- Use explicit waits instead of timeouts

### Type Errors

**Problem:** TypeScript errors in test files

**Solution:**
- Ensure `@types/*` packages are installed
- Check `tsconfig.json` includes test files
- Import types from correct locations

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [Testcontainers Documentation](https://testcontainers.com/)
- [Test Plan](./.ai-10xdevs/test-plan.md)

## 🎯 Next Steps

1. ✅ Setup complete
2. 📝 Write tests for your features
3. 🔄 Run tests regularly during development
4. 📊 Monitor coverage
5. 🚀 Deploy with confidence

## 💡 Best Practices

1. **Test Naming**: Use descriptive names that explain the expected behavior
2. **AAA Pattern**: Arrange, Act, Assert
3. **Test Isolation**: Each test should be independent
4. **Mock External Services**: Don't make real API calls in tests
5. **Use Fixtures**: Create reusable test data with fixtures
6. **Keep Tests Fast**: Unit tests should run in milliseconds
7. **Test User Flows**: E2E tests should cover critical user journeys
8. **Update Tests**: Keep tests in sync with code changes

Happy Testing! 🎉

