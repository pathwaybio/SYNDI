// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createAuthProvider } from '../../../../src/shared/lib/auth';
import { AuthConfig } from '../../../../src/shared/types/config';

// Mock auth providers (only 2 providers after v3 migration)
vi.mock('../../../../src/shared/lib/auth-providers/cognito', () => ({
  CognitoAuthProvider: vi.fn().mockImplementation(() => ({
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
  })),
}));

vi.mock('../../../../src/shared/lib/auth-providers/jwt', () => ({
  JWTAuthProvider: vi.fn().mockImplementation(() => ({
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    validateToken: vi.fn(),
  })),
}));

const defaultSession = {
  timeout: 86400000,
  refreshBuffer: 300000,
};

describe('Simplified Auth System (2 providers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAuthProvider', () => {
    it('should create CognitoAuthProvider for cognito config', async () => {
      const { CognitoAuthProvider } = await import('../../../../src/shared/lib/auth-providers/cognito');
      const config: AuthConfig = {
        provider: 'cognito',
        required: true,
        session: defaultSession,
        cognito: {
          region: 'us-east-1',
          userPoolId: 'us-east-1_123456789',
          clientId: 'abcdef123456',
        },
      };

      const provider = await createAuthProvider(config);
      
      expect(CognitoAuthProvider).toHaveBeenCalledWith({
        region: 'us-east-1',
        userPoolId: 'us-east-1_123456789',
        clientId: 'abcdef123456',
      });
      expect(provider).toBeDefined();
    });

    it('should create JWTAuthProvider for jwt config', async () => {
      const { JWTAuthProvider } = await import('../../../../src/shared/lib/auth-providers/jwt');
      const config: AuthConfig = {
        provider: 'jwt',
        required: true,
        session: defaultSession,
        jwt: {
          secret: 'test-secret',
          algorithm: 'HS256',
        },
      };

      const provider = await createAuthProvider(config);
      
      expect(JWTAuthProvider).toHaveBeenCalledWith({
        secret: 'test-secret',
        algorithm: 'HS256',
        baseUrl: '/api/auth',
        loginEndpoint: '/login',
        signupEndpoint: undefined,
        refreshEndpoint: undefined,
      });
      expect(provider).toBeDefined();
    });

    it('should create JWTAuthProvider with mockUsers for dev/test', async () => {
      const { JWTAuthProvider } = await import('../../../../src/shared/lib/auth-providers/jwt');
      const config: AuthConfig = {
        provider: 'jwt',
        required: true,
        session: defaultSession,
        jwt: {
          secret: 'dev-secret',
          algorithm: 'HS256',
          mockUsers: [
            {
              id: '1',
              email: 'admin@local.dev',
              username: 'admin',
              password: 'dev123456',
              name: 'Admin User',
              groups: ['admin'],
              permissions: ['*'],
              isAdmin: true,
            }
          ],
        },
      };

      const provider = await createAuthProvider(config);
      
      expect(JWTAuthProvider).toHaveBeenCalled();
      expect(provider).toBeDefined();
    });

    it('should throw error for unsupported provider', async () => {
      const config: AuthConfig = {
        provider: 'unsupported' as any,
        required: true,
        session: defaultSession,
      };

      await expect(createAuthProvider(config)).rejects.toThrow(
        'Unsupported auth provider: unsupported'
      );
    });

    it('should throw error for legacy mock provider', async () => {
      const config: AuthConfig = {
        provider: 'mock' as any,  // Legacy provider removed in v3
        required: true,
        session: defaultSession,
      };

      await expect(createAuthProvider(config)).rejects.toThrow(
        'Unsupported auth provider: mock'
      );
    });

    it('should throw error for legacy service provider', async () => {
      const config: AuthConfig = {
        provider: 'service' as any,  // Legacy provider removed in v3
        required: true,
        session: defaultSession,
      };

      await expect(createAuthProvider(config)).rejects.toThrow(
        'Unsupported auth provider: service'
      );
    });

    it('should throw error for missing cognito config', async () => {
      const config: AuthConfig = {
        provider: 'cognito',
        required: true,
        session: defaultSession,
      };

      await expect(createAuthProvider(config)).rejects.toThrow(
        'Cognito configuration required'
      );
    });

    it('should throw error for missing jwt config', async () => {
      const config: AuthConfig = {
        provider: 'jwt',
        required: true,
        session: defaultSession,
      };

      await expect(createAuthProvider(config)).rejects.toThrow(
        'JWT configuration required'
      );
    });
  });

  describe('Auth Provider Integration', () => {
    it('should create providers with correct configuration', async () => {
      const { CognitoAuthProvider } = await import('../../../../src/shared/lib/auth-providers/cognito');
      const { JWTAuthProvider } = await import('../../../../src/shared/lib/auth-providers/jwt');

      // Test cognito provider
      const cognitoConfig: AuthConfig = {
        provider: 'cognito',
        required: true,
        session: defaultSession,
        cognito: {
          region: 'us-east-1',
          userPoolId: 'us-east-1_123456789',
          clientId: 'abcdef123456',
          identityPoolId: 'us-east-1:12345678-1234-1234-1234-123456789012',
        },
      };

      const cognitoProvider = await createAuthProvider(cognitoConfig);
      expect(CognitoAuthProvider).toHaveBeenCalledWith(cognitoConfig.cognito);
      expect(cognitoProvider).toBeDefined();

      // Test JWT provider
      const jwtConfig: AuthConfig = {
        provider: 'jwt',
        required: true,
        session: defaultSession,
        jwt: {
          secret: 'test-secret-key',
          algorithm: 'HS256',
          issuer: 'test-issuer',
          audience: 'test-audience',
        },
      };

      const jwtProvider = await createAuthProvider(jwtConfig);
      expect(JWTAuthProvider).toHaveBeenCalledWith({
        secret: 'test-secret-key',
        algorithm: 'HS256',
        issuer: 'test-issuer',
        audience: 'test-audience',
        baseUrl: '/api/auth',
        loginEndpoint: '/login',
        signupEndpoint: undefined,
        refreshEndpoint: undefined,
      });
      expect(jwtProvider).toBeDefined();
    });
  });
});
