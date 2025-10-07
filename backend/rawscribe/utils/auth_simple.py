# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Simplified Authentication for API Gateway Cognito Authorizer
Extracts user information from API Gateway authorizer context
"""

import logging
from typing import Optional, List, Dict, Any
from fastapi import Request
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class User:
    id: str
    email: str
    username: str
    name: str
    groups: List[str]
    permissions: List[str]
    is_admin: bool
    token: Optional[str] = None

def get_permissions_for_groups(groups: List[str]) -> List[str]:
    """Get permissions based on user groups"""
    permissions = []
    for group in groups:
        if group == 'admin':
            permissions.extend(['*'])
        elif group == 'user':
            permissions.extend(['view:own', 'edit:own'])
    return list(set(permissions))

async def get_current_user_from_context(request: Request) -> Optional[User]:
    """
    Extract user from API Gateway Cognito Authorizer context
    """
    try:
        # In API Gateway Cognito Authorizer, user claims are in the Lambda event
        # This needs to be passed through the request scope by Mangum
        
        # For now, since auth is disabled, return a default user
        # TODO: Extract from actual authorizer context when auth is re-enabled
        
        return User(
            id="test-user",
            email="testuser@pwb.com", 
            username="testuser",
            name="Test User",
            groups=["admin"],
            permissions=["*"],
            is_admin=True
        )
        
    except Exception as e:
        logger.error(f"Failed to extract user from context: {e}")
        return None

# For backward compatibility
def get_current_user_or_default() -> User:
    """Get current user or default when auth is disabled"""
    return User(
        id="default-user",
        email="default@localhost",
        username="default",
        name="Default User", 
        groups=["admin"],
        permissions=["*"],
        is_admin=True
    )

class AuthValidator:
    """Simplified authentication validator for API Gateway Cognito Authorizer"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        # Handle nested config structure: config.lambda.auth or config.auth
        if 'lambda' in config and 'auth' in config['lambda']:
            self.auth_config = config['lambda']['auth']
        else:
            self.auth_config = config.get('auth', {})
        self.provider = self.auth_config.get('provider', 'mock')
        self.required = self.auth_config.get('required', False)
        
        logger.info(f"AuthValidator initialized: provider={self.provider}, required={self.required}")
    
    def is_auth_required(self) -> bool:
        """Check if authentication is required"""
        return self.required
    
    def get_provider(self) -> str:
        """Get the authentication provider"""
        return self.provider
