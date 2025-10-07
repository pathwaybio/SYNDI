<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Testing Authentication

This guide covers comprehensive JWT authentication testing for SYNDI systems, including local testing, AWS testing, and endpoint protection verification.

## Overview

SYNDI uses AWS Cognito for authentication with JWT (JSON Web Token) tokens. This guide shows you how to:

- Test JWT authentication locally (fast iteration)
- Test JWT authentication on AWS (deployed environments)
- Test protected endpoint access
- Understand how JWT validation works
- Troubleshoot authentication issues

### Authentication Architecture

**Provider:** AWS Cognito  
**Token Types:** Access Tokens and ID Tokens  
**Username Format:** Email addresses (no hyphens allowed - filesystem delimiter conflict)  
**Organizations:** Multi-client support with complete isolation  
**Resource Discovery:** All AWS resource IDs are dynamically discovered

### Endpoint Protection Levels

- **✅ Unprotected**: Root endpoint (`/`) and `/health` - Returns status
- **🔒 Protected**: All `/api/*` endpoints - Require valid JWT tokens
- **🔐 RBAC Protected**: Specific endpoints based on user groups (ADMINS/LAB_MANAGERS/RESEARCHERS/CLINICIANS)

## Local Testing (Fast Iteration)

Local testing allows you to validate JWT functionality without deploying to AWS.

### Basic Usage

```bash
# Test with specific credentials
python backend/test_jwt_local.py --org uga --get-token \
  --username testuser@uga.edu --password UGAPass123!

# Test with existing token
python backend/test_jwt_local.py --org uga --token "eyJ..."
```

### How It Works

The local test script (`backend/test_jwt_local.py`):
1. Sets environment variables matching Lambda configuration
2. Creates minimal config object for AuthValidator
3. Validates token locally using same code as Lambda
4. Reports user details and permissions

### Makefile Command

```bash
# Using environment variables for credentials
export UGA_TEST_USER=testuser@uga.edu
export UGA_TEST_PASSWORD=UGAPass123!

# Run local test
make test-jwt-local ENV=stage ORG=uga
```

## AWS Testing

Test authentication against deployed Lambda functions and Cognito User Pools.

### Automated Testing (Recommended)

The Makefile provides commands that dynamically discover AWS resources:

```bash
# Test JWT for specific organization
export UGA_TEST_USER=testuser@uga.edu
export UGA_TEST_PASSWORD=UGAPass123!

make test-jwt-aws ENV=stage ORG=uga
```

**What it does:**
- Discovers Cognito User Pool by name pattern
- Discovers API Gateway endpoint
- Obtains JWT token
- Tests protected endpoint
- Displays authentication result

### Manual Testing

If you need manual control over the process:

```bash
# Set environment and organization
ENV=stage
ORG=myorg
TEST_USERNAME=admin@myorg.com
TEST_PASSWORD=YourPassword

# Discover resources dynamically
POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?contains(Name,'rawscribe-${ENV}-${ORG}')].Id | [0]" \
  --output text --region us-east-1)

CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id $POOL_ID \
  --query "UserPoolClients[0].ClientId" --output text --region us-east-1)

API_ID=$(aws apigateway get-rest-apis \
  --query "items[?name=='rawscribe-${ENV}-${ORG}-api'].id | [0]" \
  --output text --region us-east-1)

# Get JWT token
JWT=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=${TEST_USERNAME},PASSWORD=${TEST_PASSWORD} \
  --region us-east-1 \
  --query 'AuthenticationResult.AccessToken' --output text)

# Test protected endpoint
curl -H "Authorization: Bearer $JWT" \
  https://${API_ID}.execute-api.us-east-1.amazonaws.com/${ENV}/api/config/private
```

### Using Makefile get-rs-token

```bash
# Get token using Makefile
TOKEN=$(make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)

# Use token to test endpoints
curl -H "Authorization: Bearer ${TOKEN}" \
  https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/v1/sops/list
```

**Note:** Use `USER_NAME` (not `USERNAME`) because `USERNAME` is a reserved shell variable.

## Token Types

### Access Token

- **Use Case**: API authorization
- **Username**: UUID with hyphens replaced by underscores  
- **Email**: Derived as `{username}@cognito.local`
- **Duration**: 1 hour
- **Preferred for**: Most API calls

### ID Token

- **Use Case**: User identity information
- **Username**: Email prefix (e.g., `testuser` from `testuser@uga.edu`)
- **Email**: Full email address
- **Duration**: 1 hour
- **Preferred for**: User profile information

