#!/usr/bin/env python
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Automated regression tests for JWT authentication
Tests both local validation and AWS Lambda endpoints
"""

import os
import sys
import json
import subprocess
import time
import unittest
from pathlib import Path
from typing import Optional, Dict

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

class JWTAuthenticationTests(unittest.TestCase):
    """Regression tests for JWT authentication"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment - dynamically discover AWS resources"""
        import subprocess
        
        cls.test_configs = {}
        cls.env = os.environ.get('ENV', 'stage')
        cls.region = 'us-east-1'
        
        # Discover resources for each organization from config files
        import glob
        config_pattern = f"infra/.config/lambda/{cls.env}-*.json"
        config_files = glob.glob(config_pattern)
        
        for config_file in config_files:
            # Extract org from filename (e.g., stage-pwb.json -> pwb)
            org = os.path.basename(config_file).replace(f'{cls.env}-', '').replace('.json', '')
            
            # Skip generic configs
            if org == cls.env or org in ['dev', 'test', 'prod', 'stage']:
                continue
            
            # Load config to get test credentials
            try:
                with open(config_file, 'r') as f:
                    site_config = json.load(f)
            except Exception as e:
                print(f"Warning: Could not load config for {org}: {e}")
                continue
            
            # Get test credentials from config or environment
            if 'test_users' in site_config and 'admin' in site_config['test_users']:
                username = site_config['test_users']['admin'].get('username')
                password = site_config['test_users']['admin'].get('password')
            else:
                # Fall back to environment variables
                username = os.environ.get(f'{org.upper()}_TEST_USER')
                password = os.environ.get(f'{org.upper()}_TEST_PASSWORD')
            
            if not username or not password:
                print(f"Warning: No test credentials found for {org}")
                continue
            # Get Cognito config from site config
            pool_id = site_config.get('lambda', {}).get('auth', {}).get('cognito', {}).get('userPoolId')
            client_id = site_config.get('lambda', {}).get('auth', {}).get('cognito', {}).get('clientId')
            
            # If not in config, try to discover from AWS
            if not pool_id:
                pool_name = f"rawscribe-{cls.env}-{org}-userpool"
                cmd = ['aws', 'cognito-idp', 'list-user-pools', '--max-results', '60',
                       '--query', f"UserPools[?contains(Name,'{pool_name}')].Id | [0]",
                       '--output', 'text', '--region', cls.region]
                try:
                    pool_id = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
                    if pool_id == 'None':
                        pool_id = None
                except subprocess.CalledProcessError:
                    pool_id = None
            
            # Get Client ID if we have pool but no client
            if pool_id and not client_id:
                cmd = ['aws', 'cognito-idp', 'list-user-pool-clients',
                       '--user-pool-id', pool_id,
                       '--query', 'UserPoolClients[0].ClientId',
                       '--output', 'text', '--region', cls.region]
                try:
                    client_id = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
                except subprocess.CalledProcessError:
                    client_id = None
            
            # Get API Gateway URL from config or discover
            api_url = site_config.get('api_gateway', {}).get('endpoint')
            if not api_url:
                api_name = f"rawscribe-{cls.env}-{org}-api"
                cmd = ['aws', 'apigateway', 'get-rest-apis',
                       '--query', f"items[?name=='{api_name}'].id | [0]",
                       '--output', 'text', '--region', cls.region]
                try:
                    api_id = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
                    if api_id and api_id != 'None':
                        api_url = f"https://{api_id}.execute-api.{cls.region}.amazonaws.com/{cls.env}"
                except subprocess.CalledProcessError:
                    api_url = None
            
            cls.test_configs[org] = {
                'pool_id': pool_id,
                'client_id': client_id,
                'username': username,
                'password': password,
                'api_url': api_url,
                'region': cls.region
            }
            
            if pool_id and client_id and api_url:
                print(f"✓ Found {org.upper()} resources")
            else:
                print(f"✗ Missing {org.upper()} resources: pool={bool(pool_id)}, client={bool(client_id)}, api={bool(api_url)}")
    
    def get_cognito_token(self, org: str, token_type: str = 'AccessToken') -> Optional[str]:
        """Get JWT token from Cognito"""
        config = self.test_configs[org]
        
        if not config['pool_id'] or not config['client_id']:
            self.skipTest(f"Cognito resources not found for {org}")
            return None
        
        cmd = [
            'aws', 'cognito-idp', 'admin-initiate-auth',
            '--user-pool-id', config['pool_id'],
            '--client-id', config['client_id'],
            '--auth-flow', 'ADMIN_USER_PASSWORD_AUTH',
            '--auth-parameters', f'USERNAME={config["username"]},PASSWORD={config["password"]}',
            '--region', config['region'],
            '--query', f'AuthenticationResult.{token_type}',
            '--output', 'text'
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=10)
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            self.fail(f"Failed to get token for {org}: {e.stderr}")
        except subprocess.TimeoutExpired:
            self.fail(f"Timeout getting token for {org}")
    
    def test_cognito_token_generation(self):
        """Test that we can generate tokens for all configured organizations"""
        for org in self.test_configs.keys():
            with self.subTest(org=org):
                token = self.get_cognito_token(org, 'AccessToken')
                self.assertIsNotNone(token)
                self.assertTrue(token.startswith('eyJ'))  # JWT format
                
                # Check ID token too
                id_token = self.get_cognito_token(org, 'IdToken')
                self.assertIsNotNone(id_token)
                self.assertTrue(id_token.startswith('eyJ'))
    
    def test_local_jwt_validation(self):
        """Test local JWT validation without AWS"""
        for org in ['uga', 'pwb']:
            with self.subTest(org=org):
                # Set up environment
                config = self.test_configs[org]
                os.environ['ENV'] = 'stage'
                os.environ['COGNITO_REGION'] = config['region']
                os.environ['COGNITO_USER_POOL_ID'] = config['pool_id']
                os.environ['COGNITO_CLIENT_ID'] = config['client_id']
                
                # Get token
                token = self.get_cognito_token(org, 'AccessToken')
                
                # Import after env vars set
                from rawscribe.utils.auth import AuthValidator, AuthError
                
                # Create validator
                auth_config = {
                    'lambda': {
                        'auth': {
                            'provider': 'cognito',
                            'required': True,
                            'cognito': {
                                'region': config['region'],
                                'userPoolId': config['pool_id'],
                                'clientId': config['client_id']
                            }
                        }
                    }
                }
                
                validator = AuthValidator(auth_config)
                
                # Validate token
                try:
                    user = validator.validate_token(token)
                    self.assertIsNotNone(user)
                    self.assertIsNotNone(user.username)
                    self.assertNotIn('-', user.username)  # No hyphens allowed!
                    self.assertIsNotNone(user.id)
                    self.assertEqual(user.groups, ['user'])  # Default group
                except AuthError as e:
                    self.fail(f"Token validation failed for {org}: {e}")
    
    def test_username_hyphen_replacement(self):
        """Test that hyphens in usernames are replaced with underscores"""
        os.environ['ENV'] = 'stage'
        
        from rawscribe.utils.auth import AuthValidator
        
        # Create validator using config from test setup - use first available org
        if not self.test_configs:
            self.skipTest("No organizations configured for testing")
        
        # Get first org with valid config
        org_config = None
        test_org = None
        for org, config in self.test_configs.items():
            if config.get('pool_id') and config.get('client_id'):
                org_config = config
                test_org = org
                break
        
        if not org_config:
            self.skipTest("No Cognito configuration available for testing")
        
        # Set environment variables for auth validator
        os.environ['COGNITO_REGION'] = org_config['region']
        os.environ['COGNITO_USER_POOL_ID'] = org_config['pool_id']
        os.environ['COGNITO_CLIENT_ID'] = org_config['client_id']
        
        auth_config = {
            'lambda': {'auth': {'provider': 'cognito', 'required': True, 'cognito': {
                'region': org_config['region'],
                'userPoolId': org_config['pool_id'],
                'clientId': org_config['client_id']
            }}}
        }
        
        validator = AuthValidator(auth_config)
        token = self.get_cognito_token(test_org, 'AccessToken')
        
        user = validator.validate_token(token)
        
        # Username should have underscores, not hyphens
        self.assertNotIn('-', user.username)
        self.assertIn('_', user.username)  # UUID format with underscores
    
    def test_aws_health_endpoints(self):
        """Test that health endpoints work without authentication"""
        import requests
        
        for org in ['uga', 'pwb']:
            with self.subTest(org=org):
                config = self.test_configs[org]
                
                if not config['api_url']:
                    self.skipTest(f"API Gateway not found for {org}")
                    continue
                
                url = f"{config['api_url']}/"
                
                try:
                    response = requests.get(url, timeout=10)
                    self.assertEqual(response.status_code, 200)
                    data = response.json()
                    self.assertEqual(data['status'], 'healthy')
                    self.assertIn('CLAIRE API', data['message'])
                except requests.RequestException as e:
                    self.fail(f"Health check failed for {org}: {e}")
    
    def test_aws_protected_endpoints(self):
        """Test that protected endpoints require valid JWT"""
        import requests
        
        for org in ['uga', 'pwb']:
            with self.subTest(org=org):
                config = self.test_configs[org]
                
                if not config['api_url']:
                    self.skipTest(f"API Gateway not found for {org}")
                    continue
                    
                url = f"{config['api_url']}/api/config/private"
                
                # Test without token - should fail
                response = requests.get(url, timeout=10)
                self.assertEqual(response.status_code, 403)
                
                # Test with valid token - should succeed
                token = self.get_cognito_token(org, 'AccessToken')
                if token:  # Only test if token was obtained
                    headers = {'Authorization': f'Bearer {token}'}
                    response = requests.get(url, headers=headers, timeout=10)
                    self.assertEqual(response.status_code, 200)
                    
                    # Verify response contains config
                    data = response.json()
                    self.assertIn('lambda', data)
                    self.assertIn('auth', data['lambda'])
    
    def test_token_expiry_handling(self):
        """Test that expired tokens are rejected"""
        # This would require mocking time or waiting for token expiry
        # For now, test with invalid token
        import requests
        
        for org in ['uga', 'pwb']:
            with self.subTest(org=org):
                config = self.test_configs[org]
                url = f"{config['api_url']}/api/config/private"
                
                # Test with invalid token
                headers = {'Authorization': 'Bearer invalid.token.here'}
                response = requests.get(url, headers=headers, timeout=10)
                self.assertEqual(response.status_code, 401)
                
                # Verify error message
                data = response.json()
                self.assertIn('detail', data)
                self.assertIn('Invalid', data['detail'])
    
    def test_cross_org_isolation(self):
        """Test that tokens from one org don't work with another"""
        import requests
        
        # Find two orgs with deployed resources
        orgs_with_apis = [(org, cfg) for org, cfg in self.test_configs.items() 
                          if cfg.get('api_url') and cfg.get('pool_id')]
        
        if len(orgs_with_apis) < 2:
            self.skipTest("Need at least 2 organizations with deployed resources for isolation test")
        
        # Use first two available orgs
        org1, config1 = orgs_with_apis[0]
        org2, config2 = orgs_with_apis[1]
        
        # Get token from first org
        org1_token = self.get_cognito_token(org1, 'AccessToken')
        
        if org1_token:  # Only test if token was obtained
            # Try to use org1 token with org2 endpoint
            org2_url = f"{config2['api_url']}/api/config/private"
            headers = {'Authorization': f'Bearer {org1_token}'}
            
            response = requests.get(org2_url, headers=headers, timeout=10)
            
            # Should fail - wrong user pool
            self.assertIn(response.status_code, [401, 403],
                         f"Token from {org1} should not work with {org2} endpoint")

