# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Test config types to ensure Pydantic v1 compatibility
"""

import pytest
from rawscribe.utils.config_types import (
    EnvironmentConfig,
    Environment,
    AWSResourceConfig,
    StorageConfig,
    AutosaveConfig,
    APIConfig,
    AuthConfig,
    ServiceConfig,
    ConfigMetadata
)


def test_config_types_import():
    """Test that config_types can be imported without errors"""
    assert EnvironmentConfig is not None
    assert Environment is not None
    

def test_environment_config_creation():
    """Test creating an EnvironmentConfig with validators"""
    config_dict = {
        'webapp': {
            'api': {
                'base_url': '/api',
                'timeout': 30000
            },
            'auth': {
                'provider': 'jwt',
                'required': False
            },
            'storage': {
                'type': 'local',
                'local_path': './.local/s3'
            },
            'autosave': {
                'enabled': True,
                'storage': {
                    'type': 'localStorage',
                    'key_prefix': 'autosave-test'
                },
                'debounce': {
                    'delay': 1000,
                    'max_wait': 5000
                },
                'retry': {
                    'max_retries': 3,
                    'initial_delay': 1000
                },
                'ui': {
                    'show_status': True,
                    'status_position': 'bottom-right'
                }
            }
        },
        'aws': {
            'region': 'us-east-1',
            'cloudformation': {
                'stack_name': 'test-stack',
                'output_mappings': {}
            },
            'enabled': True
        },
        'meta': {
            'environment': 'test'
        }
    }
    
    # This will trigger all validators
    config = EnvironmentConfig(**config_dict)
    
    # Verify the config was created successfully
    assert config.webapp.api.base_url == '/api'
    assert config.webapp.auth.provider == 'jwt'
    assert config.webapp.storage.type == 'local'
    assert config.webapp.autosave.debounce['delay'] == 1000
    assert config.webapp.autosave.retry['max_retries'] == 3
    assert config.webapp.autosave.ui['show_status'] == True
    assert config.aws.region == 'us-east-1'
    assert config.aws.cloudformation['stack_name'] == 'test-stack'
    assert config.meta.environment == Environment.TEST


def test_validators_work():
    """Test that the validators are actually being called"""
    config_dict = {
        'webapp': {
            'auth': {
                'provider': 'jwt'  # Required field
            },
            'storage': {
                'type': 'local'  # Required field
            }
        },
        'aws': {
            'region': 'us-east-1',
            'cloudformation': {}  # Empty dict to test validator
        },
        'meta': {
            'environment': 'test'
        }
    }
    
    config = EnvironmentConfig(**config_dict)
    
    # Verify validators work correctly
    assert config.aws.cloudformation == {'stack_name': '', 'output_mappings': {}}  # Validator adds default fields
    assert config.webapp.storage.type == 'local'
    assert config.webapp.storage.local_path == './.local/s3'  # Default from validator
    assert config.webapp.auth.provider == 'jwt'
    assert config.meta.environment == Environment.TEST
