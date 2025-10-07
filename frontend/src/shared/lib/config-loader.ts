// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * configuration loader
 * 
 * Supports multi-environment configuration with AWS resource discovery,
 *  comprehensive validation.
 */

import { Environment, EnvironmentConfig, AutosaveConfig, ServiceConfig, ClaireConfig } from '../types/config';
import { logger } from '@shared/lib/logger';

// configure logger
logger.configure("info");

if (process.env.NODE_ENV === "dev") {
  logger.configure("debug");
}

interface PrivateConfig {
  private_webapp?: {
    auth?: {
      mock?: {
        users: Array<{
          id: string;
          email: string;
          username: string;
          password: string;
          name: string;
          groups: string[];
          permissions: string[];
          isAdmin: boolean;
        }>;
        defaultGroups: string[];
      };
    };
    storage?: {
      local_path: string;
    };
    features?: {
      advancedSettings?: Record<string, any>;
    };
  };
  user?: {
    id: string;
    groups: string[];
    permissions: string[];
    preferences: Record<string, any>;
  };
}

/**
 * Simple configuration loader that loads public and private configs
 * Public config: Available to everyone from /config.json
 * Private config: Available after auth from /api/config/private
 */
export class ConfigLoader {
  private publicCache: EnvironmentConfig | null = null;
  private privateCache: PrivateConfig | null = null;
  private runtimeCache: any | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get public config URL based on current domain
   * Determines environment from hostname and constructs appropriate S3 URL
   */
  private getPublicConfigUrl(): string {
    const hostname = window.location.hostname;
    
    // Get region from environment - must be set during deployment
    const region = (window as any).__AWS_REGION__;
    if (!region) {
      throw new Error('AWS region not configured for production deployment. Check deployment process.');
    }
    
    // For production deployments, environment and org should be embedded in the HTML
    // by the deployment process. Check for these first.
    const deployedEnv = (window as any).__ENVIRONMENT__;
    const deployedOrg = (window as any).__ORGANIZATION__;
    
    if (!deployedEnv || !deployedOrg) {
      throw new Error('Environment and organization not configured for production deployment. Check deployment process.');
    }
    
    return `https://rawscribe-public-${deployedEnv}-${deployedOrg}.s3.${region}.amazonaws.com/config.json`;
  }

  /**
   * Clear the cache - used for testing
   */
  clearCache(): void {
    this.publicCache = null;
    this.privateCache = null;
    this.runtimeCache = null;
    this.cacheTime = 0;
  }

  /**
   * Load runtime auth configuration from backend API (public endpoint)
   * 
   * This fetches the ACTUAL deployed auth config from the Lambda,
   * which reads from environment variables (CloudFormation) first,
   * then falls back to config file.
   * 
   * Returns the auth config that the backend is actually using.
   * Falls back to static config.json if endpoint unavailable (on-prem).
   */
  async loadRuntimeConfig(): Promise<any | null> {
    try {
      if (!this.publicCache?.webapp?.apiEndpoint) {
        console.log('API endpoint not available, using static config');
        return null;
      }
      
      // Use relative path for runtime config endpoint
      const response = await fetch('/api/config/runtime', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.warn(`Runtime config not available (HTTP ${response.status}), using static config`);
        return null;
      }
      
      const runtimeConfig = await response.json();
      this.runtimeCache = runtimeConfig;
      
      console.log('✅ Loaded runtime config from backend:', runtimeConfig.auth.provider);
      return runtimeConfig;
      
    } catch (error) {
      console.warn('Failed to load runtime config, using static config:', error);
      return null;
    }
  }

