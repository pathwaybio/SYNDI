// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { configLoader } from './config-loader';
import { AuthConfig } from '../types/config';

/**
 * Authentication System
 * 
 * HOW TO DISABLE AUTH FOR DEVELOPMENT/TESTING:
 * 
 * Method 1: Config File (Recommended)
 * - Set "auth": { "required": false } in infra/.config/webapp/dev.json
 * - Run: make setup-local (to deploy config changes)
 * 
 * Method 2: Temporary Override (Development only)
 * - Change config.webapp.auth?.required === false to true in initializeAuth()
 * 
 * SECURITY NOTE: Frontend auth is UX only - real security happens on backend API endpoints
 * 
 * When auth is disabled:
 * - No login required
 * - All auth checks return true
 * - User context is null but app functions normally
 * - API calls work without authentication headers
 */

// Enhanced User interface with groups and permissions
export interface User {
  id: string;
  email: string;
  username: string;
  name?: string;
  groups: string[];
  permissions: string[];
  isAdmin: boolean;
  token?: string;
  refreshToken?: string;
}

// Enhanced AuthContextType interface
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup?: (email: string, password: string, name: string) => Promise<void>;
  refreshToken?: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isInGroup: (group: string) => boolean;
  getToken: () => string | null;
}

// Abstract auth provider interface
export interface AuthProvider {
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshToken?: () => Promise<User>;
  signup?: (email: string, password: string, name: string) => Promise<User>;
  validateToken?: (token: string) => Promise<User>;
  getCurrentUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider factory - simplified to 2 providers only
export const createAuthProvider = async (config: AuthConfig): Promise<AuthProvider> => {
  switch (config.provider) {
    case 'cognito': {
      const { CognitoAuthProvider } = await import('./auth-providers/cognito');
      if (!config.cognito) {
        throw new Error('Cognito configuration required');
      }
      return new CognitoAuthProvider(config.cognito);
    }
    
    case 'jwt': {
      const { JWTAuthProvider } = await import('./auth-providers/jwt');
      if (!config.jwt) {
        throw new Error('JWT configuration required');
      }
      return new JWTAuthProvider({
        ...config.jwt,
        baseUrl: config.jwt.baseUrl || '/api/auth',
        loginEndpoint: config.jwt.loginEndpoint || '/login',
        signupEndpoint: config.jwt.signupEndpoint,
        refreshEndpoint: config.jwt.refreshEndpoint
      });
    }
    
    default:
      throw new Error(
        `Unsupported auth provider: ${config.provider}. ` +
        `Supported: 'cognito' (AWS), 'jwt' (local/self-hosted). ` +
        `Note: 'mock' and 'service' providers have been removed.`
      );
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authProvider, setAuthProvider] = useState<AuthProvider | null>(null);
  const [isAuthDisabled, setIsAuthDisabled] = useState(false);

  // Initialize auth system
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Load configuration
        const config = await configLoader.loadConfig();
        
        // Check if auth is disabled for dev environment
        const authDisabled = config.webapp.auth?.required === false;
        setIsAuthDisabled(authDisabled);
        
        if (authDisabled) {
          // CRITICAL: Auth is disabled - this should ONLY be used in dev/test environments
          // Check if we're in a safe environment
          const apiEndpoint = config.webapp.apiEndpoint || '';
          const isLocalhost = apiEndpoint.includes('localhost') || apiEndpoint.includes('127.0.0.1');
          
          if (!isLocalhost && window.location.hostname !== 'localhost') {
            console.error('🔒 SECURITY ERROR: Auth disabled in non-local environment!');
            throw new Error('Authentication disabled in production environment - this is a security error');
          }
          
          console.warn('🔓 SECURITY WARNING: Auth disabled for development environment');
          // Set a default admin user when auth is disabled (dev/test only)
          const defaultUser: User = {
            id: 'dev-user',
            email: 'admin@local.dev',
            username: 'admin',
            name: 'Development Admin',
            groups: ['admin'],
            permissions: ['*'],
            isAdmin: true
          };
          setUser(defaultUser);
          setIsLoading(false);
          return;
        }

        // Try to load runtime config from backend (deployed Lambda truth)
        const runtimeConfig = await configLoader.loadRuntimeConfig();
        let authConfig = config.webapp.auth;
        
        // If runtime config available and provider is Cognito, merge it
        if (runtimeConfig?.auth?.provider === 'cognito' && runtimeConfig.auth.config) {
          console.log('🔄 Using runtime auth config from deployed Lambda');
          authConfig = {
            ...authConfig,
            cognito: {
              ...authConfig.cognito,
              ...runtimeConfig.auth.config
            }
          };
          console.log('✅ Auth config merged:', {
            userPoolId: authConfig.cognito?.userPoolId,
            source: runtimeConfig.auth.config.source
          });
        }

        // Create auth provider based on configuration
        const provider = await createAuthProvider(authConfig);
        setAuthProvider(provider);
        
        // Try to get current user (if token exists)
        const currentUser = await provider.getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          console.log('🔐 Restored user session:', currentUser.username);
        }
      } catch (error) {
        console.error('❌ Failed to initialize auth system:', error);
        // Don't throw - allow app to continue with no auth
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    // If auth is disabled, always succeed with a default user
    if (isAuthDisabled) {
      const defaultUser: User = {
        id: 'dev-user',
        email: email,
        username: 'admin',
        name: 'Development Admin',
        groups: ['admin'],
        permissions: ['*'],
        isAdmin: true
      };
      setUser(defaultUser);
      console.log('✅ Auth disabled - auto-login successful:', defaultUser.username);
      return;
    }

    if (!authProvider) {
      throw new Error('Auth provider not initialized');
    }

    try {
      const user = await authProvider.login(email, password);
      setUser(user);
      console.log('✅ User logged in:', user.username);
      
      // Load private config after successful authentication
      try {
        const fullConfig = await configLoader.loadPrivateConfigAfterAuth();
        console.log('✅ Private config loaded after authentication');
        // Store full config for app use (you may want to update app state here)
      } catch (configError) {
        console.warn('⚠️ Failed to load private config after auth:', configError);
        // Continue with public config only
      }
    } catch (error) {
      console.error('❌ Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    if (!authProvider) {
      setUser(null);
      return;
    }

    try {
      await authProvider.logout();
      setUser(null);
      console.log('✅ User logged out');
    } catch (error) {
      console.error('❌ Logout failed:', error);
      // Still clear user state even if logout fails
      setUser(null);
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    if (!authProvider?.signup) {
      throw new Error('Signup not supported by current auth provider');
    }

    try {
      const user = await authProvider.signup(email, password, name);
      setUser(user);
      console.log('✅ User signed up:', user.username);
    } catch (error) {
      console.error('❌ Signup failed:', error);
      throw error;
    }
  };

  const refreshToken = async () => {
    if (!authProvider?.refreshToken) {
      console.log('Token refresh not supported by current auth provider');
      return;
    }

    try {
      const user = await authProvider.refreshToken();
      setUser(user);
      console.log('✅ Token refreshed');
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      // Clear user on refresh failure
      setUser(null);
    }
  };

  const hasPermission = (permission: string): boolean => {
    // If auth is disabled, allow all permissions
    if (!authProvider) return true;
    
    if (!user) return false;
    
    // Check for wildcard permissions
    if (user.permissions.includes('*') || user.permissions.includes('admin:*')) {
      return true;
    }
    
    // Check for exact permission match
    if (user.permissions.includes(permission)) {
      return true;
    }
    
    // Check for pattern matches (e.g., "submit:*" matches "submit:SOP1")
    const [action, resource] = permission.split(':');
    const wildcardPermission = `${action}:*`;
    if (user.permissions.includes(wildcardPermission)) {
      return true;
    }
    
    return false;
  };

  const isInGroup = (group: string): boolean => {
    // If auth is disabled, allow all groups
    if (!authProvider) return true;
    
    if (!user) return false;
    return user.groups.includes(group);
  };

  const getToken = (): string | null => {
    return user?.token || null;
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: isAuthDisabled || !!user,
    isLoading,
    login,
    logout,
    signup,
    refreshToken,
    hasPermission,
    isInGroup,
    getToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 