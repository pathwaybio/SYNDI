// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for auth system integration with runtime config
 * 
 * Verifies that the auth provider properly merges runtime config
 * from the backend API with static config
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../../../src/shared/lib/auth';
import { configLoader } from '../../../../src/shared/lib/config-loader';
import React from 'react';

// Mock the config loader
vi.mock('../../../../src/shared/lib/config-loader', () => ({
  configLoader: {
    loadConfig: vi.fn(),
    loadRuntimeConfig: vi.fn(),
    clearCache: vi.fn(),
  }
}));

// Mock auth providers
vi.mock('../../../../src/shared/lib/auth-providers/cognito', () => ({
  CognitoAuthProvider: class MockCognitoAuthProvider {
    constructor(public config: any) {}
    async login() {
      return {
        id: 'test-user',
        email: 'test@example.com',
        username: 'testuser',
        groups: ['RESEARCHERS'],
        permissions: ['view:own'],
        isAdmin: false
      };
    }
    async logout() {}
    async getCurrentUser() {
      return null;
    }
  }
}));

vi.mock('../../../../src/shared/lib/auth-providers/jwt', () => ({
  JWTAuthProvider: class MockJWTAuthProvider {
    constructor(public config: any) {}
    async login() {
      return {
        id: 'test-user',
        email: 'test@example.com',
        username: 'testuser',
        groups: ['user'],
        permissions: ['view:own'],
        isAdmin: false
      };
    }
    async logout() {}
    async getCurrentUser() {
      return null;
    }
  }
}));

describe('Auth System - Runtime Config Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should merge runtime config with static config for Cognito', async () => {
    // Static config from config.json
    const staticConfig = {
      webapp: {
        apiEndpoint: 'https://api.example.com',
        auth: {
          provider: 'cognito' as const,
          required: true,
          cognito: {
            region: 'us-east-1',
            userPoolId: 'us-east-1_OLD123', // Old from config file
            clientId: 'oldclient123'
          },
          session: {
            timeout: 3600000,
            refreshBuffer: 300000
          }
        }
      }
    };

    // Runtime config from /api/config/runtime (CloudFormation truth)
    const runtimeConfig = {
      auth: {
        provider: 'cognito',
        config: {
          userPoolId: 'us-east-1_NEW456', // New from environment
          clientId: 'newclient456',
          region: 'us-east-1',
          source: 'environment'
        }
      }
    };

    (configLoader.loadConfig as any).mockResolvedValue(staticConfig);
    (configLoader.loadRuntimeConfig as any).mockResolvedValue(runtimeConfig);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify runtime config was fetched
    expect(configLoader.loadRuntimeConfig).toHaveBeenCalled();

    // Verify console logs show merged config
    expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Using runtime auth config from deployed Lambda');
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Auth config merged:', {
      userPoolId: 'us-east-1_NEW456',
      source: 'environment'
    });

    consoleLogSpy.mockRestore();
  });

  it('should use static config when runtime config not available', async () => {
    const staticConfig = {
      webapp: {
        apiEndpoint: 'https://api.example.com',
        auth: {
          provider: 'cognito' as const,
          required: true,
          cognito: {
            region: 'us-east-1',
            userPoolId: 'us-east-1_STATIC',
            clientId: 'staticclient'
          },
          session: {
            timeout: 3600000,
            refreshBuffer: 300000
          }
        }
      }
    };

    (configLoader.loadConfig as any).mockResolvedValue(staticConfig);
    (configLoader.loadRuntimeConfig as any).mockResolvedValue(null); // Runtime not available

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have attempted to load runtime config
    expect(configLoader.loadRuntimeConfig).toHaveBeenCalled();

    // Auth provider should still initialize with static config
    expect(result.current.user).toBeNull(); // No user yet, but system initialized
  });

  it('should not merge runtime config for JWT provider', async () => {
    const staticConfig = {
      webapp: {
        apiEndpoint: 'https://api.example.com',
        auth: {
          provider: 'jwt' as const,
          required: true,
          jwt: {
            secret: 'test-secret',
            algorithm: 'HS256' as const,
            baseUrl: '/api/auth'
          },
          session: {
            timeout: 3600000,
            refreshBuffer: 300000
          }
        }
      }
    };

    // Runtime config returns JWT info
    const runtimeConfig = {
      auth: {
        provider: 'jwt',
        config: {
          algorithm: 'HS256',
          mockUsers: 2,
          source: 'config_file'
        }
      }
    };

    (configLoader.loadConfig as any).mockResolvedValue(staticConfig);
    (configLoader.loadRuntimeConfig as any).mockResolvedValue(runtimeConfig);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should NOT merge for JWT (only Cognito needs runtime pool ID)
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Using runtime auth config')
    );

    consoleLogSpy.mockRestore();
  });

  it('should handle auth disabled for development', async () => {
    const staticConfig = {
      webapp: {
        apiEndpoint: 'http://localhost:8000',
        auth: {
          provider: 'cognito' as const,
          required: false, // Auth disabled
          session: {
            timeout: 3600000,
            refreshBuffer: 300000
          }
        }
      }
    };

    (configLoader.loadConfig as any).mockResolvedValue(staticConfig);
    (configLoader.loadRuntimeConfig as any).mockResolvedValue(null);

    // Mock window.location.hostname
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have default dev user
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.username).toBe('admin');
    expect(result.current.user?.isAdmin).toBe(true);

    // Should have warned about disabled auth
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SECURITY WARNING: Auth disabled')
    );

    // Should NOT have attempted runtime config (auth disabled)
    expect(configLoader.loadRuntimeConfig).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('should handle errors gracefully during runtime config fetch', async () => {
    const staticConfig = {
      webapp: {
        apiEndpoint: 'https://api.example.com',
        auth: {
          provider: 'cognito' as const,
          required: true,
          cognito: {
            region: 'us-east-1',
            userPoolId: 'us-east-1_FALLBACK',
            clientId: 'fallbackclient'
          },
          session: {
            timeout: 3600000,
            refreshBuffer: 300000
          }
        }
      }
    };

    (configLoader.loadConfig as any).mockResolvedValue(staticConfig);
    (configLoader.loadRuntimeConfig as any).mockRejectedValue(new Error('Network error'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should still initialize (errors are caught)
    expect(result.current.user).toBeNull();
  });
});

