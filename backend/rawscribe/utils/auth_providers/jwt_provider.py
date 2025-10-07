# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
On-premise JWT authentication provider

Reads configuration from config file. No user pool concept,
users are defined directly in config.
"""
from typing import Dict, Optional
from .base import AuthProvider


class JWTProvider(AuthProvider):
    """On-premise JWT authentication provider"""
    
    def __init__(self, config: Dict):
        self._config = config
        self._jwt_config = config.get('lambda', {}).get('auth', {}).get('jwt', {})
    
    def get_config(self) -> Dict:
        """
        Get JWT runtime configuration
        
        Returns public configuration (algorithm, issuer, audience).
        Does NOT return secret key.
        """
        return {
            'algorithm': self._jwt_config.get('algorithm', 'HS256'),
            'issuer': self._jwt_config.get('issuer'),
            'audience': self._jwt_config.get('audience'),
            'mockUsers': len(self._jwt_config.get('mockUsers', [])),
            'source': 'config_file'
        }
    
    def get_user_pool_id(self) -> Optional[str]:
        """JWT doesn't have user pool concept"""
        return None
    
    def get_client_id(self) -> Optional[str]:
        """JWT doesn't have client ID concept"""
        return None
    
    def get_region(self) -> str:
        """JWT doesn't have region concept"""
        return 'local'
    
    @property
    def provider_name(self) -> str:
        return 'jwt'

