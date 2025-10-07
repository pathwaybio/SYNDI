<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Local Development Workflow

This guide covers the complete local development workflow for SYNDI, including clean builds, incremental builds, testing, and deployment strategies.

## Overview

SYNDI provides multiple development workflows optimized for different scenarios:

- **Local Development** - Hot reload for fast iteration
- **Local Production Simulation** - Test packaged code locally
- **AWS Deployment** - Deploy to staging/production
- **Clean Builds** - Force complete rebuild when needed
- **Incremental Builds** - Faster builds reusing existing artifacts

## Quick Reference

### Common Development Tasks

```bash
# Start development servers (hot reload)
make start-dev ENV=dev ORG=myorg

# Build for local testing
make build-frontend ENV=stage ORG=myorg  # Always clean build
make build-backend ENV=stage ORG=myorg   # Always clean build

# Deploy to AWS (fast Lambda update)
make rs-deploy-function ENV=stage ORG=myorg

# Clean everything
make clean-frontend
make clean-backend

# Run tests
make test-all
```

## Build System Behavior

### Clean vs Incremental Builds

SYNDI's build system uses **automatic clean builds** for `build-*` targets:

| Target | Build Type | When to Use |
|--------|-----------|-------------|
| `build-frontend` | **Clean build** | Testing changes locally |
| `build-backend` | **Clean build** | Testing changes locally |
| `serve-lambda` | Incremental (if exists) | Quick local testing |
| `serve-webapp` | Incremental (if exists) | Quick local testing |
| `rs-deploy` | Clean build (via SAM) | AWS deployment |
| `rs-deploy-function` | Minimal build | Quick AWS updates |

**Key Insight:** The `build-*` commands **always do clean builds** because they call `clean-*` first internally.

### Build Directory Structure

```
backend/.build/
├── lambda/
│   ├── function.zip          # Packaged Lambda
│   ├── package/              # Temporary build dir
│   └── stage-myorg.env.json  # Environment variables

frontend/dist/                 # Built frontend
├── index.html
├── assets/
└── config.json               # Merged configuration

.aws-sam-stage-myorg/          # SAM build artifacts
├── RawscribeLambda/          # Lambda code
├── DependencyLayer/          # Python dependencies
└── template.yaml             # Processed template

.local/s3/                    # Local "S3" storage
├── lambda/
│   ├── function.zip
│   └── build_mock/           # Extracted for serve-lambda
├── webapp/                   # Deployed frontend
├── forms/                    # Local forms/SOPs
├── eln/                      # Local submissions
└── eln-drafts/              # Local drafts
```

## Development Workflows

### Workflow 1: Local Development (Hot Reload)

**Best for:** Active coding, frequent changes, immediate feedback

```bash
# Start both servers with hot reload
make start-dev ENV=dev ORG=myorg

# Or start separately:
# Terminal 1: Backend
make start-backend ENV=dev ORG=myorg

# Terminal 2: Frontend
make start-frontend ENV=dev ORG=myorg
```

**What happens:**
- Backend: FastAPI with uvicorn auto-reload
- Frontend: Vite dev server with HMR (Hot Module Replacement)
- Changes detected automatically
- Browser refreshes automatically
- No build step required

**URLs:**
- Frontend: `http://localhost:3000` (or 5173 for Vite)
- Backend: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`

**Stop servers:**
```bash
make stop-all
# Or Ctrl+C in each terminal
```

### Workflow 2: Local Production Simulation

**Best for:** Testing packaged code before AWS deployment

```bash
# Step 1: Clean build everything
make clean-frontend
make clean-backend

# Step 2: Build (automatic clean builds)
make build-frontend ENV=stage ORG=myorg
make build-backend ENV=stage ORG=myorg

# Step 3: Serve built artifacts
# Terminal 1: Serve frontend
make serve-webapp ENV=stage ORG=myorg

# Terminal 2: Serve packaged Lambda
make serve-lambda ENV=stage ORG=myorg
```

**What happens:**
- Frontend built to production bundle (`frontend/dist/`)
- Backend packaged like Lambda would be
- Code served from `.local/s3/` (simulates S3)
- No auto-reload (matches production)

**When to use:**
- Before deploying to AWS
- Testing production configuration
- Debugging packaging issues
- Verifying build output

### Workflow 3: AWS Deployment Testing

**Best for:** Testing in real AWS environment

```bash
# Option A: Full rebuild + deploy
make clean-frontend
make clean-backend
ENABLE_AUTH=true CREATE_BUCKETS=false make rs-deploy ENV=stage ORG=myorg

# Option B: Quick Lambda-only update (30 seconds)
make rs-deploy-function ENV=stage ORG=myorg

# Step 2: Sync configs from CloudFormation
make sync-configs ENV=stage ORG=myorg

