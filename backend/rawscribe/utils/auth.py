# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Backend Authentication Utilities for CLAIRE

Extracts user information from API Gateway Cognito Authorizer context
with ELN-specific access control and permission management.
"""

import json
import logging
import os
from typing import Optional, Dict, Any, List
from functools import wraps
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Import PyJWT for Cognito token validation
try:
    import jwt
    from jwt import PyJWKClient
    JWT_AVAILABLE = True
except ImportError:
    jwt = None
    PyJWKClient = None
    JWT_AVAILABLE = False
    logging.warning("PyJWT library not available - Cognito JWT validation will be limited")

logger = logging.getLogger(__name__)

# Auth provider types (simplified to 2 providers only)
AUTH_PROVIDERS = ['cognito', 'jwt']  # Only 2 providers after v3 migration

def validate_username(username: str) -> bool:
    """
    Validate username format to prevent delimiter conflicts.
    
    Usernames must not contain hyphens (-) to avoid conflicts with 
    filename generation that uses hyphens as delimiters.
    
    Args:
        username: Username to validate
        
    Returns:
        bool: True if valid, False otherwise
    """
    if not username:
        return False
    
    # Forbid hyphens to avoid filename delimiter conflicts
    if '-' in username:
        return False
        
    # Basic character validation (alphanumeric, underscore, dot, at-sign)
    import re
    if not re.match(r'^[a-zA-Z0-9._@]+$', username):
        return False


        
    return True

class User:
    """User model with authentication and authorization information

    Note: Token is optional and included to support providers that want to
    attach the raw token to the user instance for downstream usage/logging.
    """
    def __init__(self, id: str, email: str, username: str, name: str,
                 groups: List[str] = None, permissions: List[str] = None,
                 is_admin: bool = False, token: Optional[str] = None):
        # Validate username format
        if not validate_username(username):
            raise ValueError(f"Invalid username format: '{username}'. Allowed: letters, digits, ., _, @; hyphens (-) are not allowed.")
            
        self.id = id
        self.email = email
        self.username = username
        self.name = name
        self.groups = groups or []
        self.permissions = permissions or []
        self.is_admin = is_admin
        self.token = token

    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission"""
        return (
            '*' in self.permissions or
            permission in self.permissions or
            any(perm.endswith('*') and permission.startswith(perm[:-1]) 
                for perm in self.permissions)
        )

    def is_in_group(self, group: str) -> bool:
        """Check if user is in a specific group"""
        return group in self.groups

    def to_dict(self) -> Dict[str, Any]:
        """Convert user to dictionary"""
        return {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'name': self.name,
            'groups': self.groups,
            'permissions': self.permissions,
            'isAdmin': self.is_admin
        }

class AuthError(Exception):
    """Custom authentication error"""
    pass

