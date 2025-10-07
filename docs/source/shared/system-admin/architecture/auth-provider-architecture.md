<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Authentication Provider Architecture

## Overview

The authentication system uses a pluggable provider pattern that ensures deployed Lambda functions always use the correct authentication configuration, even after infrastructure changes.

## The Problem This Solves

**Before:** After running `sync-configs` to update local configuration files with new Cognito pool IDs, the Lambda function would still use OLD pool IDs that were baked into the code during the previous build. This caused authentication failures until the Lambda was redeployed.

**After:** Environment variables set by CloudFormation take precedence over baked-in configuration files, ensuring the Lambda always uses the correct, up-to-date authentication settings.

## Architecture

### Backend: Provider Pattern

```
backend/rawscribe/utils/
├── auth.py                    # Original auth validation (unchanged)
├── auth_providers/            # NEW: Provider abstraction
│   ├── __init__.py
│   ├── base.py               # Abstract AuthProvider interface
│   ├── cognito_provider.py   # AWS Cognito implementation
│   ├── jwt_provider.py       # On-prem JWT implementation
│   └── factory.py            # Provider factory
└── config_loader.py          # Enhanced with get_auth_provider()
```

### Configuration Priority

For ALL auth settings:

1. **Environment Variables** (CloudFormation) - **PRIMARY SOURCE**
2. **Config File** (baked into Lambda) - **FALLBACK**

```python
# backend/rawscribe/utils/auth_providers/cognito_provider.py
def get_user_pool_id(self) -> Optional[str]:
    # CloudFormation sets this at deploy time (always fresh)
    return os.environ.get('COGNITO_USER_POOL_ID') or \
           self._cognito_config.get('userPoolId')
```

### Frontend: Runtime Config Endpoint

The frontend queries `/api/config/runtime` to get the actual deployed configuration:

```typescript
// frontend/src/shared/lib/auth.tsx
const runtimeConfig = await configLoader.loadRuntimeConfig();

if (runtimeConfig?.auth?.provider === 'cognito') {
  // Merge runtime config (from CloudFormation) with static config
  authConfig = {
    ...authConfig,
    cognito: {
      ...authConfig.cognito,
      ...runtimeConfig.auth.config
    }
  };
}
```

## API Endpoints

### `/api/config/runtime` (Public)

Returns the actual authentication configuration the Lambda is using.

**Request:**
```bash
GET /api/config/runtime
```

**Response:**
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

**Source Field:**
- `environment` - Config came from CloudFormation environment variables (correct)
- `config_file` - Config came from baked-in configuration (may be stale after sync-configs)

## Workflow

### 1. Initial Deployment

```bash
# Deploy with fresh infrastructure
ENABLE_AUTH=true CREATE_BUCKETS=true ORG=myorg ENV=stage make rs-deploy

# CloudFormation creates:
# - Cognito pool: us-east-1_ABC123
# - Environment variables in Lambda:
#   COGNITO_USER_POOL_ID=us-east-1_ABC123
#   COGNITO_CLIENT_ID=abc123def456
```

**Lambda reads from:** Environment variables ✅

### 2. After Infrastructure Change (Nuke and Redeploy)

```bash
# Nuke everything
make rs-nuke-all ENV=stage ORG=myorg

# Redeploy
ENABLE_AUTH=true CREATE_BUCKETS=true ORG=myorg ENV=stage make rs-deploy

# CloudFormation creates NEW pool:
# - Cognito pool: us-east-1_XYZ789
# - Environment variables updated:
#   COGNITO_USER_POOL_ID=us-east-1_XYZ789  # NEW
```

**Lambda reads from:** Environment variables (NEW pool ID) ✅
**Config file has:** OLD pool ID (but ignored) ✅

**Result:** Authentication works immediately, no rebuild needed!

### 3. Verifying Configuration

```bash
# Check what Lambda is actually using
make rs-show-runtime-config ENV=stage ORG=myorg

# Output shows:
# {
#   "auth": {
#     "provider": "cognito",
#     "config": {
#       "userPoolId": "us-east-1_XYZ789",
#       "source": "environment"  ← Correct!
#     }
#   }
# }
```

## Code Updates

### Backend Changes

