<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Makefile-Driven Deployment Guide

This guide covers the complete deployment process for SYNDI infrastructure using the Makefile-driven approach. All deployments are managed through `make` commands that handle build, configuration, and AWS resource creation.

## Overview

SYNDI uses a **Makefile-driven deployment** system that provides:

- **Zero configuration files to maintain** - No `samconfig.toml` needed
- **Pure functional deployment** - `f(ENV, ORG, parameters) → Infrastructure`
- **Automatic configuration sync** - CloudFormation outputs update configs automatically
- **Built-in testing** - Deployment verifies everything works
- **Self-documenting** - Command line shows exactly what's being deployed

### Key Deployment Parameters

All deployments require these parameters:

- **`ENV`**: Environment (`dev`, `test`, `stage`, `prod`)
- **`ORG`**: Organization identifier (required, no default for security)
- **`ENABLE_AUTH`** (optional): Enable Cognito authentication (`true`/`false`, default: `true`)
- **`CREATE_BUCKETS`** (optional): Create S3 buckets (`true`/`false`, default: `false`)
- **`ADMIN_USERNAME`** (optional): Create admin user with this email
- **`ADMIN_PASSWORD`** (optional): Set admin user password

## Choosing the Right Deploy Command

### Decision Tree

```
What changed?
├─ Only Python code
│  └─ make rs-deploy-function (30 seconds)
│
├─ Only CloudFormation parameters (ENABLE_AUTH, CREATE_BUCKETS)
│  └─ make rs-deploy-only (1-2 minutes)
│
├─ Python code + infrastructure/config
│  └─ make rs-deploy (5-7 minutes)
│
└─ Adding dependencies to requirements.txt
   └─ make rs-deploy (5-7 minutes - rebuilds layer)
```

### Command Comparison

| Command | Build Time | Use When | What It Does |
|---------|-----------|----------|--------------|
| `rs-deploy-function` | ~30 sec | Code changes only | Updates Lambda code directly via AWS API |
| `rs-deploy-only` | ~1-2 min | Config/parameter changes only | Deploys without rebuilding |
| `rs-deploy` | ~5-7 min | Code + infrastructure changes | Full SAM build and deploy |

## Deployment Commands

### rs-deploy: Full Build and Deploy

Complete build and deployment process.

**Usage:**
```bash
ENV=stage ORG=myorg make rs-deploy
```

**What it does:**
1. Runs `sam build` - Rebuilds everything including dependency layer
2. Packages Lambda function
3. Uploads to S3
4. Deploys via CloudFormation
5. Uploads config to S3

**Use when:**
- First deployment to a new environment/org
- Changed dependencies in `backend/layers/dependencies/requirements.txt`
- Changed infrastructure in `template.yaml`
- Changed both code AND configuration

**Time:** 5-7 minutes

**Example:**
```bash
# First deployment with authentication
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ORG=myorg ENV=stage make rs-deploy
```

### rs-deploy-only: Deploy Without Build

Deploys using existing build artifacts.

**Usage:**
```bash
ENV=stage ORG=myorg make rs-deploy-only
```

**What it does:**
1. Skips build step (uses existing `.aws-sam-{ENV}-{ORG}/`)
2. Uploads config to S3
3. Deploys existing build via CloudFormation
4. Handles ROLLBACK_COMPLETE state automatically

**Use when:**
- ONLY changed CloudFormation parameters (e.g., `ENABLE_AUTH=true`)
- ONLY changed environment variables in template.yaml
- Want to redeploy same code with different config
- Previous deployment failed and you want to retry

**Time:** 1-2 minutes

**Example:**
```bash
# Enable authentication without rebuilding
ENABLE_AUTH=true ENV=stage ORG=myorg make rs-deploy-only
```

### rs-deploy-function: Quick Lambda Update

Fastest deployment method - updates Lambda code directly.

**Usage:**
```bash
ENV=stage ORG=myorg make rs-deploy-function
```

**What it does:**
1. Creates minimal zip of Python code (no dependencies)
2. Optionally uploads via S3 if package > 69MB
3. Updates Lambda function directly via AWS API
4. Bypasses CloudFormation entirely

**Use when:**
- ONLY changed Python code in `backend/rawscribe/`
- No infrastructure changes
- No config changes
- No dependency changes
- Want fastest possible deployment

**Time:** 30 seconds

**Example:**
```bash
# Quick bug fix deployment
ENV=stage ORG=myorg make rs-deploy-function
```

## Complete Deployment Workflow

### Initial Organization Deployment

Deploy a new organization for the first time:

