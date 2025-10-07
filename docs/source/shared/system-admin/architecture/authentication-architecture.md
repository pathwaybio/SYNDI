<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Authentication Architecture

This guide explains how authentication and authorization work in SYNDI, including the JWT token flow, Cognito integration, and RBAC implementation.

## Overview

SYNDI uses **AWS Cognito** for authentication with **JWT tokens** for API authorization. The system implements **role-based access control (RBAC)** using Cognito groups with fine-grained permissions.

### Key Components

- **AWS Cognito User Pools** - User authentication and management
- **JWT Tokens** - Stateless authorization (Access and ID tokens)
- **Cognito Groups** - Role assignment (ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS)
- **Permission System** - Wildcard-based permissions (`submit:SOP*`, `view:*`, etc.)
- **Backend Validation** - AuthValidator in `backend/rawscribe/utils/auth.py`
- **Frontend Enforcement** - UX-level access control

## Authentication Flow

### Complete Login Flow

```
1. User enters credentials in frontend
   ↓
2. Frontend sends to Cognito
   POST https://cognito-idp.{region}.amazonaws.com/
   Body: {username, password, clientId}
   ↓
3. Cognito validates credentials
   ↓
4. Cognito returns JWT tokens
   Response: {AccessToken, IdToken, RefreshToken}
   ↓
5. Frontend stores tokens (localStorage or sessionStorage)
   ↓
6. Frontend sends requests with Authorization header
   Authorization: Bearer {AccessToken}
   ↓
7. API Gateway validates token (optional Cognito authorizer)
   ↓
8. Lambda receives request with token
   ↓
9. AuthValidator validates token and extracts user info
   ↓
10. Lambda processes request with user context
    ↓
11. Response returned to frontend
```

### Token Lifecycle

**Token Issuance:**
```
User Login → Cognito → JWT Tokens (signed with Cognito private key)
```

**Token Validation:**
```
Request → Lambda → AuthValidator → Fetch Cognito public keys (JWKS)
                                 → Verify signature
                                 → Check expiration
                                 → Extract user claims
                                 → Grant/deny access
```

**Token Expiration:**
- **Access Token**: 1 hour
- **ID Token**: 1 hour
- **Refresh Token**: 30 days

**Token Refresh:**
```
Frontend detects token near expiry
   ↓
Send refresh token to Cognito
   ↓
Receive new Access and ID tokens
   ↓
Continue using API
```

## JWT Token Structure

### Access Token

Used for API authorization:

**Claims:**
```json
{
  "sub": "uuid-1234-5678",              // User ID (UUID)
  "cognito:groups": ["RESEARCHERS"],     // User's groups
  "token_use": "access",                 // Token type
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/{pool-id}",
  "client_id": "abc123def456",
  "username": "uuid_with_underscores",   // Hyphens replaced
  "exp": 1706654321,                     // Expiration timestamp
  "iat": 1706650721                      // Issued at timestamp
}
```

**Usage:** Send in Authorization header for API requests

**Email derivation:** For UUID usernames, email derived as `{username}@cognito.local`

### ID Token

Used for user identity information:

**Claims:**
```json
{
  "sub": "uuid-1234-5678",              // User ID
  "cognito:groups": ["RESEARCHERS"],     // User's groups
  "email": "researcher1@myorg.com",      // User's email
  "name": "Jane Researcher",             // User's name
  "cognito:username": "researcher1",     // Username (email prefix)
  "token_use": "id",                     // Token type
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/{pool-id}",
  "exp": 1706654321,
  "iat": 1706650721
}
```

**Usage:** Get user profile information, display name in UI

## JWT Validation Process

### Backend Implementation

Located in: `backend/rawscribe/utils/auth.py`

**Validation steps:**

