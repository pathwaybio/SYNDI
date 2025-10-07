# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
RBAC Enforcement Utilities for CLAIRE Backend

Provides functional permission checking and enforcement utilities
for the three-role RBAC system (Admin, Researcher, Viewer).
"""

from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from .auth import User
import logging

logger = logging.getLogger(__name__)

def can_submit(user: User, sop_id: Optional[str] = None) -> bool:
    """
    Check if user can submit SOPs
    
    Args:
        user: Current user
        sop_id: Optional specific SOP ID to check
        
    Returns:
        True if user can submit
    """
    # Admin override
    if user.is_admin:
        return True
        
    # Check wildcard submit permission
    if user.has_permission("submit:*"):
        return True
        
    # Check SOP-specific submit permission
    if user.has_permission("submit:SOP*"):
        return True
        
    # Check specific SOP permission if provided
    if sop_id and user.has_permission(f"submit:{sop_id}"):
        return True
        
    return False

def require_submit_permission(user: User, sop_id: Optional[str] = None) -> None:
    """
    Require submit permission for SOP submissions
    
    Args:
        user: Current user
        sop_id: Optional specific SOP ID to check
        
    Raises:
        HTTPException: 403 if permission denied
    """
    if not can_submit(user, sop_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions to submit {sop_id or 'SOPs'}"
        )

def can_manage_drafts(user: User, action: str = "create") -> bool:
    """
    Check if user can perform draft operations
    
    Args:
        user: Current user
        action: Specific action (create, update, delete, view)
        
    Returns:
        True if user can perform the action
    """
    # Admin override
    if user.is_admin:
        return True
        
    # Check wildcard draft permission
    if user.has_permission("draft:*"):
        return True
        
    # Check specific draft action permission
    if user.has_permission(f"draft:{action}"):
        return True
        
    return False

def require_draft_permission(user: User, action: str = "create") -> None:
    """
    Require draft permission for draft operations
    
    Args:
        user: Current user
        action: Specific action (create, update, delete, view)
        
    Raises:
        HTTPException: 403 if permission denied
    """
    if not can_manage_drafts(user, action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions to {action} drafts"
        )

def can_view_data(user: User, scope: str = "own") -> bool:
    """
    Check if user can view data with given scope
    
    Args:
        user: Current user
        scope: View scope (own, group, all)
        
    Returns:
        True if user can view data
    """
    # Admin override
    if user.is_admin:
        return True
        
    # Check wildcard view permission
    if user.has_permission("view:*"):
        return True
        
    # Check specific view permission
    if user.has_permission(f"view:{scope}"):
        return True
        
    return False

def require_view_permission(user: User, scope: str = "own") -> None:
    """
    Require view permission for data access
    
    Args:
        user: Current user
        scope: View scope (own, group, all)
        
    Raises:
        HTTPException: 403 if permission denied
    """
    if not can_view_data(user, scope):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions to view {scope} data"
        )

def can_view_user_data(user: User, target_user_id: str) -> bool:
    """
    Check if user can view another user's data
    
    Args:
        user: Current user
        target_user_id: User ID of data owner
        
    Returns:
        True if user can view the data
    """
    # Admin can view all
    if user.is_admin or user.has_permission("view:*"):
        return True
        
    # Can always view own data
    if user.id == target_user_id or user.username == target_user_id:
        return True
        
    # Can view group data if has group permission
    if user.has_permission("view:group"):
        return True
        
    return False

def filter_viewable_data(user: User, data_list: List[Dict[str, Any]], user_id_field: str = "user_id") -> List[Dict[str, Any]]:
    """
    Filter list of data items to only those user can view
    
    Args:
        user: Current user
        data_list: List of data dictionaries
        user_id_field: Field name containing user ID
        
    Returns:
        Filtered list of viewable data
    """
    if user.is_admin or user.has_permission("view:*"):
        return data_list
        
    viewable_data = []
    for item in data_list:
        target_user_id = item.get(user_id_field)
        if target_user_id and can_view_user_data(user, target_user_id):
            viewable_data.append(item)
            
    return viewable_data

def get_user_role_display(user: User) -> str:
    """
    Get display name for user's primary role
    
    Args:
        user: Current user
        
    Returns:
        Human-readable role name
    """
    if user.is_admin:
        return "Admin"
    elif "researcher" in user.groups:
        return "Researcher"  
    elif "viewer" in user.groups:
        return "Viewer"
    else:
        return "User"  # Fallback

def has_role(user: User, role: str) -> bool:
    """
    Check if user has specific role
    
    Args:
        user: Current user
        role: Role name (admin, researcher, viewer)
        
    Returns:
        True if user has the role
    """
    role_lower = role.lower()
    
    if role_lower == "admin":
        return user.is_admin
    elif role_lower in ["researcher", "viewer", "user"]:
        return role_lower in [g.lower() for g in user.groups]
    
    return False