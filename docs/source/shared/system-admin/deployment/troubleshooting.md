<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Deployment Troubleshooting

Common deployment issues and solutions for SYNDI systems.

## Deployment Failures

### Stack in ROLLBACK_COMPLETE State

**Symptom:**
```
⚠️  Stack rawscribe-stage-myorg is in ROLLBACK_COMPLETE state
```

**Cause:** Previous deployment failed and CloudFormation rolled back

**Solution:**
```bash
# Automatic handling via rs-deploy-only
ORG=myorg ENV=stage make rs-deploy-only
```

The deployment automatically:
1. Detects ROLLBACK_COMPLETE state
2. Deletes the failed stack
3. Waits for deletion to complete
4. Proceeds with fresh deployment

**Manual solution:**
```bash
# Delete stack manually
aws cloudformation delete-stack \
  --stack-name rawscribe-stage-myorg \
  --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name rawscribe-stage-myorg

# Redeploy
ORG=myorg ENV=stage make rs-deploy
```

### "Stack already exists"

**Symptom:**
```
Error: Stack rawscribe-stage-myorg already exists
```

**Cause:** Organization was previously deployed

**Solution:**

**Option 1:** Use different organization name
```bash
ORG=myorg2 ENV=stage make rs-deploy
```

**Option 2:** Update existing stack
```bash
ORG=myorg ENV=stage make rs-deploy-only
```

**Option 3:** Delete and redeploy
```bash
make rs-teardown ENV=stage ORG=myorg
# Wait 2-3 minutes
ORG=myorg ENV=stage make rs-deploy
```

### "Bucket already exists"

**Symptom:**
```
Error: Bucket rawscribe-forms-stage-myorg-288761742376 already exists
```

**Cause:** `CREATE_BUCKETS=true` but buckets already exist

**Solution:**
```bash
# Use CREATE_BUCKETS=false for existing buckets
CREATE_BUCKETS=false ENABLE_AUTH=true \
  ORG=myorg ENV=stage make rs-deploy
```

### "Insufficient permissions"

**Symptom:**
```
Error: User: arn:aws:iam::123456:user/myuser is not authorized to perform: cloudformation:CreateStack
```

**Cause:** AWS IAM user lacks required permissions

**Solution:**

Check required permissions:
- CloudFormation: CreateStack, UpdateStack, DescribeStacks
- Lambda: CreateFunction, UpdateFunctionCode
- S3: CreateBucket, PutObject, GetObject
- Cognito: CreateUserPool, CreateUserPoolClient
- API Gateway: CreateRestApi, CreateDeployment
- IAM: CreateRole, AttachRolePolicy, PutRolePolicy
- CloudFront: CreateDistribution

Request administrator access or specific permissions from your AWS admin.

## Build Failures

### SAM Build Fails

**Symptom:**
```
Error: Unable to find a supported build workflow for runtime python3.9
```

**Cause:** Build dependencies missing or corrupted build directory

**Solution:**
```bash
# Clean and rebuild
rm -rf .aws-sam-stage-myorg/
ORG=myorg ENV=stage make rs-deploy
```

### Dependencies Not Installing

**Symptom:**
```
Error: Could not install packages due to an OSError
```

**Cause:** Network issues or package conflicts

**Solution:**
```bash
# Update requirements.txt with specific versions
vim backend/layers/dependencies/requirements.txt

# Clean and rebuild
rm -rf .aws-sam-stage-myorg/
ORG=myorg ENV=stage make rs-deploy
```

### Layer Build Timeout

**Symptom:**
```
Error: Build timed out after 600 seconds
```

**Cause:** Too many dependencies or slow network

**Solution:**
```bash
# Build locally first
cd backend/layers/dependencies
pip install -r requirements.txt -t python/

# Then deploy
cd ../../../
ORG=myorg ENV=stage make rs-deploy
```

## Configuration Issues

### Config Not Found

**Symptom:**
```
❌ Base config not found: infra/.config/lambda/stage.json
```

**Cause:** Config files missing

**Solution:**
```bash
# Check if base configs exist
ls infra/.config/lambda/stage.json
ls infra/.config/webapp/stage.json

# If missing, restore from example or git
git checkout infra/.config/
# Or create minimal configs (see config-examples.md)
```

