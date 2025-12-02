<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# First Deployment Guide

This guide walks you through deploying SYNDI for the first time to a new organization and environment.

## Overview

First-time deployment creates all AWS resources needed for SYNDI:
- CloudFormation stack
- Lambda function with dependency layer
- API Gateway
- Cognito User Pool and app client
- S3 buckets (5 buckets)
- CloudFront distribution
- IAM roles

**Time Required:** 10-15 minutes  
**Prerequisites:** AWS CLI configured, appropriate IAM permissions

## Prerequisites

### AWS Account Setup

- AWS account with administrative access
- AWS CLI configured: `aws configure`
- IAM permissions for:
  - CloudFormation (create/update stacks)
  - Lambda (create functions, layers)
  - S3 (create/manage buckets)
  - Cognito (create User Pools)
  - API Gateway (create APIs)
  - CloudFront (create distributions)
  - IAM (create roles and policies)

### Local Environment

- Conda environment created: `conda env create -f environment.yml`
- Repository cloned and up to date
- Basic understanding of organization identifier (e.g., `myorg`, `uga`, `pwb`)

### Verify AWS Access

```bash
# Check AWS credentials
aws sts get-caller-identity

# Should output your account ID and user/role
```

## Automatic Account-Level Setup

During your first deployment, `make rs-deploy` automatically creates two account-wide resources if they don't exist:

### 1. SAM Deployment Bucket

**Name**: `rawscribe-sam-deployments-{account-id}`
**Purpose**: SAM uses this bucket to upload Lambda artifacts (code and layers) before CloudFormation deployment.
**Scope**: Account-wide - shared by all environments and organizations
**When created**: Automatically on first `make rs-deploy` in your AWS account

This bucket is separate from the application S3 buckets and is used exclusively by AWS SAM for deployment artifacts.

### 2. API Gateway CloudWatch Logs Role

**Name**: `APIGatewayCloudWatchLogsRole`
**Purpose**: Allows API Gateway to write access logs and execution logs to CloudWatch Logs.
**Scope**: Account-wide - required for all API Gateway stages with logging enabled
**When created**: Automatically on first `make rs-deploy` in your AWS account

This IAM role grants API Gateway permission to create log groups and streams in CloudWatch.

### What You'll See

On first deployment, you'll see output like:
```
📦 Creating SAM deployment bucket (one-time account setup)...
   Bucket: rawscribe-sam-deployments-804320730777
✅ SAM deployment bucket created and versioning enabled

🔧 Configuring API Gateway CloudWatch Logs role (one-time account setup)...
   Creating IAM role: APIGatewayCloudWatchLogsRole
   Setting API Gateway account role: arn:aws:iam::804320730777:role/APIGatewayCloudWatchLogsRole
✅ API Gateway CloudWatch Logs role configured
```

On subsequent deployments:
```
✅ SAM deployment bucket exists: rawscribe-sam-deployments-804320730777
✅ API Gateway CloudWatch Logs role already configured
```

**These are one-time setups** - once created, they're reused for all future SYNDI deployments in your AWS account.

## Step-by-Step Deployment

### Step 1: Choose Environment and Organization

```bash
# Set your parameters
export ENV=stage       # or prod
export ORG=myorg       # Your organization identifier (change to your org)

# Account ID (automatic)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

**Environment choices:**
- `dev` - Local development (not for AWS)
- `test` - Automated testing (not for AWS)
- `stage` - Staging/pre-production (recommended for first AWS deploy)
- `prod` - Production

**Organization identifier:**
- Lowercase alphanumeric only
- No hyphens or special characters
- Examples: `myorg`, `university`, `lab`

### Step 2: Deploy Infrastructure

Deploy all resources with one command:

```bash
# Deploy with authentication and bucket creation
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@${ORG}.com \
  ADMIN_PASSWORD=SecurePassword2025! \
  make rs-deploy