# Step 3: Test against deployed backend
make start-frontend ENV=stage ORG=myorg
```

**Deployment comparison:**

| Command | Time | Rebuilds Layer | Updates CloudFormation | Use When |
|---------|------|----------------|----------------------|----------|
| `rs-deploy` | 5-7 min | Yes | Yes | First deploy, dependency changes, infrastructure changes |
| `rs-deploy-only` | 1-2 min | No | Yes | Config/parameter changes only |
| `rs-deploy-function` | 30 sec | No | No | Code changes only |

### Workflow 4: Clean Build & Deploy (Recommended for Stage)

**Best for:** Testing complete deployment from scratch

```bash
# Step 1: Clean everything first
make clean-frontend
make clean-backend

# Step 2: Deploy to AWS (includes clean build automatically)
ENABLE_AUTH=true CREATE_BUCKETS=false make rs-deploy ENV=stage ORG=myorg

# Step 3: Sync configs from CloudFormation outputs
make sync-configs ENV=stage ORG=myorg

# Step 4: Test frontend locally against deployed backend
make start-frontend ENV=stage ORG=myorg
```

**What happens:**
1. SAM does clean build (`sam build`)
2. Creates `.aws-sam-stage-myorg/` with all artifacts
3. Deploys Lambda, API Gateway, CloudFormation stack
4. sync-configs updates local config files
5. Frontend connects to deployed AWS backend

## Clean Build Commands

### When to Clean Build

**Always clean build when:**
- Switching between organizations
- Dependencies changed
- Build artifacts corrupted
- Mysterious build errors
- Before important deployments

**Commands that auto-clean:**
- `make build-frontend` - Calls `clean-frontend` first
- `make build-backend` - Calls `clean-backend` first
- `make rs-deploy` - SAM builds fresh each time

### Manual Clean Commands

```bash
# Clean frontend artifacts
make clean-frontend
# Removes: frontend/dist/, frontend/public/config.json, .local/s3/webapp/

# Clean backend artifacts
make clean-backend
# Removes: backend/.build/, .local/s3/lambda/

# Clean configuration
make clean-config
# Removes: backend/rawscribe/.config/, frontend/public/config.json

# Clean test artifacts
make clean-test
# Removes: coverage reports, test results, cached data

# Clean SAM build (specific org)
rm -rf .aws-sam-stage-myorg/

# Nuclear option: Clean everything
make clean-frontend clean-backend clean-config clean-test
rm -rf .aws-sam-*/
```

## Configuration Management in Development

### Deploy Configuration

Configuration must be deployed before starting servers:

```bash
# Deploy configs for environment/org
make config ENV=dev ORG=myorg

# What it does:
# 1. Merges base + org-specific configs
# 2. Writes to backend/rawscribe/.config/config.json
# 3. Writes to frontend/public/config.json
```

**When to redeploy config:**
- Switched ENV or ORG
- Changed config files in `infra/.config/`
- After `make clean-config`
- Before starting servers

### Config File Locations

**Source configs (edit these):**
```
infra/.config/lambda/dev.json
infra/.config/lambda/dev-myorg.json
infra/.config/webapp/dev.json
infra/.config/webapp/dev-myorg.json
```

**Runtime configs (generated, don't edit):**
```
backend/rawscribe/.config/config.json  # Used by backend
frontend/public/config.json            # Used by frontend
```

## Incremental vs Full Builds

### Incremental Builds (serve-* targets)

When using `serve-lambda` or `serve-webapp`, builds are incremental:

```bash
# First run: Builds if missing
make serve-lambda ENV=dev ORG=myorg
# Output: 📦 Backend changes detected - rebuilding...

# Second run: Reuses existing if up-to-date
make serve-lambda ENV=dev ORG=myorg
# Output: ✅ Using existing extracted lambda (up to date)
```

**Incremental build logic:**
- Checks if `.local/s3/lambda/function.zip` exists
- Checks if `build_mock/` extract exists
- Compares timestamps
- Rebuilds only if source files newer than artifacts

**Force rebuild for serve-lambda:**
```bash
# Use debug mode (forces full rebuild)
make serve-lambda-debug ENV=dev ORG=myorg

# Or manually clean first
make clean-backend
make serve-lambda ENV=dev ORG=myorg
```

### Make's Dependency Tracking

The Makefile uses dependency tracking for builds:

```makefile
# Frontend build depends on source files
$(WEBAPP_BUILD_DIR)/index.html: $(FRONTEND_DEPS)
    # Rebuilds only if source files changed
    
# Backend build depends on Python files  
$(LAMBDA_DEST): $(BACKEND_DEPS)
    # Rebuilds only if source files changed
```

**Automatic rebuilds when:**
- Source `.ts`/`.tsx` files change (frontend)
- Source `.py` files change (backend)
- `package.json` changes (frontend)
- Dependencies change

## Testing During Development

### Quick Testing Loop

```bash
# 1. Make code changes
vim backend/rawscribe/routes/sops.py

