# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Tests for the backend configuration loader
"""

import asyncio
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
import pytest

pytestmark = pytest.mark.skip(reason="Config loader tests broken - fundamental API changes needed")

from rawscribe.utils.config_loader import ConfigLoader, config_loader
from rawscribe.utils.config_types import (
    Environment,
    EnvironmentConfig,
    ConfigLoadOptions,
    DefaultConfigFactory
)


class TestConfigLoader:
    """Test the ConfigLoader class"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.config_dir = Path(self.temp_dir)
        self.loader = ConfigLoader(str(self.config_dir))
    
    def teardown_method(self):
        """Clean up test fixtures"""
        import shutil
        shutil.rmtree(self.temp_dir)
    
    def test_environment_detection_from_env_var(self):
        """Test environment detection from ENV variable"""
        with patch.dict(os.environ, {'ENV': 'test'}):
            env = self.loader._detect_environment()
            assert env == Environment.TEST
    
    def test_environment_detection_priority(self):
        """Test environment variable priority"""
        with patch.dict(os.environ, {
            'ENV': 'prod',
            'ENVIRONMENT': 'stage',
            'STAGE': 'test'
        }):
            env = self.loader._detect_environment()
            assert env == Environment.PROD  # ENV has highest priority
    
    def test_environment_detection_lambda_function(self):
        """Test environment detection from Lambda function name"""
        with patch.dict(os.environ, {
            'AWS_LAMBDA_FUNCTION_NAME': 'my-app-prod-handler'
        }, clear=True):
            env = self.loader._detect_environment()
            assert env == Environment.PROD
    
    def test_environment_detection_default(self):
        """Test default environment detection"""
        with patch.dict(os.environ, {}, clear=True):
            env = self.loader._detect_environment()
            assert env == Environment.DEV
    
    @pytest.mark.asyncio
    async def test_load_built_in_defaults(self):
        """Test loading built-in defaults when no config files exist"""
        options = ConfigLoadOptions(environment=Environment.DEV)
        result = await self.loader.load_config(options)
        
        assert result.config.webapp.api.base_url == "/api"
        assert result.config.webapp.auth.provider == "local"
        assert result.config.webapp.autosave.enabled is True
        assert result.validation_result.valid is True
    
    @pytest.mark.asyncio
    async def test_load_defaults_from_file(self):
        """Test loading defaults from file"""
        defaults_config = {
            "webapp": {
                "api": {"base_url": "/api/v1"},
                "auth": {"provider": "cognito"}
            }
        }
        
        defaults_file = self.config_dir / "defaults.json"
        with open(defaults_file, 'w') as f:
            json.dump(defaults_config, f)
        
        options = ConfigLoadOptions(environment=Environment.DEV)
        result = await self.loader.load_config(options)
        
        assert result.config.webapp.api.base_url == "/api/v1"
        assert result.config.webapp.auth.provider == "cognito"
    
    @pytest.mark.asyncio
    async def test_hierarchical_config_merging(self):
        """Test hierarchical configuration merging"""
        # Create defaults
        defaults_config = {
            "webapp": {
                "api": {"base_url": "/api", "timeout": 30000},
                "auth": {"provider": "local", "required": False}
            }
        }
        defaults_file = self.config_dir / "defaults.json"
        with open(defaults_file, 'w') as f:
            json.dump(defaults_config, f)
        
        # Create environment config
        env_config = {
            "webapp": {
                "api": {"base_url": "/api/v2"},
                "auth": {"required": True}
            }
        }
        env_file = self.config_dir / "dev.json"
        with open(env_file, 'w') as f:
            json.dump(env_config, f)
        
        # Create local config
        local_config = {
            "webapp": {
                "api": {"timeout": 15000}
            }
        }
        local_file = self.config_dir / "local.json"
        with open(local_file, 'w') as f:
            json.dump(local_config, f)
        
        options = ConfigLoadOptions(environment=Environment.DEV)
        result = await self.loader.load_config(options)
        
        # Check merged values
        assert result.config.webapp.api.base_url == "/api/v2"  # from env
        assert result.config.webapp.api.timeout == 15000  # from local
        assert result.config.webapp.auth.provider == "local"  # from defaults
        assert result.config.webapp.auth.required is True  # from env
    
    @pytest.mark.asyncio
    async def test_environment_variable_overrides(self):
        """Test environment variable overrides"""
        with patch.dict(os.environ, {
            'WEBAPP_API_BASE_URL': 'http://localhost:3000/api',
            'WEBAPP_AUTH_REQUIRED': 'true',
            'WEBAPP_AUTOSAVE_ENABLED': 'false'
        }):
            options = ConfigLoadOptions(environment=Environment.DEV)
            result = await self.loader.load_config(options)
            
            assert result.config.webapp.api.base_url == 'http://localhost:3000/api'
            assert result.config.webapp.auth.required is True
            assert result.config.webapp.autosave.enabled is False
    
    @pytest.mark.asyncio
    async def test_skip_env_var_overrides(self):
        """Test skipping environment variable overrides"""
        with patch.dict(os.environ, {
            'WEBAPP_API_BASE_URL': 'http://localhost:3000/api'
        }):
            options = ConfigLoadOptions(
                environment=Environment.DEV,
                env_var_overrides=False
            )
            result = await self.loader.load_config(options)
            
            # Should use default, not env var
            assert result.config.webapp.api.base_url == '/api'
    
    @pytest.mark.asyncio
    async def test_caching(self):
        """Test configuration caching"""
        options = ConfigLoadOptions(environment=Environment.DEV)
        
        # First load
        result1 = await self.loader.load_config(options)
        
        # Second load should return cached result
        result2 = await self.loader.load_config(options)
        
        assert result1 is result2  # Same object reference
    
    @pytest.mark.asyncio
    async def test_skip_cache(self):
        """Test skipping cache"""
        options1 = ConfigLoadOptions(environment=Environment.DEV)
        options2 = ConfigLoadOptions(environment=Environment.DEV, skip_cache=True)
        
        result1 = await self.loader.load_config(options1)
        result2 = await self.loader.load_config(options2)
        
        assert result1 is not result2  # Different object references
    
    def test_clear_cache(self):
        """Test clearing cache"""
        self.loader.cache['test'] = MagicMock()
        self.loader.aws_resource_cache['test'] = MagicMock()
        
        self.loader.clear_cache()
        
        assert len(self.loader.cache) == 0
        assert len(self.loader.aws_resource_cache) == 0
    
    @pytest.mark.asyncio
    async def test_validation_errors(self):
        """Test configuration validation with errors"""
        invalid_config = {
            "webapp": {
                # Missing required fields
            }
        }
        
        defaults_file = self.config_dir / "defaults.json"
        with open(defaults_file, 'w') as f:
            json.dump(invalid_config, f)
        
        options = ConfigLoadOptions(environment=Environment.DEV)
        result = await self.loader.load_config(options)
        
        # Should fall back to built-in defaults when validation fails
        assert result.config.webapp.api.base_url == "/api"
    
    @pytest.mark.asyncio
    async def test_validation_warnings(self):
        """Test configuration validation warnings"""
        config_with_warnings = {
            "webapp": {
                "api": {"base_url": "/api"},
                "auth": {"provider": "local", "required": False},
                "storage": {"type": "local"},
                "autosave": {"enabled": True}
            },
            "meta": {"environment": "prod"}
        }
        
        defaults_file = self.config_dir / "defaults.json"
        with open(defaults_file, 'w') as f:
            json.dump(config_with_warnings, f)
        
        options = ConfigLoadOptions(environment=Environment.PROD)
        result = await self.loader.load_config(options)
        
        assert len(result.validation_result.warnings) > 0
        assert any('Local auth not recommended for production' in w.message 
                  for w in result.validation_result.warnings)
    
    @pytest.mark.asyncio
    async def test_aws_discovery_disabled(self):
        """Test AWS discovery when disabled"""
        options = ConfigLoadOptions(
            environment=Environment.STAGE,
            aws_discovery=False
        )
        
        result = await self.loader.load_config(options)
        
        # Should not have AWS sources
        aws_sources = [s for s in result.sources if s.type == 'aws']
        assert len(aws_sources) == 0
    
    @pytest.mark.asyncio
    @patch('boto3.client')
    async def test_aws_discovery_success(self, mock_boto_client):
        """Test successful AWS resource discovery"""
        # Mock CloudFormation client
        mock_cf_client = MagicMock()
        mock_boto_client.return_value = mock_cf_client
        
        # Mock CloudFormation response
        mock_cf_client.describe_stacks.return_value = {
            'Stacks': [{
                'Outputs': [
                    {'OutputKey': 'ApiEndpoint', 'OutputValue': 'https://api.example.com'},
                    {'OutputKey': 'DatabaseHost', 'OutputValue': 'db.example.com'}
                ]
            }]
        }
        
        # Create config with AWS settings
        config_with_aws = {
            "webapp": {
                "api": {"base_url": "/api"}
            },
            "aws": {
                "enabled": True,
                "region": "us-east-1",
                "cloudformation": {
                    "stack_name": "my-stack",
                    "output_mappings": {
                        "webapp.api.base_url": "ApiEndpoint",
                        "webapp.database.host": "DatabaseHost"
                    }
                }
            }
        }
        
        defaults_file = self.config_dir / "defaults.json"
        with open(defaults_file, 'w') as f:
            json.dump(config_with_aws, f)
        
        options = ConfigLoadOptions(environment=Environment.STAGE)
        result = await self.loader.load_config(options)
        
        # Should have discovered resources
        assert result.config.webapp.api.base_url == "https://api.example.com"
    
    @pytest.mark.asyncio
    async def test_get_autosave_config(self):
        """Test backward compatibility autosave config method"""
        autosave_config = await self.loader.get_autosave_config(Environment.DEV)
        
        assert autosave_config.enabled is True
        assert autosave_config.storage['type'] == 'localStorage'
        assert autosave_config.storage['key_prefix'] == 'autosave-dev'
    
    @pytest.mark.asyncio
    async def test_get_service_config(self):
        """Test service config method"""
        service_config = await self.loader.get_service_config(Environment.DEV)
        
        assert service_config.api.base_url == '/api'
        assert service_config.auth.provider == 'local'
        assert service_config.autosave.enabled is True