```

**Parameters explained:**
- `ENABLE_AUTH=true` - Creates Cognito User Pool
- `CREATE_BUCKETS=true` - Creates S3 buckets (first time only)
- `ADMIN_USERNAME` - Creates admin user automatically
- `ADMIN_PASSWORD` - Sets permanent password (meets policy requirements)

**Deployment time:** 5-7 minutes

**What happens:**
1. SAM builds Lambda function and dependency layer
2. Uploads artifacts to S3
3. Creates CloudFormation stack
4. Creates all AWS resources
5. Creates admin user and ADMINS group
6. Tests authentication
7. Tests API endpoints
8. Displays deployment summary

**Expected output:**
```
🚀 Deploying to stage for ${ORG} with SAM...
Building Lambda with SAM...
✅ Copied requirements.txt to layer directory
🔄 Building with layer caching...
[SAM build output...]

Deploying to AWS...
[CloudFormation progress...]

👤 Creating admin user admin@${ORG}.com...
👥 Ensuring admin group exists...
🔗 Adding user to admin group...
🔐 Setting permanent password...
🔑 Testing authentication...
✅ Authentication successful!

🧪 Testing API endpoints:
  Health check: "status":"healthy"
  SOPs list: ✅ Found 0 SOPs (none uploaded yet)

════════════════════════════════════════════════
🎉 Deployment Complete: stage/${ORG}
════════════════════════════════════════════════
📡 API Endpoint: https://abc123def.execute-api.us-east-1.amazonaws.com/stage
🔐 User Pool ID: us-east-1_ABC123DEF
🔑 Client ID: abc123def456ghi789
👤 Admin User: admin@${ORG}.com
🔒 Admin Pass: [set successfully]

📋 Next Steps:
1. Upload SOPs to S3:
   aws s3 cp your-sop.yaml s3://rawscribe-forms-stage-${ORG}-288761742376/sops/
2. Check deployment status:
   make check-rs
3. View CloudWatch logs:
   aws logs tail /aws/lambda/rawscribe-stage-${ORG}-backend --follow
════════════════════════════════════════════════
```

### Step 3: Sync Configuration Files

After deployment, sync configuration files from CloudFormation outputs:

```bash
make sync-configs
```

**What it does:**
1. Queries CloudFormation stack for outputs
2. Extracts API endpoint, Cognito User Pool ID, Client ID
3. Updates `infra/.config/webapp/stage-${ORG}.json`
4. Updates `infra/.config/lambda/stage-${ORG}.json`
5. Preserves custom fields you may have added

**Output:**
```
🔍 Fetching outputs from stack: rawscribe-stage-${ORG}

📋 CloudFormation Outputs:
  ApiEndpoint: https://abc123.execute-api.us-east-1.amazonaws.com/stage
  CognitoUserPoolId: us-east-1_ABC123
  CognitoClientId: abc123def456
  CloudFrontURL: https://d1234567.cloudfront.net

📝 Updating configuration files...
✅ Updated org-specific config: infra/.config/webapp/stage-${ORG}.json
   (Custom fields preserved, CloudFormation values updated)
✅ Updated org-specific lambda config: infra/.config/lambda/stage-${ORG}.json
   (Custom fields preserved, CloudFormation values updated)

✅ Configuration sync complete!

📌 Next steps:
  1. Review changes: git diff infra/.config/webapp/stage-${ORG}.json
  2. Test frontend: make start-frontend
  3. Commit if correct: git add infra/.config/webapp/stage-${ORG}.json
```

### Step 4: Review and Commit Configs

Review the auto-generated configuration files:

```bash
# View webapp config
cat infra/.config/webapp/stage-${ORG}.json | jq

# View lambda config
cat infra/.config/lambda/stage-${ORG}.json | jq

# See what changed
git diff infra/.config/webapp/stage-${ORG}.json
git diff infra/.config/lambda/stage-${ORG}.json
```

**If using private config repo:**
```bash
cd infra/.config
git add webapp/stage-${ORG}.json lambda/stage-${ORG}.json
git commit -m "Add stage-${ORG} configs with deployed resource IDs"
git push
cd ../..
```

### Step 5: Upload SOPs

Upload Standard Operating Procedures to the forms bucket:

```bash
# Upload single SOP
aws s3 cp your-sop.yaml \
  s3://rawscribe-forms-stage-${ORG}-${ACCOUNT_ID}/sops/

# Or upload directory of SOPs
aws s3 sync ./sops-directory \
  s3://rawscribe-forms-stage-${ORG}-${ACCOUNT_ID}/sops/

