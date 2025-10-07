<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Manual Deployment Testing Guide

This guide provides step-by-step instructions for manually testing the complete deployment lifecycle of CLAIRE/SYNDI.

## Overview

This guide covers critical deployment scenarios and testing:
1. **Fresh Stack Creation** - First-time deployment with all resources
2. **Function Updates** - Fast code-only updates
3. **Stack Updates** - Full infrastructure updates preserving resources
4. **Stack Re-deployment** - Clean re-deploy reusing existing resources
5. **User Management API** - Testing authentication and user endpoints
6. **Complete Teardown** - Removing all AWS resources (with nuclear options)

## Prerequisites

- AWS CLI configured with appropriate credentials
- Sufficient AWS permissions for CloudFormation, Lambda, Cognito, S3
- Environment configured: `conda activate syndi` (for Python 3.9)
- Organization name chosen (e.g., `testorg`, `myorg`)
- Environment chosen: `stage` (recommended for testing) or `prod`


## Testing Scenarios

### 1. Fresh Stack Creation (Naive First Deploy)

This simulates a completely new deployment where no AWS resources exist yet.

```bash
# Clean local artifacts to start fresh
# CAUTION
# Complete clean slate (everything)
make rs-nuke-all ENV=stage ORG=testorg
# Destroys: local builds + stack + buckets + users
# Confirmation: "NUKE testorg"
# block ENV=prod

# Set your test parameters
export TEST_ORG=testorg
export TEST_ENV=stage

# Deploy - automatically detects this is a fresh deployment
ORG=$TEST_ORG ENV=$TEST_ENV make rs-deploy
```

**What this does:**
- Auto-detects that buckets don't exist (fresh deployment)
- Creates new S3 buckets (lambda, forms, ELN, drafts, frontend)
- Creates new Cognito User Pool with groups (ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS)
- Configures Lambda IAM role with Cognito user management permissions
- Deploys Lambda function with config packaged inside
- Creates API Gateway with Cognito authorizer
- Creates CloudFront distribution
- Auto-syncs config files with deployment outputs (can skip with `SKIP_SYNC=true`)
- Pings health endpoint to initialize logs
- **Automatically bootstraps test environment** (creates test users + uploads sample SOP for non-prod)

**Note:** Config sync happens automatically! The deployment updates `infra/.config/webapp/stage-testorg.json` and `infra/.config/lambda/stage-testorg.json` with actual resource IDs from CloudFormation outputs.

**Verify success:**
```bash
# Check stack status
make check-rs-stack-status ENV=$TEST_ENV ORG=$TEST_ORG

# Verify all resources
make check-rs ENV=$TEST_ENV ORG=$TEST_ORG

# Check Lambda logs (should see "Loading config from filesystem")
make rs-watch-log ENV=$TEST_ENV ORG=$TEST_ORG

# List test users (automatically created during fresh deployment)
make rs-list-test-users ENV=$TEST_ENV ORG=$TEST_ORG
```

**Test users created automatically:**
For fresh non-prod deployments, test users are created automatically. If you need to create them manually or re-create them:

```bash
# Bootstrap/re-create test environment (test users + sample SOP)
make rs-bootstrap-testenv ENV=$TEST_ENV ORG=$TEST_ORG

# Or just create test users
make rs-create-test-users ENV=$TEST_ENV ORG=$TEST_ORG
```


**Expected config behavior:**
- Lambda should load config from standard path (same as local dev)
- Logs should show: `"Loaded config from local development: rawscribe/.config/config.json"`
- No S3 download should occur for config

**Expected test users:**
```
testadmin@example.com / TestAdmin123! [ADMINS] - CONFIRMED
testresearcher@example.com / TestResearch123! [RESEARCHERS] - CONFIRMED
testclinician@example.com / TestClinic123! [CLINICIANS] - CONFIRMED
```

### 2. Start CLAIRE  to view SOP
```
make start-frontend ENV=$TEST_ENV ORG=$TEST_ORG
```
Look for the test sop:
- Wait for frontend to finish loading (may take a bit)
- Navigate to http://localhost:3000/claire
- open the browser console to watch for errors
- clear browser cache if needed
- login as the test RESEARCHER (testresearcher@example.com / TestResearch123!)
- click on the Test4 SOP

Congratulations! You have successfully deployed your first SOP and viewed it in CLAIRE.