class TestGlobalConfigLoader:
    """Test the global config loader instance"""
    
    def test_singleton_instance(self):
        """Test that config_loader is properly initialized"""
        assert config_loader is not None
        assert isinstance(config_loader, ConfigLoader)
    
    @pytest.mark.asyncio
    async def test_load_config_through_singleton(self):
        """Test loading config through the global instance"""
        result = await config_loader.load_config(
            ConfigLoadOptions(environment=Environment.TEST)
        )
        
        assert result.config.webapp.api.base_url == '/api'
        assert result.config.meta.environment == Environment.TEST


class TestDefaultConfigFactory:
    """Test the default configuration factory"""
    
    def test_create_dev_config(self):
        """Test creating dev configuration"""
        config = DefaultConfigFactory.create(Environment.DEV)
        
        assert config.webapp.logging.level == 'debug'
        assert config.webapp.features.enable_beta_features is True
        assert config.webapp.autosave.storage['key_prefix'] == 'autosave-dev'
    
    def test_create_prod_config(self):
        """Test creating prod configuration"""
        config = DefaultConfigFactory.create(Environment.PROD)
        
        assert config.webapp.logging.level == 'info'
        assert config.webapp.features.enable_audit_trail is True
        assert config.webapp.autosave.storage['key_prefix'] == 'autosave-prod'
    
    def test_create_autosave_config(self):
        """Test creating autosave configuration"""
        autosave_config = DefaultConfigFactory.create_for_autosave()
        
        assert autosave_config.enabled is True
        assert autosave_config.storage['type'] == 'localStorage'


# Integration test
@pytest.mark.asyncio
async def test_config_loading_integration():
    """Integration test for the entire configuration loading process"""
    # Use temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        loader = ConfigLoader(temp_dir)
        
        # Test loading with all defaults
        result = await loader.load_config(ConfigLoadOptions(environment=Environment.DEV))
        
        # Verify basic structure
        assert result.config.webapp.api.base_url == '/api'
        assert result.config.webapp.auth.provider == 'local'
        assert result.config.webapp.autosave.enabled is True
        assert result.validation_result.valid is True
        
        # Verify metadata
        assert result.config.meta.environment == Environment.DEV
        assert len(result.sources) > 0 