# Verify upload
aws s3 ls s3://rawscribe-forms-stage-${ORG}-${ACCOUNT_ID}/sops/
```

### Step 6: Test the Deployment

Verify everything works:

```bash
# Check deployment status
make check-rs
```

**Output shows:**
```
=== ${ORG} Resources (stage) ===
Lambda:      rawscribe-stage-${ORG}-backend
API Gateway: rawscribe-stage-${ORG}-api
API Endpoint: https://abc123.execute-api.us-east-1.amazonaws.com/stage/
Stack Name:  rawscribe-stage-${ORG}
User Pool:   us-east-1_ABC123
Client ID:   abc123def456
S3 Buckets:
     lambda:     rawscribe-lambda-stage-${ORG}-288761742376
     forms:      rawscribe-forms-stage-${ORG}-288761742376
     ELN:        rawscribe-eln-stage-${ORG}-288761742376
     ELN drafts: rawscribe-eln-drafts-stage-${ORG}-288761742376
```

**Test API endpoint:**
```bash
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-${ORG} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

# Test health endpoint
curl ${API_ENDPOINT}/health

# Expected: {"status":"healthy","service":"claire-api",...}
```

**Test authentication:**
```bash
# Set test credentials (use single quotes for passwords with special characters)
export ${ORG^^}_TEST_USER=testresearcher@example.com
export ${ORG^^}_TEST_PASSWORD='TestResearch123!'

# Run authentication test
make test-jwt-aws
```

**Expected output:**
```
Testing JWT for ${ORG} on AWS...
Found API Gateway: https://abc123.execute-api.us-east-1.amazonaws.com/stage
✅ JWT token obtained (length: 1171)
Testing protected endpoint...
✅ Authentication successful!
{
  "id": "default-user",
  "email": "default@localhost",
  "username": "default",
  "name": "Default User",
  "groups": ["admin"],
  "permissions": ["*"],
  "isAdmin": true
}
```

**Note:** Use **single quotes** for the password to prevent bash from interpreting special characters like `!`. The `${ORG^^}` syntax uppercases the ORG variable (e.g., if `ORG=myorg`, then `${ORG^^}_TEST_USER` becomes `MYORG_TEST_USER`).

### Step 7: Test Frontend

Start frontend locally pointing to deployed backend:

```bash
# Frontend will use config.json with deployed API endpoint
make start-frontend
```

Navigate to `http://localhost:3000` and:
1. Login with admin@${ORG}.com / SecurePassword2025!
2. Verify SOP list loads
3. Test creating a draft
4. Test submitting an ELN

## What Gets Created

### CloudFormation Stack

Stack name: `rawscribe-{env}-{org}`  
Example: `rawscribe-stage-myorg`

### Lambda Resources

- **Function**: `rawscribe-stage-myorg-backend`
- **Layer**: `rawscribe-deps-stage-myorg` (Python dependencies)
- **Execution Role**: `rawscribe-stage-myorg-lambda-role`

### API Gateway

- **Name**: `rawscribe-stage-myorg-api`
- **Stage**: `stage`
- **Endpoint**: `https://{api-id}.execute-api.us-east-1.amazonaws.com/stage`

### Cognito Resources

- **User Pool**: `rawscribe-stage-myorg-userpool`
- **Pool ID**: `us-east-1_XXXXXXXXX`
- **App Client**: `rawscribe-stage-myorg-client`
- **Client ID**: `XXXXXXXXXXXXXXXXXXXXXXXXXX`
- **Groups**: ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS
- **Admin User**: (if ADMIN_USERNAME provided)

### S3 Buckets (5 buckets)

- `syndi-frontend-stage-myorg-{accountid}` - Frontend hosting (CloudFront)
- `rawscribe-lambda-stage-myorg-{accountid}` - Lambda configs
- `rawscribe-forms-stage-myorg-{accountid}` - Forms and SOPs
- `rawscribe-eln-stage-myorg-{accountid}` - ELN submissions
- `rawscribe-eln-drafts-stage-myorg-{accountid}` - Draft submissions

### CloudFront Distribution

- **Purpose**: CDN for frontend hosting
- **URL**: `https://{distribution-id}.cloudfront.net`
- **Origins**: S3 (frontend) + API Gateway (backend)

