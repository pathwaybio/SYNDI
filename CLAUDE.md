# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SYNDI (Synthetic Intelligence for Data Integrity) is an automated lab data capture system enabling AI-ready data. The system consists of three core components:

1. **PAUL** (Protocol Automation Librarian) - Extracts SOPs from written protocols using AI
2. **SAM** (SOP Authoring Manager) - Validates and optimizes SOPs
3. **CLAIRE** (Compliant Ledger-based Automation for Integrated Reporting and Export) - ELN data capture system with dynamic forms

The architecture is AWS-based (Lambda, S3, Cognito, CloudFront, API Gateway) with a FastAPI Python backend and React/TypeScript frontend.

## Essential Build Commands

All commands require explicit `ENV` and `ORG` parameters (no defaults for security):

### Development
```bash
# Start backend (FastAPI with hot reload)
make start-backend ENV=dev ORG=<org>

# Start frontend (Vite dev server with hot reload)
make start-frontend ENV=dev ORG=<org>

# Start both servers together
make start-dev ENV=dev ORG=<org>

# Serve lambda locally (requires Python 3.9 syndi conda environment)
conda activate syndi && make serve-lambda ENV=dev ORG=<org>

# Stop all local servers
make stop-all
```

### Testing
```bash
# All tests default to ORG=testorg for isolation
make test-all          # Run all tests
make test-frontend     # Vitest unit tests
make test-backend      # pytest unit tests
make test-e2e          # Playwright end-to-end tests
make test-ci           # CI test suite with coverage

# Run single backend test file
cd backend && pytest tests/unit/test_auth.py -v

# Run single frontend test
cd frontend && npm test -- tests/unit/MyComponent.test.tsx
```

### Building & Deployment
```bash
# Build frontend for production
make build-frontend ENV=prod ORG=<org>

# Build backend Lambda package
make rs-build ENV=stage ORG=<org>

# Deploy to AWS (initial setup with resource creation)
ENABLE_AUTH=true CREATE_BUCKETS=true make rs-deploy ENV=stage ORG=<org>

# Deploy Lambda code updates only (fast, 95% of deployments)
make rs-deploy-function ENV=stage ORG=<org>

# Sync configs from CloudFormation outputs (after deployment)
make sync-configs ENV=stage ORG=<org>
```

## Environment Setup

### Python Environment
```bash
# Create syndi environment (Python 3.9 - matches AWS Lambda)
conda env create -f environment.yml

# Activate for production simulation (serve-lambda)
conda activate syndi

# For development, you can use any Python 3.9+ environment
# The syndi environment is required ONLY for serve-lambda
```

### Configuration System
SYNDI uses a three-tier configuration system:

1. **Base configs**: `infra/.config/lambda/{env}.json` and `infra/.config/webapp/{env}.json` - Environment defaults
2. **Org-specific overrides**: `infra/.config/lambda/{env}-{org}.json` - Deployment-specific settings
3. **Merged output**: Generated automatically by `make config` command

**Important**: Never manually edit merged configs in `backend/rawscribe/.config/` or `frontend/public/config.json`. Always edit source files in `infra/.config/`.

After AWS deployment, always run `make sync-configs` to update org-specific files with CloudFormation outputs (API endpoints, Cognito IDs, bucket names).

## Architecture Overview

