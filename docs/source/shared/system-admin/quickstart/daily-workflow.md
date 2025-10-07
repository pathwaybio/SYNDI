<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Daily Workflow Reference

Quick reference for common daily tasks when working with SYNDI.

## Common Workflows

### Daily Development Cycle

```bash
# 1. Start development servers
make start-dev ENV=dev ORG=myorg

# 2. Make code changes (auto-reload handles updates)

# 3. Test changes
make test-all

# 4. Commit
git add .
git commit -m "Your changes"
git push

# 5. Deploy to staging
make rs-deploy-function ENV=stage ORG=myorg
```

### Deploy Code Changes

```bash
# Quick code update (30 seconds)
make rs-deploy-function ENV=stage ORG=myorg

# Verify deployment
make check-rs ENV=stage ORG=myorg

# View logs
make rs-watch-log ENV=stage ORG=myorg
```

### Deploy Configuration Changes

```bash
# 1. Edit config
vi infra/.config/lambda/stage-myorg.json

# 2. Deploy config change
make rs-deploy-only ENV=stage ORG=myorg

# 3. Verify
make check-rs ENV=stage ORG=myorg
```

### Test Authentication

```bash
# Test JWT authentication
make test-jwt-aws ENV=stage ORG=myorg

# Get token for manual testing
TOKEN=$(make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)

# Use token
curl -H "Authorization: Bearer ${TOKEN}" \
  ${API_ENDPOINT}/api/v1/sops/list
```

### Create New User

```bash
# Get User Pool ID
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-myorg \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username newuser@myorg.com \
  --user-attributes Name=email,Value=newuser@myorg.com \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# Add to group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username newuser@myorg.com \
  --group-name RESEARCHERS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username newuser@myorg.com \
  --password SecurePass123! \
  --permanent
```

### Upload SOPs

```bash
# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Upload SOP
aws s3 cp new-sop.yaml \
  s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID}/sops/

# Sync directory
aws s3 sync ./sops/ \
  s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID}/sops/
```

### Check Deployment Status

```bash
# Quick status check
make check-rs ENV=stage ORG=myorg

# Stack status only
make check-rs-stack-status ENV=stage ORG=myorg

# View endpoint
make show-rs-endpoint ENV=stage ORG=myorg
```

### View Logs

```bash
# Tail logs in real-time
make rs-watch-log ENV=stage ORG=myorg

# Last 10 minutes
aws logs tail /aws/lambda/rawscribe-stage-myorg-backend \
  --since 10m
```

## Quick Command Reference

### Setup & Configuration

```bash
make setup-local ENV=dev ORG=myorg     # Setup local environment
make config ENV=dev ORG=myorg          # Deploy configuration
make clean-config                      # Remove generated configs
make sync-configs ENV=stage ORG=myorg  # Sync from CloudFormation
```

### Development

```bash
make start-backend ENV=dev ORG=myorg   # Start backend only
make start-frontend ENV=dev ORG=myorg  # Start frontend only
make start-dev ENV=dev ORG=myorg       # Start both
make stop-all                          # Stop all servers
```

### Testing

```bash
make test-all                          # All tests
make test-frontend                     # Frontend tests
make test-backend                      # Backend tests
make test-e2e                         # E2E tests
make test-jwt-aws ENV=stage ORG=myorg # JWT tests
make clean-test                        # Clean test artifacts
```

### Building

```bash
make build-frontend ENV=stage ORG=myorg  # Build frontend (clean)
make build-backend ENV=stage ORG=myorg   # Build backend (clean)
make clean-frontend                      # Clean frontend
make clean-backend                       # Clean backend
```

### AWS Deployment

```bash
make rs-deploy ENV=stage ORG=myorg           # Full deploy (5-7 min)
make rs-deploy-only ENV=stage ORG=myorg     # Deploy without build (1-2 min)
make rs-deploy-function ENV=stage ORG=myorg # Quick Lambda update (30 sec)
make rs-teardown ENV=stage ORG=myorg        # Remove stack
```

### Monitoring