**Getting different token types:**
```bash
# Access token (default)
aws cognito-idp admin-initiate-auth \
  --query 'AuthenticationResult.AccessToken'

# ID token
aws cognito-idp admin-initiate-auth \
  --query 'AuthenticationResult.IdToken'

# Refresh token
aws cognito-idp admin-initiate-auth \
  --query 'AuthenticationResult.RefreshToken'
```

## Testing Protected Endpoints

### Verify Endpoint Protection

All `/api/*` endpoints should require authentication:

```bash
# These should return "Missing Authentication Token" or 401
curl https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/config
curl https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/v1/eln  
curl https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/v1/sops
curl https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/v1/files
```

### Test Valid Token Access

```bash
# Get token
TOKEN=$(make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)

# Test protected endpoint with valid token
curl -H "Authorization: Bearer ${TOKEN}" \
  https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/config/private

# Should return config data
```

### Test Invalid Token

```bash
# Should return 401 Unauthorized
curl -H "Authorization: Bearer invalid-token" \
  https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/config
```

### Test CORS Configuration

```bash
# Test CORS preflight
curl -X OPTIONS \
  -H "Origin: https://syndi-frontend.myorg.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type" \
  https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/v1/eln

# Should return CORS headers
```

## RBAC Testing

Test different user roles and their permissions.

### Create Test Users

```bash
# Set variables
USER_POOL_ID=us-east-1_ABC123  # From CloudFormation output

# Create researcher user
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher@myorg.com \
  --user-attributes Name=email,Value=researcher@myorg.com \
  --temporary-password TempPass123! \
  --message-action SUPPRESS \
  --region us-east-1

# Add to RESEARCHERS group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher@myorg.com \
  --group-name RESEARCHERS \
  --region us-east-1

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher@myorg.com \
  --password ResearchPass123! \
  --permanent \
  --region us-east-1
```

### Test Role-Based Access

```bash
# Get tokens for different roles
ADMIN_TOKEN=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id ${USER_POOL_ID} \
  --client-id ${CLIENT_ID} \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=admin@myorg.com,PASSWORD=AdminPass! \
  --query 'AuthenticationResult.AccessToken' --output text)

RESEARCHER_TOKEN=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id ${USER_POOL_ID} \
  --client-id ${CLIENT_ID} \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=researcher@myorg.com,PASSWORD=ResearchPass! \
  --query 'AuthenticationResult.AccessToken' --output text)

# Test researcher permissions
curl -H "Authorization: Bearer ${RESEARCHER_TOKEN}" \
  https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/v1/eln

# Admin should have more permissions
curl -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  https://your-api.execute-api.us-east-1.amazonaws.com/stage/api/admin/users
```

### User Groups and Permissions

| Group | Permissions | Use Cases |
|-------|------------|-----------|
| **ADMINS** | All (`*`) | System administration, user management |
| **LAB_MANAGERS** | Submit, view, approve | Lab oversight, SOP approval |
| **RESEARCHERS** | Submit, view own/group, drafts | Laboratory work, data entry |
| **CLINICIANS** | Submit, view own | Clinical data entry |

## How JWT Validation Works

Understanding the JWT validation process helps troubleshoot authentication issues.

### Environment Variables vs Config Files

The system uses **environment variables as the primary source** for auth configuration, with config file fallback:

**Lambda Environment Variables (set by CloudFormation):**
```yaml
COGNITO_REGION: us-east-1
COGNITO_USER_POOL_ID: us-east-1_ABC123
COGNITO_CLIENT_ID: abc123def456
```

**Auth Provider Priority:**
```python
# backend/rawscribe/utils/auth_providers/cognito_provider.py
# 1. Check environment variables first (CloudFormation truth)
def get_user_pool_id(self) -> Optional[str]:
    return os.environ.get('COGNITO_USER_POOL_ID') or \
           self._cognito_config.get('userPoolId')

def get_client_id(self) -> Optional[str]:
    return os.environ.get('COGNITO_CLIENT_ID') or \
           self._cognito_config.get('clientId')
```

**Runtime Config Endpoint:**

Clients (frontend, scripts) can query the runtime config to get the actual deployed settings:

```bash
# Get runtime auth config
curl https://your-api.com/api/config/runtime | jq '.auth'
```

Response:
```json
{
  "auth": {
    "provider": "cognito",
    "config": {
      "userPoolId": "us-east-1_ABC123",
      "clientId": "abc123def456",
      "region": "us-east-1",
      "source": "environment"
    }
  }
}
```

