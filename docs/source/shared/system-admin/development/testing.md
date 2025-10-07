<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Testing Guide

This guide covers all testing procedures for SYNDI, including unit tests, end-to-end tests, and deployment testing.

## Overview

SYNDI uses a comprehensive testing strategy:

- **Frontend Unit Tests**: Vitest for React components
- **Backend Unit Tests**: pytest for Python code
- **End-to-End Tests**: Playwright for full user flows
- **Integration Tests**: Backend + Frontend together
- **JWT Authentication Tests**: Cognito authentication testing
- **Deployment Tests**: Configuration and deployment verification

All tests use `ORG=testorg` by default for complete isolation from development and production data.

## Quick Test Commands

```bash
# Run all tests
make test-all

# Frontend tests only
make test-frontend

# Backend tests only
make test-backend

# End-to-end tests
make test-e2e

# CI test suite with coverage
make test-ci

# Clean test artifacts
make clean-test
```

## Frontend Testing

### Unit Tests (Vitest)

Frontend unit tests use Vitest and test React components in isolation.

**Run frontend tests:**
```bash
# Using make (handles config automatically)
make test-frontend

# Or override organization
make test-frontend ORG=myorg

# Direct npm command
cd frontend && npx vitest run
```

**What gets tested:**
- Component rendering
- User interactions
- State management
- Form validation
- Data transformations
- Schema-agnostic rendering

**Test organization:**
- Tests located in `frontend/tests/`
- Component tests colocated with components
- Shared test utilities in `frontend/tests/helpers/`

### End-to-End Tests (Playwright)

E2E tests verify complete user workflows using Playwright.

**Run E2E tests:**
```bash
# All E2E tests
make test-e2e

# ReviewSubmitPanel component tests
make test-e2e-reviewsubmit

# Integration tests with real backend
make test-e2e-integration

# Visual UI runner
make test-e2e-ui

# Headed mode (visible browser)
make test-e2e-headed

# Debug mode
make test-e2e-debug
```

**What gets tested:**
- Complete SOP submission flow
- Form interaction and validation
- Review and submit panel
- Draft saving and loading
- Authentication flows
- Multi-step workflows

**Test data:**
- Static fixtures in `frontend/tests/fixtures/`
- Schema-compliant test SOPs
- No external dependencies required

**Test isolation:**
- Uses `NODE_ENV=test` environment
- `data-testid` attributes enabled automatically
- Isolated test organization (`testorg`)

## Backend Testing

### Unit Tests (pytest)

Backend unit tests use pytest and test Python code in isolation.

**Run backend tests:**
```bash
# Using make (handles config automatically)
make test-backend

# Or override organization
make test-backend ORG=myorg

# Direct pytest command
cd backend && TESTING=true PYTHONPATH=. python -m pytest tests/ -v
```

**What gets tested:**
- API endpoints
- Business logic
- Data validation
- Configuration loading
- Authentication logic
- S3 interactions (mocked)
- SOP parsing

**Test organization:**
- Tests located in `backend/tests/`
- Test configuration in `pytest.ini`
- Fixtures in `backend/tests/conftest.py`

### Integration Tests

Integration tests run both backend and frontend together:

```bash
# Start backend, run frontend tests against it
make test-e2e-integration
```

**Process:**
1. Starts backend server (`make start-backend ENV=test`)
2. Waits for startup (3 seconds)
3. Runs Playwright tests against real backend
4. Stops backend server
5. Reports results

## Authentication Testing

See [Testing Authentication](../authentication/testing-auth.md) for comprehensive JWT testing guide.

**Quick commands:**
```bash
# Local JWT testing (no AWS)
make test-jwt-local ENV=stage ORG=myorg

# AWS JWT testing (deployed environment)
make test-jwt-aws ENV=stage ORG=myorg

# Full JWT regression tests
make test-jwt-regression

# Local-only regression (no AWS)
make test-jwt-regression-local
```

## CI/CD Testing

### Continuous Integration

Run the complete CI test suite with coverage:

```bash
# Full CI test suite
make test-ci

# Includes:
# - Backend tests with coverage
# - Frontend tests with coverage
# - Coverage reports (XML and HTML)
```

**Coverage output:**
- Backend: `backend/coverage.xml` and `backend/htmlcov/`
- Frontend: `frontend/coverage/`

### Test Organization

All tests use `ORG=testorg` by default to ensure:
- Complete isolation from real data
- Separate S3 buckets for test data
- Separate configuration files
- No conflicts with development or production

**Override test organization:**
```bash
# Use custom org for testing
make test-all ORG=mytest
```

## Deployment Testing

### Configuration Testing

Test that configuration is properly deployed:

```bash
# Deploy test environment
ORG=testorg ENV=test make config

# Verify config files created
cat backend/rawscribe/.config/config.json | jq .
cat frontend/public/config.json | jq .
```

### Deployment Verification

After deployment, verify everything works:

```bash
# Deploy to staging
ORG=myorg ENV=stage make rs-deploy

# Run deployment tests
ORG=myorg ENV=stage make check-rs

# Test authentication
ORG=myorg ENV=stage make test-jwt-aws

# View logs
ORG=myorg ENV=stage make rs-watch-log
```

### Clean Build Testing

For testing complete rebuild:

```bash
# Clean everything
make clean-frontend
make clean-backend

# Build from scratch
make build-frontend ENV=stage ORG=myorg
make build-backend ENV=stage ORG=myorg

# Test locally
make start-frontend ENV=stage ORG=myorg  # Terminal 1
make serve-lambda ENV=stage ORG=myorg    # Terminal 2
```

