<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Multi-Organization Setup

This guide explains how to deploy and manage multiple organizations within SYNDI. Each organization gets completely isolated infrastructure, user pools, and data storage.

## Overview

When you deploy a new organization, the system creates:

- **Separate CloudFormation stack** with unique name
- **Separate AWS infrastructure** (Lambda, API Gateway, S3 buckets, CloudFront)
- **Separate Cognito User Pool** for authentication
- **Complete data isolation** from other organizations
- **Independent scaling and monitoring**

### Multi-Organization Isolation

Each organization gets:

| Resource | Isolation Level | Example Names |
|----------|----------------|---------------|
| **User Pools** | Complete | `rawscribe-stage-org1-userpool`, `rawscribe-stage-org2-userpool` |
| **Lambda Functions** | Complete | `rawscribe-stage-org1-backend`, `rawscribe-stage-org2-backend` |
| **S3 Buckets** | Complete | `rawscribe-forms-stage-org1-{accountid}`, `rawscribe-forms-stage-org2-{accountid}` |
| **API Gateways** | Complete | `rawscribe-stage-org1-api`, `rawscribe-stage-org2-api` |
| **CloudFront** | Complete | Separate distributions per organization |

**Benefits:**
- Users from org1 cannot access org2 data
- Independent API rate limiting
- Separate cost tracking and billing
- Independent deployment cycles
- Different authentication policies per org

## Resource Naming Convention

All resources follow this consistent pattern:

```
CloudFormation Stack:  rawscribe-{env}-{org}
Lambda Function:       rawscribe-{env}-{org}-backend
API Gateway:           rawscribe-{env}-{org}-api
Cognito User Pool:     rawscribe-{env}-{org}-userpool
S3 Buckets:           rawscribe-{service}-{env}-{org}-{accountid}
CloudFront:           {distributionid}.cloudfront.net (tagged with org)
```

**Examples for org "acme" in stage:**
```
Stack:       rawscribe-stage-acme
Lambda:      rawscribe-stage-acme-backend
API:         rawscribe-stage-acme-api
User Pool:   rawscribe-stage-acme-userpool
Forms S3:    rawscribe-forms-stage-acme-288761742376
ELN S3:      rawscribe-eln-stage-acme-288761742376
```

## Deploying a New Organization

### Step 1: Deploy Infrastructure

Deploy the complete infrastructure stack for the new organization:

```bash
# First-time deployment with all resources
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@neworg.com \
  ADMIN_PASSWORD=SecurePassword2025! \
  ORG=neworg ENV=stage make rs-deploy
```

**Deployment time:** 5-7 minutes

**What gets created:**
- CloudFormation stack
- Lambda function with dependency layer
- API Gateway with proxy integration
- Cognito User Pool with app client
- Cognito Groups: ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS
- S3 buckets (5 buckets):
  - Frontend hosting
  - Lambda configs
  - Forms/SOPs
  - ELN submissions
  - ELN drafts
- CloudFront distribution
- IAM roles and policies
- Admin user (if credentials provided)

### Step 2: Sync Configuration

After deployment, sync configuration files from CloudFormation outputs:

```bash
make sync-configs ENV=stage ORG=neworg
```

This updates:
- `infra/.config/webapp/stage-neworg.json` with API endpoint and Cognito IDs
- `infra/.config/lambda/stage-neworg.json` with Cognito IDs

**Output:**
```
🔍 Fetching outputs from stack: rawscribe-stage-neworg

📋 CloudFormation Outputs:
  ApiEndpoint: https://abc123.execute-api.us-east-1.amazonaws.com/stage
  CognitoUserPoolId: us-east-1_ABC123
  CognitoClientId: abc123def456
  CloudFrontURL: https://d1234.cloudfront.net

📝 Updating configuration files...
✅ Updated org-specific config: infra/.config/webapp/stage-neworg.json
✅ Updated org-specific lambda config: infra/.config/lambda/stage-neworg.json

✅ Configuration sync complete!
```

### Step 3: Customize Organization Settings (Optional)

Edit organization-specific configurations:

```bash
# Edit webapp config for branding
vi infra/.config/webapp/stage-neworg.json
```

Add organization-specific settings:
```json
{
  "webapp": {
    "branding": {
      "title": "SYNDI - New Organization",
      "org_name": "New Organization Labs"
    },
    "ui": {
      "theme": "light",
      "logo": "/assets/neworg-logo.png"
    }
  }
}
```

```bash
# Edit lambda config for custom settings
vi infra/.config/lambda/stage-neworg.json
```

Add organization-specific settings:
```json
{
  "lambda": {
    "email_settings": {
      "from_email": "noreply@neworg.com",
      "support_email": "support@neworg.com"
    },
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "cors": {
      "allowedOrigins": [
        "https://syndi.neworg.com",
        "http://localhost:3000"
      ]
    }
  }
}
```

