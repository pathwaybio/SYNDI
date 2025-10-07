// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for ConfigLoader runtime config functionality
 * 
 * Tests the new runtime config endpoint that fetches auth configuration
 * from deployed Lambda (environment variables take precedence over config file)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigLoader } from '../../../../src/shared/lib/config-loader';

// Mock fetch globally
global.fetch = vi.fn();

describe('ConfigLoader - Runtime Config', () => {
  let configLoader: ConfigLoader;

  beforeEach(() => {
    configLoader = new ConfigLoader();
    configLoader.clearCache();
    vi.clearAllMocks();
  });

  describe('loadRuntimeConfig', () => {
    it('should fetch runtime config from API endpoint', async () => {
      // Mock public config (needs apiEndpoint)
      const publicConfig = {
        webapp: {
          apiEndpoint: 'https://api.example.com',
          auth: {
            provider: 'cognito' as const,
            required: true,
            cognito: {
              region: 'us-east-1',
              userPoolId: 'us-east-1_OLD123',
              clientId: 'oldclient123'
            },
            session: {
              timeout: 3600000,
              refreshBuffer: 300000
            }
          }
        }
      };

      const runtimeConfig = {
        auth: {
          provider: 'cognito',
          config: {
            userPoolId: 'us-east-1_NEW456',
            clientId: 'newclient456',
            region: 'us-east-1',
            source: 'environment'
          }
        }
      };

      // Setup mocks
      (global.fetch as any).mockImplementation((url: string) => {
        if (url === '/config.json') {
          return Promise.resolve({
            ok: true,
            json: async () => publicConfig
          });
        }
        if (url === '/api/config/runtime') {
          return Promise.resolve({
            ok: true,
            json: async () => runtimeConfig
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      // Load public config first
      await configLoader.loadPublicConfig();

      // Load runtime config
      const result = await configLoader.loadRuntimeConfig();

      expect(result).toEqual(runtimeConfig);
      expect(result?.auth.config.source).toBe('environment');
      expect(result?.auth.config.userPoolId).toBe('us-east-1_NEW456');
    });

    it('should return null if API endpoint not available', async () => {
      // Mock public config without apiEndpoint
      const publicConfig = {
        webapp: {
          auth: {
            provider: 'jwt' as const,
            required: true,
            session: {
              timeout: 3600000,
              refreshBuffer: 300000
            }
          }
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => publicConfig
      });

      await configLoader.loadPublicConfig();
      const result = await configLoader.loadRuntimeConfig();

      expect(result).toBeNull();
      // Runtime endpoint should not be called
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only public config
    });

    it('should return null and log warning on HTTP error', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: 'https://api.example.com',
          auth: {
            provider: 'cognito' as const,
            required: true,
            session: { timeout: 3600000, refreshBuffer: 300000 }
          }
        }
      };

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === '/config.json') {
          return Promise.resolve({
            ok: true,
            json: async () => publicConfig
          });
        }
        if (url === '/api/config/runtime') {
          return Promise.resolve({
            ok: false,
            status: 404
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await configLoader.loadPublicConfig();
      const result = await configLoader.loadRuntimeConfig();

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Runtime config not available')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return null and log warning on network error', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: 'https://api.example.com',
          auth: {
            provider: 'cognito' as const,
            required: true,
            session: { timeout: 3600000, refreshBuffer: 300000 }
          }
        }
      };

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === '/config.json') {
          return Promise.resolve({
            ok: true,
            json: async () => publicConfig
          });
        }
        if (url === '/api/config/runtime') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await configLoader.loadPublicConfig();
      const result = await configLoader.loadRuntimeConfig();

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load runtime config'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle JWT provider runtime config', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: 'https://api.example.com',
          auth: {
            provider: 'jwt' as const,
            required: true,
            session: { timeout: 3600000, refreshBuffer: 300000 }
          }
        }
      };

      const runtimeConfig = {
        auth: {
          provider: 'jwt',
          config: {
            algorithm: 'HS256',
            issuer: 'test-issuer',
            audience: 'test-audience',
            mockUsers: 2,
            source: 'config_file'
          }
        }
      };

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === '/config.json') {
          return Promise.resolve({
            ok: true,
            json: async () => publicConfig
          });
        }
        if (url === '/api/config/runtime') {
          return Promise.resolve({
            ok: true,
            json: async () => runtimeConfig
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      await configLoader.loadPublicConfig();
      const result = await configLoader.loadRuntimeConfig();

      expect(result).toEqual(runtimeConfig);
      expect(result?.auth.provider).toBe('jwt');
      expect(result?.auth.config.source).toBe('config_file');
    });
  });

  describe('clearCache', () => {
    it('should clear runtime cache', async () => {
      const publicConfig = {
        webapp: {
          apiEndpoint: 'https://api.example.com',
          auth: {
            provider: 'cognito' as const,
            required: true,
            session: { timeout: 3600000, refreshBuffer: 300000 }
          }
        }
      };

      const runtimeConfig = {
        auth: {
          provider: 'cognito',
          config: {
            userPoolId: 'us-east-1_TEST',
            clientId: 'testclient',
            region: 'us-east-1',
            source: 'environment'
          }
        }
      };

      (global.fetch as any).mockImplementation((url: string) => {
        if (url === '/config.json') {
          return Promise.resolve({
            ok: true,
            json: async () => publicConfig
          });
        }
        if (url === '/api/config/runtime') {
          return Promise.resolve({
            ok: true,
            json: async () => runtimeConfig
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      await configLoader.loadPublicConfig();
      await configLoader.loadRuntimeConfig();

      // Clear cache
      configLoader.clearCache();

      // Should fetch again after clear
      await configLoader.loadPublicConfig();
      await configLoader.loadRuntimeConfig();

      expect(global.fetch).toHaveBeenCalledTimes(4); // 2 public + 2 runtime
    });
  });
});

