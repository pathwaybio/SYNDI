// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for RBAC utility functions
 * Tests the functional permission checking for frontend
 */

import { describe, it, expect } from 'vitest';
import {
  canSubmit,
  canManageDrafts,
  canViewData,
  canViewUserData,
  getUserRoleDisplay,
  hasRole,
  filterViewableData,
  PERMISSIONS,
  ROLES
} from '../../src/shared/lib/rbac-utils';
import type { User } from '../../src/shared/lib/auth';

// Mock users for testing
const adminUser: User = {
  id: 'admin1',
  email: 'admin@test.com',
  username: 'admin',
  name: 'Admin User',
  groups: ['admin'],
  permissions: ['*'],
  isAdmin: true
};

const researcherUser: User = {
  id: 'researcher1',
  email: 'researcher@test.com',
  username: 'researcher',
  name: 'Researcher User',
  groups: ['researcher'],
  permissions: ['submit:SOP*', 'view:own', 'view:group', 'draft:*'],
  isAdmin: false
};

const viewerUser: User = {
  id: 'viewer1',
  email: 'viewer@test.com',
  username: 'viewer',
  name: 'Viewer User',
  groups: ['viewer'],
  permissions: ['view:own', 'view:group'],
  isAdmin: false
};

describe('canSubmit', () => {
  it('should allow admin to submit anything', () => {
    expect(canSubmit(adminUser, 'sop1')).toBe(true);
    expect(canSubmit(adminUser)).toBe(true);
  });

  it('should allow researcher to submit SOPs', () => {
    expect(canSubmit(researcherUser, 'sop1')).toBe(true);
    expect(canSubmit(researcherUser)).toBe(true);
  });

  it('should not allow viewer to submit', () => {
    expect(canSubmit(viewerUser, 'sop1')).toBe(false);
    expect(canSubmit(viewerUser)).toBe(false);
  });

  it('should return false for null user', () => {
    expect(canSubmit(null, 'sop1')).toBe(false);
  });

  it('should check wildcard submit permission', () => {
    const userWithWildcard: User = {
      ...viewerUser,
      permissions: ['submit:*']
    };
    expect(canSubmit(userWithWildcard, 'sop1')).toBe(true);
  });

  it('should check specific SOP permission', () => {
    const userWithSpecific: User = {
      ...viewerUser,
      permissions: ['submit:sop1']
    };
    expect(canSubmit(userWithSpecific, 'sop1')).toBe(true);
    expect(canSubmit(userWithSpecific, 'sop2')).toBe(false);
  });
});

describe('canManageDrafts', () => {
  it('should allow admin to manage drafts', () => {
    expect(canManageDrafts(adminUser, 'create')).toBe(true);
    expect(canManageDrafts(adminUser, 'update')).toBe(true);
    expect(canManageDrafts(adminUser, 'delete')).toBe(true);
  });

  it('should allow researcher to manage drafts', () => {
    expect(canManageDrafts(researcherUser, 'create')).toBe(true);
    expect(canManageDrafts(researcherUser, 'update')).toBe(true);
    expect(canManageDrafts(researcherUser, 'delete')).toBe(true);
  });

  it('should not allow viewer to manage drafts', () => {
    expect(canManageDrafts(viewerUser, 'create')).toBe(false);
    expect(canManageDrafts(viewerUser, 'update')).toBe(false);
  });

  it('should return false for null user', () => {
    expect(canManageDrafts(null)).toBe(false);
  });

  it('should check specific draft action permissions', () => {
    const userWithSpecific: User = {
      ...viewerUser,
      permissions: ['draft:create', 'draft:update']
    };
    expect(canManageDrafts(userWithSpecific, 'create')).toBe(true);
    expect(canManageDrafts(userWithSpecific, 'update')).toBe(true);
    expect(canManageDrafts(userWithSpecific, 'delete')).toBe(false);
  });
});

describe('canViewData', () => {
  it('should allow admin to view all data', () => {
    expect(canViewData(adminUser, 'own')).toBe(true);
    expect(canViewData(adminUser, 'group')).toBe(true);
    expect(canViewData(adminUser, 'all')).toBe(true);
  });

  it('should allow researcher appropriate view permissions', () => {
    expect(canViewData(researcherUser, 'own')).toBe(true);
    expect(canViewData(researcherUser, 'group')).toBe(true);
    expect(canViewData(researcherUser, 'all')).toBe(false);
  });

  it('should allow viewer basic view permissions', () => {
    expect(canViewData(viewerUser, 'own')).toBe(true);
    expect(canViewData(viewerUser, 'group')).toBe(true);
    expect(canViewData(viewerUser, 'all')).toBe(false);
  });

  it('should return false for null user', () => {
    expect(canViewData(null)).toBe(false);
  });
});