### 3. Function Update (Fast Code-Only Deploy)

This tests updating Lambda code without touching CloudFormation infrastructure.

```bash
# Make a trivial code change to verify deployment
echo "# Test change $(date)" >> backend/rawscribe/main.py

# Fast function-only update (bypasses CloudFormation)
ORG=$TEST_ORG ENV=$TEST_ENV make rs-deploy-function

# Verify the update
make rs-ping-health ENV=$TEST_ENV ORG=$TEST_ORG
make rs-watch-log ENV=$TEST_ENV ORG=$TEST_ORG
```

**What this does:**
- Builds minimal Lambda package (code only, no dependencies)
- Updates Lambda function directly via AWS API
- Skips CloudFormation (much faster)
- No Cognito or bucket changes

**Verify success:**
```bash
# Check that Cognito pool was NOT recreated
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-$TEST_ENV-$TEST_ORG \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

echo "User Pool ID: $USER_POOL_ID (should be same as before)"
```

### 3. Stack Update (Full Deploy, Preserving Resources)

This tests a full CloudFormation deployment that preserves existing Cognito and S3 buckets.

```bash
# Make changes (e.g., update template.yaml, config files, or code)
echo "# Template update $(date)" >> template.yaml

# Deploy - automatically detects existing resources
make rs-deploy ENV=$TEST_ENV ORG=$TEST_ORG
```

