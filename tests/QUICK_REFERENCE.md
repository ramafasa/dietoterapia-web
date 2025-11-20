# Testing Quick Reference

## 🚀 Commands

### Running Tests
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e          # E2E tests only
npm run test:watch        # Watch mode
npm run test:ui           # Interactive UI
npm run test:coverage     # Generate coverage
```

### Playwright Specific
```bash
npm run test:e2e          # Run E2E tests
npm run test:e2e:headed   # See browser
npm run test:e2e:debug    # Debug mode
npm run test:e2e:ui       # Interactive UI
npx playwright show-report # View last report
```

## 📝 Test Templates

### Unit Test
```typescript
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });
});
```

### React Hook Test
```typescript
import { renderHook } from '@testing-library/react';
import { useMyHook } from '@/hooks/useMyHook';

describe('useMyHook', () => {
  it('should return correct value', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(expected);
  });
});
```

### Integration Test
```typescript
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../helpers';

describe('MyService', () => {
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

  it('should work', async () => {
    // Test with real database
  });
});
```

### E2E Test
```typescript
import { test, expect } from '@playwright/test';

test('should do something', async ({ page }) => {
  await page.goto('/path');
  await page.click('button');
  await expect(page.locator('h1')).toContainText('Expected');
});
```

## 🏭 Fixtures

```typescript
import { createPatient, createWeightEntry } from '../fixtures';

// Create a patient
const patient = await createPatient(db, {
  email: 'test@example.com',
  status: 'active',
});

// Create a weight entry
const entry = await createWeightEntry(db, {
  patientId: patient.id,
  weight: 70.5,
  notes: 'Feeling good',
});

// Create a series
const entries = await createWeightEntrySeries(db, {
  patientId: patient.id,
  startWeight: 80,
  endWeight: 70,
  days: 30,
  pattern: 'decreasing',
});
```

## 🎯 Common Matchers

### Vitest/Jest
```typescript
expect(value).toBe(expected)
expect(value).toEqual(expected)
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).toBeUndefined()
expect(value).toBeDefined()
expect(array).toContain(item)
expect(string).toMatch(/pattern/)
expect(number).toBeGreaterThan(n)
expect(number).toBeLessThan(n)
expect(fn).toThrow()
expect(fn).toHaveBeenCalled()
expect(fn).toHaveBeenCalledWith(args)
```

### Testing Library
```typescript
expect(element).toBeInTheDocument()
expect(element).toBeVisible()
expect(element).toHaveTextContent('text')
expect(element).toHaveAttribute('attr', 'value')
expect(element).toHaveClass('className')
expect(element).toBeDisabled()
expect(element).toBeEnabled()
```

### Playwright
```typescript
await expect(page).toHaveURL('/path')
await expect(page).toHaveTitle('Title')
await expect(locator).toBeVisible()
await expect(locator).toBeHidden()
await expect(locator).toHaveText('text')
await expect(locator).toContainText('text')
await expect(locator).toHaveAttribute('attr', 'value')
await expect(locator).toHaveClass('className')
await expect(locator).toBeDisabled()
await expect(locator).toBeEnabled()
```

## 🔧 Mocking

### Mock Function
```typescript
import { vi } from 'vitest';

const mockFn = vi.fn();
mockFn.mockReturnValue(value);
mockFn.mockResolvedValue(value);
mockFn.mockRejectedValue(error);

expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(args);
expect(mockFn).toHaveBeenCalledTimes(n);
```

### Spy on Function
```typescript
const spy = vi.spyOn(object, 'method');
spy.mockImplementation(() => value);
spy.mockRestore();
```

### Mock Module
```typescript
vi.mock('@/lib/module', () => ({
  myFunction: vi.fn(() => 'mocked'),
}));
```

## 🐛 Debugging

### Vitest
```bash
# Run specific test
npm test -- path/to/test.test.ts

# Run tests matching pattern
npm test -- -t "pattern"

# Run in UI mode
npm run test:ui
```

### Playwright
```bash
# Run in headed mode
npm run test:e2e:headed

# Run in debug mode
npm run test:e2e:debug

# View trace
npx playwright show-report
```

### Console Logging
```typescript
// In tests
console.log('Debug:', value);

// In Playwright
await page.pause(); // Pause execution
```

## 📊 Coverage

```bash
# Generate coverage
npm run test:coverage

# View HTML report
open coverage/index.html
```

## 🔍 Selectors (Playwright)

```typescript
// By role (preferred)
page.getByRole('button', { name: 'Submit' })

// By label
page.getByLabel('Email')

// By placeholder
page.getByPlaceholder('Enter email')

// By text
page.getByText('Welcome')

// By test ID
page.getByTestId('submit-button')

// CSS selector
page.locator('button.primary')

// XPath
page.locator('xpath=//button')
```

## ⚡ Tips

1. **Keep tests fast** - Unit tests should run in milliseconds
2. **Test behavior, not implementation** - Focus on what, not how
3. **Use descriptive names** - Test names should explain expected behavior
4. **Arrange-Act-Assert** - Structure tests clearly
5. **One assertion per test** - Or at least one concept
6. **Clean up after tests** - Use afterEach/afterAll
7. **Mock external dependencies** - Don't make real API calls
8. **Use fixtures** - Create reusable test data
9. **Test edge cases** - Not just happy paths
10. **Keep tests independent** - Tests should not depend on each other

## 📚 More Info

- [TESTING_SETUP.md](../TESTING_SETUP.md) - Full setup guide
- [README.md](./README.md) - Testing documentation
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [Testing Library Docs](https://testing-library.com/)

