# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
ELN Access Control System for CLAIRE

Handles ELN data access control based on SOP template authorization configuration.
Uses filename variables to dynamically add groups for access control.
"""

from typing import Dict, List, Any, Optional
import logging
from .auth import User
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class AuthorizationConfig:
    """Authorization configuration from SOP template"""
    public: bool
    allowed_users: List[str]
    allowed_groups: List[str]
    filename_variable_access: List[str]
    required_permissions: List[str]

class ELNAccessControl:
    """ELN access control system"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def can_access_eln(
        self, 
        user: User, 
        eln_metadata: Dict[str, Any], 
        sop_template: Dict[str, Any]
    ) -> bool:
        """
        Check if user can access ELN data based on SOP template authorization
        
        Args:
            user: Current user
            eln_metadata: ELN metadata (creator, filename variables, etc.)
            sop_template: SOP template with authorization configuration
        """
        try:
            # Get authorization configuration from SOP template
            auth_config = self._parse_authorization_config(sop_template, 'eln_default_permissions')
            
            # Check admin override
            if user.is_admin:
                return True
            
            # Check if public
            if auth_config.public:
                return True
            
            # Check allowed users
            if self._check_allowed_users(user, auth_config.allowed_users):
                return True
            
            # Get dynamic groups from filename variables
            dynamic_groups = self._get_dynamic_groups(eln_metadata, auth_config.filename_variable_access)
            all_allowed_groups = auth_config.allowed_groups + dynamic_groups
            
            # Check allowed groups
            if self._check_allowed_groups(user, all_allowed_groups):
                return True
            
            # Check required permissions
            if not self._check_required_permissions(user, auth_config.required_permissions):
                return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"ELN access check failed: {e}")
            return False
    
    def can_import_prerequisite_eln(
        self,
        user: User,
        prerequisite_eln: Dict[str, Any],
        prerequisite_sop: Dict[str, Any],
        current_sop_template: Dict[str, Any]
    ) -> bool:
        """
        Check if user can import data from prerequisite ELN
        
        Args:
            user: Current user
            prerequisite_eln: ELN to import from
            prerequisite_sop: SOP template of prerequisite ELN
            current_sop_template: Current SOP template being executed

        Returns:
            True if user can import data from prerequisite ELN, False otherwise

        Raises:
            Exception: If there is an error checking the prerequisite ELN import

        Example:
            user = User(id="123", username="john.doe", email="john.doe@example.com", is_admin=False)
            prerequisite_eln = {"metadata": {"filename_variables": {"project_id": "123"}}}
            prerequisite_sop = {"metadata": {"permissions": {"required_groups": ["project_id:123"]}}}
            current_sop_template = {"metadata": {"permissions": {"required_groups": ["project_id:123"]}}}
            eln_access_control.can_import_prerequisite_eln(user, prerequisite_eln, prerequisite_sop, current_sop_template)
            # Returns True if user can import data from prerequisite ELN, False otherwise
        """
        try:
            # First check if user can access the prerequisite ELN
            if not self.can_access_eln(user, prerequisite_eln, prerequisite_sop):
                return False
            
            # For now, if user can access the prerequisite ELN, they can import from it
            # This could be enhanced with more specific import permissions if needed
            return True
            
        except Exception as e:
            self.logger.error(f"Prerequisite ELN import check failed: {e}")
            return False
    
    def filter_accessible_elns(
        self,
        user: User,
        elns: List[Dict[str, Any]],
        sop_template: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Filter list of ELNs to only those user can access

        Args:
            user: Current user
            elns: List of ELNs to filter
            sop_template: SOP template with authorization configuration

        Returns: 
            List of ELNs that user can access

        Raises:
            Exception: If there is an error filtering the ELNs

        Example:
            user = User(id="123", username="john.doe", email="john.doe@example.com", is_admin=False)
            elns = [{"metadata": {"filename_variables": {"project_id": "123"}}}, {"metadata": {"filename_variables": {"project_id": "456"}}}]
            sop_template = {"metadata": {"permissions": {"required_groups": ["project_id:123"]}}}
            eln_access_control.filter_accessible_elns(user, elns, sop_template)
        """
        accessible_elns = []
        
        for eln in elns:
            if self.can_access_eln(user, eln, sop_template):
                accessible_elns.append(eln)
        
        return accessible_elns
    
    def _parse_authorization_config(self, sop: Dict[str, Any], config_key: str) -> AuthorizationConfig:
        """Parse authorization configuration from SOP
        
        Args:
            sop: SOP with authorization configuration
            config_key: Key to get authorization configuration from

        Returns:
            Authorization configuration

        Raises:
            Exception: If there is an error parsing the authorization configuration

        Example:
            sop = {"metadata": {"eln_default_permissions": {"public": True, "allowed_users": ["john.doe@example.com"], "allowed_groups": ["project_id:123"], "filename_variable_access": ["project_id"], "required_permissions": ["view:SOP"]}}
            auth_config = eln_access_control._parse_authorization_config(sop, 'eln_default_permissions')
            # Returns AuthorizationConfig object with public, allowed_users, allowed_groups, filename_variable_access, and required_permissions
        """
        auth_config = sop.get('metadata', {}).get(config_key, {})
        return AuthorizationConfig(
            public=auth_config.get('public', False),
            allowed_users=auth_config.get('allowed_users', []),
            allowed_groups=auth_config.get('allowed_groups', []),
            filename_variable_access=auth_config.get('filename_variable_access', []),
            required_permissions=auth_config.get('required_permissions', [])
        )
    
    def _check_allowed_users(self, user: User, allowed_users: List[str]) -> bool:
        """Check if any version of the user (id, email, username) is in allowed users list
        
        Args:
            user: Current user
            allowed_users: List of allowed users

        Returns:
            True if user is in allowed users list, False otherwise

        Raises:
            Exception: If there is an error checking the allowed users list

        Example:
            user = User(id="123", username="john.doe", email="john.doe@example.com", is_admin=False)
            allowed_users = ["john.doe@example.com", "jane.doe@example.com"]
            eln_access_control._check_allowed_users(user, allowed_users)
            # Returns True if user is in allowed users list, False otherwise
        """
        if not allowed_users:
            return False
        
        # Check exact user ID match
        if user.id in allowed_users:
            return True
        
        # Check username match
        if user.username in allowed_users:
            return True
        
        # Check email match
        if user.email in allowed_users:
            return True
        
        # Check wildcard patterns (e.g., "*:admin" for all admins)
        for pattern in allowed_users:
            if pattern.startswith("*:") and user.is_admin:
                return True
        
        return False
    
    def _check_allowed_groups(self, user: User, allowed_groups: List[str]) -> bool:
        """Check if user is in any of the allowed groups"""
        return bool(allowed_groups) and any(user.is_in_group(group) for group in allowed_groups)
    
    def _check_required_permissions(self, user: User, required_permissions: List[str]) -> bool:
        """Check if user has all required permissions"""
        return all(user.has_permission(perm) for perm in required_permissions)
    
    def _get_dynamic_groups(self, eln_metadata: Dict[str, Any], filename_variables: List[str]) -> List[str]:
        """
        Get dynamic groups from filename variable values in ELN metadata. 
        Does not check if the user is in the access control group.
        
        Args:
            eln_metadata: ELN metadata containing filename variable values
            filename_variables: List of filename variable names to check
            
        Returns:
            List of group names based on filename variable values

        Raises:
            Exception: If there is an error getting the dynamic groups

        Example:
            eln_metadata = {"filename_variables": {"project_id": "123"}}
            filename_variables = ["project_id"]
            eln_access_control._get_dynamic_groups(eln_metadata, filename_variables)
            # Returns ["123"]
        """
        dynamic_groups = []
        
        for var_name in filename_variables:
            var_value = eln_metadata.get(var_name)
            if var_value:
                # Add the filename variable value as a group name
                dynamic_groups.append(str(var_value))
        
        return dynamic_groups

# Global instance
eln_access_control = ELNAccessControl() 