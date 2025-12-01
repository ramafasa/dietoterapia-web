# GitHub Actions - Pull Request CI/CD

## Workflow Overview

Workflow `pull-request.yml` wykonuje pełne CI/CD dla każdego pull requesta do brancha `main`.

### Jobs Flow

```
PR opened/updated → Manual trigger
         ↓
    [1. lint]
         ↓
    ┌────┴────┬──────────┐
    ↓         ↓          ↓
[2. unit] [3. integ] [4. e2e]
    └────┬────┴──────────┘
         ↓
   [5. status-comment]
```

### Jobs Description

1. **lint** - Lint & Typecheck
   - TypeScript typecheck (`tsc --noEmit`)
   - ESLint (`eslint .`)
   - Runs on: `ubuntu-latest`
   - **Blokuje** następne joby jeśli fail

2. **test-unit** - Unit Tests
   - Runs: `npm run test:unit`
   - Parallel with integration & e2e
   - Runs on: `ubuntu-latest`

3. **test-integration** - Integration Tests
   - Runs: `npm run test:integration`
   - Requires: `DATABASE_URL`, `LUCIA_SESSION_SECRET`
   - Uses testcontainers for database
   - Parallel with unit & e2e
   - Runs on: `ubuntu-latest`

4. **test-e2e** - E2E Tests
   - Runs: `npm run test:e2e`
   - Requires: `DATABASE_URL`, `LUCIA_SESSION_SECRET`
   - Installs Playwright browsers (chromium)
   - Caches browsers for faster runs
   - Uploads artifacts on failure (playwright-report, test-results)
   - Parallel with unit & integration
   - Runs on: `ubuntu-latest`

5. **status-comment** - Post Status Comment
   - Creates/updates PR comment with detailed status report
   - Shows status for all jobs with links to logs
   - Only runs for pull requests (not manual triggers)
   - Always runs (even if previous jobs failed)

## Required Secrets

Configure in: GitHub repo → Settings → Secrets and variables → Actions

```bash
DATABASE_URL          # Connection string to test database (Neon Postgres)
LUCIA_SESSION_SECRET  # Secret for session encryption (min 32 chars)
```

**Example values:**

```bash
DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/dietoterapia_test?sslmode=require
LUCIA_SESSION_SECRET=test-session-secret-key-for-ci-testing-min-32-characters-long
```

## Branch Protection Rules

Recommended configuration for `main` branch:

1. GitHub repo → Settings → Branches → Add rule
2. Branch name pattern: `main`
3. **Enable:**
   - ✅ Require status checks to pass before merging
   - ✅ Required checks:
     - `lint`
     - `test-unit`
     - `test-integration`
     - `test-e2e`
   - ✅ Require branches to be up to date before merging
   - ✅ Restrict deletions

## Local Development

### Prerequisites

```bash
# Install dependencies
npm ci

# Setup test database (use .env.test or export vars)
export DATABASE_URL="postgresql://..."
export LUCIA_SESSION_SECRET="your-secret-32-chars"
```

### Commands

```bash
# Linting & typecheck
npm run lint          # Run ESLint
npm run lint:fix      # Auto-fix ESLint issues
npm run typecheck     # TypeScript type checking

# Testing
npm run test          # All tests (unit + integration)
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e      # E2E tests (Playwright)
npm run test:watch    # Watch mode (unit + integration)
npm run test:coverage # Coverage report

# Database
npm run db:generate   # Generate migrations
npm run db:push       # Push schema to database
npm run db:studio     # Open Drizzle Studio GUI
```

## GitHub Actions Usage

### Action Versions

All actions use latest major versions:

- `actions/checkout@v6`
- `actions/setup-node@v6` (via composite action)
- `actions/cache@v4`
- `actions/upload-artifact@v5`
- `actions/github-script@v8`

### Composite Actions

**`.github/actions/setup-node/action.yml`**

Reusable composite action for:
- Reading Node.js version from `.nvmrc`
- Setting up Node.js with npm cache
- Installing dependencies with `npm ci`

Used in all jobs to avoid duplication.

## Performance Optimizations

1. **npm cache** - `actions/setup-node` caches `node_modules`
2. **Playwright browsers cache** - Browsers cached between runs (~2min → ~10s)
3. **Parallel jobs** - Unit, integration, and E2E tests run concurrently
4. **Fail fast** - If lint fails, tests don't run

## Troubleshooting

### Linting failures

ESLint 9 uses flat config (`eslint.config.js`). If you see errors:

```bash
# Locally test
npm run lint

# Auto-fix issues
npm run lint:fix
```

### E2E tests failing

Check uploaded artifacts in GitHub Actions → Run → Artifacts tab:
- `playwright-report` - HTML report with screenshots/videos
- `test-results` - Raw test results

### Database connection issues

Verify secrets are configured correctly:
- `DATABASE_URL` should point to test database (NOT production!)
- `LUCIA_SESSION_SECRET` must be at least 32 characters

### Caching issues

If Playwright browsers or npm cache is corrupted:

1. Go to Actions → Caches
2. Delete relevant caches
3. Re-run workflow

## Manual Workflow Trigger

Workflow can be triggered manually via GitHub UI:

1. Go to Actions tab
2. Select "Pull Request CI"
3. Click "Run workflow"
4. Select branch
5. Click "Run workflow"

Useful for testing without creating a PR.

## Estimated Execution Times

- **Lint job:** ~30-60s
- **Unit tests:** ~1-2min
- **Integration tests:** ~2-3min
- **E2E tests:** ~3-5min (includes browser installation)
- **Total (success):** ~5-8min
- **Total (lint failure):** ~30-60s (fail fast)

## Cost

All workflows run on GitHub-hosted runners (ubuntu-latest):
- **Free tier:** 2,000 minutes/month for public repos
- **Free tier:** 500 minutes/month for private repos (Neon Pro plan)

Estimated usage per PR: ~5-8 minutes = ~6-10 PRs/day in free tier.

## Maintenance

### Updating action versions

Actions are pinned to major versions for stability. Update when new major versions are released:

```bash
# Check latest versions
curl -s https://api.github.com/repos/actions/checkout/releases/latest | grep tag_name
curl -s https://api.github.com/repos/actions/setup-node/releases/latest | grep tag_name
curl -s https://api.github.com/repos/actions/cache/releases/latest | grep tag_name
curl -s https://api.github.com/repos/actions/upload-artifact/releases/latest | grep tag_name
curl -s https://api.github.com/repos/actions/github-script/releases/latest | grep tag_name
```

Update in:
- `.github/workflows/pull-request.yml`
- `.github/actions/setup-node/action.yml`

### Updating Node.js version

Update `.nvmrc` file. The composite action automatically reads this version.

## Files Structure

```
.github/
├── actions/
│   └── setup-node/
│       └── action.yml          # Composite action for Node.js setup
└── workflows/
    ├── pull-request.yml        # Main CI/CD workflow
    └── README.md               # This file

eslint.config.js                 # ESLint flat config (ESLint 9+)
.nvmrc                          # Node.js version (read by CI)
.env.example                    # Environment variables template
```

## Support

For issues or questions:
- Check workflow logs in Actions tab
- Review this documentation
- Check ESLint config if linting fails
- Verify secrets configuration for test failures
