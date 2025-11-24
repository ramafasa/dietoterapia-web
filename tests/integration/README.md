# Integration Tests

Integration tests verify the application's interaction with the real PostgreSQL database using Testcontainers.

## Test Structure

```
tests/integration/
├── database/           # Direct database CRUD operations
│   ├── users.test.ts
│   ├── sessions.test.ts
│   ├── weight-entries.test.ts
│   └── events.test.ts
├── transactions/       # Complex multi-table transactions
│   └── signup.test.ts
└── middleware/         # Auth and RBAC middleware logic
    ├── auth.test.ts
    └── rbac.test.ts
```

## Running Tests

```bash
# Run all integration tests
npm run test:unit -- tests/integration

# Run specific test file
npm run test:unit -- tests/integration/database/users.test.ts

# Run with coverage
npm run test:unit -- --coverage tests/integration
```

## Test Database

Integration tests use **Testcontainers** to spin up isolated PostgreSQL instances:

- Each test suite gets a fresh database container in `beforeAll`
- Database is cleaned between tests in `beforeEach` using `cleanDatabase()`
- Container is stopped after all tests in `afterAll`
- Full schema migrations are run automatically on container start

## Test Fixtures

Use helper functions from `tests/helpers/fixtures.ts` to create test data:

```typescript
import { createPatient, createDietitian, createWeightEntry } from '../../helpers/fixtures';

const patient = await createPatient(db, 'active');
const weightEntry = await createWeightEntry(db, patient.id, { weight: 70.5 });
```

Available fixtures:
- `createUser()` - Generic user
- `createPatient()` - Patient with specific status
- `createDietitian()` - Dietitian (Paulina)
- `createSession()` - User session
- `createWeightEntry()` - Single weight entry
- `createWeightHistory()` - Multiple weight entries
- `createInvitation()` - Invitation token
- `createConsent()` - User consent
- `createEvent()` - Analytics event

## Known Limitations

### Repository Singleton Pattern

⚠️ **Important**: Tests that use repositories (e.g., `authService.signup()`) may fail because repositories use a global `db` instance instead of the test database.

**Current behavior:**
```typescript
// In repositories/userRepository.ts
import { db } from '@/db'  // Global singleton

export class UserRepository {
  async findByEmail(email: string) {
    return db.select().from(users)...  // Uses global db, not test db
  }
}
```

**Tests affected:**
- `tests/integration/transactions/signup.test.ts` - Uses `authService` which uses repositories
- `tests/integration/middleware/auth.test.ts` - Uses Lucia which uses repositories

**Workaround options:**
1. **Dependency Injection (Recommended)**: Refactor repositories to accept `db` in constructor
2. **Mock repositories**: Use Vitest mocks to inject test database
3. **Direct database operations**: Use `db.insert()`, `db.select()` instead of repositories in tests

**Example refactor (future improvement):**
```typescript
// Repository with DI
export class UserRepository {
  constructor(private db: Database) {}

  async findByEmail(email: string) {
    return this.db.select().from(users)...
  }
}

// Usage in tests
const userRepo = new UserRepository(testDb);
```

### Transaction Tests

For transaction tests (like signup), we directly call service functions which may use the global `db`. These tests verify:
- Transaction logic (all-or-nothing commits)
- Rollback on errors
- Audit trail creation
- Event tracking

However, they currently have limited coverage due to the singleton issue.

## Test Coverage

Current coverage (as of implementation):
- ✅ Database CRUD operations: 100% (direct database queries)
- ✅ Weight entry constraints: 100% (unique index, backfill, outliers)
- ✅ Session management: 100% (Lucia Auth integration)
- ✅ Event tracking: 100% (analytics, aggregations)
- ⚠️ Complex transactions: Partial (limited by repository singletons)
- ⚠️ Middleware: Partial (simulated logic, not full Astro context)

## Future Improvements

1. **Refactor repositories for dependency injection**
   - Accept `Database` instance in constructor
   - Allow test database injection
   - Improve testability of service layer

2. **Add request/response integration tests**
   - Test full Astro middleware flow
   - Test API endpoints with real HTTP requests
   - Use `supertest` or similar library

3. **Add database migration tests**
   - Verify migrations run successfully
   - Test rollback functionality
   - Validate schema constraints

4. **Add performance benchmarks**
   - Measure query performance
   - Identify N+1 query problems
   - Optimize slow queries

## Debugging

**Tests timeout:**
```bash
# Increase timeout (default: 120s)
npm run test:unit -- tests/integration --testTimeout=300000
```

**Container cleanup issues:**
```bash
# Manually stop containers
docker ps -a | grep testcontainers | awk '{print $1}' | xargs docker rm -f
```

**View container logs:**
```bash
# While tests are running
docker logs <container-id>
```

**Database inspection:**
- Tests use Drizzle migrations from `./drizzle` folder
- Each test suite gets a fresh schema
- Use `console.log(db)` to inspect connection details during tests
