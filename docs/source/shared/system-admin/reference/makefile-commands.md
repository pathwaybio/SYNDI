<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Makefile Command Reference

Complete reference for all Makefile commands in SYNDI.

## Command Categories

- [Setup & Configuration](#setup--configuration)
- [Development](#development)
- [Testing](#testing)
- [Building](#building)
- [AWS Deployment](#aws-deployment-rawscribe)
- [JWT Testing](#jwt-testing)
- [Utilities](#utilities)

## Setup & Configuration

### setup-local

Set up local directories and configuration for development.

**Usage:**
```bash
make setup-local ENV=dev ORG=myorg
```

**Parameters:**
- `ENV` - Environment (`dev` or `test`)
- `ORG` - Organization identifier (required)

**What it does:**
- Creates `.local/s3/` directory structure
- Creates simulated S3 buckets (forms, eln, eln-drafts, public, webapp, lambda)
- Deploys configuration via `make config`

**Example:**
```bash
make setup-local ENV=dev ORG=uga
```

### config

Deploy configuration files to runtime locations.

**Usage:**
```bash
make config ENV=dev ORG=myorg
```

**Parameters:**
- `ENV` - Environment (`dev`, `test`, `stage`, `prod`)
- `ORG` - Organization identifier (required)

**What it does:**
- Cleans existing configs
- Merges `infra/.config/webapp/{env}.json` + `infra/.config/webapp/{env}-{org}.json`
- Writes to `frontend/public/config.json`
- Merges `infra/.config/lambda/{env}.json` + `infra/.config/lambda/{env}-{org}.json`
- Writes to `backend/rawscribe/.config/config.json`
- Creates environment variables JSON for cloud deployments

**Example:**
```bash
make config ENV=stage ORG=uga
```

### clean-config

Remove all generated configuration files.

**Usage:**
```bash
make clean-config
```

**What it removes:**
- `backend/rawscribe/.config/`
- `frontend/public/config.json`

### list-orgs

List all configured organizations from samconfig.toml.

**Usage:**
```bash
make list-orgs
```

**Note:** If `samconfig.toml` doesn't exist (current system), this shows no organizations.

### list-envs

List all configured environments from samconfig.toml.

**Usage:**
```bash
make list-envs
```

**Note:** If `samconfig.toml` doesn't exist (current system), this shows no environments.

### schemas

Generate TypeScript schemas from SOP templates.

**Usage:**
```bash
make schemas
```

**What it does:**
- Runs `frontend/tools/generateSOPTemplateSchema.ts`
- Generates TypeScript interfaces from SOP YAML schema

### docs

Build Sphinx documentation.

**Usage:**
```bash
make docs
```

**What it does:**
- Builds HTML documentation in `docs/build/html/`

---

## Development

### start-backend

Start FastAPI backend server with hot reload.

**Usage:**
```bash
make start-backend ENV=dev ORG=myorg
```

**Parameters:**
- `ENV` - Environment (`dev`, `test`, `stage`, `prod`)
- `ORG` - Organization identifier (required)

**What it does:**
- Deploys configuration for ENV/ORG
- Creates symlink to `.local/` storage
- Starts uvicorn with auto-reload

**Server:**
- URL: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`
- Hot reload: Enabled

**Stop:** Ctrl+C

### start-frontend

Start React frontend dev server with hot reload.

**Usage:**
```bash
make start-frontend ENV=dev ORG=myorg
```

**Parameters:**
- `ENV` - Environment (`dev`, `test`, `stage`, `prod`)
- `ORG` - Organization identifier (required)

**What it does:**
- Deploys configuration for ENV/ORG
- Starts Vite dev server

**Server:**
- URL: `http://localhost:3000` or `http://localhost:5173`
- Hot reload: Enabled (HMR)

**Stop:** Ctrl+C

### start-dev

Start both backend and frontend servers.

**Usage:**
```bash
make start-dev ENV=dev ORG=myorg
```

**Parameters:**
- `ENV` - Must be `dev`
- `ORG` - Organization identifier (required)

**What it does:**
- Starts backend in background
- Starts frontend in foreground

**Stop:** Ctrl+C (stops frontend, use `make stop-all` to stop both)

### stop-all

Stop all running development servers.

**Usage:**
```bash
make stop-all
```

**What it does:**
- Runs `scripts/stop-servers.sh`
- Kills uvicorn and vite processes

---

## Testing

### test-frontend

Run frontend unit tests (Vitest).

**Usage:**
```bash
make test-frontend
make test-frontend ORG=myorg  # Override org
```

**Default ORG:** `testorg`

**What it does:**
- Deploys test configuration
- Runs `npx vitest run` in frontend

### test-backend

Run backend unit tests (pytest).

**Usage:**
```bash
make test-backend
make test-backend ORG=myorg  # Override org
```

**Default ORG:** `testorg`

**What it does:**
- Sets up local test environment
- Runs `pytest tests/` in backend

### test-unit

Run all unit tests (frontend + backend).

**Usage:**
```bash
make test-unit
make test-unit ORG=myorg  # Override org
```

**Default ORG:** `testorg`

### test-e2e

Run end-to-end tests (Playwright).

**Usage:**
```bash
make test-e2e
make test-e2e ORG=myorg  # Override org
```

**Default ORG:** `testorg`

**What it does:**
- Deploys test configuration
- Runs `npx playwright test` in frontend

### test-e2e-reviewsubmit

Run ReviewSubmitPanel component E2E tests.

**Usage:**
```bash
make test-e2e-reviewsubmit
```

### test-e2e-integration

Run integration tests with real backend.

**Usage:**
```bash
make test-e2e-integration
```

**What it does:**
- Starts backend server
- Runs Playwright tests against real backend
- Stops backend server

### test-e2e-ui

Run E2E tests with visual UI runner.

**Usage:**
```bash
make test-e2e-ui
```

### test-e2e-headed

Run E2E tests with visible browser.

**Usage:**
```bash
make test-e2e-headed
```

### test-e2e-debug

Run E2E tests in debug mode.

**Usage:**
```bash
make test-e2e-debug
```

### test-all

Run all tests (unit + E2E).

**Usage:**
```bash
make test-all
make test-all ORG=myorg  # Override org
```

**Default ORG:** `testorg`

### test-ci

Run CI test suite with coverage.

**Usage:**
```bash
make test-ci
```

**What it does:**
- Backend tests with coverage (pytest --cov)
- Frontend tests with coverage (vitest --coverage)
- Generates coverage reports

### clean-test

Clean test artifacts.

**Usage:**
```bash
make clean-test
```

**What it removes:**
- Coverage reports
- Test results
- Playwright reports
- Python cache files

---

## Building

### build-frontend

Build frontend webapp (clean build).

**Usage:**
```bash
make build-frontend ENV=stage ORG=myorg
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)

**What it does:**
- Calls `clean-frontend` first
- Deploys configuration
- Runs `npm run build`
- Creates `frontend/dist/`

**Always clean build** - Removes dist/ before building

### build-backend

Build Lambda function (clean build).

**Usage:**
```bash
make build-backend ENV=stage ORG=myorg
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)

**What it does:**
- Calls `clean-backend` first
- Builds Lambda package
- Creates `backend/.build/lambda/function.zip`

**Always clean build** - Removes .build/ before building

### clean-frontend

Remove frontend build artifacts.

**Usage:**
```bash
make clean-frontend
```

**What it removes:**
- `frontend/dist/`
- `frontend/public/config.json`
- `.local/s3/webapp/`

### clean-backend

Remove backend build artifacts.

**Usage:**
```bash
make clean-backend
```

**What it removes:**
- `backend/.build/`
- `.local/s3/lambda/function.zip`
- `.local/s3/lambda/build_mock/`

### serve-webapp

Serve built frontend locally.

**Usage:**
```bash
make serve-webapp ENV=stage ORG=myorg
```

**Incremental build** - Only rebuilds if sources changed

**Server:** Python static file server (emulates CloudFront+S3)

### serve-lambda

Serve packaged Lambda locally.

**Usage:**
```bash
make serve-lambda ENV=stage ORG=myorg
```

**Incremental build** - Only rebuilds if sources changed

**Server:** Uvicorn serving packaged Lambda code

**Note:** Must use `conda activate syndi` (Python 3.9) for Lambda compatibility

### serve-lambda-debug

Serve Lambda with forced rebuild and debug logging.

**Usage:**
```bash
make serve-lambda-debug ENV=stage ORG=myorg
```

**Forces clean rebuild** - Useful for debugging packaging issues

---

## AWS Deployment (RAWSCRIBE)

### rs-build

Build Lambda function and dependency layer with SAM.

**Usage:**
```bash
make rs-build ENV=stage ORG=myorg
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)

**What it does:**
- Deploys configuration
- Copies requirements.txt to layer directory
- Runs `sam build --cached` with org-specific build directory

**Build directory:** `.aws-sam-{ENV}-{ORG}/`

**Time:** 5-7 min (first build) or 30 sec (with cached layer)

### rs-deploy

Full build and deploy to AWS.

**Usage:**
```bash
make rs-deploy ENV=stage ORG=myorg
ENABLE_AUTH=true CREATE_BUCKETS=true make rs-deploy ENV=stage ORG=myorg
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)
- `ENABLE_AUTH` - Enable Cognito (default: `true`)
- `CREATE_BUCKETS` - Create S3 buckets (default: `false`)
- `ADMIN_USERNAME` - Create admin user (optional)
- `ADMIN_PASSWORD` - Admin password (optional)

**What it does:**
- Calls `rs-build`
- Calls `rs-deploy-only`

**Time:** 5-7 minutes

**Use when:** First deployment, dependency changes, infrastructure changes

### rs-deploy-only

Deploy without building.

**Usage:**
```bash
make rs-deploy-only ENV=stage ORG=myorg
```

**Parameters:** Same as `rs-deploy`

**What it does:**
- Handles ROLLBACK_COMPLETE state (auto-deletes failed stack)
- Uploads config to S3
- Deploys via SAM using existing build
- Creates admin user if credentials provided

**Time:** 1-2 minutes

**Use when:** Config/parameter changes only

### rs-deploy-function

Quick Lambda code update (bypasses CloudFormation).

**Usage:**
```bash
make rs-deploy-function ENV=stage ORG=myorg
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)

**What it does:**
- Creates minimal zip of code only (no dependencies)
- Updates Lambda function directly via AWS API
- Uses S3 if package > 69MB

**Time:** 30 seconds

**Use when:** Code changes only

### rs-validate

Validate SAM template.

**Usage:**
```bash
make rs-validate
```

**What it does:**
- Runs `sam validate --lint`

### sync-configs

Sync configuration files from CloudFormation outputs.

**Usage:**
```bash
make sync-configs ENV=stage ORG=myorg
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)

**What it does:**
- Queries CloudFormation stack outputs
- Updates `infra/.config/webapp/{env}-{org}.json`
- Updates `infra/.config/lambda/{env}-{org}.json`
- Preserves custom fields

### rs-sync

Sync Lambda code only (SAM sync).

**Usage:**
```bash
make rs-sync ENV=stage ORG=myorg
```

**What it does:**
- Uses `sam sync --code` to update Lambda
- Faster than full deployment

**Time:** 10-20 seconds

### rs-sync-watch

Sync Lambda code in watch mode.

**Usage:**
```bash
make rs-sync-watch ENV=stage ORG=myorg
```

**What it does:**
- Watches for file changes
- Automatically syncs to Lambda
- Press Ctrl+C to stop

### rs-watch-log

View Lambda logs in real-time.

**Usage:**
```bash
make rs-watch-log ENV=stage ORG=myorg
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)

**What it does:**
- Tails CloudWatch logs for Lambda function
- Shows logs in real-time

**Stop:** Ctrl+C

### rs-teardown

Remove CloudFormation stack.

**Usage:**
```bash
make rs-teardown ENV=stage ORG=myorg
```

**WARNING:** Deletes Lambda, API Gateway, and CloudFormation stack. S3 buckets and Cognito User Pool may be preserved depending on template configuration.

**Confirmation:** 5 second wait before execution

---

## JWT Testing

### test-jwt-local

Test JWT authentication locally (no AWS).

**Usage:**
```bash
make test-jwt-local ENV=stage ORG=myorg
```

**Environment variables required:**
```bash
export MYORG_TEST_USER=testuser@myorg.com
export MYORG_TEST_PASSWORD=TestPass123!
```

(ORG name uppercased)

### test-jwt-aws

Test JWT authentication on deployed Lambda.

**Usage:**
```bash
make test-jwt-aws ENV=stage ORG=myorg
```

**Environment variables required:** Same as `test-jwt-local`

**What it does:**
- Discovers API Gateway and Cognito resources
- Obtains JWT token
- Tests protected endpoint

### test-jwt-regression

Run full JWT regression test suite.

**Usage:**
```bash
make test-jwt-regression
```

**What it does:**
- Runs `backend/test_jwt_regression.py`
- Tests all JWT validation scenarios

### test-jwt-regression-local

Run JWT regression tests (local only, no AWS).

**Usage:**
```bash
make test-jwt-regression-local
```

### get-rs-token

Get JWT token for testing.

**Usage:**
```bash
TOKEN=$(make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)
```

**Parameters:**
- `ENV` - Environment (required)
- `ORG` - Organization (required)
- `USER_NAME` - Username/email (required) **Note:** Use `USER_NAME` not `USERNAME`
- `PASSWORD` - User password (required)

**Output:** JWT access token (to stdout)

---

## Utilities

### show-account-number

Display current AWS account number.

**Usage:**
```bash
make show-account-number
```

### show-region

Display current AWS region.

**Usage:**
```bash
make show-region
```

### show-rs-endpoint

Show API Gateway endpoint URL.

**Usage:**
```bash
make show-rs-endpoint ENV=stage ORG=myorg
```

### show-rs-function-name

Show Lambda function name.

**Usage:**
```bash
make show-rs-function-name ENV=stage ORG=myorg
```

### show-rs-user-pool

Show Cognito User Pool ID.

**Usage:**
```bash
make show-rs-user-pool ENV=stage ORG=myorg
```

### show-rs-client-id

Show Cognito App Client ID.

**Usage:**
```bash
make show-rs-client-id ENV=stage ORG=myorg
```

### show-rs-api-gateway

Show API Gateway name.

**Usage:**
```bash
make show-rs-api-gateway ENV=stage ORG=myorg
```

### show-rs-s3-buckets

Show S3 buckets for organization.

**Usage:**
```bash
make show-rs-s3-buckets ENV=stage ORG=myorg
```

**Displays:**
- Shared deployment bucket
- Org-specific buckets (filtered by ENV/ORG)

### show-rs-stackname

Show CloudFormation stack name.

**Usage:**
```bash
make show-rs-stackname ENV=stage ORG=myorg
```

### check-rs-stack-status

Check CloudFormation stack status.

**Usage:**
```bash
make check-rs-stack-status ENV=stage ORG=myorg
```

**Possible statuses:**
- `CREATE_COMPLETE` - Stack created successfully
- `UPDATE_COMPLETE` - Stack updated successfully
- `ROLLBACK_COMPLETE` - Deployment failed (needs deletion)
- `NO_STACK` - Stack doesn't exist

### check-rs

Check complete deployment status.

**Usage:**
```bash
make check-rs ENV=stage ORG=myorg
make check-rs  # Checks all orgs
```

**Displays:**
- Lambda function name
- API Gateway name
- API endpoint URL
- Stack name
- User Pool ID
- Client ID
- All S3 buckets

---

## Common Command Patterns

### Development Workflow

```bash
# Start development
make setup-local ENV=dev ORG=myorg
make start-dev ENV=dev ORG=myorg

# Test changes
make test-all

# Deploy to staging
make rs-deploy-function ENV=stage ORG=myorg
```

### Testing Workflow

```bash
# Run all tests
make test-all

# Run specific tests
make test-frontend
make test-backend
make test-e2e

# Test authentication
make test-jwt-aws ENV=stage ORG=myorg
```

### Deployment Workflow

```bash
# First deployment
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com ADMIN_PASSWORD=Pass! \
  ORG=myorg ENV=stage make rs-deploy

# Sync configs
make sync-configs ENV=stage ORG=myorg

# Subsequent code updates
make rs-deploy-function ENV=stage ORG=myorg

# Config updates
make rs-deploy-only ENV=stage ORG=myorg
```

### Monitoring Workflow

```bash
# Check status
make check-rs ENV=stage ORG=myorg

# View logs
make rs-watch-log ENV=stage ORG=myorg

# Check stack
make check-rs-stack-status ENV=stage ORG=myorg
```

## Parameter Reference

### Required Parameters

- **ENV** - Environment name (`dev`, `test`, `stage`, `prod`)
- **ORG** - Organization identifier (lowercase alphanumeric, no default for security)

### Optional Parameters

- **ENABLE_AUTH** - Enable Cognito (`true`/`false`, default: `true`)
- **CREATE_BUCKETS** - Create S3 buckets (`true`/`false`, default: `false`)
- **ADMIN_USERNAME** - Admin user email (default: none)
- **ADMIN_PASSWORD** - Admin password (default: none)
- **USER_NAME** - Username for get-rs-token (default: none)
- **PASSWORD** - Password for get-rs-token (default: none)

### Test Default

- **TEST_ORG** - Default organization for tests (default: `testorg`)

## Help Commands

### help

Show all available commands.

**Usage:**
```bash
make help
make  # Same as make help
```

### help-target

Show detailed help for specific target.

**Usage:**
```bash
make help-target TARGET=rs-deploy
```

**Example:**
```bash
make help-target TARGET=rs-deploy-function
```

## Related Documentation

- [Makefile Deployment Guide](../deployment/makefile-deployment.md) - Using deployment commands
- [Testing Guide](../development/testing.md) - Testing procedures
- [Local Development](../development/local-development.md) - Development workflow
- [Configuration System](../architecture/configuration-system.md) - Configuration commands