### Backend Structure (`/backend/rawscribe/`)
- **main.py** - FastAPI application entry point with Mangum handler for Lambda
- **routes/** - API endpoints:
  - `auth.py` - Authentication endpoints
  - `drafts.py` - Draft SOP management
  - `eln.py` - Electronic Lab Notebook data
  - `sops.py` - Standard Operating Procedures
  - `files.py` - File upload/download with S3
  - `user_management.py` - User/role management
  - `config.py` - Runtime configuration endpoint
- **utils/** - Shared utilities:
  - `auth_providers/` - Authentication provider abstraction (Cognito/JWT)
  - `storage_factory.py` - Storage backend abstraction (S3/Local)
  - `config_loader.py` - Configuration loading with S3 fallback
  - `rbac_enforcement.py` - Role-based access control
  - `schema_utils.py` - JSON schema validation

### Frontend Structure (`/frontend/src/`)
- **claire/** - CLAIRE ELN application
  - `components/` - React components (form renderers, data tables)
  - `views/` - Page-level components
  - `hooks/` - Custom React hooks
  - `lib/` - API clients and utilities
  - `types/` - TypeScript type definitions
- **sam/** - SAM SOP authoring interface
- **paul/** - PAUL protocol extraction interface
- **shared/** - Shared components and utilities

### Storage Architecture
- **S3 Buckets** (format: `rawscribe-{type}-{env}-{org}-{account}`):
  - `lambda` - Configuration files
  - `forms` - Published SOP schemas
  - `eln` - Electronic lab notebook data with audit trails
  - `drafts` - Draft SOPs (mutable, versioned)
- **Local Storage** - File-based storage for development (`.local/s3/`)

### Authentication
- **AWS Cognito** - Production auth (AWS Lambda deployments)
- **JWT** - Local development auth with configurable secret
- **Provider Abstraction** - `auth_providers/` allows switching between Cognito/JWT
- **RBAC** - Four roles: Admin, Lab Manager, Researcher, Clinician

## Key Patterns & Conventions

### Configuration Loading
The backend loads config in this order:
1. S3 bucket (`rawscribe-lambda-{env}-{org}-{account}/config.json`)
2. Local file (`backend/rawscribe/.config/config.json`)
3. Fallback defaults (logged as warnings)

Always check `app.state.config` for runtime configuration access.

### Environment Validation
The backend enforces strict environment/provider rules:
- AWS Lambda MUST use Cognito (security critical - API Gateway rejects JWT)
- Stage/prod MUST use secure auth (Cognito or JWT with strong secret)
- Dev defaults to JWT for local development

See `main.py` lifespan function for enforcement logic.

### Storage Backend Selection
Use `StorageFactory` to get the appropriate storage backend:
```python
from rawscribe.utils.storage_factory import StorageFactory
storage = StorageFactory.get_storage(config)
# Returns S3Storage or LocalStorage based on config
```

### Testing Isolation
All tests use `ORG=testorg` by default. This provides complete isolation from dev/stage/prod data. Test configs are in `infra/.config/lambda/test-testorg.json` and `infra/.config/webapp/test-testorg.json`.

## Deployment Best Practices

### Initial Infrastructure Setup (once per env/org)
1. Deploy with resource creation:
   ```bash
   ENABLE_AUTH=true CREATE_BUCKETS=true make rs-deploy ENV=stage ORG=myorg
   ```
2. Sync configs to capture CloudFormation outputs:
   ```bash
   make sync-configs ENV=stage ORG=myorg
   ```
3. Review and commit org-specific configs

### Regular Code Updates (frequent)
1. Use fast Lambda-only updates:
   ```bash
   make rs-deploy-function ENV=stage ORG=myorg
   ```
2. OR full stack update if infrastructure changed:
   ```bash
   ENABLE_AUTH=true CREATE_BUCKETS=false make rs-deploy ENV=stage ORG=myorg
   ```

**Critical**: Never set `CREATE_BUCKETS=true` on existing deployments unless you want to recreate buckets (destroys data).

### CloudFormation Stack Management
- Stack naming: `rawscribe-{env}-{org}`
- Build isolation: `.aws-sam-{env}-{org}/` directories
- Each env/org combination is a separate CloudFormation stack
- Rollback automatic on deployment failures

## Common Pitfalls

### Authentication Mismatches
- **Problem**: JWT tokens don't work in AWS Lambda
- **Cause**: API Gateway Cognito Authorizer only accepts Cognito tokens
- **Solution**: Always use `provider: cognito` in stage/prod configs

### Config Out of Sync
- **Problem**: Frontend shows wrong API endpoint or auth errors
- **Cause**: Org-specific config not updated after deployment
- **Solution**: Always run `make sync-configs` after AWS deployments

### Build Directory Conflicts
- **Problem**: `sam build` fails with cache errors
- **Cause**: Multiple env/org builds sharing same directory
- **Solution**: Each env/org uses isolated `.aws-sam-{env}-{org}/` directory

### Missing ORG Parameter
- **Problem**: Commands fail with "ORG must be specified"
- **Cause**: No default ORG for security reasons
- **Solution**: Always provide `ORG=<org>` parameter (except test commands which default to `testorg`)

## AWS SAM Template

The `template.yaml` defines all AWS resources:
- Lambda function with dependency layer
- API Gateway with Cognito authorizer
- S3 buckets for storage
- Cognito User Pool (optional - can attach existing)
- CloudFront distribution (optional)
- IAM roles and policies

Parameters control behavior:
- `Environment` (dev/test/stage/prod)
- `Organization` (required, no default)
- `EnableAuth` (true/false - toggles Cognito)
- `CreateBuckets` (true/false - manages S3 lifecycle)
- `CognitoUserPoolId` / `CognitoClientId` (optional - use existing pool)

## Code Style

### Python (Backend)
- FastAPI patterns with async/await
- Type hints required (Pydantic models)
- Snake_case for variables/functions
- Import from local utils using relative imports
- Structured logging with `logging` module
- HTTP exceptions with proper status codes

### TypeScript (Frontend)
- React 18 functional components
- Custom hooks for state management
- PascalCase for components
- camelCase for variables/functions
- React Query for API calls
- Radix UI for accessible components
- TailwindCSS for styling

## Testing Strategy

### Backend Testing (pytest)
- Located in `backend/tests/`
- `conftest.py` provides shared fixtures
- Async mode enabled (`asyncio_mode = auto`)
- Mock S3/Cognito with moto library
- Test isolation with testorg organization

### Frontend Testing
- **Unit tests**: Vitest with React Testing Library
- **E2E tests**: Playwright for full user flows
- Located in `frontend/tests/`
- Test utils in `frontend/tests/helpers/`

## Documentation

Comprehensive documentation in `/docs/`:
- **System Admin** - Deployment, configuration, monitoring
- **CLAIRE User** - ELN usage guides
- **SAM User** - SOP authoring guides
- **PAUL User** - Protocol extraction guides

Built with Sphinx and hosted on Read the Docs: https://syndi.readthedocs.io/

To build docs locally:
```bash
make docs
```

## Important Files

- **Makefile** - All build, test, deployment commands (extensive help: `make help`)
- **template.yaml** - AWS SAM CloudFormation template
- **environment.yml** - Conda environment for Python 3.9
- **AGENTS.md** - Development guide (complementary to this file)
- **build.toml** - SAM build configuration
- **pytest.ini** - Backend test configuration
- **playwright.config.ts** - E2E test configuration