  /**
   * Load public configuration from deployed location
   * Safe for public access - no sensitive data
   */
  async loadPublicConfig(): Promise<EnvironmentConfig> {
    // Check cache first
    if (this.publicCache && (Date.now() - this.cacheTime) < this.CACHE_TTL) {
      return this.publicCache;
    }

    try {
      // Determine config URL based on environment
      // Local dev/test: served from local public directory or .local/s3/public
      // Stage/prod: served from public S3 bucket with dynamic URL
      const configUrl = window.location.hostname === 'localhost' 
        ? '/config.json'  // Local development
        : this.getPublicConfigUrl();  // Stage/prod from S3 (dynamic)
      
      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`);
      }
      
      const config = await response.json();
      
      // Validate config structure
      if (!config.webapp) {
        throw new Error('Invalid config: missing webapp section');
        }

      this.publicCache = config;
      this.cacheTime = Date.now();
      
      console.log('📋 Loaded public configuration - contains only auth essentials');
      return config;
      
    } catch (error) {
      console.error('Failed to load public configuration:', error);
      console.error('Configuration paths checked:');
      console.error('  Development: public/config.json, a build target sourced from infra/.config (served at /config.json via vite)');
      console.error('  Production: served directly from webapp bucket at /config.json');
      
      throw new Error(
        `Configuration not found or invalid: ${error}. ` +
        `Ensure configs are properly deployed.`
      );
    }
  }

  /**
   * Load private configuration from backend API
   * Requires authentication - contains sensitive data
   */
  async loadPrivateConfig(): Promise<PrivateConfig | null> {
    try {
      if (!this.publicCache?.webapp?.apiEndpoint) {
        throw new Error('API endpoint not configured. Load public config first.');
      }
      
      // Get auth token from localStorage (supports mock auth provider)
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      // Try to get the auth token from localStorage
      const storedAuth = localStorage.getItem('mock-auth-user');
      if (storedAuth) {
        try {
          const authData = JSON.parse(storedAuth);
          if (authData.token) {
            headers['Authorization'] = `Bearer ${authData.token}`;
          }
        } catch (e) {
          logger.warn('Failed to parse stored auth data:', String(e));
        }
      }
      
      // Use relative path - works with Vite proxy (dev) and CloudFront routing (prod)
      const response = await fetch('/api/config/private', {
        credentials: 'include', // Include auth cookies
        headers
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log('Private config requires authentication');
          return null;
  }
        throw new Error(`Private config fetch failed: ${response.status}`);
      }
      
      const privateConfig = await response.json();
      this.privateCache = privateConfig;
      
      console.log('🔐 Loaded private configuration');
      return privateConfig;
      
    } catch (error) {
      console.warn('Failed to load private configuration:', error);
      return null;
    }
  }

  /**
   * Load complete configuration (public + private if authenticated)
   */
  async loadConfig(): Promise<EnvironmentConfig> {
    const publicConfig = await this.loadPublicConfig();
    
    // Only load public config during initialization
    // Private config should be loaded after authentication in a separate call
    console.log('📋 Loaded public configuration - contains only auth essentials');
    
    return publicConfig;
  }

  /**
   * Load and merge private configuration after authentication
   * Should be called after user is authenticated to get full app configuration
   */
  async loadPrivateConfigAfterAuth(): Promise<EnvironmentConfig> {
    const publicConfig = await this.loadPublicConfig();
    
    // Try to load private config if auth is required
    const authRequired = publicConfig.webapp.auth?.required !== false;
    if (authRequired) {
      const privateConfig = await this.loadPrivateConfig();
      
      // Merge private config into public config if available
      if (privateConfig && privateConfig.private_webapp) {
        // Merge private webapp settings, ensuring config structure is preserved
        const mergedConfig = {
          ...publicConfig,
          webapp: {
            ...publicConfig.webapp,
            ...privateConfig.private_webapp,
            // Ensure auth config maintains required structure
            auth: {
              ...publicConfig.webapp.auth,
              ...privateConfig.private_webapp.auth
            },
            // Ensure storage config maintains required structure
            storage: privateConfig.private_webapp.storage ? {
              ...publicConfig.webapp.storage,
              ...privateConfig.private_webapp.storage,
              backend: (privateConfig.private_webapp.storage as any).backend || publicConfig.webapp.storage?.backend || 'local'
            } : publicConfig.webapp.storage,
            // Ensure features config maintains required structure
            features: privateConfig.private_webapp.features ? {
              ...publicConfig.webapp.features,
              ...privateConfig.private_webapp.features,
              enableBetaFeatures: (privateConfig.private_webapp.features as any).enableBetaFeatures ?? publicConfig.webapp.features?.enableBetaFeatures ?? false,
              enableAdvancedValidation: (privateConfig.private_webapp.features as any).enableAdvancedValidation ?? publicConfig.webapp.features?.enableAdvancedValidation ?? false,
              enableRealTimeSync: (privateConfig.private_webapp.features as any).enableRealTimeSync ?? publicConfig.webapp.features?.enableRealTimeSync ?? false,
              enableAuditTrail: (privateConfig.private_webapp.features as any).enableAuditTrail ?? publicConfig.webapp.features?.enableAuditTrail ?? false,
              enableOfflineMode: (privateConfig.private_webapp.features as any).enableOfflineMode ?? publicConfig.webapp.features?.enableOfflineMode ?? false
            } : publicConfig.webapp.features
          }
        };
        
        // Add user info if available
        if (privateConfig.user) {
          (mergedConfig as any).user = privateConfig.user;
        }
        
        return mergedConfig;
      }
    }
    
    return publicConfig;
  }

  /**
   * Get autosave configuration (backward compatibility)
   */
  async getAutosaveConfig(): Promise<AutosaveConfig> {
    const config = await this.loadConfig();
    return config.webapp.autosave;
  }

  /**
   * Get CLAIRE-specific autosave configuration
   */
  async getClaireAutosaveConfig(): Promise<AutosaveConfig> {
    const config = await this.loadConfig();
    
    // Start with base autosave config
    const baseConfig = config.webapp.autosave;
    
    // Merge CLAIRE autosave config with base config if it exists
    // Example: baseConfig = { delay: 5000, maxWait: 10000 }
    // claire.autosave = { delay: 15000, retries: 3 }
    // Result = { delay: 15000, maxWait: 10000, retries: 3 }
    // If claire.autosave is not defined, return baseConfig
    const autosaveConfig = config.webapp.claire?.autosave 
      ? { ...baseConfig, ...config.webapp.claire.autosave } // CLAIRE settings override base
      : baseConfig;

    return autosaveConfig;
  }

  /**
   * Get webapp configuration  
   */
  async getWebappConfig(): Promise<ServiceConfig> {
    const config = await this.loadConfig();
    return config.webapp;
  }




}

// Export singleton instance
export const configLoader = new ConfigLoader();

// Export types for backward compatibility
export type { AutosaveConfig, ServiceConfig, EnvironmentConfig }; 