### IAM Resources

- **Lambda Execution Role**: With S3 and Cognito access
- **Policies**: S3AccessPolicy, CognitoAccessPolicy

## Common First Deployment Issues

### "Stack already exists"

**Cause:** Organization was previously deployed

**Solution:**
```bash
# Check existing stack
aws cloudformation describe-stacks --stack-name rawscribe-stage-${ORG}

# Either use different ORG name or delete existing stack
aws cloudformation delete-stack --stack-name rawscribe-stage-${ORG}
aws cloudformation wait stack-delete-complete --stack-name rawscribe-stage-${ORG}
```

### "Bucket name already taken"

**Cause:** S3 bucket names are globally unique

**Solution:**
```bash
# Use CREATE_BUCKETS=false if buckets exist
CREATE_BUCKETS=false ENABLE_AUTH=true make rs-deploy

# Or choose different ORG name
```

### "Invalid password"

**Cause:** Password doesn't meet Cognito policy

**Solution:** Ensure ADMIN_PASSWORD has:
- At least 8 characters
- Uppercase and lowercase letters
- Numbers
- Symbols

Example: `SecurePass2025!`

### "Insufficient permissions"

**Cause:** AWS IAM user lacks required permissions

**Solution:**
```bash
# Check current permissions
aws iam get-user

# Request administrator access or specific permissions:
# - CloudFormation full access
# - Lambda full access
# - S3 full access
# - Cognito full access
# - API Gateway full access
# - IAM role creation
```

## Verification Checklist

After deployment, verify:

- [ ] CloudFormation stack shows CREATE_COMPLETE
- [ ] Lambda function exists and is active
- [ ] API Gateway endpoint returns health check
- [ ] Cognito User Pool exists with groups
- [ ] Admin user can authenticate
- [ ] All 5 S3 buckets exist
- [ ] CloudFront distribution is enabled
- [ ] Configuration files synced correctly

**Verification commands:**
```bash
# Stack status
make check-rs-stack-status

# Complete check
make check-rs

# Test auth
make test-jwt-aws
```

## Next Steps

After successful first deployment:

1. **Create Additional Users**: See [User Management](../authentication/user-management.md)
2. **Upload SOPs**: Add your organization's SOPs to forms bucket
3. **Customize Configs**: Edit `infra/.config/lambda/stage-${ORG}.json` for org-specific settings
4. **Deploy Frontend**: Build and deploy frontend to CloudFront (TBD)
5. **Setup Monitoring**: Configure CloudWatch alarms and dashboards
6. **Document Procedures**: Create runbook for your organization
7. **Train Users**: Provide access and training to team

## Production Deployment

For production deployment (first time):

```bash
# Production deployment with confirmation (set ENV=prod first)
export ENV=prod
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@${ORG}.com \
  ADMIN_PASSWORD=ProductionPassword2025! \
  make rs-deploy
```

**Production differences:**
- Deployment pauses for changeset confirmation
- Enhanced logging and tracing enabled
- Different Cognito password requirements possible
- More stringent security policies

**Production checklist:**
- [ ] Use strong, unique password for admin
- [ ] Document admin credentials securely
- [ ] Enable MFA for admin users (manual in Cognito)
- [ ] Configure backup and disaster recovery
- [ ] Set up monitoring and alarms
- [ ] Configure cost alerts
- [ ] Review security settings

## Subsequent Deployments

After initial deployment, use different commands for updates:

```bash
# Code changes only (30 seconds)
make rs-deploy-function

# Config changes (1-2 minutes)
make rs-deploy-only

# Infrastructure changes (5-7 minutes)
ENABLE_AUTH=true CREATE_BUCKETS=false make rs-deploy

# Always sync after infrastructure changes
make sync-configs
```

**Note:** Use `CREATE_BUCKETS=false` for subsequent deployments (buckets already exist).

## Related Documentation

- [Makefile Deployment](../deployment/makefile-deployment.md) - Complete deployment guide
- [Multi-Organization Setup](../deployment/multi-organization.md) - Additional organizations
- [Configuration System](../architecture/configuration-system.md) - How configs work
- [Sync Configs](../configuration/sync-configs.md) - TBD
- [User Management](../authentication/user-management.md) - Managing users
