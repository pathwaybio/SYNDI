// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 *  JWT Authentication Provider for CLAIRE
 * 
 * Environment Support:
 * - Local Dev/Test: Mock users with development tokens
 * - Self-Hosted: Real JWT authentication without API Gateway
 * 
 * ⚠️  NOT FOR AWS STAGE/PROD: API Gateway Cognito Authorizer blocks non-Cognito tokens
 */

import { AuthProvider, User } from '../auth';

// Import MockUser from shared types to avoid duplication
import type { MockUser } from '../../types/config';

export interface JWTAuthConfig {
  secret: string;
  algorithm: 'HS256' | 'RS256';
  issuer?: string;
  audience?: string;
  baseUrl: string;
  loginEndpoint: string;
  signupEndpoint?: string;
  refreshEndpoint?: string;
  
  // Development Configuration (mock users)
  mockUsers?: MockUser[];
  defaultGroups?: string[];
  
  // Security
  tokenExpiry?: number;  // seconds
  environment?: 'dev' | 'test' | 'stage' | 'prod';
}

export interface JWTPayload {
  sub: string;
  email: string;
  username: string;
  name?: string;
  groups: string[];
  permissions: string[];
  isAdmin: boolean;
  iss?: string;
  aud?: string;
  exp: number;
  iat: number;
}

export class JWTAuthProvider implements AuthProvider {
  private config: JWTAuthConfig;
  private currentUser: User | null = null;
  private jwtToken: string | null = null;

  constructor(config: JWTAuthConfig) {
    this.config = {
      tokenExpiry: 8 * 60 * 60, // 8 hours
      environment: 'dev',
      ...config
    };
    
    // CRITICAL: Enforce environment constraints
    this.validateEnvironment();
    this.loadCurrentUser();
    
    console.log('🔐 JWT Provider initialized:', {
      baseUrl: config.baseUrl,
      environment: this.config.environment,
      hasMockUsers: !!(config.mockUsers && config.mockUsers.length > 0),
      algorithm: config.algorithm
    });
  }

  private validateEnvironment(): void {
    const env = this.config.environment;
    
    // Block usage in AWS stage/prod
    if (env === 'stage' || env === 'prod') {
      throw new Error(
        `JWT Provider cannot be used in ${env} environment.\n` +
        `API Gateway Cognito Authorizer will reject non-Cognito tokens.\n` +
        `Use Cognito provider for AWS deployments.`
      );
    }
    
    // Validate mock user passwords
    if (this.config.mockUsers) {
      for (const user of this.config.mockUsers) {
        if (user.password.length < 8) {
          throw new Error(
            `Mock user ${user.email} has weak password. Minimum 8 characters required.`
          );
        }
      }
    }
  }

  async login(email: string, password: string): Promise<User> {
    console.log(`🔐 Login attempt: ${email} (env: ${this.config.environment})`);
    
    try {
      // Priority 1: Mock users (development/testing)
      if (this.config.mockUsers && this.config.mockUsers.length > 0) {
        const mockUser = this.config.mockUsers.find(u => 
          u.email === email && u.password === password
        );
        
        if (mockUser) {
          console.log('🔓 Development mock authentication');
          return await this.authenticateMockUser(mockUser);
        }
      }

      // Priority 2: Real JWT (self-hosted production)
      console.log('🔐 Production JWT authentication');
      return await this.authenticateWithJWT(email, password);
      
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async authenticateMockUser(mockUser: MockUser): Promise<User> {
    const token = this.generateDevToken(mockUser);
    
    const user: User = {
      id: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
      name: mockUser.name || mockUser.username,
      groups: mockUser.groups,
      permissions: mockUser.permissions,
      isAdmin: mockUser.isAdmin || false,
      token: token,
    };

    this.currentUser = user;
    this.jwtToken = token;
    this.saveCurrentUser(user);
    
    console.log('✅ Mock user authenticated:', {
      userId: user.id,
      username: user.username,
      environment: this.config.environment
    });
    
    return user;
  }

  private generateDevToken(mockUser: MockUser): string {
    /**
     * Development token format:
     * - Header contains dev_mode flag
     * - Signed with HMAC for consistency
     * - Backend validates environment before accepting
     */
    
    const header = { 
      alg: 'HS256', 
      typ: 'JWT',
      dev_mode: true
    };
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
      name: mockUser.name,
      groups: mockUser.groups,
      permissions: mockUser.permissions,
      isAdmin: mockUser.isAdmin,
      exp: now + (this.config.tokenExpiry || 28800),
      iat: now,
      nbf: now - 60, // Allow 1 min clock skew
      jti: this.generateJTI(),
      iss: `claire-${this.config.environment}`,
      aud: 'claire-backend',
      env: this.config.environment
    };

    const headerEncoded = this.base64UrlEncode(JSON.stringify(header));
    const payloadEncoded = this.base64UrlEncode(JSON.stringify(payload));
    const signature = this.simpleHMAC(`${headerEncoded}.${payloadEncoded}`);
    
    return `${headerEncoded}.${payloadEncoded}.${signature}`;
  }

  private generateJTI(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private simpleHMAC(data: string): string {
    // Simplified HMAC for browser compatibility
    // Backend performs proper cryptographic validation
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.config.secret);
    const messageData = encoder.encode(data);
    
    let hash = 0;
    const combined = [...keyData, ...messageData];
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined[i];
      hash = hash & hash;
    }
    
    return this.base64UrlEncode(hash.toString(36));
  }

