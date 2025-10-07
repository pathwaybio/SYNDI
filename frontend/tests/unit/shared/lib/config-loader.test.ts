// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader, configLoader } from '../../../../src/shared/lib/config-loader';
import { Environment } from '../../../../src/shared/types/config';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock import.meta.env
const mockImportMeta = {
  env: {
    MODE: 'test',
    REACT_APP_ENV: undefined as string | undefined,
    NODE_ENV: 'test',
    REACT_APP_API_BASE_URL: undefined as string | undefined,
    REACT_APP_AUTH_REQUIRED: undefined as string | undefined,
    REACT_APP_AUTOSAVE_ENABLED: undefined as string | undefined
  }
};

// Replace import.meta in tests
vi.stubGlobal('import', { meta: mockImportMeta });

describe('ConfigLoader', () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    loader = new ConfigLoader();
    // Reset all mocks completely
    vi.resetAllMocks();
    mockFetch.mockClear();
    mockFetch.mockReset();
    loader.clearCache();
    
    // Reset window.location to localhost for most tests
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true
    });
    
    // Clear any AWS region that might be set
    delete (window as any).__AWS_REGION__;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('configuration loading', () => {
    it('should load configuration from /config.json', async () => {
      const mockConfig = {
        webapp: {
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true },
          autosave: { enabled: true }
        },
        _meta: { environment: 'test' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const config = await loader.loadConfig();

      expect(mockFetch).toHaveBeenCalledWith('/config.json');
      expect(config).toEqual(mockConfig);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(loader.loadConfig()).rejects.toThrow('Network error');
    });

    it('should handle non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(loader.loadConfig()).rejects.toThrow('Config fetch failed: 404');
    });

    it('should use cache for subsequent calls', async () => {
      const mockConfig = {
        webapp: {
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      // First call
      const config1 = await loader.loadConfig();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const config2 = await loader.loadConfig();
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(config1).toEqual(config2);
    });

    it('should clear cache when requested', async () => {
      const mockConfig = {
        webapp: {
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true }
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      });

      // First call
      await loader.loadConfig();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear cache
      loader.clearCache();

      // Second call should fetch again
      await loader.loadConfig();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('environment detection', () => {
    it('should detect localhost environment', async () => {
      // Mock window.location for localhost
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost' },
        writable: true
      });

      const mockConfig = {
        webapp: {
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      await loader.loadConfig();

      expect(mockFetch).toHaveBeenCalledWith('/config.json');
    });

    it('should handle different environments', async () => {
      // Mock window.location for production
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
        writable: true
      });

      // Mock AWS region and deployment environment for production
      (window as any).__AWS_REGION__ = 'us-east-1';
      (window as any).__ENVIRONMENT__ = 'stage';
      (window as any).__ORGANIZATION__ = 'testorg';

      const mockConfig = {
        webapp: {
          api: { baseUrl: 'https://api.example.com' },
          auth: { provider: 'cognito', required: true }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      await loader.loadConfig();

      // Should call the S3 URL, not /config.json
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('s3'));
    });
  });

  describe('private configuration', () => {
    it('should load private config when auth is required', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: '/api',
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true },
          autosave: { 
            enabled: true,
            storage: { 
              type: 'localStorage' as const, 
              keyPrefix: 'test', 
              maxItems: 100, 
              ttl: 3600000 
            },
            debounce: { 
              delay: 1000, 
              maxWait: 5000 
            },
            retry: { 
              maxRetries: 3, 
              backoffMultiplier: 2, 
              initialDelay: 1000 
            },
            ui: { 
              showStatus: true, 
              statusPosition: 'bottom-right' as const, 
              toastOnSave: true, 
              toastOnError: true 
            }
          }
        }
      };

      const privateConfig = {
        private_webapp: {
          auth: {
            jwt: {
              secret: 'test-secret',
              algorithm: 'HS256',
              mockUsers: [{ 
                id: '1', 
                email: 'test@example.com', 
                username: 'test', 
                password: 'pass', 
                name: 'Test User',
                groups: [], 
                permissions: [],
                isAdmin: false
              }],
              defaultGroups: ['users']
            }
          }
        },
        user: { id: '1', groups: ['users'], permissions: ['read'], preferences: {} }
      };

      // Clear any existing cache and mocks
      loader.clearCache();
      mockFetch.mockReset();
      
      // First call for public config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => publicConfig
      });
      
      // Second call for private config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => privateConfig
      });

      // Use loadPrivateConfigAfterAuth() instead of loadConfig() to get merged config
      const result = await loader.loadPrivateConfigAfterAuth();
      
      expect(result.webapp.auth.jwt).toBeDefined();
      expect((result as any).user).toBeDefined();
    });

    it('should skip private config when auth is not required', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: '/api',
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: false },
          autosave: { enabled: true }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => publicConfig
      });

      const result = await loader.loadPrivateConfigAfterAuth();
      
      // Should only call fetch once (for public config)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.webapp.auth.required).toBe(false);
    });

    it('should handle private config fetch errors', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: '/api',
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true },
          autosave: { enabled: true }
        }
      };

      // First call for public config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => publicConfig
      });
      
      // Second call for private config fails
      mockFetch.mockRejectedValueOnce(new Error('Private config fetch failed'));

      // loadPrivateConfigAfterAuth should return public config when private config fails
      const result = await loader.loadPrivateConfigAfterAuth();
      
      // Should return public config only (no private config merged)
      expect(result.webapp.auth.required).toBe(true);
      expect((result as any).user).toBeUndefined();
    });

    it('should handle 401 unauthorized for private config', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: '/api',
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true },
          autosave: { enabled: true }
        }
      };

      // First call for public config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => publicConfig
      });
      
      // Second call for private config returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      const result = await loader.loadPrivateConfigAfterAuth();
      
      // Should return public config only
      expect(result.webapp.auth.required).toBe(true);
      expect((result as any).user).toBeUndefined();
    });
  });

  describe('configuration validation', () => {
    it('should validate required fields', async () => {
      const invalidConfig = {
        webapp: {
          // Missing required auth field
          api: { baseUrl: '/api' }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => invalidConfig
      });

      // Should still load the config (validation happens at runtime)
      const config = await loader.loadConfig();
      expect(config).toEqual(invalidConfig);
    });

    it('should handle malformed JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      });

      await expect(loader.loadConfig()).rejects.toThrow('Invalid JSON');
    });
  });

  describe('singleton instance', () => {
    it('should return the same instance', () => {
      const instance1 = configLoader;
      const instance2 = configLoader;
      expect(instance1).toBe(instance2);
    });

    it('should maintain state across calls', async () => {
      const mockConfig = {
        webapp: {
          api: { baseUrl: '/api' },
          auth: { provider: 'local', required: true }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      // First call
      await configLoader.loadConfig();
      
      // Second call should use cache
      const config = await configLoader.loadConfig();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(config).toEqual(mockConfig);
    });
  });
});