### Step 4: Redeploy with Custom Configs

If you customized configs, redeploy:

```bash
ORG=neworg ENV=stage make rs-deploy-only
```

### Step 5: Upload SOPs

Upload Standard Operating Procedures to the forms bucket:

```bash
# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Upload SOP file
aws s3 cp your-sop.yaml \
  s3://rawscribe-forms-stage-neworg-${ACCOUNT_ID}/sops/

# Or sync entire directory
aws s3 sync ./sops-directory \
  s3://rawscribe-forms-stage-neworg-${ACCOUNT_ID}/sops/
```

### Step 6: Test Deployment

Verify the deployment works correctly:

```bash
# Check deployment status
ORG=neworg ENV=stage make check-rs

# Test authentication (if admin user created)
ORG=neworg ENV=stage make test-jwt-aws

# Test API endpoints
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-neworg \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

curl ${API_ENDPOINT}/health
# Expected: {"status":"healthy",...}
```

## Managing Multiple Organizations

### Deployment Best Practices

#### Initial Infrastructure Setup (ONCE per org)

```bash
# Create all resources including buckets
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@org.com \
  ADMIN_PASSWORD=SecurePass! \
  ORG=myorg ENV=stage make rs-deploy

# Sync configs
make sync-configs ENV=stage ORG=myorg

# Commit org-specific configs
git add infra/.config/webapp/stage-myorg.json
git add infra/.config/lambda/stage-myorg.json
git commit -m "Add stage-myorg configs with deployed resource IDs"
```

#### Regular Code Updates (FREQUENT)

```bash
# Fast Lambda-only update - use this 95% of the time
ORG=myorg ENV=stage make rs-deploy-function

# OR full stack update if infrastructure changed
ENABLE_AUTH=true CREATE_BUCKETS=false \
  ORG=myorg ENV=stage make rs-deploy

# Sync configs only if API endpoint changed
make sync-configs ENV=stage ORG=myorg
```

### Parallel Deployments

Different organizations can deploy simultaneously:

```bash
# Terminal 1: Deploy org1
ORG=org1 ENV=stage make rs-deploy &

# Terminal 2: Deploy org2 (parallel)
ORG=org2 ENV=stage make rs-deploy &

# Each uses its own build directory:
# .aws-sam-stage-org1/
# .aws-sam-stage-org2/
```

**Benefits:**
- No build conflicts
- Faster overall deployment
- Independent failure handling

### Configuration Management

#### Base Configuration (Shared)

`infra/.config/lambda/stage.json` - Settings shared by all organizations:
```json
{
  "lambda": {
    "auth": {
      "provider": "cognito",
      "required": true
    },
    "file_uploads": {
      "max_file_size_mb": 25,
      "allowed_extensions": [".pdf", ".doc", ".txt"]
    },
    "retry": {
      "max_retries": 3,
      "backoff_multiplier": 2
    }
  }
}
```

#### Organization-Specific Overrides

`infra/.config/lambda/stage-org1.json` - Org1-specific settings:
```json
{
  "lambda": {
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "email_settings": {
      "from_email": "noreply@org1.com"
    }
  }
}
```

`infra/.config/lambda/stage-org2.json` - Org2-specific settings:
```json
{
  "lambda": {
    "file_uploads": {
      "max_file_size_mb": 100
    },
    "email_settings": {
      "from_email": "noreply@org2.com"
    }
  }
}
```

**Merge behavior:** Org-specific settings override base settings via deep merge.

### Viewing All Organizations

```bash
# Check all organizations
make check-rs

# Output shows all deployed orgs:
=== org1 Resources (stage) ===
Lambda:      rawscribe-stage-org1-backend
API Gateway: rawscribe-stage-org1-api
API Endpoint: https://abc123.execute-api.us-east-1.amazonaws.com/stage/
...

=== org2 Resources (stage) ===
Lambda:      rawscribe-stage-org2-backend
API Gateway: rawscribe-stage-org2-api
API Endpoint: https://def456.execute-api.us-east-1.amazonaws.com/stage/
...
```

## User Management Per Organization

Each organization has its own Cognito User Pool with separate users.

### Creating Users

```bash
# Get User Pool ID for organization
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-org1 \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher@org1.com \
  --user-attributes Name=email,Value=researcher@org1.com \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# Add to RESEARCHERS group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher@org1.com \
  --group-name RESEARCHERS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher@org1.com \
  --password ResearcherPass123! \
  --permanent
```

### Using Makefile Helper

```bash
# Create user with Makefile (if helper exists)
make create-rs-user ENV=stage ORG=org1 \
  USERNAME=researcher@org1.com \
  PASSWORD=ResearcherPass! \
  GROUP=RESEARCHERS
```

## Cost Management

### Resource Tagging