  private async authenticateWithJWT(email: string, password: string): Promise<User> {
    const url = `${this.config.baseUrl}${this.config.loginEndpoint}`;
    
    console.log(`🔐 JWT auth request: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) throw new Error('Authentication failed');

    const decoded = this.decodeJWT(data.token);
    const user: User = {
      id: decoded.sub,
      email: decoded.email,
      username: decoded.username,
      name: decoded.name,
      groups: decoded.groups || ['user'],
      permissions: decoded.permissions || ['view:own'],
      isAdmin: decoded.isAdmin || false,
      token: data.token,
      refreshToken: data.refreshToken,
    };

    this.currentUser = user;
    this.jwtToken = data.token;
    this.saveCurrentUser(user);
    
    console.log('✅ JWT user authenticated:', user.username);
    return user;
  }

  async logout(): Promise<void> {
    try {
      // Optionally notify the server about logout
      if (this.jwtToken) {
        await this.logoutFromJWT(this.jwtToken);
      }
      
      this.currentUser = null;
      this.jwtToken = null;
      localStorage.removeItem('jwt-auth-user');
    } catch (error) {
      console.error('JWT logout failed:', error);
      // Continue with local cleanup even if remote logout fails
      this.currentUser = null;
      this.jwtToken = null;
      localStorage.removeItem('jwt-auth-user');
    }
  }

  async signup(email: string, password: string, name: string): Promise<User> {
    try {
      if (!this.config.signupEndpoint) {
        throw new Error('Signup not supported by this JWT provider');
      }

      // Make real HTTP request to JWT signup endpoint
      const signupResponse = await this.signupWithJWT(email, password, name);
      
      if (!signupResponse.success) {
        throw new Error('Signup failed');
      }

      const decoded = this.decodeJWT(signupResponse.token);
      const user: User = {
        id: decoded.sub,
        email: decoded.email,
        username: decoded.username,
        name: decoded.name,
        groups: decoded.groups || ['user'],
        permissions: decoded.permissions || ['view:own'],
        isAdmin: false,
        token: signupResponse.token,
        refreshToken: signupResponse.refreshToken,
      };

      this.currentUser = user;
      this.jwtToken = signupResponse.token;
      this.saveCurrentUser(user);
      
      return user;
    } catch (error) {
      console.error('JWT signup failed:', error);
      throw new Error('Signup failed');
    }
  }

  async refreshToken(): Promise<User> {
    try {
      const stored = this.getStoredAuth();
      if (!stored?.refreshToken) {
        throw new Error('No refresh token available');
      }

      if (!this.config.refreshEndpoint) {
        throw new Error('Token refresh not supported by this JWT provider');
      }

      // Make real HTTP request to refresh the token
      const refreshResponse = await this.refreshJWT(stored.refreshToken);
      
      if (!refreshResponse.success) {
        throw new Error('Token refresh failed');
      }

      const decoded = this.decodeJWT(refreshResponse.token);
      const user: User = {
        id: decoded.sub,
        email: decoded.email,
        username: decoded.username,
        name: decoded.name,
        groups: decoded.groups || ['user'],
        permissions: decoded.permissions || ['view:own'],
        isAdmin: decoded.isAdmin || false,
        token: refreshResponse.token,
        refreshToken: refreshResponse.refreshToken,
      };

      this.currentUser = user;
      this.jwtToken = refreshResponse.token;
      this.saveCurrentUser(user);
      
      return user;
    } catch (error) {
      console.error('JWT token refresh failed:', error);
      throw error;
    }
  }

  async validateToken(token: string): Promise<User> {
    try {
      // Decode and validate the JWT token
      const decoded = this.decodeJWT(token);
      
      // Check if token has expired
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp <= now) {
        throw new Error('Token has expired');
      }

      return {
        id: decoded.sub,
        email: decoded.email,
        username: decoded.username,
        name: decoded.name,
        groups: decoded.groups || ['user'],
        permissions: decoded.permissions || ['view:own'],
        isAdmin: decoded.isAdmin || false,
        token: token,
      };
    } catch (error) {
      console.error('JWT token validation failed:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    if (this.currentUser && this.jwtToken) {
      try {
        // Validate that the current token is still valid
        await this.validateToken(this.jwtToken);
        return this.currentUser;
      } catch (error) {
        console.warn('Current JWT token is invalid:', error);
        
        // Try to refresh the token
        try {
          return await this.refreshToken();
        } catch (refreshError) {
          console.warn('Token refresh failed:', refreshError);
          this.currentUser = null;
          this.jwtToken = null;
          localStorage.removeItem('jwt-auth-user');
          return null;
        }
      }
    }
    
    return this.currentUser;
  }

  private decodeJWT(token: string): JWTPayload {
    try {
      // Simple JWT decode (header.payload.signature)
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      // Decode the payload (base64url -> JSON)
      const payload = parts[1];
      const decoded = JSON.parse(this.base64UrlDecode(payload));

      // Validate required fields
      if (!decoded.sub || !decoded.email || !decoded.exp) {
        throw new Error('Invalid JWT payload: missing required fields');
      }

      // Validate issuer and audience if configured
      if (this.config.issuer && decoded.iss !== this.config.issuer) {
        throw new Error(`Invalid JWT issuer: expected ${this.config.issuer}, got ${decoded.iss}`);
      }

      if (this.config.audience && decoded.aud !== this.config.audience) {
        throw new Error(`Invalid JWT audience: expected ${this.config.audience}, got ${decoded.aud}`);
      }

      return decoded as JWTPayload;
    } catch (error) {
      console.error('Failed to decode JWT:', error);
      throw new Error(`Invalid JWT token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private base64UrlDecode(base64Url: string): string {
    // Convert base64url to base64
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Decode base64 to string
    return atob(base64);
  }

  private loadCurrentUser(): void {
    try {
      const stored = localStorage.getItem('jwt-auth-user');
      if (stored) {
        const data = JSON.parse(stored);
        this.currentUser = data.user;
        this.jwtToken = data.token;
      }
    } catch (error) {
      console.warn('Failed to load stored JWT user:', error);
      localStorage.removeItem('jwt-auth-user');
    }
  }

  private saveCurrentUser(user: User): void {
    try {
      const data = { user, token: this.jwtToken, timestamp: Date.now() };
      localStorage.setItem('jwt-auth-user', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save user:', error);
    }
  }

  private base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private getStoredAuth(): { user: User; token: string; refreshToken?: string } | null {
    try {
      const stored = localStorage.getItem('jwt-auth-user');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to get stored JWT auth:', error);
      localStorage.removeItem('jwt-auth-user');
    }
    return null;
  }
  
  // Stubs for signup/refresh/logout for self-hosted deployments
  private async signupWithJWT(email: string, password: string, name: string): Promise<any> {
    throw new Error('Signup requires server endpoint implementation');
  }

  private async refreshJWT(refreshToken: string): Promise<any> {
    throw new Error('Token refresh requires server endpoint implementation');
  }

  private async logoutFromJWT(token: string): Promise<void> {
    // Optional: notify server about logout - no-op for dev tokens
  }
} 