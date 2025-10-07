# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Tests for authentication provider system
"""
import os
import pytest
from unittest.mock import patch, MagicMock

from rawscribe.utils.auth_providers import (
    AuthProviderFactory,
    CognitoProvider,
    JWTProvider
)


class TestAuthProviderFactory:
    """Test auth provider factory"""
    
    def test_create_cognito_provider(self):
        """Should create Cognito provider when configured"""
        config = {
            'lambda': {
                'auth': {
                    'provider': 'cognito',
                    'cognito': {
                        'region': 'us-east-1',
                        'userPoolId': 'us-east-1_TEST123',
                        'clientId': 'testclient123'
                    }
                }
            }
        }
        
        provider = AuthProviderFactory.create(config)
        
        assert isinstance(provider, CognitoProvider)
        assert provider.provider_name == 'cognito'
    
    def test_create_jwt_provider(self):
        """Should create JWT provider when configured"""
        config = {
            'lambda': {
                'auth': {
                    'provider': 'jwt',
                    'jwt': {
                        'secret': 'test-secret',
                        'algorithm': 'HS256'
                    }
                }
            }
        }
        
        provider = AuthProviderFactory.create(config)
        
        assert isinstance(provider, JWTProvider)
        assert provider.provider_name == 'jwt'
    
    def test_create_defaults_to_jwt(self):
        """Should default to JWT provider if not specified"""
        config = {'lambda': {}}
        
        provider = AuthProviderFactory.create(config)
        
        assert isinstance(provider, JWTProvider)
    
    def test_create_unknown_provider_raises(self):
        """Should raise ValueError for unknown provider"""
        config = {
            'lambda': {
                'auth': {
                    'provider': 'ldap'
                }
            }
        }
        
        with pytest.raises(ValueError, match='Unknown auth provider: ldap'):
            AuthProviderFactory.create(config)


class TestCognitoProvider:
    """Test Cognito provider"""
    
    def test_prefers_environment_variables(self):
        """Should prefer environment variables over config file"""
        config = {
            'lambda': {
                'auth': {
                    'cognito': {
                        'region': 'us-west-2',
                        'userPoolId': 'us-west-2_OLD123',
                        'clientId': 'oldclient123'
                    }
                }
            }
        }
        
        with patch.dict(os.environ, {
            'COGNITO_REGION': 'us-east-1',
            'COGNITO_USER_POOL_ID': 'us-east-1_NEW456',
            'COGNITO_CLIENT_ID': 'newclient456'
        }):
            provider = CognitoProvider(config)
            
            # Should use environment variables
            assert provider.get_region() == 'us-east-1'
            assert provider.get_user_pool_id() == 'us-east-1_NEW456'
            assert provider.get_client_id() == 'newclient456'
    
    def test_falls_back_to_config_file(self):
        """Should fall back to config file when env vars not set"""
        config = {
            'lambda': {
                'auth': {
                    'cognito': {
                        'region': 'us-west-2',
                        'userPoolId': 'us-west-2_CFG123',
                        'clientId': 'cfgclient123'
                    }
                }
            }
        }
        
        # Clear any existing env vars
        with patch.dict(os.environ, {}, clear=True):
            provider = CognitoProvider(config)
            
            # Should use config file
            assert provider.get_region() == 'us-west-2'
            assert provider.get_user_pool_id() == 'us-west-2_CFG123'
            assert provider.get_client_id() == 'cfgclient123'
    
    def test_get_config_returns_public_data(self):
        """Should return public config without secrets"""
        config = {
            'lambda': {
                'auth': {
                    'cognito': {
                        'region': 'us-east-1',
                        'userPoolId': 'us-east-1_TEST',
                        'clientId': 'testclient'
                    }
                }
            }
        }
        
        with patch.dict(os.environ, {}, clear=True):
            provider = CognitoProvider(config)
            runtime_config = provider.get_config()
            
            assert runtime_config['userPoolId'] == 'us-east-1_TEST'
            assert runtime_config['clientId'] == 'testclient'
            assert runtime_config['region'] == 'us-east-1'
            assert runtime_config['source'] == 'config_file'
    
    def test_config_source_environment(self):
        """Should indicate source as environment when using env vars"""
        config = {'lambda': {'auth': {'cognito': {}}}}
        
        with patch.dict(os.environ, {
            'COGNITO_USER_POOL_ID': 'us-east-1_ENV'
        }):
            provider = CognitoProvider(config)
            runtime_config = provider.get_config()
            
            assert runtime_config['source'] == 'environment'


class TestJWTProvider:
    """Test JWT provider"""
    
    def test_get_config_returns_public_data(self):
        """Should return public config without secret key"""
        config = {
            'lambda': {
                'auth': {
                    'jwt': {
                        'secret': 'super-secret-key',
                        'algorithm': 'HS256',
                        'issuer': 'test-issuer',
                        'audience': 'test-audience',
                        'mockUsers': [
                            {'username': 'user1'},
                            {'username': 'user2'}
                        ]
                    }
                }
            }
        }
        
        provider = JWTProvider(config)
        runtime_config = provider.get_config()
        
        # Should NOT include secret
        assert 'secret' not in runtime_config
        
        # Should include public info
        assert runtime_config['algorithm'] == 'HS256'
        assert runtime_config['issuer'] == 'test-issuer'
        assert runtime_config['audience'] == 'test-audience'
        assert runtime_config['mockUsers'] == 2  # Count only, not user data
        assert runtime_config['source'] == 'config_file'
    
    def test_no_user_pool_concept(self):
        """JWT provider should return None for user pool methods"""
        config = {'lambda': {'auth': {'jwt': {}}}}
        
        provider = JWTProvider(config)
        
        assert provider.get_user_pool_id() is None
        assert provider.get_client_id() is None
        assert provider.get_region() == 'local'


class TestConfigLoaderIntegration:
    """Test config_loader integration with auth providers"""
    
    def test_get_auth_provider_returns_singleton(self):
        """Should return same provider instance on multiple calls"""
        from rawscribe.utils.config_loader import config_loader
        
        # Clear any cached provider
        config_loader.clear_cache()
        
        with patch.object(config_loader, 'load_config', return_value={
            'lambda': {'auth': {'provider': 'jwt', 'jwt': {}}}
        }):
            provider1 = config_loader.get_auth_provider()
            provider2 = config_loader.get_auth_provider()
            
            assert provider1 is provider2  # Same instance
    
    def test_clear_cache_clears_provider(self):
        """Should clear provider when cache is cleared"""
        from rawscribe.utils.config_loader import config_loader
        
        with patch.object(config_loader, 'load_config', return_value={
            'lambda': {'auth': {'provider': 'jwt', 'jwt': {}}}
        }):
            provider1 = config_loader.get_auth_provider()
            config_loader.clear_cache()
            provider2 = config_loader.get_auth_provider()
            
            assert provider1 is not provider2  # Different instances