**New Files:**
- `backend/rawscribe/utils/auth_providers/base.py` - Abstract provider interface
- `backend/rawscribe/utils/auth_providers/cognito_provider.py` - Cognito implementation
- `backend/rawscribe/utils/auth_providers/jwt_provider.py` - JWT implementation
- `backend/rawscribe/utils/auth_providers/factory.py` - Provider factory

**Modified Files:**
- `backend/rawscribe/utils/config_loader.py` - Added `get_auth_provider()`
- `backend/rawscribe/routes/user_management.py` - Uses auth provider
- `backend/rawscribe/routes/config.py` - Added `/api/config/runtime` endpoint

**Tests:**
- `backend/tests/unit/test_auth_provider.py` - Comprehensive provider tests

### Frontend Changes

**Modified Files:**
- `frontend/src/shared/lib/config-loader.ts` - Added `loadRuntimeConfig()`
- `frontend/src/shared/lib/auth.tsx` - Merges runtime config with static config

**Tests:**
- `frontend/src/shared/lib/__tests__/config-loader-runtime.test.ts` - Runtime config tests
- `frontend/src/shared/lib/__tests__/auth-runtime-config.test.tsx` - Auth integration tests

### Makefile Changes

**New Target:**
- `rs-show-runtime-config` - Query runtime config from deployed Lambda

## Environment Variables

CloudFormation sets these in the Lambda's environment (from `template.yaml`):

```yaml
Environment:
  Variables:
    COGNITO_REGION: !Ref AWS::Region
    COGNITO_USER_POOL_ID: !If
      - CreateUserPool
      - !Ref CognitoUserPool
      - !Ref CognitoUserPoolId
    COGNITO_CLIENT_ID: !If
      - CreateUserPool
      - !Ref CognitoUserPoolClient
      - !Ref CognitoClientId
```

These are **public identifiers**, not secrets. They tell the Lambda which Cognito pool to validate JWTs against.

## Extensibility

The provider pattern makes it easy to add new authentication methods:

```python
# To add LDAP support:
class LDAPProvider(AuthProvider):
    def get_config(self) -> Dict:
        return {
            'server': os.environ.get('LDAP_SERVER') or self._config.get('server'),
            'base_dn': os.environ.get('LDAP_BASE_DN') or self._config.get('base_dn'),
            'source': 'environment' if os.environ.get('LDAP_SERVER') else 'config_file'
        }
    # ... implement other methods

# Register in factory.py:
AuthProviderFactory._providers['ldap'] = LDAPProvider
```

## Benefits

✅ **No Stale Config** - Environment variables are always fresh from CloudFormation  
✅ **Single Source of Truth** - CloudFormation controls infrastructure  
✅ **No Rebuild Required** - Config changes don't require Lambda redeployment  
✅ **Cloud Agnostic** - Works for AWS (Cognito) and on-prem (JWT)  
✅ **Debuggable** - `/api/config/runtime` shows actual config in use  
✅ **Extensible** - Easy to add new auth providers  
✅ **Testable** - Clean provider interfaces for unit testing  

## Troubleshooting

### Problem: Auth fails after `rs-nuke-all` and redeploy

**Check runtime config:**
```bash
make rs-show-runtime-config ENV=stage ORG=myorg
```

**If `source: config_file`:**
- Lambda is using baked-in config (stale)
- Environment variables not set correctly
- Check CloudFormation template and redeploy

**If `source: environment`:**
- Lambda is using CloudFormation variables (correct)
- Pool ID should match CloudFormation output

### Problem: Frontend uses wrong pool ID

**Check browser console:**
```
✅ Auth config merged: { userPoolId: 'us-east-1_XYZ789', source: 'environment' }
```

**If runtime config not loading:**
- Check `/api/config/runtime` endpoint is accessible
- Verify API endpoint is configured in frontend config
- Check browser network tab for 404/500 errors

## Migration Guide

No migration needed! The changes are backward compatible:

- **Existing deployments** continue using config files (fallback works)
- **New deployments** automatically use environment variables
- **After next deploy** environment variables take precedence

To verify your deployment is using the new system:

```bash
make rs-show-runtime-config ENV=stage ORG=myorg
# Look for "source": "environment" in output
```

