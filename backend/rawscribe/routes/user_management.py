# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
User Management API Routes

RESTful endpoints for Cognito user management. Called by Makefile targets,
works with both local dev server and deployed Lambda.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict
import boto3
import secrets
import string
import logging
from botocore.exceptions import ClientError

from rawscribe.utils.config_loader import config_loader
from rawscribe.utils.auth import get_current_user

router = APIRouter(tags=["user-management"])
logger = logging.getLogger(__name__)

# Test user definitions
DEFAULT_TEST_USERS = {
    'testadmin@example.com': {
        'group': 'ADMINS',
        'password': 'TestAdmin123!',
        'attributes': {'name': 'Test Administrator'}
    },
    'testresearcher@example.com': {
        'group': 'RESEARCHERS', 
        'password': 'TestResearch123!',
        'attributes': {'name': 'Test Researcher'}
    },
    'testclinician@example.com': {
        'group': 'CLINICIANS',
        'password': 'TestClinic123!',
        'attributes': {'name': 'Test Clinician'}
    }
}


class CreateUserRequest(BaseModel):
    username: EmailStr
    password: str
    group: str
    attributes: Optional[Dict[str, str]] = None


class UserResponse(BaseModel):
    username: str
    group: str
    status: str
    is_test_user: bool


def check_cognito_only():
    """
    Check that auth provider is Cognito.
    User management only works with Cognito (not on-prem JWT).
    """
    auth_provider = config_loader.get_auth_provider()
    
    if auth_provider.provider_name != 'cognito':
        raise HTTPException(
            status_code=501,
            detail=f"User management not supported for provider '{auth_provider.provider_name}'. "
                   f"On-prem deployments: edit users in config.json. "
                   f"AWS deployments: use provider='cognito'."
        )


def get_cognito_client():
    """Get Cognito client with region from auth provider"""
    check_cognito_only()
    auth_provider = config_loader.get_auth_provider()
    region = auth_provider.get_region()
    return boto3.client('cognito-idp', region_name=region)


def get_user_pool_id():
    """
    Get User Pool ID from auth provider
    
    Reads from environment variables (CloudFormation) first,
    then falls back to config file.
    """
    auth_provider = config_loader.get_auth_provider()
    pool_id = auth_provider.get_user_pool_id()
    
    if not pool_id:
        raise HTTPException(
            status_code=500,
            detail="Cognito not configured (no userPoolId)"
        )
    
    return pool_id


def generate_secure_password(length: int = 16) -> str:
    """Generate a secure random password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    
    # Ensure it meets Cognito requirements (upper, lower, number, special)
    if (any(c.isupper() for c in password) and 
        any(c.islower() for c in password) and
        any(c.isdigit() for c in password) and
        any(c in "!@#$%^&*" for c in password)):
        return password
    else:
        # Regenerate if requirements not met
        return generate_secure_password(length)


@router.get("/v1/user-management/users/{username}")
async def get_user(
    username: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get details for a specific user
    Requires manage:users permission (ADMINS or LAB_MANAGERS)
    """
    # Check user management permission
    user_permissions = current_user.permissions if hasattr(current_user, 'permissions') else []
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
    
    try:
        client = get_cognito_client()
        pool_id = get_user_pool_id()
        
        # Get user details
        user = client.admin_get_user(
            UserPoolId=pool_id,
            Username=username
        )
        
        # Get user's groups
        groups_response = client.admin_list_groups_for_user(
            UserPoolId=pool_id,
            Username=username
        )
        groups = [g['GroupName'] for g in groups_response.get('Groups', [])]
        
        # Extract user attributes
        attributes = {attr['Name']: attr['Value'] for attr in user.get('UserAttributes', [])}
        
        return {
            'username': username,
            'email': attributes.get('email', username),
            'status': user['UserStatus'],
            'enabled': user['Enabled'],
            'groups': groups,
            'created': user.get('UserCreateDate', None),
            'modified': user.get('UserLastModifiedDate', None),
            'is_test_user': username in DEFAULT_TEST_USERS
        }
        
    except client.exceptions.UserNotFoundException:
        raise HTTPException(status_code=404, detail=f"User {username} not found")
    except ClientError as e:
        logger.error(f"Failed to get user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/v1/user-management/users", response_model=UserResponse)