All resources are automatically tagged with:
```yaml
Environment: stage
Organization: org1
Application: SYNDI
Component: Backend-API (or Frontend, Storage, etc.)
```

### Cost Tracking

Track costs per organization using AWS Cost Explorer:

```bash
# View costs by organization tag
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --group-by Type=TAG,Key=Organization
```

### Cost Optimization

**Per Organization:**
- Monitor Lambda invocations and adjust memory/timeout
- Review S3 storage growth and implement lifecycle policies
- Optimize CloudFront cache settings
- Set up budget alerts per organization tag

**Example Lifecycle Policy:**
```bash
# Move old ELN submissions to Glacier after 90 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket rawscribe-eln-stage-org1-${ACCOUNT_ID} \
  --lifecycle-configuration file://lifecycle.json
```

## Troubleshooting

### Deployment Issues

**Stack Name Conflicts:**
```
Error: Stack rawscribe-stage-org1 already exists
```
**Solution:** Use different ORG parameter or check existing stack:
```bash
aws cloudformation describe-stacks --stack-name rawscribe-stage-org1
```

**S3 Bucket Naming Issues:**
```
Error: Bucket already exists
```
**Solution:** 
- Use `CREATE_BUCKETS=false` if buckets exist
- Or choose different ORG name

**Cognito User Pool Limits:**
```
Error: LimitExceededException
```
**Solution:** Check AWS limits (default 1000 pools per region). Request increase or use existing pools.

### Verification Commands

```bash
# Check stack status
ORG=org1 ENV=stage make check-rs-stack-status

# List all stacks for organization
aws cloudformation list-stacks \
  --query 'StackSummaries[?contains(StackName,`org1`)]'

# Check Lambda function
aws lambda get-function \
  --function-name rawscribe-stage-org1-backend

# Check S3 buckets
aws s3 ls | grep "rawscribe.*org1"

# Show all S3 buckets for organization
ORG=org1 ENV=stage make show-rs-s3-buckets
```

### Cross-Organization Issues

**Users can't access other org's data:**
- This is expected - organizations are isolated
- Users need separate accounts in each org's User Pool

**Shared resources:**
- Only the SAM deployment bucket is shared: `rawscribe-sam-deployments-{accountid}`
- All other resources are org-specific

## Environment Teardown

### Safe Teardown (Preserves Data)

Removes Lambda and API Gateway, keeps Cognito and S3:

```bash
# WARNING: This will delete the Lambda and API Gateway
ORG=org1 ENV=stage make rs-teardown

# Buckets and User Pool are preserved
# Redeploy with: ORG=org1 ENV=stage make rs-deploy
```

### Complete Teardown (DANGEROUS - Destroys User Data!)

Only for dev/test environments or complete rebuilds:

```bash
# WARNING: Deletes Cognito users, S3 data, everything!
aws cloudformation delete-stack \
  --stack-name rawscribe-stage-org1 \
  --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name rawscribe-stage-org1

# Manually delete S3 buckets (CloudFormation can't delete non-empty buckets)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 rm s3://rawscribe-forms-stage-org1-${ACCOUNT_ID} --recursive
aws s3 rb s3://rawscribe-forms-stage-org1-${ACCOUNT_ID}
# Repeat for other buckets...
```

## Security Considerations

### Organization Isolation

- **Network:** Each org has separate API Gateway endpoints
- **Authentication:** Separate User Pools mean separate user databases
- **Authorization:** JWT tokens from org1 won't work with org2 Lambda
- **Data:** S3 bucket policies restrict access to specific Lambda functions
- **Monitoring:** CloudWatch logs are separated by function name

### IAM Roles

Each organization's Lambda has a unique execution role:
```
rawscribe-stage-org1-lambda-role
rawscribe-stage-org2-lambda-role
```

Roles grant access only to that org's S3 buckets.

### API Gateway Security

- CORS configured per organization
- Rate limiting applied per API Gateway
- Different throttling settings possible per org

## Best Practices

1. **Use Consistent Naming:** Stick to lowercase, alphanumeric org names (no hyphens or special characters)
2. **Tag Resources:** Use Organization tag for cost tracking and resource management
3. **Document Org-Specific Configs:** Add comments explaining custom settings
4. **Monitor Per Organization:** Set up CloudWatch alarms per org
5. **Backup Data:** Configure S3 versioning and cross-region replication for critical orgs
6. **Regular Audits:** Review user access and permissions quarterly per org
7. **Independent Testing:** Test each org's deployment separately

## Related Documentation

- [Makefile Deployment Guide](makefile-deployment.md) - Deployment commands
- [Configuration System](../architecture/configuration-system.md) - Config management
- [RBAC Guide](../authentication/rbac.md) - Role-based access control
- [User Management](../authentication/user-management.md) - Creating users
- [Testing Authentication](../authentication/testing-auth.md) - Auth testing
