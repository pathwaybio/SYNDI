# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Configuration API endpoints
Serves private configuration data after authentication
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
import logging

from rawscribe.utils.config_loader import config_loader
from rawscribe.utils.auth_simple import get_current_user_or_default

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/config", tags=["config"])

@router.get("/runtime")
async def get_runtime_config() -> Dict[str, Any]:
    """
    Get runtime authentication configuration (public endpoint)
    
    Returns active auth config from environment (CloudFormation) or config file.
    This endpoint is public - no authentication required.
    
    Clients (frontend, scripts) can query this to get current auth settings.
    Does NOT return secrets (JWT keys, passwords, etc.)
    """
    try:
        auth_provider = config_loader.get_auth_provider()
        
        return {
            'auth': {
                'provider': auth_provider.provider_name,
                'config': auth_provider.get_config()
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to load runtime config: {e}")
        raise HTTPException(status_code=500, detail="Failed to load runtime configuration")

@router.get("/private")
async def get_private_config(
    current_user = Depends(get_current_user_or_default)
) -> Dict[str, Any]:
    """
    Get private configuration data
    Requires authentication - contains sensitive data
    """
    try:
        # Load full backend config (includes private webapp data)
        full_config = config_loader.load_config()
        
        # Return the private webapp section and user info
        private_config = {
            "private_webapp": full_config.get("private_webapp", {}),
            "user": {
                "id": current_user.id,
                "email": current_user.email,
                "username": current_user.username,
                "name": getattr(current_user, 'name', current_user.username),
                "groups": current_user.groups,
                "permissions": current_user.permissions,
                "isAdmin": current_user.is_admin # does it need to be isAdmin? xxx
            }
        }
        
        return private_config
        
    except Exception as e:
        logger.error(f"Failed to load private configuration: {e}")
        raise HTTPException(status_code=500, detail="Failed to load private configuration") 