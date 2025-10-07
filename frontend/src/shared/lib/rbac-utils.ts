// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * RBAC Utility Functions for CLAIRE Frontend
 * 
 * Provides functional utilities for role-based access control
 * matching the three-role system (Admin, Researcher, Viewer).
 */

import type { User } from './auth';

/**
 * Check if user can submit SOPs
 */
export function canSubmit(user: User | null, sopId?: string): boolean {
  if (!user) return false;
  
  // Admin override
  if (user.isAdmin) return true;
  
  // Check wildcard submit permission
  if (user.permissions.includes('submit:*')) return true;
  
  // Check SOP-specific submit permission
  if (user.permissions.includes('submit:SOP*')) return true;
  
  // Check specific SOP permission if provided
  if (sopId && user.permissions.includes(`submit:${sopId}`)) return true;
  
  return false;
}

/**
 * Check if user can manage drafts
 */
export function canManageDrafts(user: User | null, action: string = 'create'): boolean {
  if (!user) return false;
  
  // Admin override
  if (user.isAdmin) return true;
  
  // Check wildcard draft permission
  if (user.permissions.includes('draft:*')) return true;
  
  // Check specific draft action permission
  if (user.permissions.includes(`draft:${action}`)) return true;
  
  return false;
}

/**
 * Check if user can view data with given scope
 */
export function canViewData(user: User | null, scope: string = 'own'): boolean {
  if (!user) return false;
  
  // Admin override
  if (user.isAdmin) return true;
  
  // Check wildcard view permission
  if (user.permissions.includes('view:*')) return true;
  
  // Check specific view permission
  if (user.permissions.includes(`view:${scope}`)) return true;
  
  return false;
}

/**
 * Check if user can view another user's data
 */
export function canViewUserData(user: User | null, targetUserId: string): boolean {
  if (!user) return false;
  
  // Admin can view all
  if (user.isAdmin || user.permissions.includes('view:*')) return true;
  
  // Can always view own data
  if (user.id === targetUserId || user.username === targetUserId) return true;
  
  // Can view group data if has group permission
  if (user.permissions.includes('view:group')) return true;
  
  return false;
}

/**
 * Get display name for user's primary role
 */
export function getUserRoleDisplay(user: User | null): string {
  if (!user) return 'Guest';
  
  if (user.isAdmin) return 'Admin';
  
  if (user.groups.includes('researcher')) return 'Researcher';
  
  if (user.groups.includes('viewer')) return 'Viewer';
  
  return 'User'; // Fallback
}

/**
 * Check if user has specific role
 */
export function hasRole(user: User | null, role: string): boolean {
  if (!user) return false;
  
  const roleLower = role.toLowerCase();
  
  if (roleLower === 'admin') {
    return user.isAdmin;
  }
  
  if (['researcher', 'viewer', 'user'].includes(roleLower)) {
    return user.groups.some(g => g.toLowerCase() === roleLower);
  }
  
  return false;
}

/**
 * Filter list of data items to only those user can view
 */
export function filterViewableData<T extends Record<string, any>>(
  user: User | null, 
  dataList: T[], 
  userIdField: string = 'user_id'
): T[] {
  if (!user) return [];
  
  if (user.isAdmin || user.permissions.includes('view:*')) {
    return dataList;
  }
  
  return dataList.filter(item => {
    const targetUserId = item[userIdField];
    return targetUserId && canViewUserData(user, targetUserId);
  });
}

/**
 * Permission constants for easy reference
 */
export const PERMISSIONS = {
  SUBMIT_ALL: 'submit:*',
  SUBMIT_SOP: 'submit:SOP*',
  VIEW_ALL: 'view:*',
  VIEW_OWN: 'view:own',
  VIEW_GROUP: 'view:group',
  DRAFT_ALL: 'draft:*',
  DRAFT_CREATE: 'draft:create',
  DRAFT_UPDATE: 'draft:update',
  DRAFT_DELETE: 'draft:delete',
} as const;

/**
 * Role constants for easy reference
 */
export const ROLES = {
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
  VIEWER: 'viewer',
  USER: 'user',
} as const;