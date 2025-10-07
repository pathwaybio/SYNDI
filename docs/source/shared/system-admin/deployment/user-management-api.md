<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# User Management API

REST API endpoints for managing users in deployed environments.

## Overview

User management is handled via REST API endpoints that work with both local dev and deployed Lambda. This ensures consistent behavior and eliminates config file ambiguity.

## Architecture

### Auth Provider System

The backend uses a pluggable authentication provider system that ensures the Lambda always uses the correct Cognito pool ID:

**Configuration Priority:**
1. **Environment variables** (set by CloudFormation at deploy time) - **PRIMARY TRUTH**
2. **Config file** (baked into Lambda at build time) - **FALLBACK**

```python
# backend/rawscribe/utils/auth_providers/cognito_provider.py
def get_user_pool_id(self) -> Optional[str]:
    # CloudFormation sets this at deploy time (always fresh)
    return os.environ.get('COGNITO_USER_POOL_ID') or \
           self._cognito_config.get('userPoolId')
```

This architecture solves the "stale config" problem where Lambda had old pool IDs baked in after `sync-configs` updated local files. Environment variables from CloudFormation are the authoritative source.

### Runtime Config Endpoint

Public endpoint that returns the actual auth configuration the Lambda is using:

```bash
GET /api/config/runtime
```

Response example:
```json
{
  "auth": {
    "provider": "cognito",
    "config": {
      "userPoolId": "us-east-1_QkkFFWXUA",
      "clientId": "1ue2h7glihso8gpq4pm4s0rs42",
      "region": "us-east-1",
      "source": "environment"
    }
  }
}
```

The `source` field indicates whether config came from environment variables (`environment`) or config file (`config_file`).

The frontend automatically queries this endpoint to get fresh auth configuration, eliminating mismatches between static config and deployed infrastructure.

## Authentication

### Getting JWT Tokens

User authentication is handled via AWS Cognito SDK (not backend API endpoint).

**Makefile Usage**:
```bash
# Get token via Cognito SDK
make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=user@example.com \
  PASSWORD=SecurePass123!
```

**Direct AWS CLI**:
```bash
aws cognito-idp admin-initiate-auth \
  --region us-east-1 \
  --user-pool-id <pool-id> \
  --client-id <client-id> \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=user@example.com,PASSWORD=Pass123! \
  --query 'AuthenticationResult.IdToken' \
  --output text
```

**Frontend Login**:
- Uses Cognito SDK directly (amplify or aws-sdk)
- See `frontend/src/shared/lib/auth.tsx`
- No backend endpoint needed

## Supported Deployments

**User Management API works with**:
- ✅ AWS deployments with Cognito (`provider: cognito`)
- ❌ On-prem deployments with JWT (`provider: jwt`)

**For on-prem deployments**: Edit users in `infra/.config/lambda/<env>-<org>.json`:
```json
{
  "lambda": {
    "auth": {
      "users": [
        {
          "id": "admin_user",
          "email": "admin@example.com",
          "username": "admin",
          "groups": ["ADMINS"],
          "permissions": ["*"]
        }
      ]
    }
  }
}
```

## Test User Management

### Create Test Users
Creates all default test users (admin, researcher, clinician).

**Endpoint**: `POST /api/v1/user-management/test-users`

**Auth**: Requires `manage:users` permission (ADMINS or LAB_MANAGERS)

**Response**:
```json
[
  {
    "username": "testadmin@example.com",
    "group": "ADMINS",
    "status": "CONFIRMED",
    "is_test_user": true
  },
  {
    "username": "testresearcher@example.com",
    "group": "RESEARCHERS",
    "status": "CONFIRMED",
    "is_test_user": true
  },
  {
    "username": "testclinician@example.com",
    "group": "CLINICIANS",
    "status": "CONFIRMED",
    "is_test_user": true
  }
]
```

**Makefile Usage**:
```bash
make rs-create-test-users ENV=stage ORG=myorg
```