```python
# 1. Extract token from Authorization header
token = request.headers.get('Authorization', '').replace('Bearer ', '')

# 2. Decode token (verify signature)
decoded = jwt.decode(
    token,
    cognito_public_key,           # Fetched from JWKS endpoint
    algorithms=['RS256'],
    options={"verify_signature": True}
)

# 3. Validate claims
# - Check expiration (exp)
# - Verify issuer matches User Pool
# - Verify token type (access or id)
# - Check audience (client_id)

# 4. Extract user information
user_id = decoded.get('sub')
username = decoded.get('username') or decoded.get('cognito:username')
groups = decoded.get('cognito:groups', [])

# 5. Map groups to permissions
permissions = self._map_cognito_permissions(groups)

# 6. Create user context
user = {
    'id': user_id,
    'username': username,
    'email': email,
    'groups': groups,
    'permissions': permissions
}
```

### Environment Variables vs Config Files

**Priority order:**

```python
# 1. Check environment variables (from CloudFormation)
cognito_region = os.environ.get('COGNITO_REGION')
cognito_pool_id = os.environ.get('COGNITO_USER_POOL_ID')
cognito_client_id = os.environ.get('COGNITO_CLIENT_ID')

# 2. Fall back to config file
if not cognito_pool_id:
    cognito_pool_id = config.get('lambda', {}).get('auth', {}).get('cognito', {}).get('userPoolId')
```

**Why environment variables first:**
- Set by CloudFormation (always correct for deployment)
- No config file loading failures
- Faster access
- Automatic updates on redeployment

## RBAC Implementation

### Group to Permission Mapping

Located in: `backend/rawscribe/utils/auth.py:_map_cognito_permissions()`

```python
def _map_cognito_permissions(self, groups: List[str]) -> List[str]:
    """Map Cognito groups to SYNDI permissions"""
    permission_mapping = {
        'ADMINS': ['*'],
        'LAB_MANAGERS': ['submit:*', 'view:*', 'approve:*', 'export:*'],
        'RESEARCHERS': ['submit:SOP*', 'view:own', 'view:group', 'draft:*'],
        'CLINICIANS': ['submit:clinical*', 'view:own']
    }
    
    permissions = []
    for group in groups:
        permissions.extend(permission_mapping.get(group, ['view:own']))
    
    return list(set(permissions))
```

**Note:** Legacy mapping also supports lowercase group names (admin, researcher, viewer) for backward compatibility.

### Permission Format

Permissions follow pattern: `{action}:{resource}`

**Examples:**
- `*` - All permissions (ADMINS only)
- `submit:SOP*` - Submit any SOP
- `submit:clinical*` - Submit clinical forms only
- `view:own` - View own submissions
- `view:group` - View team submissions
- `view:*` - View all submissions
- `draft:*` - Full draft management
- `approve:*` - Approve submissions
- `export:*` - Export data

### Permission Checking

```python
def has_permission(user: dict, required_permission: str) -> bool:
    """Check if user has required permission"""
    user_permissions = user.get('permissions', [])
    
    # Admin wildcard
    if '*' in user_permissions:
        return True
    
    # Exact match
    if required_permission in user_permissions:
        return True
    
    # Wildcard match (e.g., submit:* matches submit:SOP123)
    for perm in user_permissions:
        if perm.endswith('*'):
            prefix = perm[:-1]
            if required_permission.startswith(prefix):
                return True
    
    return False
```

## Cognito Integration

### User Pool Configuration

Created by CloudFormation when `ENABLE_AUTH=true`:

```yaml
CognitoUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: !Sub 'rawscribe-${Environment}-${Organization}-userpool'
    UsernameAttributes: [email]
    AutoVerifiedAttributes: [email]
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireUppercase: true
        RequireLowercase: true
        RequireNumbers: true
        RequireSymbols: true
    Schema:
      - Name: email
        Required: true
        Mutable: false
      - Name: name
        Required: false
        Mutable: true
```

### App Client Configuration