### What Environment Variables Contain

**The environment variables DO NOT contain secrets or JWT tokens.** They only contain public identifiers:

- `COGNITO_USER_POOL_ID`: User Pool identifier (e.g., `us-east-1_ABC123`)
- `COGNITO_CLIENT_ID`: Public client ID (e.g., `abc123def456`)
- `COGNITO_REGION`: AWS region (e.g., `us-east-1`)

These are **public identifiers**, not secrets. They tell Lambda which Cognito User Pool to validate tokens against.

### JWT Validation Flow

```
1. User logs in via Cognito
   ↓
2. Cognito returns signed JWT token to user
   ↓  
3. User sends JWT in Authorization header to Lambda
   ↓
4. Lambda uses env vars to know WHICH Cognito pool to check
   ↓
5. Lambda fetches public keys from Cognito JWKS endpoint
   ↓
6. Lambda validates JWT signature using Cognito's public keys
   ↓
7. If valid, Lambda trusts the token claims and extracts user info
```

### Current Validation Implementation

The system validates:
- ✅ Token expiration (`exp` claim)
- ✅ Token issuer matches expected User Pool
- ✅ Token type (access or ID token)
- ✅ Token structure and claims
- ✅ Username format (no hyphens)

### Security Analysis

**What's Secure:**
- JWT tokens are validated using Cognito's public keys (fetched via HTTPS)
- No secrets are stored in environment variables
- Each Lambda only knows about its own organization's Cognito pool
- Tokens from one org cannot be used with another org's Lambda

**Why This Is Secure:**
- Environment variables are configuration pointers, not secrets
- Actual JWT validation uses Cognito's public keys
- Keys are fetched securely from AWS
- Token signature proves it was issued by the correct Cognito pool

## Automated Testing Scripts

### Complete Test Script

Create `test-auth.sh` for automated testing:

```bash
#!/bin/bash
set -e

ORG=${1:-myorg}
ENV=${2:-stage}
USERNAME=${3:-admin@myorg.com}
PASSWORD=${4}

if [ -z "$PASSWORD" ]; then
    echo "Usage: $0 <org> <env> <username> <password>"
    exit 1
fi

echo "🧪 Testing Authentication for ${ORG}/${ENV}"

# Discover resources
POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?contains(Name,'rawscribe-${ENV}-${ORG}')].Id | [0]" \
  --output text --region us-east-1)

CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id $POOL_ID \
  --query "UserPoolClients[0].ClientId" --output text --region us-east-1)

API_ID=$(aws apigateway get-rest-apis \
  --query "items[?name=='rawscribe-${ENV}-${ORG}-api'].id | [0]" \
  --output text --region us-east-1)

API_ENDPOINT="https://${API_ID}.execute-api.us-east-1.amazonaws.com/${ENV}"

# Test 1: Unprotected endpoint
echo "1. Testing unprotected endpoint..."
curl -s ${API_ENDPOINT}/ | jq . || echo "❌ Failed"

# Test 2: Get JWT token
echo "2. Getting JWT token..."
JWT=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=$USERNAME,PASSWORD=$PASSWORD \
  --region us-east-1 \
  --query 'AuthenticationResult.AccessToken' \
  --output text 2>/dev/null)

if [ -z "$JWT" ] || [ "$JWT" = "None" ]; then
    echo "❌ Failed to get token"
    exit 1
fi
echo "✅ Token obtained"

# Test 3: Protected endpoint with valid token
echo "3. Testing protected endpoint with valid JWT..."
curl -s -H "Authorization: Bearer $JWT" \
  ${API_ENDPOINT}/api/config/private | jq . || echo "❌ Failed"

# Test 4: Protected endpoint without token
echo "4. Testing protected endpoint without token (should fail)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" ${API_ENDPOINT}/api/config)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    echo "✅ Correctly rejected (HTTP $HTTP_CODE)"
else
    echo "⚠️  Unexpected response (HTTP $HTTP_CODE)"
fi

# Test 5: Invalid token
echo "5. Testing with invalid token (should fail)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid-token" ${API_ENDPOINT}/api/config)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    echo "✅ Correctly rejected (HTTP $HTTP_CODE)"
else
    echo "⚠️  Unexpected response (HTTP $HTTP_CODE)"
fi

echo ""
echo "✅ Authentication testing complete"
```

### Regression Testing

Run comprehensive JWT regression tests:

```bash
# Full regression test suite
make test-jwt-regression

# Local-only regression tests (no AWS)
make test-jwt-regression-local
```

## Finding Test Users

Test users are created during deployment with `ADMIN_USERNAME` parameter. To find existing users:

```bash
# Find User Pool
ENV=stage
ORG=myorg

POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?contains(Name,'rawscribe-${ENV}-${ORG}')].Id | [0]" \
  --output text --region us-east-1)

# List all users in pool
aws cognito-idp list-users --user-pool-id $POOL_ID --region us-east-1 \
  --query 'Users[].Username' --output table

# Get specific user details
aws cognito-idp admin-get-user --user-pool-id $POOL_ID \
  --username admin@myorg.com --region us-east-1

# Check user's groups
aws cognito-idp admin-list-groups-for-user --user-pool-id $POOL_ID \
  --username admin@myorg.com --region us-east-1
```

## Troubleshooting

### "Invalid username format" Error

**Cause:** Username contains hyphens (filesystem delimiter conflict)

**Solution:** The system automatically replaces hyphens with underscores for UUID usernames. Ensure usernames are email addresses.

### "Invalid issuer" Error

**Cause:** Wrong Cognito configuration loaded

**Solution:** Check environment variables:
```bash
aws lambda get-function-configuration \
  --function-name rawscribe-stage-myorg-backend \
  --query 'Environment.Variables' \
  --region us-east-1
```

Ensure `COGNITO_USER_POOL_ID` matches your pool.

### "Token expired" Error

**Cause:** Token older than 1 hour

**Solution:** Generate a new token:
```bash
TOKEN=$(make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)
```

### "User not found" or "Incorrect username or password"

**Cause:** User doesn't exist or wrong password

**Solution:**
```bash
# Check if user exists
aws cognito-idp admin-get-user \
  --user-pool-id $POOL_ID \
  --username admin@myorg.com

# Reset password if needed
aws cognito-idp admin-set-user-password \
  --user-pool-id $POOL_ID \
  --username admin@myorg.com \
  --password NewPassword123! \
  --permanent
```

### "User Pool not found"

**Cause:** User Pool doesn't exist or wrong naming

**Solution:**
```bash
# List all User Pools
aws cognito-idp list-user-pools --max-results 60 --region us-east-1

# Check stack outputs
aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-myorg \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text
```

### Lambda Can't Validate Tokens

**Cause:** Missing Cognito configuration

**Solution:**
```bash
# Check Lambda environment variables
aws lambda get-function-configuration \
  --function-name rawscribe-stage-myorg-backend \
  --query 'Environment.Variables' | jq

# Should show COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID

# If missing, redeploy
ORG=myorg ENV=stage ENABLE_AUTH=true make rs-deploy-only
```

## Development Workflow

### Rapid Iteration

For testing authentication changes:

```bash
# 1. Make changes to backend/rawscribe/utils/auth.py
vim backend/rawscribe/utils/auth.py

# 2. Test locally (no AWS deployment)
make test-jwt-local ENV=stage ORG=myorg

# 3. If tests pass, deploy to AWS
ORG=myorg ENV=stage make rs-deploy-function

# 4. Test on AWS
make test-jwt-aws ENV=stage ORG=myorg

# 5. Run full regression
make test-jwt-regression
```

### Full Deployment Testing

```bash
# 1. Check current deployment
ORG=myorg ENV=stage make check-rs

# 2. Deploy changes
ORG=myorg ENV=stage make rs-deploy-function

# 3. Test authentication
make test-jwt-aws ENV=stage ORG=myorg

# 4. Monitor logs
ORG=myorg ENV=stage make rs-watch-log
```

## Security Best Practices

1. **Never log JWT tokens** - They contain user credentials
2. **Use HTTPS only** - Never send tokens over unencrypted connections
3. **Rotate passwords regularly** - Especially for admin accounts
4. **Use different credentials per environment** - dev/stage/prod should have different passwords
5. **Store production passwords securely** - Use AWS Secrets Manager for production
6. **Validate tokens on every request** - Never cache authentication state
7. **Monitor failed authentication attempts** - Set up CloudWatch alarms
8. **Use strong passwords** - Meet Cognito password policy requirements

## Related Documentation

- [RBAC System](rbac.md) - Role-based access control details
- [User Management](user-management.md) - Creating and managing users
- [Configuration System](../architecture/configuration-system.md) - How Cognito config is managed
- [Deployment Guide](../deployment/makefile-deployment.md) - Deploying with authentication