```bash
make check-rs ENV=stage ORG=myorg           # Check deployment
make rs-watch-log ENV=stage ORG=myorg       # View logs
make show-rs-endpoint ENV=stage ORG=myorg   # Show API endpoint
make show-rs-user-pool ENV=stage ORG=myorg  # Show User Pool
```

## Common Scenarios

### Morning: Start Development

```bash
# Activate environment
conda activate syndi

# Pull latest code
git pull

# Start servers
make start-dev ENV=dev ORG=myorg
```

### Fix Production Bug

```bash
# 1. Reproduce locally
make start-backend ENV=dev ORG=myorg

# 2. Fix code
vim backend/rawscribe/routes/sops.py

# 3. Test locally (auto-reload)
curl http://localhost:8000/api/v1/sops/list

# 4. Run tests
make test-backend

# 5. Deploy to staging
make rs-deploy-function ENV=stage ORG=myorg

# 6. Test on staging
make test-jwt-aws ENV=stage ORG=myorg

# 7. Deploy to production
make rs-deploy-function ENV=prod ORG=myorg
```

### Add New Feature

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Develop with hot reload
make start-dev ENV=dev ORG=myorg

# 3. Write tests
vim frontend/tests/new-feature.spec.ts
vim backend/tests/test_new_feature.py

# 4. Run tests
make test-all

# 5. Build locally
make build-frontend ENV=stage ORG=myorg
make build-backend ENV=stage ORG=myorg

# 6. Test locally
make serve-webapp ENV=stage ORG=myorg &
make serve-lambda ENV=stage ORG=myorg

# 7. Commit
git add .
git commit -m "Add new feature"
git push origin feature/new-feature

# 8. Deploy to staging
make rs-deploy ENV=stage ORG=myorg

# 9. Test on staging
make start-frontend ENV=stage ORG=myorg
```

### Update Configuration

```bash
# 1. Edit config
vi infra/.config/lambda/stage-myorg.json

# 2. Commit to config repo (if using)
cd infra/.config
git add lambda/stage-myorg.json
git commit -m "Update file size limit"
git push
cd ../..

# 3. Deploy config
make rs-deploy-only ENV=stage ORG=myorg
```

### Onboard New User

```bash
# 1. Get User Pool ID
make show-rs-user-pool ENV=stage ORG=myorg

# 2. Create user (follow prompts)
aws cognito-idp admin-create-user \
  --user-pool-id <pool-id> \
  --username newuser@myorg.com \
  --user-attributes Name=email,Value=newuser@myorg.com

# 3. Add to group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <pool-id> \
  --username newuser@myorg.com \
  --group-name RESEARCHERS

# 4. Send credentials to user
```

### Investigate Production Issue

```bash
# 1. Check deployment status
make check-rs ENV=prod ORG=myorg

# 2. View recent logs
make rs-watch-log ENV=prod ORG=myorg

# 3. Test authentication
make test-jwt-aws ENV=prod ORG=myorg

# 4. Check specific endpoint
TOKEN=$(make get-rs-token ENV=prod ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)
  
curl -H "Authorization: Bearer ${TOKEN}" \
  ${API_ENDPOINT}/api/v1/sops/list | jq
```

## Time-Saving Tips

1. **Use aliases** for common commands:
   ```bash
   alias sd='make start-dev ENV=dev ORG=myorg'
   alias ta='make test-all'
   alias df='make rs-deploy-function'
   ```

2. **Set default ENV/ORG** in shell profile:
   ```bash
   export SYNDI_ENV=stage
   export SYNDI_ORG=myorg
   
   # Then use: make rs-deploy-function ENV=$SYNDI_ENV ORG=$SYNDI_ORG
   ```

3. **Use command history** - Search with Ctrl+R

4. **Create org-specific scripts** - Wrapper scripts for common tasks

5. **Use make help** - Quick reference: `make help`

## Related Documentation

- [Local Development](../development/local-development.md) - Development workflows
- [Testing Guide](../development/testing.md) - Testing procedures
- [Deployment Guide](../deployment/makefile-deployment.md) - Deployment details
- [User Management](../authentication/user-management.md) - Managing users
