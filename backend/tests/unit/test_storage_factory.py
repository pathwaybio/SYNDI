# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for Storage Factory Pattern
Tests dynamic backend switching and factory functionality
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
from pydantic import ValidationError

# Add backend to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from rawscribe.utils.storage_factory import (
    StorageManager, 
    create_storage_manager
)
from rawscribe.utils.config_types import StorageConfig
from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.storage_s3 import S3JSONStorage


class TestStorageFactory:
    """Test storage factory pattern and backend switching"""

    def test_local_backend_creation(self):
        """Test that local config creates local backends"""
        # Create local storage config
        config = StorageConfig(
            type='local',
            local_path='./test_local_storage',
            bucket_name='test-bucket'
        )
        
        # Create storage manager
        manager = StorageManager(config)
        
        # Verify backend types
        assert isinstance(manager.backend, LocalJSONStorage)
        
        # Verify config is passed correctly
        assert manager.backend.base_path.name == 'test_local_storage'
        assert manager.config == config

    @patch('rawscribe.utils.storage_s3.boto3.client')
    def test_s3_backend_creation_success(self, mock_boto3_client):
        """Test that S3 config creates S3 backends when AWS credentials are valid"""
        # Mock successful S3 client
        mock_s3 = MagicMock()
        mock_boto3_client.return_value = mock_s3
        
        # Create S3 storage config
        config = StorageConfig(
            type='s3',
            bucket_name='test-s3-bucket',
            region='us-east-1',
            access_key_id='test-key',
            secret_access_key='test-secret'
        )
        
        # Create storage manager
        manager = StorageManager(config)
        
        # Verify backend types
        assert isinstance(manager.backend, S3JSONStorage)
        
        # Verify S3 client was created with correct parameters
        mock_boto3_client.assert_called_with(
            's3',
            region_name='us-east-1',
            aws_access_key_id='test-key',
            aws_secret_access_key='test-secret'
        )

    @pytest.mark.asyncio
    async def test_s3_backend_creation_failure(self):
        """Test that S3 operations fail with invalid credentials"""
        # Create S3 storage config with invalid credentials  
        config = StorageConfig(
            type='s3',
            bucket_name='test-s3-bucket',
            eln_bucket_name='test-s3-bucket',
            draft_bucket_name='test-s3-drafts',
            forms_bucket_name='test-s3-forms',
            region='us-east-1',
            access_key_id='invalid-key',
            secret_access_key='invalid-secret'
        )
        
        # Manager creation should succeed (no longer checks connection during init)
        manager = StorageManager(config)
        
        # But operations should fail with invalid credentials
        eln_backend = manager.backend
        with pytest.raises(Exception):  # Could be StorageError or AWS error
            await eln_backend.list_documents()

    def test_config_backend_switching(self):
        """Test that changing config.backend switches backend types"""
        # Test local config
        local_config = StorageConfig(
            type='local',
            local_path='./test_local',
            bucket_name='test-bucket'
        )
        
        local_manager = StorageManager(local_config)
        assert isinstance(local_manager.backend, LocalJSONStorage)
        
        # Mock S3 for the S3 test
        with patch('rawscribe.utils.storage_s3.boto3.client') as mock_boto3:
            mock_boto3.return_value = MagicMock()
            
            # Test S3 config
            s3_config = StorageConfig(
                type='s3',
                bucket_name='test-s3-bucket',
                region='us-east-1',
                access_key_id='test-key',
                secret_access_key='test-secret'
            )
            
            s3_manager = StorageManager(s3_config)
            assert isinstance(s3_manager.backend, S3JSONStorage)



    def test_create_storage_manager_function(self):
        """Test the create_storage_manager factory function"""
        config = StorageConfig(
            type='local',
            local_path='./test'
        )
        
        manager = create_storage_manager(config)
        assert isinstance(manager, StorageManager)
        assert isinstance(manager.backend, LocalJSONStorage)

    def test_storage_manager_configuration(self):
        """Test StorageManager with local configuration"""
        config = StorageConfig(
            type='local',
            local_path='./primary'
        )
        
        manager = StorageManager(config)
        
        # Verify backends are properly initialized
        assert isinstance(manager.backend, LocalJSONStorage)
        
        # Verify no fallback backends exist (removed functionality)
        assert not hasattr(manager, 'fallback_draft_backend')
        assert not hasattr(manager, 'fallback_eln_backend')
        assert not hasattr(manager, 'fallback_sop_backend')

    def test_missing_backend_type_fails(self):
        """Test that missing backend type fails catastrophically (no silent defaults)"""
        # This should fail at Pydantic validation level
        with pytest.raises(ValidationError):
            StorageConfig(local_path='./test')  # Missing required 'type' field

    def test_unsupported_backend_type_fails(self):
        """Test that unsupported backend types fail explicitly"""
        # This should fail at Pydantic validation level for invalid literal
        with pytest.raises(ValidationError):
            StorageConfig(type='invalid_backend', local_path='./test')
        
        # Test the factory error handling with a mock config object
        # (To test completeness of factory validation beyond Pydantic)
        class MockConfig:
            def __init__(self):
                self.type = 'unsupported'
                self.local_path = './test'
        
        mock_config = MockConfig()
        
        with pytest.raises(ValueError, match="Unsupported storage backend type: unsupported"):
            StorageManager(mock_config)



    def test_config_validation(self):
        """Test that StorageConfig validation works correctly"""
        # Test local config validation (should set default local_path when type=local)
        local_config = StorageConfig(type='local')
        assert local_config.type == 'local'
        assert local_config.local_path == './.local/s3'
        
        # Test S3 config (type is required)
        s3_config = StorageConfig(
            type='s3',
            bucket_name='test-bucket',
            region='us-east-1'
        )
        assert s3_config.type == 's3'
        assert s3_config.bucket_name == 'test-bucket'
        
        # Test that type field is required
        with pytest.raises(ValidationError):
            StorageConfig(bucket_name='test-bucket')

    def test_manager_api_interface(self):
        """Test that StorageManager exposes the expected API interface"""
        config = StorageConfig(type='local', local_path='./test')
        manager = StorageManager(config)
        
        # Test that all expected methods exist
        expected_methods = [
            'delete_draft', 'cleanup_old_drafts',
            'get_eln_by_uuid', 'query_prerequisite_elns',
            'validate_eln_immutability', 'store_temp_file', 'attach_files_to_eln',
            'list_documents', 'get_document', 'save_document'
        ]
        
        for method_name in expected_methods:
            assert hasattr(manager, method_name), f"StorageManager missing method: {method_name}"
            assert callable(getattr(manager, method_name)), f"StorageManager.{method_name} is not callable" 