```yaml
CognitoUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    ClientName: !Sub 'rawscribe-${Environment}-${Organization}-client'
    UserPoolId: !Ref CognitoUserPool
    GenerateSecret: false
    ExplicitAuthFlows:
      - ALLOW_USER_PASSWORD_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
      - ALLOW_ADMIN_USER_PASSWORD_AUTH
    PreventUserExistenceErrors: ENABLED
```

**Auth flows enabled:**
- `ADMIN_USER_PASSWORD_AUTH` - For backend user creation
- `USER_PASSWORD_AUTH` - For frontend login
- `REFRESH_TOKEN_AUTH` - For token refresh

### Cognito Groups

Four groups created automatically:

```yaml
CognitoAdminGroup:
  GroupName: ADMINS
  Precedence: 1

CognitoLabManagerGroup:
  GroupName: LAB_MANAGERS
  Precedence: 2

CognitoResearcherGroup:
  GroupName: RESEARCHERS
  Precedence: 3

CognitoClinicianGroup:
  GroupName: CLINICIANS
  Precedence: 4
```

**Precedence:** Lower number = higher priority (used for token claims)

## API Gateway Authorization

### Cognito Authorizer

Configured in template.yaml:

```yaml
ApiGateway:
  Type: AWS::Serverless::Api
  Properties:
    Auth:
      Authorizers:
        CognitoAuthorizer:
          UserPoolArn: !If
            - CreateUserPool
            - !GetAtt CognitoUserPool.Arn
            - !Sub 'arn:aws:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/${CognitoUserPoolId}'
```

### Endpoint Protection

**Protected endpoints:**
```yaml
ApiProxy:
  Path: /api/{proxy+}
  Method: ANY
  Auth:
    Authorizer: CognitoAuthorizer

ApiV1Proxy:
  Path: /api/v1/{proxy+}
  Method: ANY
  Auth:
    Authorizer: CognitoAuthorizer
```

**Unprotected endpoints:**
```yaml
RootGet:
  Path: /
  Method: GET
  # No Auth - public health check

HealthGet:
  Path: /health
  Method: GET
  # No Auth - public health check
```

**Endpoint protection levels:**
- ✅ `/` and `/health` - Public (no auth required)
- 🔒 `/api/*` - Requires valid JWT token
- 🔐 Specific endpoints - RBAC enforced by Lambda code

## Security Model

### Multi-Layer Security

**Layer 1: API Gateway**
- Cognito authorizer validates JWT signature
- Checks token not expired
- Verifies token from correct User Pool

**Layer 2: Lambda Backend**
- Re-validates JWT (defense in depth)
- Extracts user information
- Maps groups to permissions
- Checks endpoint-specific permissions

**Layer 3: Frontend**
- UX-level enforcement
- Hides unauthorized features
- Client-side validation only (not trusted)

### Token Security

**What's in environment variables:**
- `COGNITO_USER_POOL_ID` - Public identifier (e.g., `us-east-1_ABC123`)
- `COGNITO_CLIENT_ID` - Public client ID (e.g., `abc123def456`)
- `COGNITO_REGION` - AWS region (e.g., `us-east-1`)

**These are NOT secrets** - They're configuration pointers telling Lambda which User Pool to validate against.

**Actual security:**
- JWT tokens signed by Cognito's private key
- Validation uses Cognito's public keys (fetched via HTTPS from JWKS endpoint)
- Signature proves token issued by correct Cognito User Pool
- Cannot forge tokens without Cognito's private key

### Cross-Organization Security

**Isolation mechanism:**
- Org1 Lambda has `COGNITO_USER_POOL_ID` = org1's pool
- Org2 Lambda has `COGNITO_USER_POOL_ID` = org2's pool
- Token from org1 won't validate in org2's Lambda
- Complete user and data isolation

## Username Handling

### Username Format Requirements

**Valid formats:**
- Email addresses: `user@myorg.com`
- No hyphens allowed (filesystem delimiter conflict)

**Username transformations:**

