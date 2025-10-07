# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Authentication Routes
JWT login included for local/self-hosted
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
import logging
import time
import jwt

from rawscribe.utils.auth import AuthValidator, User, AuthError, get_auth_validator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["authentication"])

# Request/Response models
class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@router.post("/login", response_model=LoginResponse)
async def login_user(
    request: LoginRequest,
    auth_validator: AuthValidator = Depends(get_auth_validator)
):
    """
    JWT authentication for local/self-hosted deployments
    
    ⚠️  NOT AVAILABLE in AWS stage/prod behind API Gateway.
    API Gateway Cognito Authorizer blocks this endpoint.
    Use Cognito SDK directly for AWS deployments.
    """
    try:
        provider = auth_validator.provider
        logger.info(f"Login attempt: {request.email} (provider={provider})")
        
        if provider != 'jwt':
            return LoginResponse(
                success=False,
                error=f"Login endpoint requires JWT provider (current: {provider})"
            )
        
        # Check mock users
        mock_users = auth_validator.mock_users
        if mock_users:
            mock_user = next(
                (u for u in mock_users if 
                 u['email'] == request.email and 
                 u['password'] == request.password),
                None
            )
            
            if mock_user:
                # Generate token
                token = generate_token(
                    mock_user,
                    auth_validator.jwt_secret,
                    auth_validator.jwt_algorithm
                )
                
                return LoginResponse(
                    success=True,
                    token=token,
                    user={
                        'id': mock_user['id'],
                        'email': mock_user['email'],
                        'username': mock_user['username'],
                        'name': mock_user['name'],
                        'groups': mock_user['groups'],
                        'permissions': mock_user['permissions'],
                        'isAdmin': mock_user['isAdmin']
                    }
                )
        
        return LoginResponse(
            success=False,
            error="Invalid credentials"
        )
    
    except Exception as e:
        logger.error(f"Login failed: {e}")
        return LoginResponse(success=False, error="Internal error")

def generate_token(user: Dict[str, Any], secret: str, algorithm: str) -> str:
    """Generate JWT token for authenticated user"""
    payload = {
        'sub': user['id'],
        'email': user['email'],
        'username': user['username'],
        'name': user['name'],
        'groups': user['groups'],
        'permissions': user['permissions'],
        'isAdmin': user['isAdmin'],
        'exp': int(time.time()) + (8 * 60 * 60),  # 8 hours
        'iat': int(time.time()),
        'iss': 'claire-backend'
    }
    return jwt.encode(payload, secret, algorithm)

@router.get("/config")
async def get_auth_config(auth_validator: AuthValidator = Depends(get_auth_validator)):
    """Get current auth configuration for debugging"""
    return {
        'provider': auth_validator.provider,
        'environment': auth_validator.environment,
        'cognito_region': getattr(auth_validator, 'cognito_region', None),
        'mock_users_count': len(getattr(auth_validator, 'mock_users', []))
    }
