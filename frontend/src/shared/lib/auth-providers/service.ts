// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Service Authentication Provider for CI/CD and Testing
 * 
 * Provides authentication using long-lived service tokens for automated testing,
 * CI/CD pipelines, and service-to-service communication.
 */

import { AuthProvider, User } from '../auth';

export interface ServiceAuthConfig {
  baseUrl: string;
  apiKey: string;
  tokenEndpoint: string;
}

export class ServiceAuthProvider implements AuthProvider {
  private config: ServiceAuthConfig;
  private currentUser: User | null = null;
  private serviceToken: string | null = null;

  constructor(config: ServiceAuthConfig) {
    this.config = config;
    this.loadCurrentUser();
  }

  async login(serviceId: string, apiKey: string): Promise<User> {
    try {
      // Validate the provided API key against configuration
      if (apiKey !== this.config.apiKey) {
        throw new Error('Invalid API key');
      }

      // Make real HTTP request to service token endpoint
      const response = await this.requestServiceToken(serviceId, apiKey);
      
      if (!response.success) {
        throw new Error('Service authentication failed');
      }

      const user: User = {
        id: response.service_id,
        email: `${response.service_id}@service.local`,
        username: response.service_id,
        name: response.service_name || 'Service Account',
        groups: response.groups || ['service'],
        permissions: response.permissions || ['submit:*', 'view:*'],
        isAdmin: response.is_admin || false,
        token: response.token,
      };

      this.currentUser = user;
      this.serviceToken = response.token;
      this.saveCurrentUser(user);
      
      return user;
    } catch (error) {
      console.error('Service authentication failed:', error);
      throw new Error('Service authentication failed');
    }
  }

  async logout(): Promise<void> {
    try {
      // Revoke the service token on the backend
      if (this.serviceToken) {
        await this.revokeServiceToken(this.serviceToken);
      }
      
      this.currentUser = null;
      this.serviceToken = null;
      localStorage.removeItem('service-auth-user');
    } catch (error) {
      console.error('Service logout failed:', error);
      // Continue with local cleanup even if remote revocation fails
      this.currentUser = null;
      this.serviceToken = null;
      localStorage.removeItem('service-auth-user');
    }
  }

  async validateToken(token: string): Promise<User> {
    try {
      // Make real HTTP request to validate the token
      const response = await this.validateServiceToken(token);
      
      if (!response.valid) {
        throw new Error('Invalid service token');
      }

      return {
        id: response.service_id!,
        email: `${response.service_id}@service.local`,
        username: response.service_id!,
        name: response.service_name || 'Service Account',
        groups: response.groups || ['service'],
        permissions: response.permissions || ['submit:*', 'view:*'],
        isAdmin: response.is_admin || false,
        token: token,
      };
    } catch (error) {
      console.error('Service token validation failed:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    if (this.currentUser && this.serviceToken) {
      try {
        // Validate that the current token is still valid
        await this.validateToken(this.serviceToken);
        return this.currentUser;
      } catch (error) {
        console.warn('Current service token is invalid:', error);
        this.currentUser = null;
        this.serviceToken = null;
        localStorage.removeItem('service-auth-user');
        return null;
      }
    }
    
    return this.currentUser;
  }

  private async requestServiceToken(serviceId: string, apiKey: string): Promise<any> {
    try {
      const url = `${this.config.baseUrl}${this.config.tokenEndpoint}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_id: serviceId,
          api_key: apiKey
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to request service token:', error);
      throw new Error(`Failed to request service token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateServiceToken(token: string): Promise<any> {
    try {
      const url = `${this.config.baseUrl}/auth/service/validate`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to validate service token:', error);
      throw new Error(`Failed to validate service token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async revokeServiceToken(token: string): Promise<void> {
    try {
      const url = `${this.config.baseUrl}/auth/service/revoke`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          token: token
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn(`Service token revocation failed: ${errorData.detail || response.statusText}`);
        // Don't throw - revocation failure shouldn't prevent logout
      }

      console.log('Service token revoked successfully');
    } catch (error) {
      console.warn('Failed to revoke service token:', error);
      // Don't throw - revocation failure shouldn't prevent logout
    }
  }

  private loadCurrentUser(): void {
    try {
      const stored = localStorage.getItem('service-auth-user');
      if (stored) {
        const data = JSON.parse(stored);
        this.currentUser = data.user;
        this.serviceToken = data.token;
      }
    } catch (error) {
      console.warn('Failed to load stored service user:', error);
      localStorage.removeItem('service-auth-user');
    }
  }

  private saveCurrentUser(user: User): void {
    try {
      const data = {
        user: user,
        token: this.serviceToken,
        timestamp: Date.now()
      };
      localStorage.setItem('service-auth-user', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save service user:', error);
    }
  }
} 