```python
# backend/rawscribe/utils/auth.py line 258
# UUID usernames have hyphens replaced with underscores
username = username.replace('-', '_')

# Email derivation for UUID usernames
if '@' not in username:
    email = f"{username}@cognito.local"
else:
    email = username
```

**Why no hyphens:**
- Filesystem path delimiters use hyphens
- Prevents path traversal issues
- Ensures consistent username format

### Username Types

**Email-based usernames:**
- Username: `researcher1@myorg.com`
- Email: `researcher1@myorg.com`
- Display name: From `name` attribute

**UUID-based usernames:**
- Username: `uuid_with_underscores` (hyphens replaced)
- Email: `uuid_with_underscores@cognito.local`
- Display name: From `name` attribute if set

## Token Validation Implementation

### AuthValidator Class

Located in: `backend/rawscribe/utils/auth.py`

**Initialization:**
```python
class AuthValidator:
    def __init__(self, config: dict):
        # Get Cognito configuration
        self.cognito_region = os.environ.get('COGNITO_REGION') or \
            config.get('lambda', {}).get('auth', {}).get('cognito', {}).get('region')
        
        self.cognito_user_pool_id = os.environ.get('COGNITO_USER_POOL_ID') or \
            config.get('lambda', {}).get('auth', {}).get('cognito', {}).get('userPoolId')
        
        self.cognito_client_id = os.environ.get('COGNITO_CLIENT_ID') or \
            config.get('lambda', {}).get('auth', {}).get('cognito', {}).get('clientId')
        
        # Fetch Cognito public keys for JWT verification
        self.cognito_keys = self._fetch_cognito_public_keys()
```

**Token validation:**
```python
async def validate_token(self, token: str) -> dict:
    """Validate JWT token and return user info"""
    try:
        # Decode and verify JWT
        decoded = jwt.decode(
            token,
            self.cognito_public_key,
            algorithms=['RS256'],
            audience=self.cognito_client_id,
            issuer=f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.cognito_user_pool_id}"
        )
        
        # Extract user information
        user_id = decoded.get('sub')
        username = decoded.get('username') or decoded.get('cognito:username')
        groups = decoded.get('cognito:groups', [])
        
        # Map groups to permissions
        permissions = self._map_cognito_permissions(groups)
        
        # Handle username format
        username = username.replace('-', '_')
        if '@' not in username:
            email = f"{username}@cognito.local"
        else:
            email = username
        
        return {
            'id': user_id,
            'username': username,
            'email': email,
            'groups': groups,
            'permissions': permissions,
            'isAdmin': '*' in permissions
        }
        
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token expired")
    except jwt.InvalidTokenError as e:
        raise AuthenticationError(f"Invalid token: {str(e)}")
```

### Cognito Public Keys (JWKS)

**JWKS Endpoint:**
```
https://cognito-idp.{region}.amazonaws.com/{pool-id}/.well-known/jwks.json
```

**Fetching keys:**
```python
def _fetch_cognito_public_keys(self):
    """Fetch Cognito public keys for JWT verification"""
    jwks_url = f"https://cognito-idp.{self.cognito_region}.amazonaws.com/" \
               f"{self.cognito_user_pool_id}/.well-known/jwks.json"
    
    response = requests.get(jwks_url)
    jwks = response.json()
    
    # Convert JWKS to public key objects
    keys = {}
    for key in jwks['keys']:
        keys[key['kid']] = jwk.construct(key)
    
    return keys
```

**Key rotation:**
- Cognito automatically rotates keys
- JWKS fetched on Lambda cold start
- Cached during Lambda warm state
- Validates against current and previous keys

## Permission System

### Permission Schema

Format: `{action}:{resource}`

**Actions:**
- `submit` - Create new submissions
- `view` - Read submissions
- `draft` - Manage drafts
- `approve` - Approve submissions
- `export` - Export data
- `admin` - Administrative actions
- `*` - All actions (wildcard)

