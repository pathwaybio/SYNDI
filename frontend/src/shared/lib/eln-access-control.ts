// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Frontend ELN Access Control System
 * 
 * Mirrors backend ELN access control logic for client-side permission checking.
 * Uses filename variables to dynamically add groups for access control.
 */

export interface AuthorizationConfig {
  public: boolean;
  allowed_users: string[];
  allowed_groups: string[];
  filename_variable_access: string[];
  required_permissions: string[];
}

export interface User {
  id: string;
  email: string;
  username: string;
  groups: string[];
  permissions: string[];
  isAdmin: boolean;
}

export interface ELNMetadata {
  user_id?: string;
  created_by?: string;
  project_id?: string;
  experiment_id?: string;
  [key: string]: any;
}

export class ELNAccessControl {
  
  /**
   * Check if user can access ELN data based on SOP template authorization
   */
  canAccessELN(
    user: User,
    elnMetadata: ELNMetadata,
    sop: any
  ): boolean {
    try {
      const authConfig = this.parseAuthorizationConfig(sop, 'eln_default_permissions');
      
      // Admin override
      if (user.isAdmin) {
        return true;
      }
      
      // Check if public
      if (authConfig.public) {
        return true;
      }
      
      // Check allowed users
      if (this.checkAllowedUsers(user, authConfig.allowed_users)) {
        return true;
      }
      
      // Get dynamic groups from filename variables
      const dynamicGroups = this.getDynamicGroups(elnMetadata, authConfig.filename_variable_access);
      const allAllowedGroups = authConfig.allowed_groups.concat(dynamicGroups);
      
      // Check allowed groups
      if (this.checkAllowedGroups(user, allAllowedGroups)) {
        return true;
      }
      
      // Check required permissions
      if (!this.checkRequiredPermissions(user, authConfig.required_permissions)) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('ELN access check failed:', error);
      return false;
    }
  }
  
  /**
   * Check if user can import from prerequisite ELN
   */
  canImportPrerequisiteELN(
    user: User,
    prerequisiteELN: ELNMetadata,
    prerequisiteSOP: any,
    currentSOP: any
  ): boolean {
    try {
      // First check if user can access the prerequisite ELN
      if (!this.canAccessELN(user, prerequisiteELN, prerequisiteSOP)) {
        return false;
      }
      
      // For now, if user can access the prerequisite ELN, they can import from it
      // This could be enhanced with more specific import permissions if needed
      return true;
    } catch (error) {
      console.error('Prerequisite ELN import check failed:', error);
      return false;
    }
  }
  
  /**
   * Filter list of ELNs to only those user can access
   */
  filterAccessibleELNs(
    user: User,
    elns: ELNMetadata[],
    sop: any
  ): ELNMetadata[] {
    return elns.filter(eln => 
      this.canAccessELN(user, eln, sop)
    );
  }
  
  /**
   * Parse authorization configuration from SOP template
   */
  private parseAuthorizationConfig(sop: any, configKey: string): AuthorizationConfig {
    const authConfig = sop?.metadata?.[configKey] || {};
    
    return {
      public: authConfig.public || false,
      allowed_users: authConfig.allowed_users || [],
      allowed_groups: authConfig.allowed_groups || [],
      filename_variable_access: authConfig.filename_variable_access || [],
      required_permissions: authConfig.required_permissions || []
    };
  }
  
  /**
   * Check if user is in allowed users list
   */
  private checkAllowedUsers(user: User, allowedUsers: string[]): boolean {
    if (allowedUsers.length === 0) {
      return false;
    }
    
    // Check exact user ID match
    if (allowedUsers.includes(user.id)) {
      return true;
    }
    
    // Check username match
    if (allowedUsers.includes(user.username)) {
      return true;
    }
    
    // Check email match
    if (allowedUsers.includes(user.email)) {
      return true;
    }
    
    // Check wildcard patterns (e.g., "*:admin" for all admins)
    for (const pattern of allowedUsers) {
      if (pattern.startsWith("*:") && user.isAdmin) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if user is in any of the allowed groups
   */
  private checkAllowedGroups(user: User, allowedGroups: string[]): boolean {
    if (allowedGroups.length === 0) {
      return false;
    }
    
    return allowedGroups.some(group => user.groups.includes(group));
  }
  
  /**
   * Check if user has all required permissions
   */
  private checkRequiredPermissions(user: User, requiredPermissions: string[]): boolean {
    if (requiredPermissions.length === 0) {
      return true; // No permissions required
    }
    
    return requiredPermissions.every(perm => user.permissions.includes(perm));
  }
  
  /**
   * Get dynamic groups from filename variable values in ELN metadata
   */
  private getDynamicGroups(elnMetadata: ELNMetadata, filenameVariables: string[]): string[] {
    const dynamicGroups: string[] = [];
    
    for (const varName of filenameVariables) {
      const varValue = elnMetadata[varName];
      if (varValue) {
        // Add the filename variable value as a group name
        dynamicGroups.push(String(varValue));
      }
    }
    
    return dynamicGroups;
  }
}

// Global instance
export const elnAccessControl = new ELNAccessControl(); 