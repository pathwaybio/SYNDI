#!/usr/bin/env python
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Local JWT validation testing script.
Loads site-specific configuration from .local/<org>/<env>/aws-resources.json

Usage:
    python test_jwt_local.py --org myorg --env stage --get-token
    python test_jwt_local.py --org myorg --env stage --token <jwt-token>
"""

import os
import sys
import argparse
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def load_site_config(org: str, env: str):
    """Load site-specific configuration from infra/.config/lambda/"""
    config_path = Path(f"infra/.config/lambda/{env}-{org}.json")
    
    if not config_path.exists():
        print(f"Error: Configuration file not found at {config_path}")
        print(f"Please create site-specific configuration in infra/.config/lambda/{env}-{org}.json")
        print("\nExpected structure:")
        print("  infra/.config/lambda/")
        print(f"    {env}-{org}.json")
        return None
    
    with open(config_path, 'r') as f:
        return json.load(f)

def test_jwt_validation(token: str, env: str = 'stage', org: str = 'pwb'):
    """Test JWT validation locally"""
    
    # Load site-specific configuration
    site_config = load_site_config(org, env)
    if not site_config:
        return
    
    # Set environment variables as Lambda would have them
    os.environ['COGNITO_REGION'] = site_config.get('region', 'us-east-1')
    os.environ['COGNITO_USER_POOL_ID'] = site_config['lambda']['auth']['cognito']['userPoolId']
    os.environ['COGNITO_CLIENT_ID'] = site_config['lambda']['auth']['cognito']['clientId']
    os.environ['ENV'] = env
    
    # Import after setting env vars
    from rawscribe.utils.auth import AuthValidator, AuthError
    
    # Create minimal config for testing
    config = {
        'lambda': {
            'auth': {
                'provider': 'cognito',
                'required': True,
                'cognito': {
                    'region': os.environ['COGNITO_REGION'],
                    'userPoolId': os.environ['COGNITO_USER_POOL_ID'],
                    'clientId': os.environ['COGNITO_CLIENT_ID']
                }
            }
        }
    }
    
    print(f"Config loaded for {org.upper()} - {env}:")
    print(f"  Auth Provider: {config['lambda']['auth']['provider']}")
    
    # Create auth validator
    try:
        validator = AuthValidator(config)
        print(f"  Cognito Region: {validator.cognito_region}")
        print(f"  User Pool ID: {validator.cognito_user_pool_id[:15]}...")
        print(f"  Client ID: {validator.cognito_client_id[:10]}...")
    except Exception as e:
        print(f"Error creating validator: {e}")
        return
    
    # Validate token
    print(f"\nValidating token...")
    try:
        user = validator.validate_token(token)
        print(f"✅ Token validated successfully!")
        print(f"  User ID: {user.id}")
        print(f"  Username: {user.username}")
        print(f"  Email: {user.email}")
        print(f"  Name: {user.name}")
        print(f"  Groups: {user.groups}")
        print(f"  Permissions: {user.permissions}")
    except AuthError as e:
        print(f"❌ Token validation failed: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

def get_token_from_cognito(org: str, env: str, username: str = None, password: str = None):
    """Get JWT token from Cognito"""
    import subprocess
    
    # Load site-specific configuration
    site_config = load_site_config(org, env)
    if not site_config:
        return None
    
    pool_id = site_config['lambda']['auth']['cognito']['userPoolId']
    client_id = site_config['lambda']['auth']['cognito']['clientId']
    
    # Use test user from config if no credentials provided
    if not username and 'test_users' in site_config:
        test_user = site_config['test_users'].get('admin', {})
        username = username or test_user.get('username')
        password = password or test_user.get('password')
    
    if not username or not password:
        print("Error: No username/password provided and no test user in config")
        return None
    
    cmd = [
        'aws', 'cognito-idp', 'admin-initiate-auth',
        '--user-pool-id', pool_id,
        '--client-id', client_id,
        '--auth-flow', 'ADMIN_USER_PASSWORD_AUTH',
        '--auth-parameters', f'USERNAME={username},PASSWORD={password}',
        '--region', site_config.get('region', 'us-east-1'),
        '--query', 'AuthenticationResult.AccessToken',
        '--output', 'text'
    ]
    
    print(f"Getting token for {username}...")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error getting token: {result.stderr}")
            return None
        token = result.stdout.strip()
        if token:
            print(f"✅ Got token (length: {len(token)})")
            return token
    except Exception as e:
        print(f"Error running AWS CLI: {e}")
    return None

def main():
    parser = argparse.ArgumentParser(description='Test JWT validation locally')
    parser.add_argument('--org', required=True,
                      help='Organization (must have config in .local/<org>/<env>/)')
    parser.add_argument('--env', default='stage', 
                      help='Environment (stage/prod)')
    parser.add_argument('--token', help='JWT token to validate')
    parser.add_argument('--get-token', action='store_true',
                      help='Get a token from Cognito')
    parser.add_argument('--username', help='Username for getting token')
    parser.add_argument('--password', help='Password for getting token')
    
    args = parser.parse_args()
    
    if args.get_token:
        token = get_token_from_cognito(args.org, args.env, args.username, args.password)
        if token:
            print(f"\nToken:\n{token}\n")
            print("Testing token validation...")
            test_jwt_validation(token, args.env, args.org)
    elif args.token:
        test_jwt_validation(args.token, args.env, args.org)
    else:
        print("Please provide either --token or --get-token")
        parser.print_help()

if __name__ == '__main__':
    main()