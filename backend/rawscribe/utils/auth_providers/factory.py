# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Authentication provider factory

Creates appropriate auth provider based on configuration.
Extensible for future providers (LDAP, SAML, etc.)
"""
from typing import Dict
from .base import AuthProvider
from .cognito_provider import CognitoProvider
from .jwt_provider import JWTProvider


class AuthProviderFactory:
    """Factory for creating auth provider instances"""
    
    _providers = {
        'cognito': CognitoProvider,
        'jwt': JWTProvider,
    }
    
    @classmethod
    def create(cls, config: Dict) -> AuthProvider:
        """
        Create appropriate auth provider based on config
        
        Args:
            config: Full application configuration dict
            
        Returns:
            AuthProvider instance
            
        Raises:
            ValueError: If provider not recognized
        """
        provider_name = config.get('lambda', {}).get('auth', {}).get('provider', 'jwt')
        
        provider_class = cls._providers.get(provider_name)
        if not provider_class:
            raise ValueError(
                f"Unknown auth provider: {provider_name}. "
                f"Available: {list(cls._providers.keys())}"
            )
        
        return provider_class(config)
    
    @classmethod
    def register_provider(cls, name: str, provider_class: type):
        """
        Register a custom auth provider (for extensibility)
        
        Args:
            name: Provider name (e.g., 'ldap', 'saml')
            provider_class: Class implementing AuthProvider interface
        """
        cls._providers[name] = provider_class

