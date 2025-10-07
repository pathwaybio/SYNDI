# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Authentication provider abstraction

Provides pluggable authentication providers (Cognito, JWT, etc.)
with environment-aware configuration loading.

This package provides the provider pattern for authentication configuration,
ensuring environment variables (CloudFormation) take precedence over
baked-in config files.
"""
from .base import AuthProvider
from .factory import AuthProviderFactory
from .cognito_provider import CognitoProvider
from .jwt_provider import JWTProvider

__all__ = [
    'AuthProvider',
    'AuthProviderFactory',
    'CognitoProvider',
    'JWTProvider',
]

