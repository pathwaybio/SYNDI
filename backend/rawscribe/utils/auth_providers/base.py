# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Base authentication provider interface

Provides abstract base class for different authentication providers
(Cognito, JWT, LDAP, etc.)
"""
from abc import ABC, abstractmethod
from typing import Dict, Optional


class AuthProvider(ABC):
    """Base class for authentication providers"""
    
    @abstractmethod
    def get_config(self) -> Dict:
        """
        Get provider-specific runtime configuration
        
        Returns public configuration that can be shared with clients.
        Should NOT include secrets (keys, passwords, etc.)
        """
        pass
    
    @abstractmethod
    def get_user_pool_id(self) -> Optional[str]:
        """
        Get user pool/realm identifier (provider-specific)
        
        Returns:
            Pool ID for Cognito, None for JWT/other providers
        """
        pass
    
    @abstractmethod
    def get_client_id(self) -> Optional[str]:
        """
        Get client/application identifier
        
        Returns:
            Client ID for Cognito, None for JWT/other providers
        """
        pass
    
    @abstractmethod
    def get_region(self) -> str:
        """
        Get region/endpoint
        
        Returns:
            AWS region for Cognito, 'local' for on-prem
        """
        pass
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Provider name (cognito, jwt, etc)"""
        pass