```bash
# Step 1: Deploy infrastructure with all resources
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com \
  ADMIN_PASSWORD=SecurePassword2025! \
  ORG=myorg ENV=stage make rs-deploy

# Step 2: Sync configuration files from CloudFormation
make sync-configs ENV=stage ORG=myorg

# Step 3: Review auto-generated configs
git diff infra/.config/webapp/stage-myorg.json
git diff infra/.config/lambda/stage-myorg.json

# Step 4: Upload SOPs to forms bucket
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 cp your-sop.yaml \
  s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID}/sops/

# Step 5: Test deployment
ORG=myorg ENV=stage make check-rs
```

**What Gets Created:**
- CloudFormation stack: `rawscribe-stage-myorg`
- Lambda function: `rawscribe-stage-myorg-backend`
- API Gateway: `rawscribe-stage-myorg-api`
- Cognito User Pool: `rawscribe-stage-myorg-userpool`
- Cognito User Pool Client
- Cognito Groups: ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS
- S3 Buckets:
  - `syndi-frontend-stage-myorg-{accountid}`
  - `rawscribe-lambda-stage-myorg-{accountid}`
  - `rawscribe-forms-stage-myorg-{accountid}`
  - `rawscribe-eln-stage-myorg-{accountid}`
  - `rawscribe-eln-drafts-stage-myorg-{accountid}`
- CloudFront Distribution
- IAM Roles and Policies

### Subsequent Deployments

For updates after initial deployment:

```bash
# Quick code update (most common)
ORG=myorg ENV=stage make rs-deploy-function

# Configuration parameter change
ENABLE_AUTH=true ORG=myorg ENV=stage make rs-deploy-only

# Infrastructure change
ORG=myorg ENV=stage make rs-deploy

# Always sync configs after infrastructure changes
make sync-configs ENV=stage ORG=myorg
```

### Production Deployment

Production deployments with confirmation:

```bash
# Production deployment (will pause for confirmation)
ENABLE_AUTH=true CREATE_BUCKETS=false \
  ADMIN_USERNAME=admin@myorg.com \
  ADMIN_PASSWORD=ProductionPassword2025! \
  ORG=myorg ENV=prod make rs-deploy
```

The deployment will automatically:
- Pause for changeset confirmation (production only)
- Create admin user if credentials provided
- Test authentication
- Test API endpoints
- Display deployment summary with next steps

## Deployment Parameters

### ENABLE_AUTH

Controls whether Cognito authentication is created and enforced.

**Values:** `true` | `false`  
**Default:** `true`

**When to use `true`:**
- Production deployments
- Staging environments with real users
- When you need role-based access control

**When to use `false`:**
- Local testing
- Development environments
- CI/CD testing pipelines
- Quick testing without user management

**Example:**
```bash
# Disable auth for testing
ENABLE_AUTH=false ORG=testorg ENV=stage make rs-deploy

# Enable auth for production
ENABLE_AUTH=true ORG=myorg ENV=prod make rs-deploy
```

### CREATE_BUCKETS

Controls whether S3 buckets are created during deployment.

**Values:** `true` | `false`  
**Default:** `false`

**When to use `true`:**
- First deployment to new environment/org
- Buckets don't exist yet
- Want CloudFormation to manage buckets

**When to use `false`:**
- Buckets already exist
- Subsequent deployments
- Redeployment after stack deletion (buckets persisted)

**Example:**
```bash
# First deployment - create buckets
CREATE_BUCKETS=true ORG=neworg ENV=stage make rs-deploy

# Update deployment - buckets exist
CREATE_BUCKETS=false ORG=neworg ENV=stage make rs-deploy
```

**Note:** If you set `CREATE_BUCKETS=false` and buckets don't exist, deployment will fail. CloudFormation will report missing bucket resources.

### ADMIN_USERNAME and ADMIN_PASSWORD

Create an admin user automatically during deployment.

**Requirements:**
- Both must be provided together
- Only works when `ENABLE_AUTH=true`
- Username should be a valid email address
- Password must meet Cognito password requirements

**What happens:**
1. Creates Cognito user with username as email
2. Ensures `ADMINS` group exists
3. Adds user to `ADMINS` group
4. Sets permanent password (no temp password required)
5. Tests authentication
6. Tests API endpoint access
7. Displays results in deployment summary

**Example:**
```bash
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com \
  ADMIN_PASSWORD=SecurePass2025! \
  ORG=myorg ENV=stage make rs-deploy
```

**Output:**
```
👤 Creating admin user admin@myorg.com...
👥 Ensuring admin group exists...
🔗 Adding user to admin group...
🔐 Setting permanent password...
🔑 Testing authentication...
✅ Authentication successful!

🧪 Testing API endpoints:
  Health check: "status":"healthy"
  SOPs list: ✅ Found 3 SOPs

════════════════════════════════════════════════
🎉 Deployment Complete: stage/myorg
════════════════════════════════════════════════
📡 API Endpoint: https://abc123.execute-api.us-east-1.amazonaws.com/stage
🔐 User Pool ID: us-east-1_ABC123
🔑 Client ID: abc123def456
👤 Admin User: admin@myorg.com
🔒 Admin Pass: [set successfully]
```