describe('canViewUserData', () => {
  it('should allow viewing own data', () => {
    expect(canViewUserData(researcherUser, 'researcher1')).toBe(true);
    expect(canViewUserData(researcherUser, researcherUser.id)).toBe(true);
    expect(canViewUserData(researcherUser, researcherUser.username)).toBe(true);
  });

  it('should allow admin to view any user data', () => {
    expect(canViewUserData(adminUser, 'any_user')).toBe(true);
  });

  it('should allow group view permission', () => {
    expect(canViewUserData(researcherUser, 'other_user')).toBe(true); // has view:group
  });

  it('should not allow viewing other user data without group permission', () => {
    const userWithOwnOnly: User = {
      ...viewerUser,
      permissions: ['view:own']
    };
    expect(canViewUserData(userWithOwnOnly, 'other_user')).toBe(false);
  });

  it('should return false for null user', () => {
    expect(canViewUserData(null, 'user1')).toBe(false);
  });
});

describe('getUserRoleDisplay', () => {
  it('should return correct role displays', () => {
    expect(getUserRoleDisplay(adminUser)).toBe('Admin');
    expect(getUserRoleDisplay(researcherUser)).toBe('Researcher');
    expect(getUserRoleDisplay(viewerUser)).toBe('Viewer');
    expect(getUserRoleDisplay(null)).toBe('Guest');
  });

  it('should fallback to User for unknown roles', () => {
    const unknownUser: User = {
      ...viewerUser,
      groups: ['unknown']
    };
    expect(getUserRoleDisplay(unknownUser)).toBe('User');
  });
});

describe('hasRole', () => {
  it('should correctly identify admin role', () => {
    expect(hasRole(adminUser, 'admin')).toBe(true);
    expect(hasRole(researcherUser, 'admin')).toBe(false);
  });

  it('should correctly identify group roles', () => {
    expect(hasRole(researcherUser, 'researcher')).toBe(true);
    expect(hasRole(viewerUser, 'viewer')).toBe(true);
    expect(hasRole(researcherUser, 'viewer')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(hasRole(adminUser, 'ADMIN')).toBe(true);
    expect(hasRole(researcherUser, 'RESEARCHER')).toBe(true);
  });

  it('should return false for null user', () => {
    expect(hasRole(null, 'admin')).toBe(false);
  });
});

describe('filterViewableData', () => {
  const testData = [
    { user_id: 'user1', content: 'data1' },
    { user_id: 'user2', content: 'data2' },
    { user_id: 'user3', content: 'data3' }
  ];

  it('should return all data for admin', () => {
    const filtered = filterViewableData(adminUser, testData);
    expect(filtered).toHaveLength(3);
  });

  it('should return only user own data with view:own permission', () => {
    const userWithOwnOnly: User = {
      ...researcherUser,
      id: 'user1',
      username: 'user1',
      permissions: ['view:own']
    };
    const filtered = filterViewableData(userWithOwnOnly, testData);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].user_id).toBe('user1');
  });

  it('should return all data with view:group permission', () => {
    const filtered = filterViewableData(researcherUser, testData);
    expect(filtered).toHaveLength(3); // researcher has view:group
  });

  it('should return empty array for null user', () => {
    const filtered = filterViewableData(null, testData);
    expect(filtered).toHaveLength(0);
  });

  it('should handle custom user id field', () => {
    const customData = [
      { owner_id: 'user1', content: 'data1' },
      { owner_id: 'user2', content: 'data2' }
    ];
    const userWithOwnOnly: User = {
      ...researcherUser,
      id: 'user1',
      permissions: ['view:own']
    };
    const filtered = filterViewableData(userWithOwnOnly, customData, 'owner_id');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].owner_id).toBe('user1');
  });
});

describe('Constants', () => {
  it('should provide permission constants', () => {
    expect(PERMISSIONS.SUBMIT_ALL).toBe('submit:*');
    expect(PERMISSIONS.VIEW_OWN).toBe('view:own');
    expect(PERMISSIONS.DRAFT_ALL).toBe('draft:*');
  });

  it('should provide role constants', () => {
    expect(ROLES.ADMIN).toBe('admin');
    expect(ROLES.RESEARCHER).toBe('researcher');
    expect(ROLES.VIEWER).toBe('viewer');
  });
});

describe('Integration scenarios', () => {
  it('should support researcher full workflow', () => {
    // Researcher should be able to do their full workflow
    expect(canManageDrafts(researcherUser, 'create')).toBe(true);
    expect(canManageDrafts(researcherUser, 'update')).toBe(true);
    expect(canSubmit(researcherUser, 'sop1')).toBe(true);
    expect(canViewData(researcherUser, 'own')).toBe(true);
    expect(canViewData(researcherUser, 'group')).toBe(true);
    expect(canViewData(researcherUser, 'all')).toBe(false);
  });

  it('should enforce viewer read-only access', () => {
    // Viewer should have read-only access
    expect(canManageDrafts(viewerUser, 'create')).toBe(false);
    expect(canSubmit(viewerUser, 'sop1')).toBe(false);
    expect(canViewData(viewerUser, 'own')).toBe(true);
    expect(canViewData(viewerUser, 'group')).toBe(true);
  });
});