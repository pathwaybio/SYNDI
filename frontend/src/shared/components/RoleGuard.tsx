// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Role Guard Component for CLAIRE
 * 
 * Provides conditional rendering based on user permissions and roles.
 * Uses functional RBAC utilities for permission checking.
 */

import React from 'react';
import { useAuth } from '../lib/auth';
import { canSubmit, canManageDrafts, canViewData, hasRole, getUserRoleDisplay } from '../lib/rbac-utils';

interface RoleGuardProps {
  children: React.ReactNode;
  /** Show children only if user has submit permission */
  requireSubmit?: boolean;
  /** SOP ID for submit permission check */
  sopId?: string;
  /** Show children only if user can manage drafts */
  requireDrafts?: boolean;
  /** Draft action to check (create, update, delete) */
  draftAction?: string;
  /** Show children only if user can view data */
  requireView?: boolean;
  /** View scope to check (own, group, all) */
  viewScope?: string;
  /** Show children only if user has specific role */
  requireRole?: string;
  /** Show children only if user has any of these roles */
  requireAnyRole?: string[];
  /** Show children only if user has all of these roles */
  requireAllRoles?: string[];
  /** Fallback content when permission is denied */
  fallback?: React.ReactNode;
  /** Show fallback for unauthenticated users */
  showFallbackForGuests?: boolean;
}

export function RoleGuard({
  children,
  requireSubmit = false,
  sopId,
  requireDrafts = false,
  draftAction = 'create',
  requireView = false,
  viewScope = 'own',
  requireRole,
  requireAnyRole,
  requireAllRoles,
  fallback = null,
  showFallbackForGuests = false
}: RoleGuardProps) {
  const { user } = useAuth();

  // Handle unauthenticated users
  if (!user) {
    return showFallbackForGuests ? <>{fallback}</> : null;
  }

  // Check submit permission
  if (requireSubmit && !canSubmit(user, sopId)) {
    return <>{fallback}</>;
  }

  // Check draft permission  
  if (requireDrafts && !canManageDrafts(user, draftAction)) {
    return <>{fallback}</>;
  }

  // Check view permission
  if (requireView && !canViewData(user, viewScope)) {
    return <>{fallback}</>;
  }

  // Check specific role
  if (requireRole && !hasRole(user, requireRole)) {
    return <>{fallback}</>;
  }

  // Check any of the required roles
  if (requireAnyRole && !requireAnyRole.some(role => hasRole(user, role))) {
    return <>{fallback}</>;
  }

  // Check all required roles
  if (requireAllRoles && !requireAllRoles.every(role => hasRole(user, role))) {
    return <>{fallback}</>;
  }

  // All checks passed, render children
  return <>{children}</>;
}

/**
 * Component to display user's current role
 */
interface UserRoleBadgeProps {
  className?: string;
  showFullRole?: boolean;
}

export function UserRoleBadge({ className = '', showFullRole = true }: UserRoleBadgeProps) {
  const { user } = useAuth();

  if (!user) {
    return <span className={`role-badge guest ${className}`}>Guest</span>;
  }

  const roleDisplay = getUserRoleDisplay(user);
  const roleName = showFullRole ? roleDisplay : roleDisplay.charAt(0);

  const roleClass = roleDisplay.toLowerCase();

  return (
    <span 
      className={`role-badge ${roleClass} ${className}`}
      title={`Role: ${roleDisplay}`}
    >
      {roleName}
    </span>
  );
}

/**
 * Hook for permission checking in components
 */
export function usePermissions() {
  const { user } = useAuth();

  return {
    canSubmit: (sopId?: string) => canSubmit(user, sopId),
    canManageDrafts: (action?: string) => canManageDrafts(user, action),
    canViewData: (scope?: string) => canViewData(user, scope),
    hasRole: (role: string) => hasRole(user, role),
    getUserRole: () => getUserRoleDisplay(user),
    isAdmin: user?.isAdmin ?? false,
    isResearcher: hasRole(user, 'researcher'),
    isViewer: hasRole(user, 'viewer'),
  };
}