## Build Directory Isolation

Each environment-organization combination gets its own SAM build directory:

```
.aws-sam-{ENV}-{ORG}/          # Isolated build directory
├── build.toml                 # SAM build metadata
├── cache/                     # Build cache
├── DependencyLayer/           # Python dependencies layer
│   └── python/
│       ├── fastapi/
│       ├── boto3/
│       └── ...
├── RawscribeLambda/          # Application code
│   └── rawscribe/
└── template.yaml             # Processed template
```

**Key Points:**
- Never mix builds between organizations
- Each org can deploy independently
- Builds are cached for faster subsequent deployments
- Manual deletion of build dirs forces clean rebuild

**Clean rebuild:**
```bash
# Remove build directory
rm -rf .aws-sam-stage-myorg/

# Next deploy will rebuild from scratch
ORG=myorg ENV=stage make rs-deploy
```

## Dependency Layer Caching

The dependency layer contains all Python packages from `requirements.txt`:

**When layer is rebuilt:**
- First `rs-deploy` for an ENV/ORG combination
- When `backend/layers/dependencies/requirements.txt` changes
- When build cache is cleared

**When layer is reused:**
- `rs-deploy-only` (uses cached layer)
- `rs-deploy-function` (bypasses layer entirely)
- Subsequent `rs-deploy` if requirements.txt unchanged

**Force layer rebuild:**
```bash
# Clear cache
rm -rf .aws-sam-stage-myorg/cache/

# Rebuild layer
ORG=myorg ENV=stage make rs-deploy
```

## Stack State Handling

The deployment automatically handles CloudFormation stack states:

### ROLLBACK_COMPLETE State

If a previous deployment failed and the stack is in `ROLLBACK_COMPLETE` state:

```bash
ORG=myorg ENV=stage make rs-deploy-only
```

Output:
```
⚠️  Stack rawscribe-stage-myorg is in ROLLBACK_COMPLETE state
🗑️  Deleting failed stack before redeploying...
⏳ Waiting for stack deletion (this may take a minute)...
✅ Failed stack deleted successfully
```

The deployment automatically:
1. Detects ROLLBACK_COMPLETE state
2. Deletes the failed stack
3. Waits for deletion to complete
4. Proceeds with fresh deployment

### Other Stack States

- **CREATE_COMPLETE**: Stack healthy, deployment proceeds
- **UPDATE_COMPLETE**: Stack healthy, deployment proceeds  
- **UPDATE_IN_PROGRESS**: Deployment waits or fails
- **DELETE_IN_PROGRESS**: Deployment waits
- **NO_STACK**: Fresh deployment proceeds

Check stack status:
```bash
ORG=myorg ENV=stage make check-rs-stack-status
```

## Configuration Sync

After deployment, sync configuration files from CloudFormation outputs:

```bash
make sync-configs ENV=stage ORG=myorg
```

This command:
1. Queries CloudFormation stack outputs
2. Extracts infrastructure values (API endpoint, Cognito IDs)
3. Updates `infra/.config/webapp/stage-myorg.json`
4. Updates `infra/.config/lambda/stage-myorg.json`
5. Preserves custom fields
6. Displays changes

**Always run sync-configs when:**
- First deployment to new org
- Cognito resources recreated
- API Gateway endpoint changes
- Any infrastructure resource IDs change

See [Sync Configs Guide](../configuration/sync-configs.md) for details.

## Common Deployment Scenarios

### Scenario 1: Fix Python Bug

```bash
# 1. Fix bug in backend/rawscribe/
vim backend/rawscribe/routes/sops.py

# 2. Quick deploy (30 seconds)
ORG=myorg ENV=stage make rs-deploy-function

# 3. Verify fix
ORG=myorg ENV=stage make rs-watch-log
```

### Scenario 2: Add Python Dependency

```bash
# 1. Add package to requirements.txt
echo "pandas==2.0.0" >> backend/layers/dependencies/requirements.txt

# 2. Full rebuild (layer changed)
ORG=myorg ENV=stage make rs-deploy

# 3. Verify package available
ORG=myorg ENV=stage make rs-watch-log
```

### Scenario 3: Enable Authentication

```bash
# 1. Deploy with authentication enabled
ENABLE_AUTH=true ORG=myorg ENV=stage make rs-deploy-only

# 2. Sync configs
make sync-configs ENV=stage ORG=myorg

# 3. Create users
# (users created via Cognito console or AWS CLI)
```

### Scenario 4: Change File Upload Limit

```bash
# 1. Edit config file
vim infra/.config/lambda/stage-myorg.json
# Change: "max_file_size_mb": 50

# 2. Deploy config change
ORG=myorg ENV=stage make rs-deploy-only
```

