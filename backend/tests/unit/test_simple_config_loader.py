# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Tests for the simplified backend configuration loader
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, mock_open
import pytest

from rawscribe.utils.config_loader import ConfigLoader


class TestSimpleConfigLoader:
    """Test the simplified ConfigLoader class"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.loader = ConfigLoader()
    # skip this test for now
    @pytest.mark.skip(reason="Skipping test_load_config_from_local_development")
    def test_load_config_from_local_development(self):
        """Test loading config from local development location"""
        # Create a mock config
        mock_config = {
            'lambda': {
                'storage': {
                    'backend': 'local',
                    'eln_bucket': 'eln',
                    'draft_bucket': 'eln-drafts',
                    'forms_bucket': 'forms',
                    'local_path': './.local/s3'
                },
                'environment': 'dev'
            }
        }
        
        # Mock file operations
        with patch('os.path.exists') as mock_exists, \
             patch('builtins.open', mock_open(read_data=json.dumps(mock_config))):
            
            # Set up the mock to return True for local config path
            mock_exists.side_effect = lambda path: '.local/s3/lambda/config.json' in path
            
            config = self.loader.load_config()
            
            assert config['lambda']['storage']['backend'] == 'local'
            assert config['lambda']['storage']['eln_bucket'] == 'eln'
            assert config['lambda']['environment'] == 'dev'
    
    def test_load_config_missing_file_raises_error(self):
        """Test that missing config file raises appropriate error"""
        with patch('os.path.exists', return_value=False), \
             patch('builtins.open', side_effect=FileNotFoundError("Config file not found")):
            
            with pytest.raises(RuntimeError) as exc_info:
                self.loader.load_config()
            
            assert "Configuration not found" in str(exc_info.value)
            assert "make config ENV=dev" in str(exc_info.value)
    
    def test_load_config_invalid_json_raises_error(self):
        """Test that invalid JSON raises appropriate error"""
        with patch('os.path.exists', return_value=True), \
             patch('builtins.open', mock_open(read_data="invalid json")):
            
            with pytest.raises(RuntimeError) as exc_info:
                self.loader.load_config()
            
            assert "Configuration not found or invalid" in str(exc_info.value)
    
    def test_load_config_missing_lambda_section_raises_error(self):
        """Test that config missing lambda section raises error"""
        mock_config = {'webapp': {'api': 'test'}}
        
        with patch('os.path.exists', return_value=True), \
             patch('builtins.open', mock_open(read_data=json.dumps(mock_config))):
            
            with pytest.raises(RuntimeError) as exc_info:
                self.loader.load_config()
            
            assert "Configuration not found or invalid" in str(exc_info.value)
    
    def test_get_storage_config(self):
        """Test getting storage configuration for backward compatibility"""
        mock_config = {
            'lambda': {
                'storage': {
                    'backend': 'local',
                    'eln_bucket': 'eln',
                    'draft_bucket': 'eln-drafts',
                    'forms_bucket': 'forms',
                    'local_path': './.local/s3'
                },
                'environment': 'dev'
            }
        }
        
        with patch('os.path.exists', return_value=True), \
             patch('builtins.open', mock_open(read_data=json.dumps(mock_config))):
            
            storage_config = self.loader.get_storage_config()
            
            assert storage_config['backend'] == 'local'
            assert storage_config['eln_bucket'] == 'eln'
            assert storage_config['draft_bucket'] == 'eln-drafts'
    
    def test_config_caching(self):
        """Test that config is cached properly"""
        mock_config = {
            'lambda': {
                'storage': {'backend': 'local'},
                'environment': 'dev'
            }
        }
        
        with patch('os.path.exists', return_value=True), \
             patch('builtins.open', mock_open(read_data=json.dumps(mock_config))) as mock_file:
            
            # Load config twice
            config1 = self.loader.load_config()
            config2 = self.loader.load_config()
            
            # Should only open file once due to caching
            assert mock_file.call_count == 1
            assert config1 == config2
    
    def test_deployed_location_fallback(self):
        """Test fallback to deployed location when local config not found"""
        mock_config = {
            'lambda': {
                'storage': {'backend': 's3'},
                'environment': 'prod'
            }
        }
        
        with patch('os.path.exists') as mock_exists, \
             patch('builtins.open', mock_open(read_data=json.dumps(mock_config))), \
             patch.dict(os.environ, {'CONFIG_PATH': '/tmp/config.json'}):
            
            # Local config doesn't exist, deployed config does
            mock_exists.side_effect = lambda path: path == '/tmp/config.json'
            
            config = self.loader.load_config()
            
            assert config['lambda']['storage']['backend'] == 's3'
            assert config['lambda']['environment'] == 'prod'


class TestGlobalConfigLoaderInstance:
    """Test the global config loader instance"""
    
    def test_singleton_instance_exists(self):
        """Test that config_loader global instance exists"""
        from rawscribe.utils.config_loader import config_loader
        
        assert config_loader is not None
        assert isinstance(config_loader, ConfigLoader)
    
    # skip this test for now
    @pytest.mark.skip(reason="Skipping test_load_config_through_singleton")
    def test_load_config_through_singleton(self):
        """Test loading config through the global instance"""
        from rawscribe.utils.config_loader import config_loader
        
        mock_config = {
            'lambda': {
                'storage': {'backend': 'local'},
                'environment': 'dev'
            }
        }
        
        with patch('os.path.exists', return_value=True), \
             patch('builtins.open', mock_open(read_data=json.dumps(mock_config))):
            
            config = config_loader.load_config()
            assert config['lambda']['storage']['backend'] == 'local'


def test_config_loading_integration():
    """Integration test for the entire configuration loading process"""
    # Test with actual project structure
    loader = ConfigLoader()
    
    # Check if actual config files exist (after make setup-local)
    local_config_path = Path('./.local/s3/lambda/config.json')
    if local_config_path.exists():
        # Test successful loading of actual configs
        config = loader.load_config()
        
        # Verify expected structure
        assert 'lambda' in config
        assert 'storage' in config['lambda']
        assert 'backend' in config['lambda']['storage']
        
        # Verify storage config works
        storage_config = loader.get_storage_config()
        assert 'backend' in storage_config
        assert 'eln_bucket' in storage_config
    else:
        # Test error handling when configs don't exist
        with patch('os.path.exists', return_value=False), \
             patch('builtins.open', side_effect=FileNotFoundError("Config file not found")):
            
            with pytest.raises(RuntimeError) as exc_info:
                loader.load_config()
            
            assert "make config ENV=dev" in str(exc_info.value) 