class AuthValidator:
    """
    Authentication validator (Cognito + JWT)
    
    Environment-aware validation:
    - AWS Lambda: Cognito only (API Gateway requirement)
    - Local dev/test: JWT with mock users
    - Self-hosted: JWT with production signatures
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        
        # Use existing config_loader pattern for environment detection
        from rawscribe.utils.config_loader import config_loader
        self.environment = config_loader.get_environment()
        self.is_aws_lambda = bool(os.environ.get('AWS_EXECUTION_ENV'))
        
        # Handle nested config structure: config.lambda.auth or config.auth
        if 'lambda' in config and 'auth' in config['lambda']:
            self.auth_config = config['lambda']['auth']
        else:
            self.auth_config = config.get('auth', {})
        
        self.provider = self.auth_config.get('provider', 'jwt')
        
        logger.info(
            f"AuthValidator: provider={self.provider}, "
            f"env={self.environment}, aws={self.is_aws_lambda}"
        )
        
        # CRITICAL: Validate AWS constraint
        if self.is_aws_lambda and self.provider != 'cognito':
            raise RuntimeError(
                f"AWS Lambda requires Cognito provider (got '{self.provider}'). "
                f"API Gateway Cognito Authorizer will reject non-Cognito tokens."
            )
        
        # Initialize provider-specific configurations
        self._init_provider_configs()

    def _init_provider_configs(self):
        """Initialize provider-specific configurations"""
        if self.provider == 'jwt':
            self._init_jwt_config()
        elif self.provider == 'cognito':
            self._init_cognito_config()
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")
    
    def _init_jwt_config(self):
        """Initialize JWT configuration"""
        jwt_config = self.auth_config.get('jwt', {})
        self.jwt_secret = jwt_config.get('secret', 'dev-secret')
        self.jwt_algorithm = jwt_config.get('algorithm', 'HS256')
        self.jwt_issuer = jwt_config.get('issuer')
        self.jwt_audience = jwt_config.get('audience')
        self.mock_users = jwt_config.get('mockUsers', [])
        
        # Validate production JWT
        if self.environment in ['stage', 'prod']:
            if self.jwt_secret in ['dev-secret', 'dev-secret-replace-with-strong-secret']:
                raise RuntimeError(
                    "Production JWT requires secure secret. "
                    "Generate: openssl rand -base64 32"
                )
        
        logger.info(
            f"JWT provider: algorithm={self.jwt_algorithm}, "
            f"mockUsers={len(self.mock_users)}"
        )
    
    def _init_cognito_config(self):
        """Initialize Cognito configuration"""
        self.cognito_region = (
            os.environ.get('COGNITO_REGION') or 
            self.auth_config.get('cognito', {}).get('region')
        )
        self.cognito_user_pool_id = (
            os.environ.get('COGNITO_USER_POOL_ID') or 
            self.auth_config.get('cognito', {}).get('userPoolId')
        )
        self.cognito_client_id = (
            os.environ.get('COGNITO_CLIENT_ID') or 
            self.auth_config.get('cognito', {}).get('clientId')
        )
        
        if not all([self.cognito_region, self.cognito_user_pool_id, self.cognito_client_id]):
            raise ValueError("Cognito requires region, userPoolId, clientId")
        
        # Initialize JWKS client
        if not JWT_AVAILABLE or not PyJWKClient:
            raise RuntimeError("PyJWT library required. Install: pip install 'PyJWT[crypto]'")
        
        try:
            jwks_url = (
                f"https://cognito-idp.{self.cognito_region}.amazonaws.com/"
                f"{self.cognito_user_pool_id}/.well-known/jwks.json"
            )
            self.jwks_client = PyJWKClient(jwks_url, timeout=10)
            logger.info(f"JWKS client initialized: {jwks_url}")
        except Exception as e:
            raise RuntimeError(f"JWKS initialization failed: {e}")

    def validate_token(self, token: str) -> User:
        """Validate token based on provider"""
        try:
            if self.provider == 'jwt':
                return self._validate_jwt_token(token)
            elif self.provider == 'cognito':
                return self._validate_cognito_token(token)
            else:
                raise AuthError(f"Unsupported provider: {self.provider}")
        except AuthError:
            raise
        except Exception as e:
            logger.error(f"Token validation failed: {e}")
            raise AuthError(f"Invalid token: {e}")

    def _validate_jwt_token(self, token: str) -> User:
        """Validate JWT token (dev or production)"""
        import time
        
        # Check for dev token
        parts = token.split('.')
        if len(parts) == 3:
            try:
                header = json.loads(self._base64url_decode(parts[0]))
                if header.get('dev_mode'):
                    return self._validate_dev_token(token)
            except:
                pass  # Not a dev token
        
        # Production JWT validation
        if not JWT_AVAILABLE:
            raise AuthError("PyJWT not available")
        
        try:
            decoded = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=[self.jwt_algorithm],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": bool(self.jwt_audience),
                    "verify_iss": bool(self.jwt_issuer)
                },
                audience=self.jwt_audience,
                issuer=self.jwt_issuer
            )
        except jwt.ExpiredSignatureError:
            raise AuthError("Token expired")
        except jwt.InvalidTokenError as e:
            raise AuthError(f"Invalid token: {e}")
        
        return User(
            id=decoded.get('sub'),
            email=decoded.get('email'),
            username=decoded.get('username') or decoded.get('email', '').split('@')[0],
            name=decoded.get('name'),
            groups=decoded.get('groups', ['user']),
            permissions=decoded.get('permissions', ['view:own']),
            is_admin=decoded.get('isAdmin', False),
            token=token
        )

    def _validate_dev_token(self, token: str) -> User:
        """
        Validate development token (local only)
        
        CRITICAL: Blocks dev tokens in:
        - AWS Lambda (any environment)
        - stage/prod (any deployment)
        - Wrong provider configuration
        """
        # Block in AWS
        if self.is_aws_lambda:
            raise AuthError("Dev tokens blocked in AWS Lambda")
        
        # Block in stage/prod
        if self.environment in ['stage', 'prod']:
            raise AuthError(f"Dev tokens blocked in {self.environment}")
        
        # Block if wrong provider
        if self.provider != 'jwt':
            raise AuthError("Dev tokens only valid with JWT provider")
        
        try:
            import time
            
            parts = token.split('.')
            if len(parts) != 3:
                raise AuthError("Invalid dev token format")
            
            # Decode header and payload
            header = json.loads(self._base64url_decode(parts[0]))
            payload = json.loads(self._base64url_decode(parts[1]))
            
            if not header.get('dev_mode'):
                raise AuthError("Not a dev token")
            
            # Check expiration
            if payload.get('exp', 0) < time.time():
                raise AuthError("Dev token expired")
            
            logger.debug(f"Dev token validated (env={self.environment})")
            
            return User(
                id=payload.get('sub'),
                email=payload.get('email'),
                username=payload.get('username') or payload.get('email', '').split('@')[0],
                name=payload.get('name'),
                groups=payload.get('groups', ['user']),
                permissions=payload.get('permissions', ['view:own']),
                is_admin=payload.get('isAdmin', False),
                token=token
            )
        except AuthError:
            raise
        except Exception as e:
            raise AuthError(f"Dev token validation failed: {e}")

    def _validate_cognito_token(self, token: str) -> User:
        """
        Validate Cognito ID Token
        
        NOTE: API Gateway already validates; this is additional validation
        """
        if not hasattr(self, 'jwks_client') or not self.jwks_client:
            raise AuthError("JWKS client not initialized")
        
        try:
            # Get signing key
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)
            
            expected_issuer = (
                f"https://cognito-idp.{self.cognito_region}.amazonaws.com/"
                f"{self.cognito_user_pool_id}"
            )
            
            # Verify signature and claims
            decoded = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": True,
                    "verify_iss": True
                },
                audience=self.cognito_client_id,
                issuer=expected_issuer
            )
            
            logger.debug("Cognito token verified")
            
            # Extract user info
            user_id = decoded.get('sub')
            email = decoded.get('email')
            # Always use email prefix for username (Cognito UUIDs contain hyphens which break filenames)
            username = email.split('@')[0] if email else 'unknown'
            groups = decoded.get('cognito:groups', ['user'])
            
            return User(
                id=user_id,
                email=email,
                username=username,
                name=decoded.get('name') or username,
                groups=groups,
                permissions=self._map_cognito_permissions(groups),
                is_admin='admin' in [g.lower() for g in groups],
                token=token
            )
        except jwt.ExpiredSignatureError:
            raise AuthError("Cognito token expired")
        except jwt.InvalidTokenError as e:
            raise AuthError(f"Invalid Cognito token: {e}")
        except Exception as e:
            logger.error(f"Cognito validation error: {e}")
            raise AuthError(f"Cognito auth failed: {e}")

    def _map_cognito_permissions(self, groups: List[str]) -> List[str]:
        """
        Map Cognito groups to permissions
        
        Matches group names from CloudFormation and config:
        - ADMINS: Full access (*)
        - LAB_MANAGERS: Submit, view all, manage users, approve
        - RESEARCHERS: Submit, view own/group, manage drafts
        - CLINICIANS: Submit, view own, manage drafts
        """
        permissions = set()
        for group in groups:
            g = group.lower()
            if g in ['admin', 'admins']:
                # Full admin access
                permissions.add('*')
            elif g in ['lab_manager', 'lab_managers']:
                # Lab managers can manage users
                permissions.update(['submit:*', 'view:*', 'draft:*', 'approve:*', 'manage:users'])
            elif g in ['researcher', 'researchers']:
                # Researchers can submit and view their own data
                permissions.update(['submit:*', 'view:own', 'view:group', 'draft:*'])
            elif g in ['clinician', 'clinicians']:
                # Clinicians can submit and view their own data
                permissions.update(['submit:*', 'view:own', 'draft:*'])
            else:
                # Default: view own data only
                permissions.add('view:own')
        return list(permissions)
    
    @staticmethod
    def _base64url_decode(data: str) -> str:
        """
        Decode base64url with proper padding (RFC 7515 compliance)
        
        Base64url uses different characters than standard base64:
        - Uses '-' instead of '+'
        - Uses '_' instead of '/'
        - No padding '=' characters
        """
        import base64
        
        # Replace URL-safe characters with standard base64
        data = data.replace('-', '+').replace('_', '/')
        
        # Add padding if needed
        padding = 4 - (len(data) % 4)
        if padding != 4:
            data += '=' * padding
        
        return base64.b64decode(data).decode('utf-8')


# FastAPI dependencies
security = HTTPBearer(auto_error=False)

def get_auth_validator() -> AuthValidator:
    """Get auth validator instance with loaded configuration"""
    from .config_loader import config_loader
    config = config_loader.load_config()
    logger.debug(f"get_auth_validator: loaded config={config}")
    return AuthValidator(config)

def get_current_user(
    auth_validator: AuthValidator = Depends(get_auth_validator),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[User]:
    """Get current authenticated user
    
    Use this dependency when you want to enforce authentication in production but allow
    endpoints to handle the None case explicitly. This gives more control over auth behavior
    compared to get_current_user_or_default which always returns a user object.
    
    For example, some endpoints may want to provide limited functionality for anonymous users
    while still supporting authenticated users.

    Args:
        auth_validator: Auth validator instance
        request: FastAPI request object

    Returns:
        Optional[User]: Current authenticated user or None if auth is disabled

    Raises:
        HTTPException: If authentication is required and credentials are missing
        AuthError: If token validation fails

    Example:
        @app.get("/private")
        async def private_endpoint(current_user: Optional[User] = Depends(get_current_user)):
            if current_user is None:
                raise HTTPException(status_code=401, detail="Unauthorized")
            return {"message": "This is a private endpoint"}
        
    """
    logger.debug(f"get_current_user: auth_validator.config={auth_validator.config}")
    logger.debug(f"get_current_user: auth.required={auth_validator.config.get('lambda', {}).get('auth', {}).get('required', True)}")
    
    # Check if auth is required
    if not auth_validator.config.get('lambda', {}).get('auth', {}).get('required', True):
        # Auth is disabled - return None to indicate no user
        logger.debug("get_current_user: Auth disabled, returning None")
        return None
    
    # Auth is required - validate token
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        token = credentials.credentials
        user = auth_validator.validate_token(token)
        return user
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_user_or_default(
    current_user: Optional[User] = Depends(get_current_user),
    auth_validator: AuthValidator = Depends(get_auth_validator)
) -> User:
    """Get current authenticated user or default user when auth is disabled. 
    
    See also get_current_user for more details.
    
    Args:
        current_user: Current authenticated user
        auth_validator: Auth validator instance

    Returns:
        User: Current authenticated user or default user when auth is disabled

    Raises:
        HTTPException: If authentication is required and credentials are missing
        AuthError: If token validation fails

    Example:   
        @app.get("/private")
        async def private_endpoint(current_user: User = Depends(get_current_user_or_default)):
            return {"message": "This is a private endpoint"}
    """
    logger.debug(f"get_current_user_or_default: current_user={current_user}")
    if current_user is not None:
        return current_user
    
    # Auth is disabled - return default user from config
    # This ensures consistency between what saves drafts and what queries them
    auth_config = auth_validator.auth_config
    mock_users = auth_config.get('users', [])
    
    if mock_users:
        # Use the first configured user as default
        default_user_config = mock_users[0]
        logger.debug(f"get_current_user_or_default: Using configured default user: {default_user_config['id']}")
        return User(
            id=default_user_config['id'],
            email=default_user_config['email'],
            username=default_user_config['username'],
            name=default_user_config['name'],
            groups=default_user_config.get('groups', ['admin']),
            permissions=default_user_config.get('permissions', ['*']),
            is_admin=default_user_config.get('isAdmin', True)
        )
    else:
        # CRITICAL: No users configured - this should only happen in dev/test
        # DO NOT allow this in production as it would be a security vulnerability
        import os
        env = os.getenv('ENV', 'dev')
        if env not in ['dev', 'test']:
            logger.error(f"SECURITY ERROR: Auth disabled with no users configured in {env} environment!")
            raise HTTPException(
                status_code=500,
                detail="Authentication configuration error - no users configured"
            )
        logger.warning(f"SECURITY WARNING: No users configured in {env} environment, using fallback")
        return User(
            id="dev-user",
            email="dev@local.dev",
            username="dev",
            name="Development User",
            groups=["admin"],
            permissions=["*"],
            is_admin=True
        )

def require_permission(permission: str):
    """Decorator to require specific permission"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user = kwargs.get('current_user') or args[-1]  # Assume user is last param
            if not isinstance(user, User):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            if not user.has_permission(permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: {permission}"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

def require_group(group: str):
    """Decorator to require specific group membership"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user = kwargs.get('current_user') or args[-1]  # Assume user is last param
            if not isinstance(user, User):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            if not user.is_in_group(group):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Group membership required: {group}"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

def require_admin(func):
    """Decorator to require admin privileges"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        user = kwargs.get('current_user') or args[-1]  # Assume user is last param
        if not isinstance(user, User):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        if not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required"
            )
        
        return await func(*args, **kwargs)
    return wrapper

# Utility functions
def extract_user_from_token(token: str, auth_validator: AuthValidator) -> Optional[User]:
    """Extract user from token without raising exceptions"""
    try:
        return auth_validator.validate_token(token)
    except AuthError:
        return None

def generate_mock_token(user_id: str) -> str:
    """Generate mock token for testing"""
    import time
    return f"mock-token-{user_id}-{int(time.time())}" 