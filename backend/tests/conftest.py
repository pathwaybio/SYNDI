# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Shared pytest fixtures for all tests
"""
import pytest
import tempfile
import shutil
import os
from pathlib import Path

from rawscribe.utils.config_loader import ConfigLoader
from rawscribe.utils.config_types import StorageConfig


@pytest.fixture
def temp_dir():
    """Create temporary directory for testing"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir)


@pytest.fixture
def storage_config(temp_dir):
    """Load storage config from actual config system but override local_path for testing"""
    # Set testing environment and load config from the real .config directory
    old_testing = os.environ.get('TESTING')
    os.environ['TESTING'] = 'true'
    
    try:
        config_loader = ConfigLoader()
        full_config = config_loader.load_config()
        storage_config_dict = full_config['lambda']['storage'].copy()
        
        # Override local_path for testing
        storage_config_dict['local_path'] = temp_dir
        
        return StorageConfig(**storage_config_dict)
    finally:
        # Restore original TESTING value
        if old_testing is None:
            os.environ.pop('TESTING', None)
        else:
            os.environ['TESTING'] = old_testing


@pytest.fixture  
def s3_storage_config():
    """Load S3 storage config from actual config system but override credentials for testing"""
    # Set testing environment and load config from the real .config directory
    old_testing = os.environ.get('TESTING')
    os.environ['TESTING'] = 'true'
    
    try:
        config_loader = ConfigLoader()
        full_config = config_loader.load_config()
        storage_config_dict = full_config['lambda']['storage'].copy()
        
        # Override for S3 testing
        storage_config_dict['type'] = 's3'
        storage_config_dict['region'] = 'us-east-1'
        storage_config_dict['access_key_id'] = 'test-key'
        storage_config_dict['secret_access_key'] = 'test-secret'
        
        return StorageConfig(**storage_config_dict)
    finally:
        # Restore original TESTING value
        if old_testing is None:
            os.environ.pop('TESTING', None)
        else:
            os.environ['TESTING'] = old_testing