### Configs Not Syncing

**Symptom:** API endpoint not updating in configs after deployment

**Cause:** Forgot to run sync-configs

**Solution:**
```bash
make sync-configs ENV=stage ORG=myorg
```

## Lambda Function Issues

### Function Not Updating

**Symptom:** Code changes not reflected in Lambda

**Cause:** Using cached build or wrong command

**Solution:**
```bash
# Force rebuild
rm -rf .aws-sam-stage-myorg/
ORG=myorg ENV=stage make rs-deploy

# Or use direct update
ORG=myorg ENV=stage make rs-deploy-function
```

### "Function size too large"

**Symptom:**
```
Error: RequestEntityTooLargeException: Request must be smaller than 69905067 bytes
```

**Cause:** Lambda package > 50MB uncompressed

**Solution:**
```bash
# rs-deploy-function automatically handles this
# It uploads via S3 if package > 69MB
ORG=myorg ENV=stage make rs-deploy-function

# Or reduce package size:
# - Remove unnecessary dependencies
# - Use Lambda layers for large packages
```

### Lambda Timeout

**Symptom:** Lambda execution times out

**Cause:** Function timeout set too low

**Solution:** Update `template.yaml`:
```yaml
Globals:
  Function:
    Timeout: 60  # Increase from 30
```

Then redeploy:
```bash
ORG=myorg ENV=stage make rs-deploy
```

## Authentication Issues

### Cognito Resources Not Created

**Symptom:** No User Pool created after deployment

**Cause:** `ENABLE_AUTH=false`

**Solution:**
```bash
# Redeploy with auth enabled
ENABLE_AUTH=true ORG=myorg ENV=stage make rs-deploy-only
```

### Admin User Not Created

**Symptom:** Admin user missing after deployment

**Cause:** Missing ADMIN_USERNAME or ADMIN_PASSWORD

**Solution:**
```bash
# Redeploy with admin credentials
ENABLE_AUTH=true \
  ADMIN_USERNAME=admin@myorg.com \
  ADMIN_PASSWORD=SecurePass2025! \
  ORG=myorg ENV=stage make rs-deploy-only
```

### JWT Validation Fails

**Symptom:** Valid tokens rejected by Lambda

**Cause:** Mismatched Cognito configuration

**Solution:**
```bash
# Check Lambda environment variables
aws lambda get-function-configuration \
  --function-name rawscribe-stage-myorg-backend \
  --query 'Environment.Variables' | jq

# Ensure COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are set

# Redeploy if needed
ORG=myorg ENV=stage make rs-deploy-only
```

## Teardown and Redeploy

### Safe Teardown (Preserves Data)

Removes Lambda and API Gateway, **keeps Cognito and S3**:

```bash
# Teardown stack (preserves User Pool and S3 buckets)
make rs-teardown ENV=stage ORG=myorg
```

**What gets preserved:**
- ✅ Cognito User Pool - User accounts remain
- ✅ S3 Buckets - All data preserved
- ✅ User passwords - No reset needed

**What gets removed:**
- ❌ Lambda function
- ❌ API Gateway
- ❌ CloudFormation stack
- ❌ CloudFront distribution

**Redeploy after teardown:**
```bash
# Redeploy with existing resources
CREATE_BUCKETS=false ENABLE_AUTH=true \
  ORG=myorg ENV=stage make rs-deploy

# CloudFormation will discover and reuse existing User Pool and buckets
```

### Complete Teardown (DANGEROUS - Destroys Data!)

**WARNING:** This deletes ALL data including user accounts and ELN submissions!