async def create_user(
    request: CreateUserRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new Cognito user
    Requires manage:users permission (ADMINS or LAB_MANAGERS)
    """
    # Check user management permission
    user_permissions = current_user.permissions if hasattr(current_user, 'permissions') else []
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
    
    try:
        client = get_cognito_client()
        pool_id = get_user_pool_id()
        
        # Create user
        user_attrs = [
            {'Name': 'email', 'Value': request.username},
            {'Name': 'email_verified', 'Value': 'true'}
        ]
        
        if request.attributes:
            for key, value in request.attributes.items():
                user_attrs.append({'Name': key, 'Value': value})
        
        client.admin_create_user(
            UserPoolId=pool_id,
            Username=request.username,
            UserAttributes=user_attrs,
            TemporaryPassword=request.password,
            MessageAction='SUPPRESS'  # Don't send email
        )
        
        # Set permanent password
        client.admin_set_user_password(
            UserPoolId=pool_id,
            Username=request.username,
            Password=request.password,
            Permanent=True
        )
        
        # Add to group
        client.admin_add_user_to_group(
            UserPoolId=pool_id,
            Username=request.username,
            GroupName=request.group
        )
        
        logger.info(f"Created user {request.username} in group {request.group}")
        
        return UserResponse(
            username=request.username,
            group=request.group,
            status='CONFIRMED',
            is_test_user=request.username in DEFAULT_TEST_USERS
        )
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'UsernameExistsException':
            raise HTTPException(status_code=409, detail=f"User {request.username} already exists")
        else:
            logger.error(f"Failed to create user: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/v1/user-management/test-users", response_model=List[UserResponse])
async def create_test_users(current_user: dict = Depends(get_current_user)):
    """
    Create all default test users
    Requires manage:users permission (ADMINS or LAB_MANAGERS)
    """
    # Check user management permission
    user_permissions = current_user.permissions if hasattr(current_user, 'permissions') else []
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
    
    results = []
    
    for username, user_data in DEFAULT_TEST_USERS.items():
        try:
            response = await create_user(
                CreateUserRequest(
                    username=username,
                    password=user_data['password'],
                    group=user_data['group'],
                    attributes=user_data.get('attributes')
                ),
                current_user=current_user
            )
            results.append(response)
            logger.info(f"✅ Created test user: {username} / {user_data['password']}")
        except HTTPException as e:
            if e.status_code == 409:
                logger.info(f"⏭️  Test user already exists: {username}")
                results.append(UserResponse(
                    username=username,
                    group=user_data['group'],
                    status='EXISTS',
                    is_test_user=True
                ))
            else:
                logger.error(f"❌ Failed to create test user {username}: {e.detail}")
                raise
    
    return results


@router.get("/v1/user-management/test-users", response_model=List[Dict])
async def list_test_users(current_user: dict = Depends(get_current_user)):
    """
    List all test users with their credentials
    Requires manage:users permission (ADMINS or LAB_MANAGERS)
    WARNING: Returns passwords in plaintext (test users only!)
    """
    # Check user management permission
    user_permissions = current_user.permissions if hasattr(current_user, 'permissions') else []
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
    
    try:
        client = get_cognito_client()
        pool_id = get_user_pool_id()
        
        result = []
        
        for username, user_data in DEFAULT_TEST_USERS.items():
            try:
                # Check if user exists
                user = client.admin_get_user(
                    UserPoolId=pool_id,
                    Username=username
                )
                
                # Get user's groups
                groups_response = client.admin_list_groups_for_user(
                    UserPoolId=pool_id,
                    Username=username
                )
                groups = [g['GroupName'] for g in groups_response.get('Groups', [])]
                
                result.append({
                    'username': username,
                    'password': user_data['password'],
                    'group': user_data['group'],
                    'actual_groups': groups,
                    'status': user['UserStatus'],
                    'enabled': user['Enabled']
                })
            except client.exceptions.UserNotFoundException:
                result.append({
                    'username': username,
                    'password': user_data['password'],
                    'group': user_data['group'],
                    'status': 'NOT_CREATED',
                    'enabled': False
                })
        
        return result
        
    except ClientError as e:
        logger.error(f"Failed to list test users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v1/user-management/groups", response_model=List[Dict])
async def list_groups(current_user: dict = Depends(get_current_user)):
    """
    List all available Cognito groups with their permissions
    Requires manage:users permission (ADMINS or LAB_MANAGERS)
    """
    # Check user management permission
    user_permissions = current_user.permissions if hasattr(current_user, 'permissions') else []
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
    
    try:
        # Load group definitions from config
        config = config_loader.load_config()
        cognito_config = config.get('lambda', {}).get('auth', {}).get('cognito', {})
        groups_config = cognito_config.get('groups', {})
        
        result = []
        for group_name, group_info in groups_config.items():
            result.append({
                'name': group_name,
                'description': group_info.get('description', ''),
                'permissions': group_info.get('permissions', [])
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to list groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/v1/user-management/test-users")
async def remove_test_users(current_user: dict = Depends(get_current_user)):
    """
    Remove all test users
    Requires manage:users permission (ADMINS or LAB_MANAGERS)
    """
    # Check user management permission
    user_permissions = current_user.permissions if hasattr(current_user, 'permissions') else []
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
    
    try:
        client = get_cognito_client()
        pool_id = get_user_pool_id()
        
        removed = []
        
        for username in DEFAULT_TEST_USERS.keys():
            try:
                client.admin_delete_user(
                    UserPoolId=pool_id,
                    Username=username
                )
                removed.append(username)
                logger.info(f"🗑️  Removed test user: {username}")
            except client.exceptions.UserNotFoundException:
                logger.info(f"⏭️  Test user not found: {username}")
        
        return {
            'removed': removed,
            'count': len(removed)
        }
        
    except ClientError as e:
        logger.error(f"Failed to remove test users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/v1/user-management/secure-production")
async def secure_production(current_user: dict = Depends(get_current_user)):
    """
    Secure production environment:
    1. Remove all test users
    2. Generate new random password for admin user (if exists)
    
    Requires manage:users permission (ADMINS or LAB_MANAGERS)
    """
    # Check user management permission
    user_permissions = current_user.permissions if hasattr(current_user, 'permissions') else []
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
    
    # Check environment
    env = config_loader.get_environment()
    if env not in ['prod', 'stage']:
        raise HTTPException(
            status_code=400,
            detail=f"secure-production only for stage/prod environments (current: {env})"
        )
    
    try:
        client = get_cognito_client()
        pool_id = get_user_pool_id()
        
        # 1. Remove test users
        test_users_result = await remove_test_users(current_user)
        
        # 2. Rotate admin password if admin user exists
        admin_users = ['admin@example.com', current_user.email if hasattr(current_user, 'email') else None]
        new_admin_passwords = {}
        
        for admin_email in admin_users:
            if admin_email and admin_email not in DEFAULT_TEST_USERS:
                try:
                    client.admin_get_user(
                        UserPoolId=pool_id,
                        Username=admin_email
                    )
                    
                    # Generate new secure password
                    new_password = generate_secure_password(20)
                    
                    client.admin_set_user_password(
                        UserPoolId=pool_id,
                        Username=admin_email,
                        Password=new_password,
                        Permanent=True
                    )
                    
                    new_admin_passwords[admin_email] = new_password
                    logger.info(f"🔐 Reset password for admin: {admin_email}")
                    
                except client.exceptions.UserNotFoundException:
                    pass
        
        return {
            'test_users_removed': test_users_result['removed'],
            'admin_passwords_reset': new_admin_passwords,
            'message': '⚠️ SAVE THE ADMIN PASSWORDS ABOVE - They cannot be recovered!'
        }
        
    except ClientError as e:
        logger.error(f"Failed to secure production: {e}")
        raise HTTPException(status_code=500, detail=str(e))

