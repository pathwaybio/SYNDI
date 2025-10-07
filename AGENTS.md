<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# AGENTS.md - SYNDI Development Guide

## Python Environments
- **syndi**: Python 3.9 - matches AWS Lambda, required for `serve-lambda` (production simulation)
\- **Setup**: `conda env create -f environment.yml` (creates syndi environment)
- **Switch**: `conda activate syndi` (for serve-lambda) or `conda activate claire` (for development)

## Build/Test Commands
- **Start backend**: `make start-backend ENV=dev ORG=<org>` (FastAPI with hot reload for development)
- **Start frontend**: `make start-frontend ENV=dev ORG=<org>` (Vite dev server with hot reload)
- **Serve lambda**: `conda activate syndi && make serve-lambda ENV=dev ORG=<org>` (production simulation, Python 3.9 required)
- **Test frontend**: `make test-frontend` (defaults to ORG=testorg)
- **Test backend**: `make test-backend` (defaults to ORG=testorg)
- **Test E2E**: `make test-e2e` (defaults to ORG=testorg)
- **Test all**: `make test-all` (runs all tests with testorg)
- **Build production**: `make build-frontend ENV=prod ORG=<org>`, `make rs-build ENV=stage ORG=<org>`
- **Deploy AWS**: `make rs-deploy ENV=stage ORG=<org>`
- **Sync configs**: `make sync-configs ENV=stage ORG=<org>` (after deployment to update configs with CloudFormation outputs)

## Deployment Best Practices

### Initial Infrastructure Setup (ONCE per environment/org)
1. Deploy with resource creation enabled:
   ```bash
   # Creates Cognito pool, S3 buckets, API Gateway, Lambda
   ENABLE_AUTH=true CREATE_BUCKETS=true ORG=uga ENV=stage make rs-deploy
   ```

2. Sync configs from CloudFormation outputs:
   ```bash
   make sync-configs ENV=stage ORG=uga
   ```

3. Review and commit updated org-specific config:
   ```bash
   git diff infra/.config/webapp/stage-uga.json
   git diff infra/.config/lambda/stage-uga.json
   git add infra/.config/webapp/stage-uga.json infra/.config/lambda/stage-uga.json
   git commit -m "Update stage-uga configs with deployed resource IDs"
   ```

### Regular Code Updates (FREQUENT)
1. Deploy Lambda code updates only (preserves Cognito & S3):
   ```bash
   # Fast Lambda-only update - use this 95% of the time
   ORG=uga ENV=stage make rs-deploy-function
   ```

2. OR full stack update if infrastructure changed:
   ```bash
   # Does NOT recreate Cognito or S3 buckets (CREATE_BUCKETS=false)
   ENABLE_AUTH=true CREATE_BUCKETS=false ORG=uga ENV=stage make rs-deploy
   ```

3. Sync configs (only if API endpoint changed):
   ```bash
   make sync-configs ENV=stage ORG=uga
   ```

4. Test:
   ```bash
   make start-frontend ENV=stage ORG=uga
   ```

### Environment Teardown (DANGEROUS - destroys user data!)
Only for dev/test environments or complete rebuilds:
```bash
# WARNING: Deletes Cognito users, S3 data, everything!
aws cloudformation delete-stack --stack-name rawscribe-stage-uga --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete --stack-name rawscribe-stage-uga
```

### Configuration Management
- **Base configs**: `infra/.config/webapp/stage.json` - Environment defaults
- **Org-specific**: `infra/.config/webapp/stage-uga.json` - Deployment-specific overrides (API endpoints, Cognito IDs)
- **Merge behavior**: Config merger combines base + org files → `frontend/public/config.json`
- **After deployment**: Always update org-specific file with `make sync-configs`
- **Never commit**: Org-specific configs are gitignored (private deployment details)

## Architecture & Structure
- **AWS SAM** application with Python FastAPI backend + React/TypeScript frontend
- **Backend**: `/backend/rawscribe/` - FastAPI app with routes/, utils/, config management via S3
- **Frontend**: `/frontend/src/` - React 18 + TypeScript + TailwindCSS + Radix UI components
- **Databases**: S3 buckets for forms, ELN data, drafts (rawscribe-*-ENV-ORG-ACCOUNT format)
- **Auth**: AWS Cognito with JWT tokens, managed via config environments
- **Deployment**: CloudFormation via SAM, CloudFront + S3 for static assets

## Code Style & Conventions
- **Python**: FastAPI patterns, async/await, type hints, snake_case, imports from local utils/
- **TypeScript**: React functional components, hooks, PascalCase components, camelCase variables
- **Error handling**: HTTP exceptions in FastAPI, proper status codes, structured logging
- **Testing**: pytest for backend (async mode), Vitest + Playwright for frontend
- **Config**: Environment-based (dev/test/stage/prod) + organization-based (no defaults, must specify ORG)
- **Security**: No hard-coded org names, no dangerous auth defaults, explicit ORG required for all commands