### Smoke Tests

**TBD**: Automated smoke tests for deployed environments.

Script location: `infra/scripts/smoke-tests.sh`

## Test Data Management

### Static Fixtures

Frontend tests use static JSON fixtures:

**Location:** `frontend/tests/fixtures/`

**Structure:**
```
frontend/tests/fixtures/
├── sops/
│   ├── test-sop-basic.json
│   ├── test-sop-complex.json
│   └── test-sop-minimal.json
├── eln-submissions/
│   └── test-submission.json
└── form-data/
    └── test-form-data.json
```

**Benefits:**
- Checked into repository (consistent across environments)
- Schema-compliant (match actual SOP/ELN structure)
- Reusable across different test scenarios
- No external dependencies

### Test Data Builder

Use `TestDataBuilder` class for dynamic test data:

```typescript
import { TestDataBuilder } from '../helpers/test-data-builder';

// Load static fixture
const sop = await TestDataBuilder.loadSOP('test-sop-basic');

// Or create dynamic data
const customSOP = TestDataBuilder.createSOP({
  id: 'CUSTOM_001',
  name: 'Custom Test SOP'
});
```

### Local Test Environment

Tests run against isolated local environment:

```
.local/s3/                    # Simulated S3 buckets (test org)
├── forms/
│   └── sops/                # Test SOPs
├── eln/                     # Test ELN submissions
└── eln-drafts/             # Test drafts
```

**Setup:**
```bash
# Create local test environment
make setup-local ENV=test ORG=testorg

# Cleanup after testing
make clean-test
```

## Development Testing Workflow

### Test-Driven Development

1. **Write test first** for new functionality
2. **Run test** to see it fail
3. **Implement feature** to make test pass
4. **Refactor** with confidence
5. **Run all tests** to catch regressions

### Pre-Commit Testing

Before committing code:

```bash
# Run unit tests (fast)
make test-unit

# Run all tests if time permits
make test-all

# Clean up test artifacts
make clean-test
```

### Pre-Deploy Testing

Before deploying to staging/production:

```bash
# Run full test suite
make test-all ORG=testorg

# Test build locally
make build-frontend ENV=stage ORG=myorg
make build-backend ENV=stage ORG=myorg

# Test locally before deploying
make start-frontend ENV=stage ORG=myorg &
make serve-lambda ENV=stage ORG=myorg
```

## Debugging Tests

### Frontend Debug

```bash
# Run with Playwright UI
make test-e2e-ui

# Run with visible browser
make test-e2e-headed

# Debug specific test
make test-e2e-debug
```

### Backend Debug

```bash
# Run with verbose output
cd backend && TESTING=true pytest tests/ -vv -s

# Run specific test
cd backend && TESTING=true pytest tests/test_auth.py -v

# Drop into debugger on failure
cd backend && TESTING=true pytest tests/ --pdb
```

### Integration Debug

```bash
# Start backend manually for debugging
make start-backend ENV=test ORG=testorg

# In another terminal, run frontend tests
cd frontend && NODE_ENV=test npx playwright test --headed
```

## Test Artifacts

### Generated Files

Tests create these artifacts:

```
backend/
├── .coverage          # Coverage data
├── coverage.xml       # Coverage report (XML)
└── htmlcov/          # Coverage report (HTML)

frontend/
├── coverage/         # Frontend coverage
├── test-results/     # Playwright test results
└── playwright-report/ # Playwright HTML report
```

### Cleanup

```bash
# Clean all test artifacts
make clean-test

# Manual cleanup
rm -rf backend/htmlcov backend/coverage.xml backend/.coverage
rm -rf frontend/coverage frontend/test-results frontend/playwright-report
```

## Troubleshooting

### Tests Fail with "Config not found"

**Cause:** Test configuration not deployed

**Solution:**
```bash
make config ENV=test ORG=testorg
```

### E2E Tests Timeout

**Cause:** Backend not started or slow startup

**Solution:**
```bash
# Increase wait time in test-e2e-integration
# Or manually start backend first
make start-backend ENV=test ORG=testorg &
sleep 5
make test-e2e
```

### Frontend Tests Can't Find Components

**Cause:** `data-testid` attributes not enabled

**Solution:**
```bash
# Ensure NODE_ENV=test is set
NODE_ENV=test npx vitest run

# Or use make command (sets it automatically)
make test-frontend
```

### Backend Tests Import Errors

**Cause:** PYTHONPATH not set or dependencies missing

**Solution:**
```bash
# Set PYTHONPATH
cd backend && TESTING=true PYTHONPATH=. pytest tests/

# Install dependencies
cd backend && pip install -r requirements.txt
```

## Best Practices

1. **Always use testorg for tests** - Keeps test data isolated
2. **Run tests before committing** - Catch issues early
3. **Use static fixtures** - More reliable than dynamic data
4. **Test one thing at a time** - Makes failures easier to debug
5. **Clean up after tests** - Run `make clean-test` regularly
6. **Update tests with code** - Keep tests in sync with implementation
7. **Test edge cases** - Empty data, invalid data, errors
8. **Use schema-agnostic assertions** - Don't hardcode field names

## Related Documentation

- [Testing Authentication](../authentication/testing-auth.md) - JWT and auth testing
- [Local Development](local-development.md) - Development workflow
- [Deployment Guide](../deployment/makefile-deployment.md) - Deployment testing
- [Configuration System](../architecture/configuration-system.md) - Config testing
