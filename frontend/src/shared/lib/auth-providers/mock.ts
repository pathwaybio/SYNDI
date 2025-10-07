// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Mock Authentication Provider for Local Development
 * 
 * Provides simple authentication with pre-configured test users
 * for development and testing purposes.
 */

import { AuthProvider, User } from '../auth';
import { MockUser } from '../../types/config';

const DEFAULT_MOCK_USERS: MockUser[] = [
  {
    id: '1',
    email: 'admin@local.dev',
    username: 'admin',
    password: 'dev123',
    name: 'Admin User',
    groups: ['admin'],
    permissions: ['submit:*', 'view:*', 'admin:*'],
    isAdmin: true,
  },
  {
    id: '2',
    email: 'researcher@local.dev',
    username: 'researcher',
    password: 'dev123',
    name: 'Researcher User',
    groups: ['researcher'],
    permissions: ['submit:SOP*', 'view:own', 'view:group'],
    isAdmin: false,
  },
  {
    id: '3',
    email: 'user@local.dev',
    username: 'user',
    password: 'dev123',
    name: 'Regular User',
    groups: ['user'],
    permissions: ['view:own'],
    isAdmin: false,
  },
];

export interface MockAuthConfig {
  users: MockUser[];
  defaultGroups: string[];
}

export class MockAuthProvider implements AuthProvider {
  private users: MockUser[];
  private currentUser: User | null = null;
  private defaultGroups: string[];

  constructor(config: MockAuthConfig) {
    // SECURITY: Never fall back to default users - this creates a security hole
    if (!config.users || config.users.length === 0) {
      const error = 'MockAuthProvider: No users configured! This would create a security vulnerability.';
      console.error(error);
      throw new Error(error);
    }
    
    this.users = config.users;
    this.defaultGroups = config.defaultGroups || ['user'];
    
    // Debug logging for dev mode
    console.log('MockAuthProvider initialized:', {
      providedUsers: config.users.length,
      actualUsers: this.users.map(u => ({ id: u.id, email: u.email, username: u.username })),
      securityMode: 'strict'
    });
    
    // Check if user is already "logged in" via localStorage
    this.loadCurrentUser();
  }

  async login(email: string, password: string): Promise<User> {
    const mockUser = this.users.find(u => u.email === email && u.password === password);
    
    if (!mockUser) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateMockToken(mockUser);
    const user: User = {
      id: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
      name: mockUser.name,
      groups: mockUser.groups,
      permissions: mockUser.permissions,
      isAdmin: mockUser.isAdmin || false,
      token: token,
    };

    console.log('Mock auth login successful:', {
      userId: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
      token: token
    });

    this.currentUser = user;
    this.saveCurrentUser(user);
    
    return user;
  }

  async logout(): Promise<void> {
    this.currentUser = null;
    localStorage.removeItem('mock-auth-user');
  }

  async signup(email: string, password: string, name: string): Promise<User> {
    // Check if user already exists
    if (this.users.find(u => u.email === email)) {
      throw new Error('User already exists');
    }

    // Create new user with default permissions
    const newMockUser: MockUser = {
      id: Date.now().toString(),
      email,
      username: email.split('@')[0],
      password,
      name,
      groups: this.defaultGroups,
      permissions: ['view:own'],
      isAdmin: false,
    };

    this.users.push(newMockUser);

    const user: User = {
      id: newMockUser.id,
      email: newMockUser.email,
      username: newMockUser.username,
      name: newMockUser.name,
      groups: newMockUser.groups,
      permissions: newMockUser.permissions,
      isAdmin: false,
      token: this.generateMockToken(newMockUser),
    };

    this.currentUser = user;
    this.saveCurrentUser(user);
    
    return user;
  }

  async validateToken(token: string): Promise<User> {
    if (!token.startsWith('mock-token-')) {
      throw new Error('Invalid token format');
    }

    const userId = token.split('-')[2];
    const mockUser = this.users.find(u => u.id === userId);
    
    if (!mockUser) {
      throw new Error('Invalid token');
    }

    return {
      id: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
      name: mockUser.name,
      groups: mockUser.groups,
      permissions: mockUser.permissions,
      isAdmin: mockUser.isAdmin || false,
      token,
    };
  }

  async getCurrentUser(): Promise<User | null> {
    return this.currentUser;
  }

  private generateMockToken(user: MockUser): string {
    return `mock-token-${user.id}-${Date.now()}`;
  }

  private saveCurrentUser(user: User): void {
    localStorage.setItem('mock-auth-user', JSON.stringify(user));
  }

  private loadCurrentUser(): void {
    try {
      const stored = localStorage.getItem('mock-auth-user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load stored user:', error);
      localStorage.removeItem('mock-auth-user');
    }
  }

  // Development helpers
  getAvailableUsers(): MockUser[] {
    return this.users.map(u => ({
      ...u,
      password: '***' // Hide passwords in dev tools
    }));
  }

  addTestUser(user: MockUser): void {
    this.users.push(user);
  }
} 