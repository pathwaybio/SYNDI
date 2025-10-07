# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for authentication system (Cognito + JWT)
"""

import pytest
from unittest.mock import Mock, patch
from rawscribe.utils.auth import (
    User, AuthValidator, AuthError, 
    extract_user_from_token, generate_mock_token
)



class TestUser:
    """Test User model"""
    
    def test_user_initialization(self):
        user = User(
            id="test-1",
            email="test@example.com",
            username="test",
            name="Test User",
            groups=["user"],
            permissions=["view:own"],
            is_admin=False
        )
        
        assert user.id == "test-1"
        assert user.email == "test@example.com"
        assert user.username == "test"
        assert user.name == "Test User"
        assert user.groups == ["user"]
        assert user.permissions == ["view:own"]
        assert user.is_admin is False
    
    def test_has_permission(self):
        user = User(
            id="test-1",
            email="test@example.com",
            username="test",
            name="Test User",
            permissions=["view:own", "submit:SOP*"]
        )
        
        # Exact match
        assert user.has_permission("view:own") is True
        assert user.has_permission("submit:SOP-test") is True  # Wildcard match
        assert user.has_permission("admin:delete") is False
        
        # Test wildcard permissions
        admin_user = User(
            id="admin-1",
            email="admin@example.com",
            username="admin",
            name="Admin User",
            permissions=["*"]
        )
        assert admin_user.has_permission("any:permission") is True
    
    def test_is_in_group(self):
        user = User(
            id="test-1",
            email="test@example.com",
            username="test",
            name="Test User",
            groups=["user", "researcher"]
        )
        
        assert user.is_in_group("user") is True
        assert user.is_in_group("researcher") is True
        assert user.is_in_group("admin") is False
    
    def test_to_dict(self):
        user = User(
            id="test-1",
            email="test@example.com",
            username="test",
            name="Test User",
            groups=["user"],
            permissions=["view:own"],
            is_admin=False
        )
        
        user_dict = user.to_dict()
        expected = {
            'id': 'test-1',
            'email': 'test@example.com',
            'username': 'test',
            'name': 'Test User',
            'groups': ['user'],
            'permissions': ['view:own'],
            'isAdmin': False
        }
        
        assert user_dict == expected


class TestAuthValidator:
    """Test AuthValidator (JWT + Cognito )"""
    
    def setup_method(self):
        self.jwt_config = {
            'lambda': {
                'auth': {
                    'provider': 'jwt',
                    'jwt': {
                        'secret': 'test-secret',
                        'algorithm': 'HS256',
                        'mockUsers': [
                            {
                                'id': '1',
                                'email': 'admin@local.dev',
                                'username': 'admin',
                                'password': 'dev123',
                                'name': 'Admin User',
                                'groups': ['admin'],
                                'permissions': ['*'],
                                'isAdmin': True
                            }
                        ]
                    }
                }
            }
        }
    
    @patch('os.environ.get')
    @patch('rawscribe.utils.config_loader.config_loader.get_environment')
    def test_jwt_validator_initialization(self, mock_get_env, mock_env_get):
        """Test JWT provider initialization"""
        mock_get_env.return_value = 'dev'
        mock_env_get.return_value = None  # Not AWS
        
        validator = AuthValidator(self.jwt_config)
        assert validator.provider == 'jwt'
        assert validator.jwt_secret == 'test-secret'
        assert len(validator.mock_users) == 1
    
    @patch('os.environ.get')
    @patch('rawscribe.utils.config_loader.config_loader.get_environment')
    def test_aws_requires_cognito(self, mock_get_env, mock_env_get):
        """Test that AWS Lambda requires Cognito"""
        mock_get_env.return_value = 'stage'
        mock_env_get.return_value = 'AWS_Lambda_python3.9'  # AWS environment
        
        with pytest.raises(RuntimeError, match="AWS Lambda requires Cognito"):
            AuthValidator(self.jwt_config)
    
    @patch('os.environ.get')
    @patch('rawscribe.utils.config_loader.config_loader.get_environment')
    def test_dev_token_validation(self, mock_get_env, mock_env_get):
        """Test development token validation"""
        mock_get_env.return_value = 'dev'
        mock_env_get.return_value = None
        
        validator = AuthValidator(self.jwt_config)
        
        # Generate dev token
        import json
        import base64
        import time
        
        header = {'alg': 'HS256', 'typ': 'JWT', 'dev_mode': True}
        payload = {
            'sub': '1',
            'email': 'admin@local.dev',
            'username': 'admin',
            'name': 'Admin User',
            'groups': ['admin'],
            'permissions': ['*'],
            'isAdmin': True,
            'exp': int(time.time()) + 3600,
            'iat': int(time.time())
        }
        
        def base64url_encode(data):
            b64 = base64.b64encode(json.dumps(data).encode()).decode()
            return b64.replace('+', '-').replace('/', '_').replace('=', '')
        
        header_enc = base64url_encode(header)
        payload_enc = base64url_encode(payload)
        token = f"{header_enc}.{payload_enc}.fake-signature"
        
        user = validator.validate_token(token)
        assert user.id == "1"
        assert user.is_admin is True



class TestUtilityFunctions:
    """Test utility functions"""
    
    @patch('os.environ.get')
    @patch('rawscribe.utils.config_loader.config_loader.get_environment')
    def test_extract_user_from_token_success(self, mock_get_env, mock_env_get):
        mock_get_env.return_value = 'dev'
        mock_env_get.return_value = None
        
        config = {
            'lambda': {
                'auth': {
                    'provider': 'jwt',
                    'jwt': {'secret': 'test', 'algorithm': 'HS256', 'mockUsers': []}
                }
            }
        }
        validator = AuthValidator(config)
        
        # Create a dev token
        import json
        import base64
        import time
        
        header = {'alg': 'HS256', 'typ': 'JWT', 'dev_mode': True}
        payload = {
            'sub': '1',
            'email': 'test@test.com',
            'username': 'test',
            'name': 'Test',
            'groups': ['user'],
            'permissions': ['view:own'],
            'isAdmin': False,
            'exp': int(time.time()) + 3600,
            'iat': int(time.time())
        }
        
        def base64url_encode(data):
            b64 = base64.b64encode(json.dumps(data).encode()).decode()
            return b64.replace('+', '-').replace('/', '_').replace('=', '')
        
        token = f"{base64url_encode(header)}.{base64url_encode(payload)}.sig"
        user = extract_user_from_token(token, validator)
        
        assert user is not None
        assert user.id == "1"
    
    @patch('os.environ.get')
    @patch('rawscribe.utils.config_loader.config_loader.get_environment')
    def test_extract_user_from_token_failure(self, mock_get_env, mock_env_get):
        mock_get_env.return_value = 'dev'
        mock_env_get.return_value = None
        
        config = {
            'lambda': {
                'auth': {
                    'provider': 'jwt',
                    'jwt': {'secret': 'test', 'algorithm': 'HS256', 'mockUsers': []}
                }
            }
        }
        validator = AuthValidator(config)
        
        token = "invalid-token"
        user = extract_user_from_token(token, validator)
        
        assert user is None
    
    def test_generate_mock_token(self):
        token = generate_mock_token("testuser")
        
        assert token.startswith("mock-token-testuser-")
        parts = token.split("-")
        assert len(parts) == 4  # mock-token-{userid}-{timestamp}
    



if __name__ == "__main__":
    pytest.main([__file__]) 