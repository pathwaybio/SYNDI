# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
AWS Cognito authentication provider

Reads configuration from environment variables (CloudFormation) first,
then falls back to config file. This ensures deployed Lambda always uses
the correct pool ID from infrastructure.
"""
import os
from typing import Dict, Optional
from .base import AuthProvider


class CognitoProvider(AuthProvider):
    """AWS Cognito authentication provider"""
    
    def __init__(self, config: Dict):
        self._config = config
        self._cognito_config = config.get('lambda', {}).get('auth', {}).get('cognito', {})
    
    def get_config(self) -> Dict:
        """
        Get Cognito runtime configuration
        
        Priority:
        1. Environment variables (set by CloudFormation at deploy time)
        2. Config file (baked into Lambda build)
        
        Returns public configuration (no secrets)
        """
        return {
            'userPoolId': self.get_user_pool_id(),
            'clientId': self.get_client_id(),
            'region': self.get_region(),
            'source': self._get_config_source()
        }
    
    def get_user_pool_id(self) -> Optional[str]:
        """Get Cognito User Pool ID (env vars take precedence)"""
        # CloudFormation sets this at deploy time (always fresh)
        return os.environ.get('COGNITO_USER_POOL_ID') or \
               self._cognito_config.get('userPoolId')
    
    def get_client_id(self) -> Optional[str]:
        """Get Cognito Client ID (env vars take precedence)"""
        return os.environ.get('COGNITO_CLIENT_ID') or \
               self._cognito_config.get('clientId')
    
    def get_region(self) -> str:
        """Get AWS region (env vars take precedence)"""
        return os.environ.get('COGNITO_REGION') or \
               self._cognito_config.get('region', 'us-east-1')
    
    def _get_config_source(self) -> str:
        """For debugging: where did config come from?"""
        if os.environ.get('COGNITO_USER_POOL_ID'):
            return 'environment'
        return 'config_file'
    
    @property
    def provider_name(self) -> str:
        return 'cognito'