### Scenario 5: Deploy to Multiple Organizations

```bash
# Deploy to organization 1
ORG=org1 ENV=stage ENABLE_AUTH=true make rs-deploy
make sync-configs ENV=stage ORG=org1

# Deploy to organization 2 (parallel)
ORG=org2 ENV=stage ENABLE_AUTH=true make rs-deploy
make sync-configs ENV=stage ORG=org2

# Both deployments are completely isolated
```

## Deployment Verification

### Check Deployment Status

```bash
# Quick status check
ORG=myorg ENV=stage make check-rs
```

Output:
```
=== myorg Resources (stage) ===
Lambda:      rawscribe-stage-myorg-backend
API Gateway: rawscribe-stage-myorg-api
API Endpoint: https://abc123.execute-api.us-east-1.amazonaws.com/stage/
Stack Name:  rawscribe-stage-myorg
User Pool:   us-east-1_ABC123
Client ID:   abc123def456
S3 Buckets:
     lambda:     rawscribe-lambda-stage-myorg-123456789
     forms:      rawscribe-forms-stage-myorg-123456789
     ELN:        rawscribe-eln-stage-myorg-123456789
     ELN drafts: rawscribe-eln-drafts-stage-myorg-123456789
```

### Test Endpoints

```bash
# Get API endpoint
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-myorg \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

# Test health endpoint
curl ${API_ENDPOINT}/health

# Expected: {"status":"healthy","service":"claire-api",...}
```

### Test Authentication

```bash
# Automated JWT testing
ORG=myorg ENV=stage make test-jwt-aws

# Manual testing
TOKEN=$(make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)

curl -H "Authorization: Bearer ${TOKEN}" \
  ${API_ENDPOINT}/api/v1/sops/list
```

### View Logs

```bash
# Tail Lambda logs in real-time
ORG=myorg ENV=stage make rs-watch-log

# View recent logs
aws logs tail /aws/lambda/rawscribe-stage-myorg-backend \
  --since 10m --follow
```

## Troubleshooting

### Deployment Fails with "Stack does not exist"

**Cause:** First deployment or stack was deleted

**Solution:**
```bash
# Use rs-deploy (not rs-deploy-only) for first deployment
ORG=myorg ENV=stage make rs-deploy
```

### Deployment Fails with "Bucket already exists"

**Cause:** `CREATE_BUCKETS=true` but buckets already exist

**Solution:**
```bash
# Use CREATE_BUCKETS=false for existing buckets
CREATE_BUCKETS=false ORG=myorg ENV=stage make rs-deploy
```

### Deployment Stuck in ROLLBACK_COMPLETE

**Cause:** Previous deployment failed

**Solution:**
```bash
# rs-deploy-only automatically handles this
ORG=myorg ENV=stage make rs-deploy-only
```

### Lambda Function Not Updated

**Cause:** Using cached build or wrong command

**Solution:**
```bash
# Force clean rebuild
rm -rf .aws-sam-stage-myorg/
ORG=myorg ENV=stage make rs-deploy

# Or use direct function update
ORG=myorg ENV=stage make rs-deploy-function
```

### Config Changes Not Applied

**Cause:** Forgot to run sync-configs or deploy

**Solution:**
```bash
# Sync configs from CloudFormation
make sync-configs ENV=stage ORG=myorg

# Deploy config changes
ORG=myorg ENV=stage make rs-deploy-only
```

### Permission Denied Errors

**Cause:** AWS credentials insufficient

**Solution:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Ensure your IAM user/role has:
# - CloudFormation full access
# - Lambda full access
# - S3 full access
# - Cognito full access
# - API Gateway full access
# - IAM role creation
```

## Performance Tips

### Speed Up Deployments

1. **Use the right command:**
   - Code changes → `rs-deploy-function` (30 sec)
   - Config changes → `rs-deploy-only` (1-2 min)
   - Full changes → `rs-deploy` (5-7 min)

2. **Keep dependencies stable:**
   - Pin versions in requirements.txt
   - Only update when necessary
   - Layer rebuilds are expensive (5+ min)

3. **Use build caching:**
   - Don't delete build directories unnecessarily
   - SAM automatically uses `--cached` flag
   - Cache speeds up subsequent builds

4. **Parallel deployments:**
   - Different orgs can deploy simultaneously
   - Each uses its own build directory
   - No conflicts between deployments

## Related Documentation

- [Configuration System](../architecture/configuration-system.md) - How configuration works
- [Multi-Organization Setup](multi-organization.md) - Setting up multiple orgs
- [Sync Configs Guide](../configuration/sync-configs.md) - Syncing CloudFormation outputs
- [Makefile Reference](../reference/makefile-commands.md) - All available commands
- [Deployment Troubleshooting](troubleshooting.md) - Detailed troubleshooting
