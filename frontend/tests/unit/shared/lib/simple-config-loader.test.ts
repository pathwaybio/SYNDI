// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for the simplified frontend configuration loader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
global.fetch = vi.fn()

describe('Frontend Config Loader', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Clear cache to ensure fresh state for each test
    const { configLoader } = await import('../../../../src/shared/lib/config-loader')
    configLoader.clearCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should load public config from /config.json', async () => {
    const mockConfig = {
      webapp: {
        apiEndpoint: 'http://localhost:8001/api',
        frontendUrl: 'http://localhost:3001',
        auth: {
          required: false,
          provider: 'mock',
          mock: {
            users: [{
              id: 'dev_user',
              email: 'dev_user@local.dev',
              username: 'dev_user',
              password: 'dev123',
              name: 'Development User',
              groups: ['admin'],
              permissions: ['*'],
              isAdmin: true
            }],
            defaultGroups: ['user']
          }
        },
        api: {
          proxyTarget: 'http://localhost:8001'
        },
        server: {
          host: 'localhost',
          port: 3001
        }
      }
    }

    // Mock successful fetch
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    } as Response)

    const { configLoader } = await import('../../../../src/shared/lib/config-loader')
    
    const config = await configLoader.loadPublicConfig()

    expect(mockFetch).toHaveBeenCalledWith('/config.json')
    expect(config).toBeDefined()
    expect(config.webapp.apiEndpoint).toBe('http://localhost:8001/api')
    expect(config.webapp.auth.required).toBe(false)
  })

  it('should handle network errors gracefully', async () => {
    // Mock network error
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { configLoader } = await import('../../../../src/shared/lib/config-loader')

    await expect(configLoader.loadPublicConfig()).rejects.toThrow('Network error')
  })

  it('should throw error on 404 response', async () => {
    // Mock 404 response
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    } as Response)

    const { configLoader } = await import('../../../../src/shared/lib/config-loader')

    // Should throw error with helpful message
    await expect(configLoader.loadPublicConfig()).rejects.toThrow('Configuration not found or invalid')
  })

  it('should load private config from API when authenticated', async () => {
    // First, mock the public config response (required for loadPrivateConfig)
    const mockPublicConfig = {
      webapp: {
        apiEndpoint: '/api',
        api: { baseUrl: '/api' },
        auth: { provider: 'local', required: true }
      }
    }

    const mockPrivateConfig = {
      private_webapp: {
        auth: {
          mock: {
            users: [
              {
                id: '1',
                email: 'admin@local.dev',
                username: 'admin',
                groups: ['admin']
              }
            ]
          }
        }
      }
    }

    // Mock successful fetch - first public config, then private config
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPublicConfig)
    } as Response)
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPrivateConfig)
    } as Response)

    const { configLoader } = await import('../../../../src/shared/lib/config-loader')
    
    // Load public config first to set up the cache
    await configLoader.loadPublicConfig()
    
    // Now load private config
    const config = await configLoader.loadPrivateConfig()

    expect(mockFetch).toHaveBeenCalledWith('/api/config/private', {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    expect(config).toBeDefined()
    expect(config?.private_webapp?.auth?.mock?.users).toHaveLength(1)
    expect(config?.private_webapp?.auth?.mock?.users?.[0]?.username).toBe('admin')
  })

  it('should handle authentication errors for private config', async () => {
    // First, mock the public config response
    const mockPublicConfig = {
      webapp: {
        apiEndpoint: '/api',
        api: { baseUrl: '/api' },
        auth: { provider: 'local', required: true }
      }
    }

    // Mock successful public config fetch
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPublicConfig)
    } as Response)
    
    // Mock 401 response for private config
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    } as Response)

    const { configLoader } = await import('../../../../src/shared/lib/config-loader')

    // Load public config first
    await configLoader.loadPublicConfig()
    
    // Now try to load private config
    const config = await configLoader.loadPrivateConfig()
    expect(config).toBeNull()
  })
})