**Resources:**
- `SOP*` - All SOPs
- `clinical*` - Clinical forms
- `own` - User's own data
- `group` - Team/group data
- `*` - All resources (wildcard)

### Wildcard Support

**Full wildcard** (`*`):
- Grants all permissions
- ADMINS only
- Matches any permission check

**Action wildcard** (`submit:*`):
- Grants all submit actions
- Matches `submit:SOP123`, `submit:clinical456`, etc.

**Resource wildcard** (`view:*`):
- Grants view on all resources
- Matches `view:own`, `view:group`, `view:all`

### Permission Checking in Routes

```python
from fastapi import Depends, HTTPException
from .utils.auth import get_current_user

@router.post("/api/v1/eln/submit")
async def submit_eln(user: dict = Depends(get_current_user)):
    """Submit ELN - requires submit:SOP* permission"""
    
    if not has_permission(user, 'submit:SOP*'):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Process submission
    ...
```

## Frontend Authentication

### Token Storage

**Development:**
```typescript
// Store in localStorage for persistence across tabs
localStorage.setItem('syndi_access_token', accessToken);
localStorage.setItem('syndi_id_token', idToken);
localStorage.setItem('syndi_refresh_token', refreshToken);
```

**Production:**
```typescript
// Consider sessionStorage for higher security
sessionStorage.setItem('syndi_access_token', accessToken);
```

### Auth Context

Frontend provides authentication context:

```typescript
// frontend/src/shared/lib/auth.tsx
const AuthContext = React.createContext({
  user: null,
  isAuthenticated: false,
  login: async (username, password) => {...},
  logout: () => {...},
  refreshToken: async () => {...}
});
```

### Protected Routes

```typescript
function ProtectedRoute({ children, requiredPermission }) {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    return <AccessDenied />;
  }
  
  return children;
}
```

## Security Considerations

### Token Security

1. **HTTPS Only** - Never send tokens over HTTP
2. **Secure Storage** - Use httpOnly cookies in production (TBD)
3. **Token Expiration** - Tokens expire after 1 hour
4. **Refresh Tokens** - Stored securely, used to get new tokens
5. **Logout** - Clear all tokens from storage

### Cognito Security

1. **Password Policy** - Strong passwords enforced
2. **MFA Support** - Can enable multi-factor authentication
3. **Account Recovery** - Email-based password reset
4. **Audit Logging** - CloudTrail logs all Cognito operations
5. **User Pool Isolation** - Each org has separate pool

### API Security

1. **JWT Validation** - Every request validated
2. **Permission Checks** - Endpoint-level authorization
3. **CORS** - Configured per organization
4. **Rate Limiting** - API Gateway throttling
5. **Encryption in Transit** - HTTPS required

## Advantages of Cognito RBAC

1. **Centralized Management** - Single identity provider
2. **Scalability** - Handles thousands of users
3. **MFA Support** - Built-in multi-factor authentication
4. **Federated Identity** - Can integrate with corporate SSO
5. **Audit Trails** - CloudTrail logging for compliance
6. **Compliance** - SOC, PCI DSS, HIPAA eligible
7. **No Infrastructure** - Fully managed service
8. **Token Standards** - Industry-standard JWT/OAuth

## Testing Authentication

See [Testing Authentication](../authentication/testing-auth.md) for complete testing guide.

**Quick test:**
```bash
# Test locally
make test-jwt-local ENV=stage ORG=myorg

# Test on AWS
make test-jwt-aws ENV=stage ORG=myorg
```

## Related Documentation

- [Authentication Provider Pattern](auth-provider-architecture.md) - Technical deep-dive into provider abstraction
- [RBAC System](../authentication/rbac.md) - Detailed RBAC documentation
- [User Management](../authentication/user-management.md) - Managing users
- [Testing Authentication](../authentication/testing-auth.md) - Auth testing
- [Configuration System](configuration-system.md) - Cognito configuration
