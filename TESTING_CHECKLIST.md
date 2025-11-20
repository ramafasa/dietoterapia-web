# Testing Setup Checklist

Use this checklist to verify your testing environment is ready.

## ✅ Initial Setup

- [ ] **Dependencies installed**
  ```bash
  npm install
  ```
  
- [ ] **Environment variables configured**
  ```bash
  cp .env.test.example .env.test
  # Edit .env.test with your values
  ```

- [ ] **Playwright browsers installed**
  ```bash
  npx playwright install chromium
  ```

- [ ] **Docker running** (required for integration tests)
  ```bash
  docker ps
  # Should show running containers or empty list (not error)
  ```

## ✅ Verify Installation

- [ ] **Check Vitest**
  ```bash
  npx vitest --version
  # Should show version 4.x.x
  ```

- [ ] **Check Playwright**
  ```bash
  npx playwright --version
  # Should show version 1.x.x
  ```

- [ ] **Check test scripts**
  ```bash
  npm run test:unit -- --help
  npm run test:e2e -- --help
  # Both should show help output
  ```

## ✅ Run Example Tests

- [ ] **Run unit tests**
  ```bash
  npm run test:unit
  # Should run 3 test files with example tests
  ```

- [ ] **Run integration tests** (requires Docker)
  ```bash
  npm run test:integration
  # Should start PostgreSQL container and run tests
  ```

- [ ] **Run E2E tests**
  ```bash
  npm run test:e2e
  # Should open browser and run tests
  ```

## ✅ Test Development Workflow

- [ ] **Watch mode works**
  ```bash
  npm run test:watch
  # Should start in watch mode, press 'q' to quit
  ```

- [ ] **UI mode works**
  ```bash
  npm run test:ui
  # Should open browser with test UI
  ```

- [ ] **Coverage generation works**
  ```bash
  npm run test:coverage
  # Should generate coverage report in coverage/
  ```

## ✅ Verify Test Fixtures

- [ ] **Database container starts**
  ```typescript
  // In a test file
  import { startTestDatabase } from '../helpers';
  const { db } = await startTestDatabase();
  // Should start PostgreSQL container
  ```

- [ ] **Fixtures work**
  ```typescript
  import { createPatient } from '../fixtures';
  const patient = await createPatient(db, {});
  // Should create a patient in test database
  ```

## ✅ Documentation

- [ ] **Read TESTING_SETUP.md**
  - Understand the testing strategy
  - Know how to write each type of test
  - Familiar with fixtures and helpers

- [ ] **Read tests/README.md**
  - Understand test structure
  - Know where to put different test types
  - Familiar with best practices

- [ ] **Bookmark QUICK_REFERENCE.md**
  - Quick access to common commands
  - Test templates
  - Common matchers

## ✅ CI/CD (Optional)

- [ ] **GitHub Actions configured**
  - Check `.github/workflows/test.yml` exists
  - Verify it runs on push/PR
  
- [ ] **Secrets configured** (if using CI)
  - `TEST_DATABASE_URL`
  - `TEST_LUCIA_SESSION_SECRET`
  - Other required secrets

## 🎯 Ready to Start Testing!

Once all items are checked, you're ready to:

1. ✅ Write tests for existing features
2. ✅ Practice TDD (Test-Driven Development)
3. ✅ Maintain high code coverage
4. ✅ Ensure quality before deployment

## 🆘 Troubleshooting

If any step fails, check:

1. **Dependencies**: Run `npm install` again
2. **Docker**: Ensure Docker Desktop is running
3. **Permissions**: Check file permissions
4. **Node version**: Use Node 20+ (check with `node --version`)
5. **Disk space**: Ensure sufficient disk space for Docker images

## 📚 Next Steps

After completing this checklist:

1. **Write your first test**
   - Start with a simple utility function
   - Follow the examples in `tests/unit/utils/`

2. **Add tests for existing features**
   - Prioritize critical paths (auth, weight entries)
   - Use the test plan as a guide

3. **Practice TDD**
   - Write tests before implementing features
   - Red → Green → Refactor

4. **Monitor coverage**
   - Aim for 70%+ coverage
   - Focus on meaningful tests, not just numbers

5. **Integrate into workflow**
   - Run tests before committing
   - Use watch mode during development
   - Review test results in CI/CD

## 🎉 Success!

If all items are checked, your testing environment is fully configured and ready for use.

Happy testing! 🚀