**What this does:**
- Auto-detects existing buckets (uses them, doesn't recreate)
- Runs full CloudFormation update
- Auto-detects and reuses existing Cognito User Pool
- Updates Lambda function with new code/config
- Updates IAM policies if changed
- Updates API Gateway if changed
- Updates CloudFront if changed
- **Auto-syncs configs** with deployment outputs
- Skips test user creation (already done in fresh deployment)

**Verify success:**
```bash
# Verify no Cognito recreation (pool ID unchanged)
make show-rs-user-pool ENV=$TEST_ENV ORG=$TEST_ORG

# Verify stack updated
make check-rs-stack-status ENV=$TEST_ENV ORG=$TEST_ORG

# Check CloudFormation events for what changed
aws cloudformation describe-stack-events \
  --stack-name rawscribe-$TEST_ENV-$TEST_ORG \
  --max-items 20 \
  --query 'StackEvents[].{Time:Timestamp,Status:ResourceStatus,Type:ResourceType,Reason:ResourceStatusReason}' \
  --output table
```

### 4. Config Update Deployment

This tests updating application configuration and deploying.

```bash
# Update config file
vi infra/.config/lambda/$TEST_ENV-$TEST_ORG.json

# Deploy with updated config (auto-syncs after deployment)
make rs-deploy ENV=$TEST_ENV ORG=$TEST_ORG

# Verify config loaded correctly
make rs-ping-health ENV=$TEST_ENV ORG=$TEST_ORG
make rs-watch-log ENV=$TEST_ENV ORG=$TEST_ORG
```

**Verify success:**
- Logs should show config loaded from standard path (rawscribe/.config/config.json)
- New config values should be active
- No S3 config download should occur
- Config files auto-synced (check `infra/.config/lambda/stage-testorg.json` updated)

### 5. Stack Re-deployment (Clean Start, Reusing Pools)

This simulates recovering from a failed deployment or forcing a clean redeploy while keeping data.

```bash
# Method A: Delete stack but keep external resources (manual)
# First, note the existing pool IDs
EXISTING_POOL=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-$TEST_ENV-$TEST_ORG \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

EXISTING_CLIENT=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-$TEST_ENV-$TEST_ORG \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' \
  --output text)

echo "Existing Pool: $EXISTING_POOL"
echo "Existing Client: $EXISTING_CLIENT"

# Delete the stack (keeps buckets and Cognito if externally managed)
aws cloudformation delete-stack \
  --stack-name rawscribe-$TEST_ENV-$TEST_ORG

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name rawscribe-$TEST_ENV-$TEST_ORG

# Re-deploy (auto-detects existing buckets if they exist)
ORG=$TEST_ORG ENV=$TEST_ENV make rs-deploy

# Method B: Handle ROLLBACK_COMPLETE automatically
# rs-deploy-only automatically detects and fixes ROLLBACK_COMPLETE state
ORG=$TEST_ORG ENV=$TEST_ENV make rs-deploy-only
```

**What this does:**
- Removes CloudFormation stack
- Keeps S3 buckets (they exist independently)
- Keeps Cognito User Pool (if stack-managed, new one created)
- Re-creates Lambda, API Gateway, CloudFront
- Reconnects to existing buckets

**Verify success:**
```bash
# Check that data persists in buckets
aws s3 ls s3://rawscribe-eln-$TEST_ENV-$TEST_ORG-$ACCOUNT_NUMBER/

# Check Cognito users still exist
make cognito-show-user ENV=$TEST_ENV ORG=$TEST_ORG USER_NAME=test@example.com
```

### 6. Complete Teardown (Sunset Deployment)

**⚠️ WARNING: This deletes ALL data including user accounts and stored files!**

```bash
# Teardown (automatically empties buckets and deletes everything)
ORG=$TEST_ORG ENV=$TEST_ENV make rs-teardown

# When prompted: "Type 'yes' to confirm deletion: "
# Type: yes

# The command will:
# 1. Empty all S3 buckets
# 2. Delete CloudFormation stack
# 3. Wait for completion
# 4. Verify deletion

# Verify complete removal
make check-rs-stack-status ENV=$TEST_ENV ORG=$TEST_ORG
# Should show: "does not exist"
```

**Note**: `rs-teardown` now handles bucket emptying automatically, preventing DELETE_FAILED states!

**What this does:**
- Empties all S3 buckets (all data deleted!)
- Deletes CloudFormation stack (Lambda, API Gateway, CloudFront)
- Deletes Cognito User Pool (all users lost!)
- Waits for completion and verifies deletion
- Complete cleanup in one command

## User Management API Testing

The deployment includes RESTful user management endpoints. Test them after deployment:

### List All Groups
```bash
make rs-list-groups ENV=$TEST_ENV ORG=$TEST_ORG
```

**Expected output:**
```
ADMINS - Administrative users with full access
  Permissions: *

LAB_MANAGERS - Lab managers with oversight and approval permissions
  Permissions: submit:*, view:*, draft:*, approve:*, manage:users

RESEARCHERS - Researchers who can submit SOPs and manage drafts
  Permissions: submit:*, view:own, view:group, draft:*

CLINICIANS - Clinical staff with data entry and viewing permissions
  Permissions: submit:*, view:own, draft:*
```

### Show User Details
```bash
# Show a specific user
make rs-show-user ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=testadmin@example.com

# Use custom admin credentials
make rs-show-user ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=researcher@example.com \
  ADMIN_USER=myadmin@myorg.com \
  ADMIN_PASSWORD='MyAdminPass!'
```

**Expected output:**
```json
{
  "username": "testadmin@example.com",
  "email": "testadmin@example.com",
  "status": "CONFIRMED",
  "enabled": true,
  "groups": ["ADMINS"],
  "created": "2025-01-15T10:30:00Z",
  "modified": "2025-01-15T10:30:00Z",
  "is_test_user": true
}
```

### Create/Update User
```bash
# Create new user (requires existing admin)
make rs-add-user ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=newuser@example.com \
  PASSWORD='SecurePass123!' \
  GROUP=RESEARCHERS

# Bootstrap first admin (no auth needed)
make rs-add-user ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=admin@myorg.com \
  PASSWORD='AdminPass123!' \
  GROUP=ADMINS \
  BOOTSTRAP=true
```

### Update User Group
```bash
make rs-set-group ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=user@example.com \
  GROUP=LAB_MANAGERS
```

### Change User Password
```bash
make rs-set-password ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=user@example.com \
  PASSWORD='NewPassword123!' \
  ADMIN_USER=admin@myorg.com \
  ADMIN_PASSWORD='AdminPass!'
```

**Note:** All user management commands support parameterized admin credentials with defaults to `testadmin@example.com`.

### Direct API Testing (Advanced)

For testing the REST API directly without Makefile wrappers:

```bash
# Get authentication token
TOKEN=$(infra/scripts/cognito-user-manager.sh get-token \
  --env stage --org testorg \
  --user testadmin@example.com --password 'TestAdmin123!' \
  --region us-east-1)

# Test GET user endpoint (note: @ must be encoded as %40)
curl -s -X GET \
  "$API_ENDPOINT/api/v1/user-management/users/testadmin%40example.com" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test GET groups endpoint
curl -s -X GET \
  "$API_ENDPOINT/api/v1/user-management/groups" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test POST create user
curl -s -X POST \
  "$API_ENDPOINT/api/v1/user-management/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser@example.com",
    "password": "NewUser123!",
    "group": "RESEARCHERS"
  }' | jq .

# Test GET test users
curl -s -X GET \
  "$API_ENDPOINT/api/v1/user-management/test-users" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Important Notes:**
- Email addresses in URLs must use `%40` instead of `@`
- JSON request bodies use `@` normally (no encoding needed)
- Token is obtained via `cognito-user-manager.sh` (no Make pollution)
- All endpoints require `manage:users` permission (ADMINS or LAB_MANAGERS)

## Common Verification Commands

### Check Overall Deployment Status
```bash
make check-rs ENV=$TEST_ENV ORG=$TEST_ORG
```

### Check CloudFormation Stack Status
```bash
make check-rs-stack-status ENV=$TEST_ENV ORG=$TEST_ORG
```

### View Lambda Logs (Real-time)
```bash
make rs-watch-log ENV=$TEST_ENV ORG=$TEST_ORG
```

### Test API Health Endpoint
```bash
make rs-ping-health ENV=$TEST_ENV ORG=$TEST_ORG
```

### Verify Config is in Lambda Package
```bash
# Build Lambda
ORG=$TEST_ORG ENV=$TEST_ENV make rs-build

# Check config.json is in the zip at standard path
unzip -l .local/s3/lambda/function.zip | grep "rawscribe/.config/config.json"

# Should show:
#   rawscribe/.config/config.json (same path as local dev)
```

### Check Cognito Pool
```bash
make show-rs-user-pool ENV=$TEST_ENV ORG=$TEST_ORG
```

### List S3 Buckets
```bash
make show-rs-s3-buckets ENV=$TEST_ENV ORG=$TEST_ORG
```

## Troubleshooting

### Lambda Fails to Initialize
**Symptom:** Lambda returns 500 errors, logs show config not found

**Check:**
```bash
# Verify config is in the zip at standard path
unzip -l .local/s3/lambda/function.zip | grep "rawscribe/.config/config.json"

# If missing, rebuild:
make clean-backend
ORG=$TEST_ORG ENV=$TEST_ENV make rs-build
```

### ROLLBACK_COMPLETE State
**Symptom:** Stack stuck in `ROLLBACK_COMPLETE`, can't update

**Fix:**
```bash
# rs-deploy-only automatically handles this
ORG=$TEST_ORG ENV=$TEST_ENV make rs-deploy-only
```

### DELETE_FAILED State
**Symptom:** Stack stuck in `DELETE_FAILED` (usually due to non-empty buckets)

**Fix:**
```bash
# Empty buckets (reads bucket names from stack), retry delete
make rs-empty-buckets ENV=$TEST_ENV ORG=$TEST_ORG
aws cloudformation delete-stack --stack-name rawscribe-$TEST_ENV-$TEST_ORG
```

Or use teardown (which does this automatically):
```bash
ORG=$TEST_ORG ENV=$TEST_ENV make rs-teardown
```

### Log Group Doesn't Exist
**Symptom:** `make rs-watch-log` fails with "ResourceNotFoundException"

**Fix:**
```bash
# Lambda log group is created on first invocation
make rs-ping-health ENV=$TEST_ENV ORG=$TEST_ORG

# Now logs should work
make rs-watch-log ENV=$TEST_ENV ORG=$TEST_ORG
```

### Cognito Pool Recreated Unexpectedly
**Symptom:** User Pool ID changed, all users lost

**Cause:** `CREATE_COGNITO=true` was explicitly set (rare), or pool wasn't stack-managed

**Prevention:**
- Never use `CREATE_COGNITO=true` unless intentional
- Normal `make rs-deploy` automatically detects and reuses existing resources
- Check pool status before deploy: `make show-rs-user-pool`

### Config Not Loading from Standard Path
**Symptom:** Logs show config fallback or error

**Check:**
```bash
# Verify config in zip at standard path
unzip -l .aws-sam-$TEST_ENV-$TEST_ORG/function.zip | grep "rawscribe/.config/config.json"

# Should see: rawscribe/.config/config.json
# If not, rebuild:
make clean-lambda-all
ORG=$TEST_ORG ENV=$TEST_ENV make rs-deploy
```

### User Management Permission Errors
**Symptom:** API returns 403 "Requires manage:users permission" but user is in ADMINS group

**Cause:** Permission mapping mismatch or Lambda lacks Cognito IAM permissions

**Fix:**
```bash
# 1. Check user's groups and permissions
make rs-show-user ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=testadmin@example.com

# 2. Verify group permissions are loaded
make rs-list-groups ENV=$TEST_ENV ORG=$TEST_ORG

# 3. If Lambda lacks IAM permissions, redeploy with updated template
make rs-deploy ENV=$TEST_ENV ORG=$TEST_ORG

# 4. Check Lambda logs for permission errors
make rs-watch-log ENV=$TEST_ENV ORG=$TEST_ORG
```

**Required IAM permissions for user management:**
- `cognito-idp:AdminCreateUser`
- `cognito-idp:AdminSetUserPassword`
- `cognito-idp:AdminAddUserToGroup`
- `cognito-idp:AdminRemoveUserFromGroup`
- `cognito-idp:AdminDeleteUser`
- `cognito-idp:AdminGetUser`
- `cognito-idp:AdminListGroupsForUser`

### Token Pollution from Make
**Symptom:** JWT token contains "make[1]: Entering directory" messages

**Fix:** Now uses `cognito-user-manager.sh get-token` directly (no Make subprocess pollution)
```bash
# Old way (polluted):
# TOKEN=$(make get-rs-token ...)

# New way (clean):
TOKEN=$(infra/scripts/cognito-user-manager.sh get-token \
  --env stage --org testorg \
  --user admin@example.com --password 'Pass!' \
  --region us-east-1)
```

### URL Encoding Issues
**Symptom:** API returns 404 for user endpoints with email addresses

**Cause:** Email addresses contain `@` which must be URL-encoded as `%40`

**Fix:** All Makefile rules now automatically encode usernames. For manual curl:
```bash
# Encode @ as %40
curl -X GET "$API_ENDPOINT/api/v1/user-management/users/admin%40example.com" \
  -H "Authorization: Bearer $TOKEN"
```

## Best Practices

### Development Testing
```bash
# Use testorg for all testing
TEST_ORG=testorg
TEST_ENV=stage

# Clean start for each major test
make rs-nuke-all ENV=$TEST_ENV ORG=$TEST_ORG

# Or just clean local builds
make clean-lambda-all
```

### Deployment Type Selection

**Template/IAM changes:**
```bash
# When template.yaml or IAM policies change
make rs-deploy ENV=stage ORG=myorg  # Full build + deploy
# Auto-syncs configs by default
```

**Code-only changes:**
```bash
# When only Lambda code changes (fastest)
make rs-deploy-function ENV=stage ORG=myorg
# Bypasses CloudFormation, no sync needed
```

**Config-only changes:**
```bash
# When only config files change
make rs-deploy ENV=stage ORG=myorg
# Rebuilds config, auto-syncs
```

**Skip auto-sync if needed:**
```bash
make rs-deploy-only ENV=stage ORG=myorg SKIP_SYNC=true
# Manual sync: make sync-configs ENV=stage ORG=myorg
```

### Pre-Production
```bash
# Use real org name, stage environment
ORG=myorg
ENV=stage

# First deployment - auto-detects and creates resources
make rs-deploy ENV=$ENV ORG=$ORG

# Updates - auto-detects and reuses existing resources
make rs-deploy ENV=$ENV ORG=$ORG
```

### Production
```bash
# Always use prod environment
ORG=myorg
ENV=prod

# Never use nuke commands (they block prod anyway)
# Use function-only updates when possible (faster)
ORG=myorg ENV=prod make rs-deploy-function

# Full updates when needed
make rs-deploy  # CloudFormation will preserve existing resources
```

### Quick Iteration Cycle
```bash
# 1. Code change
vi backend/rawscribe/routes/eln.py

# 2. Fast update (30-60 seconds, code-only)
make rs-deploy-function ENV=$TEST_ENV ORG=$TEST_ORG

# 3. Test
make rs-ping-health ENV=$TEST_ENV ORG=$TEST_ORG

# 4. Check logs
make rs-watch-log ENV=$TEST_ENV ORG=$TEST_ORG

# For template/IAM changes, use full deploy:
vi template.yaml
make rs-deploy ENV=$TEST_ENV ORG=$TEST_ORG  # Auto-syncs configs

# To test from absolute clean slate:
make rs-nuke-all ENV=$TEST_ENV ORG=$TEST_ORG
make rs-deploy ENV=$TEST_ENV ORG=$TEST_ORG
# Test users created automatically for non-prod!
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy to Stage

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Deploy to stage
        run: |
          # Auto-detects existing buckets, no flags needed
          ORG=myorg ENV=stage make rs-deploy
```

## Cleanup After Testing

### Option 1: Complete Nuclear Cleanup (Recommended for Testing)

```bash
# Nuclear option - destroys EVERYTHING in one command
make rs-nuke-all ENV=stage ORG=testorg

# Type: NUKE testorg
# This will:
#  1. Clean local builds (backend/.build/, .aws-sam-*)
#  2. Teardown CloudFormation stack
#  3. Delete Cognito User Pool and all users
#  4. Delete all S3 buckets and data

# Wait a few minutes for completion, then verify
make check-rs-stack-status ENV=stage ORG=testorg
# Should show: "Stack does not exist"
```

### Option 2: Incremental Cleanup (More Control)

```bash
# Step 1: Remove test users only (keep infrastructure)
make rs-remove-test-users ENV=stage ORG=testorg

# Step 2: Delete authentication (keep stack and buckets)
make rs-nuke-user-pool ENV=stage ORG=testorg

# Step 3: Delete all buckets (keep stack)
make rs-nuke-buckets ENV=stage ORG=testorg

# Step 4: Teardown stack (keeps buckets/users if external)
make rs-teardown ENV=stage ORG=testorg

# Step 5: Clean local artifacts
make clean-all
```

### Option 3: Traditional Teardown (Legacy)

```bash
# Remove test deployment (keeps buckets with retention policy)
ORG=testorg ENV=stage make rs-teardown

# Clean local artifacts
make clean-all
```

## Complete Testing Workflow (Recommended)

This is the complete end-to-end testing workflow from clean slate to teardown:

```bash
# Setup
export TEST_ORG=testorg
export TEST_ENV=stage

# 1. COMPLETE CLEAN SLATE
make rs-nuke-all ENV=$TEST_ENV ORG=$TEST_ORG
# Type: NUKE testorg

# 2. FRESH DEPLOYMENT
make rs-deploy ENV=$TEST_ENV ORG=$TEST_ORG
# Auto-detects fresh deployment, creates buckets
# Auto-syncs configs, pings health endpoint
# Auto-creates test users and uploads sample SOP (non-prod only)

# 3. VERIFY DEPLOYMENT
make check-rs ENV=$TEST_ENV ORG=$TEST_ORG
make rs-list-test-users ENV=$TEST_ENV ORG=$TEST_ORG
make rs-list-groups ENV=$TEST_ENV ORG=$TEST_ORG

# 4. TEST USER MANAGEMENT API
make rs-show-user ENV=$TEST_ENV ORG=$TEST_ORG \
  USER_NAME=testadmin@example.com

# 5. TEST FRONTEND (sample SOP already uploaded automatically)
make start-frontend ENV=$TEST_ENV ORG=$TEST_ORG
# Navigate to http://localhost:3000/claire
# Login as: testresearcher@example.com / TestResearch123!

# 6. CODE UPDATE TESTING
vi backend/rawscribe/routes/eln.py
make rs-deploy-function ENV=$TEST_ENV ORG=$TEST_ORG
# Fast code-only update (30-60 seconds)

# 7. TEMPLATE UPDATE TESTING
vi template.yaml
make rs-deploy ENV=$TEST_ENV ORG=$TEST_ORG
# Full rebuild + deploy with auto-sync

# 8. CLEANUP
make rs-nuke-all ENV=$TEST_ENV ORG=$TEST_ORG
# Type: NUKE testorg
```

**Total time:** ~5-10 minutes for complete cycle (most time is CloudFormation waits)

## Related Documentation

- [Deployment Overview](index.md)
- [Makefile Deployment Commands](makefile-deployment.md)
- [User Management API](user-management-api.md)
- [Multi-Organization Strategy](multi-organization.md)
- [Troubleshooting Guide](troubleshooting.md)
- [Configuration Management](../configuration/index.md)