**What it does**:
1. Creates admin user via Cognito SDK (if doesn't exist)
2. Authenticates as admin
3. Creates remaining test users via API
4. Displays credentials

### List Test Users
Lists all test users with their credentials.

**Endpoint**: `GET /api/v1/user-management/test-users`

**Auth**: Requires `manage:users` permission

**Response**:
```json
[
  {
    "username": "testadmin@example.com",
    "password": "TestAdmin123!",
    "group": "ADMINS",
    "actual_groups": ["ADMINS"],
    "status": "CONFIRMED",
    "enabled": true
  },
  ...
]
```

**Makefile Usage**:
```bash
make rs-list-test-users ENV=stage ORG=myorg

# Output:
#   testadmin@example.com / TestAdmin123! [ADMINS] - CONFIRMED
#   testresearcher@example.com / TestResearch123! [RESEARCHERS] - CONFIRMED
#   testclinician@example.com / TestClinic123! [CLINICIANS] - CONFIRMED
```

### Remove Test Users
Removes all test users from Cognito pool.

**Endpoint**: `DELETE /api/v1/user-management/test-users`

**Auth**: Requires `manage:users` permission

**Response**:
```json
{
  "removed": [
    "testadmin@example.com",
    "testresearcher@example.com",
    "testclinician@example.com"
  ],
  "count": 3
}
```

**Makefile Usage**:
```bash
make rs-remove-test-users ENV=stage ORG=myorg
```

### Secure Production
Removes all test users and resets admin password to random value.

**Endpoint**: `POST /api/v1/user-management/secure-production`

**Auth**: Requires `manage:users` permission

**Environment**: Only works in `stage` or `prod`

**Response**:
```json
{
  "test_users_removed": [
    "testadmin@example.com",
    "testresearcher@example.com",
    "testclinician@example.com"
  ],
  "admin_passwords_reset": {
    "admin@example.com": "xK9#mP2$vL8@wQ5!nR7&tY3^"
  },
  "message": "⚠️ SAVE THE ADMIN PASSWORDS ABOVE - They cannot be recovered!"
}
```

**Makefile Usage**:
```bash
make rs-secure-prod ENV=prod ORG=myorg

# Prompts for confirmation, then outputs:
#   🔒 IMPORTANT: Save the new admin passwords below!
#   ================================================
#   admin@example.com: xK9#mP2$vL8@wQ5!nR7&tY3^
#   ================================================
#   ⚠️  SAVE THESE PASSWORDS - They cannot be recovered!
```

## Test User Credentials

Default test users created by the system:

| Username | Password | Group | Permissions |
|----------|----------|-------|-------------|
| testadmin@example.com | TestAdmin123! | ADMINS | All (`*`) |
| testresearcher@example.com | TestResearch123! | RESEARCHERS | submit:SOP*, view:own, view:group, draft:* |
| testclinician@example.com | TestClinic123! | CLINICIANS | submit:SOP*, view:own, draft:* |

## Workflow

### Fresh Deployment
```bash
# Deploy creates empty Cognito pool
ENABLE_AUTH=true CREATE_BUCKETS=true ORG=testorg ENV=stage make rs-deploy

# Auto-creates test users (creates admin first, then others via API)
# Displays credentials at end
```

### Testing with Test Users
```bash
# List all test users
make rs-list-test-users ENV=stage ORG=testorg

# Login as admin
curl -X POST "https://api.example.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testadmin@example.com","password":"TestAdmin123!"}' | jq

# Use in application
# Frontend: Use credentials to login
# Backend tests: Use credentials to authenticate
```

### Cleanup
```bash
# Remove test users when done
make rs-remove-test-users ENV=stage ORG=testorg
```

### Before Production
```bash
# Secure production environment
make rs-secure-prod ENV=prod ORG=myorg

# Saves new admin password securely
# Removes all test users
```

## Security Notes

### Test User Passwords
- Obvious/simple passwords (TestAdmin123!)
- **Never use in production**
- Always run `rs-secure-prod` before real production use

### Permission Requirements
- All endpoints require `manage:users` permission
- Only ADMINS and LAB_MANAGERS can manage users
- Uses permission check, not hardcoded group check (flexible)

### Admin Password Rotation
- `rs-secure-prod` generates cryptographically secure passwords
- 16-20 characters: uppercase, lowercase, digits, special chars
- Meets Cognito password policy
- Cannot be recovered - save immediately!

## Related Documentation

- [Permission System](../authentication/permissions.md)
- [Manual Testing Guide](manual-testing-guide.md)
- [Authentication Testing](../authentication/testing-auth.md)