class LocalDevelopmentTests(unittest.TestCase):
    """Tests for local development tools"""
    
    def test_local_test_script_exists(self):
        """Test that local JWT test script exists and is executable"""
        script_path = Path(__file__).parent / 'test_jwt_local.py'
        self.assertTrue(script_path.exists(), "test_jwt_local.py should exist")
        
        # Test script can be imported
        import importlib.util
        spec = importlib.util.spec_from_file_location("test_jwt_local", script_path)
        self.assertIsNotNone(spec)
    
    def test_requirements_files(self):
        """Test that correct requirements file is used"""
        lambda_req = Path(__file__).parent / 'rawscribe/requirements-lambda.txt'
        self.assertTrue(lambda_req.exists(), "requirements-lambda.txt should exist")
        
        # Check it contains necessary JWT libraries
        content = lambda_req.read_text()
        self.assertIn('PyJWT', content)
        self.assertIn('boto3', content)
        self.assertIn('fastapi', content)

def run_tests(verbose=True):
    """Run all regression tests"""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(JWTAuthenticationTests))
    suite.addTests(loader.loadTestsFromTestCase(LocalDevelopmentTests))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2 if verbose else 1)
    result = runner.run(suite)
    
    return result.wasSuccessful()

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='JWT Authentication Regression Tests')
    parser.add_argument('--skip-aws', action='store_true',
                      help='Skip AWS endpoint tests (for local development)')
    parser.add_argument('--org',
                      help='Test specific organization only (must have config file)')
    parser.add_argument('-v', '--verbose', action='store_true',
                      help='Verbose output')
    
    args = parser.parse_args()
    
    if args.skip_aws:
        # Remove AWS test methods
        del JWTAuthenticationTests.test_aws_health_endpoints
        del JWTAuthenticationTests.test_aws_protected_endpoints
        del JWTAuthenticationTests.test_cross_org_isolation
    
    success = run_tests(verbose=args.verbose)
    sys.exit(0 if success else 1)