# 2. Auto-reload detects changes (if using start-backend)
# Or manually test

# 3. Run unit tests
make test-backend

# 4. If tests pass, commit
git add backend/rawscribe/routes/sops.py
git commit -m "Fix SOP listing endpoint"
```

### Pre-Deployment Testing

```bash
# 1. Run all tests
make test-all

# 2. Build locally
make build-frontend ENV=stage ORG=myorg
make build-backend ENV=stage ORG=myorg

# 3. Test locally against production config
make serve-webapp ENV=stage ORG=myorg &
make serve-lambda ENV=stage ORG=myorg

# 4. If all good, deploy
make rs-deploy-function ENV=stage ORG=myorg
```

## Common Development Scenarios

### Scenario 1: Fix Backend Bug

```bash
# 1. Start backend in dev mode
make start-backend ENV=dev ORG=myorg

# 2. Edit code (auto-reloads)
vim backend/rawscribe/routes/sops.py

# 3. Test in browser or with curl
curl http://localhost:8000/api/v1/sops/list

# 4. Run tests
make test-backend

# 5. Deploy to AWS
make rs-deploy-function ENV=stage ORG=myorg
```

### Scenario 2: Add Frontend Feature

```bash
# 1. Start frontend in dev mode
make start-frontend ENV=dev ORG=myorg

# 2. Edit component (auto-reloads)
vim frontend/src/components/MyComponent.tsx

# 3. Test in browser (HMR updates immediately)

# 4. Run tests
make test-frontend

# 5. Build and verify
make build-frontend ENV=stage ORG=myorg

# 6. Deploy to S3 (TBD - frontend deployment)
```

### Scenario 3: Update Configuration

```bash
# 1. Edit config
vim infra/.config/lambda/stage-myorg.json

# 2. Redeploy config
make config ENV=stage ORG=myorg

# 3. Deploy to AWS
make rs-deploy-only ENV=stage ORG=myorg

# 4. Sync updated configs
make sync-configs ENV=stage ORG=myorg
```

### Scenario 4: Add Python Dependency

```bash
# 1. Add to requirements.txt
echo "pandas==2.0.0" >> backend/layers/dependencies/requirements.txt

# 2. Full rebuild required (layer changes)
make clean-backend
make rs-deploy ENV=stage ORG=myorg

# 3. Verify in Lambda
make rs-watch-log ENV=stage ORG=myorg
```

### Scenario 5: Switch Organizations

```bash
# 1. Clean configs
make clean-config

# 2. Deploy config for new org
make config ENV=dev ORG=neworg

# 3. Restart servers
make stop-all
make start-dev ENV=dev ORG=neworg
```

## Troubleshooting

### Hot Reload Not Working

**Symptom:** Changes not appearing in browser

**Solutions:**
```bash
# Frontend: Clear Vite cache
rm -rf frontend/node_modules/.vite
make start-frontend ENV=dev ORG=myorg

# Backend: Restart server
make stop-all
make start-backend ENV=dev ORG=myorg
```

### Build Artifacts Stale

**Symptom:** Old code running despite changes

**Solution:**
```bash
# Force clean rebuild
make clean-frontend clean-backend
make build-frontend ENV=dev ORG=myorg
make build-backend ENV=dev ORG=myorg
```

### Config Not Loading

**Symptom:** "Config file not found" errors

**Solution:**
```bash
# Redeploy configuration
make clean-config
make config ENV=dev ORG=myorg

# Verify configs exist
ls backend/rawscribe/.config/config.json
ls frontend/public/config.json
```

### Port Already in Use

**Symptom:** "Address already in use" error

**Solution:**
```bash
# Stop all servers
make stop-all

# Or manually kill processes
pkill -f "uvicorn.*rawscribe"
pkill -f "vite"

# Check ports
lsof -i :8000  # Backend
lsof -i :3000  # Frontend (or 5173)
```

## Best Practices

1. **Use hot reload for development** - `make start-dev` for active coding
2. **Clean build before AWS deploy** - Prevents stale artifacts
3. **Test locally first** - `make serve-*` to test packaged code
4. **Run tests before committing** - `make test-all`
5. **Use rs-deploy-function for quick updates** - Faster than full deploy
6. **Sync configs after infrastructure changes** - `make sync-configs`
7. **Clean when switching orgs** - Prevents config contamination
8. **Use incremental builds when safe** - Faster iteration

## Related Documentation

- [Local Setup](local-setup.md) - Initial environment setup
- [Testing Guide](testing.md) - Testing procedures
- [Deployment Guide](../deployment/makefile-deployment.md) - AWS deployment
- [Configuration System](../architecture/configuration-system.md) - How configs work