```bash
# Delete CloudFormation stack (initiates deletion)
aws cloudformation delete-stack \
  --stack-name rawscribe-stage-myorg \
  --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name rawscribe-stage-myorg

# Manually delete S3 buckets (CloudFormation can't delete non-empty buckets)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Empty and delete each bucket
aws s3 rm s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID} --recursive
aws s3 rb s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID}

aws s3 rm s3://rawscribe-eln-stage-myorg-${ACCOUNT_ID} --recursive
aws s3 rb s3://rawscribe-eln-stage-myorg-${ACCOUNT_ID}

aws s3 rm s3://rawscribe-eln-drafts-stage-myorg-${ACCOUNT_ID} --recursive
aws s3 rb s3://rawscribe-eln-drafts-stage-myorg-${ACCOUNT_ID}

aws s3 rm s3://rawscribe-lambda-stage-myorg-${ACCOUNT_ID} --recursive
aws s3 rb s3://rawscribe-lambda-stage-myorg-${ACCOUNT_ID}

aws s3 rm s3://syndi-frontend-stage-myorg-${ACCOUNT_ID} --recursive
aws s3 rb s3://syndi-frontend-stage-myorg-${ACCOUNT_ID}
```

### Verification After Teardown

```bash
# Check Lambda (should not exist)
aws lambda get-function --function-name rawscribe-stage-myorg-backend
# Expected: ResourceNotFoundException

# Check API Gateway (should not exist)
aws apigateway get-rest-apis \
  --query "items[?name=='rawscribe-stage-myorg-api'].name"
# Expected: []

# Check User Pool (should exist if safe teardown)
aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?contains(Name,'rawscribe-stage-myorg')].Name"

# Check S3 buckets (should exist if safe teardown)
aws s3 ls | grep "rawscribe.*myorg"
```

## Performance Issues

### Slow Deployments

**Symptom:** Deployment takes > 10 minutes

**Causes and Solutions:**

**1. Layer rebuild:**
```bash
# Check if requirements.txt changed
git diff backend/layers/dependencies/requirements.txt

# If unchanged, use rs-deploy-only (skips rebuild)
ORG=myorg ENV=stage make rs-deploy-only
```

**2. Network issues:**
```bash
# Check AWS connectivity
aws sts get-caller-identity

# Try different region (edit AWS config)
aws configure set region us-west-2
```

**3. Large deployment artifacts:**
```bash
# Check package size
ls -lh .aws-sam-stage-myorg/RawscribeLambda/

# Reduce if needed:
# - Remove unused dependencies
# - Optimize imports
```

### Slow Lambda Cold Starts

**Symptom:** First request takes > 5 seconds

**Solution:** TBD - Lambda warming strategies

## Resource Cleanup

### Clean Build Directories

```bash
# Remove specific org build
rm -rf .aws-sam-stage-myorg/

# Remove all build directories
rm -rf .aws-sam-*/

# Force clean rebuild
make clean-frontend clean-backend
ORG=myorg ENV=stage make rs-deploy
```

### Clean Local Test Data

```bash
# Clean test artifacts
make clean-test

# Clean local S3 simulation
rm -rf .local/s3/*

# Recreate local environment
make setup-local ENV=dev ORG=myorg
```

## Verification Commands

### Check Stack Exists

```bash
aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-myorg \
  --query 'Stacks[0].StackName' \
  --output text
```

### Check Stack Status

```bash
make check-rs-stack-status ENV=stage ORG=myorg

# Or directly
aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-myorg \
  --query 'Stacks[0].StackStatus' \
  --output text
```

### List All Resources

```bash
# Complete deployment check
make check-rs ENV=stage ORG=myorg

# List CloudFormation resources
aws cloudformation describe-stack-resources \
  --stack-name rawscribe-stage-myorg
```

## Getting Help

### View Deployment Logs

```bash
# CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name rawscribe-stage-myorg \
  --max-items 20

# Lambda logs
make rs-watch-log ENV=stage ORG=myorg
```

### Check Recent Changes

```bash
# View stack events
aws cloudformation describe-stack-events \
  --stack-name rawscribe-stage-myorg \
  --query 'StackEvents[0:10].[Timestamp,ResourceStatus,ResourceType,ResourceStatusReason]' \
  --output table
```

## Related Documentation

- [Makefile Deployment](makefile-deployment.md) - Main deployment guide
- [Multi-Organization Setup](multi-organization.md) - Multi-org deployment
- [Configuration System](../architecture/configuration-system.md) - Config troubleshooting
- [Testing Authentication](../authentication/testing-auth.md) - Auth troubleshooting
