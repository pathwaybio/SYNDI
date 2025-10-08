# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Simple configuration loader for backend services
Loads from deployed config.json in lambda bucket
"""
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class ConfigLoader:
    """Simple configuration loader for backend services"""
    
    def __init__(self):
        self._cache: Optional[Dict[str, Any]] = None
        self._cache_time: float = 0
        self.CACHE_TTL = 300  # 5 minutes
        self._auth_provider = None
    
    def load_config(self) -> Dict[str, Any]:
        """
        Load configuration from deployed location
        - Local development: ./config.json (copied from infra/.config/lambda/dev.json by make rule before deploying)
        - Production: Read from lambda bucket (via S3 or env CONFIG_PATH)
        - Testing: Read directly from infra/.config/lambda/test.json when TESTING=true
        """
        # Check cache first
        import time
        if self._cache and (time.time() - self._cache_time) < self.CACHE_TTL:
            return self._cache
        
        try:
            # Check if we're in testing mode
            if os.environ.get('TESTING') == 'true':
                # Read from merged config file (created by make config)
                test_config_path = Path('rawscribe/.config/config.json')
                logger.info(f"TESTING mode: loading config from {test_config_path}")
                
                if test_config_path.exists():
                    with open(test_config_path, 'r') as f:
                        config = json.load(f)
                    logger.info(f"Loaded test config from: {test_config_path}")
                else:
                    raise FileNotFoundError(f"Test config not found at: {test_config_path}")
            else:
                # Try local development first (same directory as main.py)
                local_config_path = Path('rawscribe/.config/config.json')
                logger.info(f"local_config_path: {local_config_path}")
                
                if local_config_path.exists():
                    with open(local_config_path, 'r') as f:
                        config = json.load(f)
                    logger.info(f"Loaded config from local development: {local_config_path}")
                else:
                    logger.warning(f"config.json not found at: ({local_config_path})")
                    # Try deployed location (e.g., from Lambda environment)
                    config_path = os.environ.get('CONFIG_PATH', '/tmp/config.json')
                    with open(config_path, 'r') as f:
                        config = json.load(f)
                    logger.info(f"Loaded config from deployed location: {config_path}")
            
            # Validate config structure
            if 'lambda' not in config:
                raise ValueError("Invalid config: missing lambda section")
            
            self._cache = config
            self._cache_time = time.time()
            
            return config
            
        except Exception as error:
            logger.error(f"Failed to load configuration: {error}")
            logger.error("Configuration paths checked:")
            if os.environ.get('TESTING') == 'true':
                logger.error(f"  Test mode: infra/.config/lambda/test.json")
            else:
                logger.error(f"  Local development: rawscribe/.config/config.json")
                logger.error(f"  Deployed location: {os.environ.get('CONFIG_PATH', '/tmp/config.json')}")
            logger.error("")
            logger.error("To fix this issue:")
            logger.error("1. Run 'make config ENV=dev' to copy lambda config to backend/rawscribe/config.json")
            logger.error("2. Or ensure configs are deployed to the correct bucket location")
            logger.error("3. Or set CONFIG_PATH environment variable to valid config file")
            
            # Exit gracefully instead of using potentially incorrect fallback
            raise RuntimeError(
                f"Configuration not found or invalid: {error}. "
                "Run 'make config ENV=dev' to copy lambda config to backend/rawscribe/config.json, "
                "or ensure configs are properly deployed."
            )
    
    def get_storage_config(self) -> Dict[str, Any]:
        """Get storage configuration for backward compatibility"""
        config = self.load_config()
        return config['lambda']['storage']
    
    def get_environment(self) -> str:
        """
        Get environment from ENV variable
        CRITICAL: No defaults - missing ENV should be a catastrophic failure
        to prevent accidentally deploying dev configs to production
        """
        env = os.getenv('ENV')
        
        # Special case: if TESTING=true, we're in test mode
        if os.getenv('TESTING') == 'true':
            return 'test'
            
        if not env:
            logger.error("CRITICAL: ENV environment variable is not set!")
            logger.error("Set ENV=dev|test|stage|prod before starting the application")
            raise RuntimeError("ENV environment variable MUST be set - refusing to start without explicit environment")
            
        return env
    
    def clear_cache(self) -> None:
        """Clear configuration cache"""
        self._cache = None
        self._cache_time = 0
        self._auth_provider = None
    
    def get_auth_provider(self):
        """
        Get auth provider instance (singleton)
        
        Returns appropriate provider based on configuration.
        Provider reads from environment variables (CloudFormation) first,
        then falls back to config file.
        
        Returns:
            AuthProvider instance (CognitoProvider or JWTProvider)
        """
        if self._auth_provider is None:
            from .auth_providers.factory import AuthProviderFactory
            config = self.load_config()
            self._auth_provider = AuthProviderFactory.create(config)
        return self._auth_provider

# Export singleton instance
config_loader = ConfigLoader() 