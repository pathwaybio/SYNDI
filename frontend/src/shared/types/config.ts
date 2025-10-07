// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Configuration interfaces for the CLAIRE MVP hierarchical configuration system
 * 
 * Supports multiple environments with AWS resource discovery and validation
 */

// Environment detection and configuration
export type Environment = 'dev' | 'test' | 'stage' | 'prod';

// Infrastructure configuration for deployment
export interface InfrastructureConfig {
  cloudformation?: {
    stackName: string;
    region: string;
    parameters: Record<string, string>;
  };
  local?: {
    basePath: string;
    mockCloudFormation: Record<string, string>;
  };
  deployment: {
    region: string;
    accountId: string;
  };
}

// Service discovery configuration
export interface ServiceDiscoveryConfig {
  webapp: {
    configPath: string;
    bucket?: string;
  };
  lambda: {
    configPath?: string;
    envVars?: Record<string, string>;
  };
  forms: {
    configPath: string;
    bucket?: string;
  };
  eln: {
    configPath: string;
    bucket?: string;
  };
}

// AWS resource discovery configuration
export interface AWSResourceConfig {
  region: string;
  cloudformation: {
    stackName: string;
    outputMappings: Record<string, string>; // Maps config keys to CloudFormation output keys
  };
  enabled: boolean;
}

// Database configuration
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  connectionPool: {
    min: number;
    max: number;
    idle: number;
  };
}

// Storage configuration (S3, local, etc.)
export interface StorageConfig {
  backend: 'local' | 's3' | 'azure' | 'gcs';
  bucket_name?: string;
  draft_bucket_name?: string; // Separate bucket for mutable drafts
  region?: string;
  endpoint?: string;
  access_key_id?: string;
  secret_access_key?: string;
  local_path?: string;
}

// Authentication configuration (2 providers)
export interface AuthConfig {
  provider: 'cognito' | 'jwt';  // 2 providers
  required: boolean;
  cognito?: {
    region: string;
    userPoolId: string;
    clientId: string;
    identityPoolId?: string;
  };
  jwt?: {
    secret: string;
    algorithm: 'HS256' | 'RS256';
    issuer?: string;
    audience?: string;
    baseUrl?: string;
    loginEndpoint?: string;
    signupEndpoint?: string;
    refreshEndpoint?: string;
    mockUsers?: MockUser[];  // For dev/test environments
    defaultGroups?: string[];
    tokenExpiry?: number;  // seconds
    environment?: 'dev' | 'test' | 'stage' | 'prod';
  };
  session: {
    timeout: number; // milliseconds
    refreshBuffer: number; // milliseconds before expiry to refresh
  };
}

// Mock user configuration for development
export interface MockUser {
  id: string;
  email: string;
  username: string;
  password: string;
  name?: string;
  groups: string[];
  permissions: string[];
  isAdmin?: boolean;
}

// API configuration
export interface APIConfig {
  baseUrl?: string;
  proxyTarget?: string;  // Vite dev proxy target
  timeout?: number;
  retries?: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  endpoints?: {
    auth: string;
    sops: string;
    forms: string;
    files: string;
    users: string;
  };
}

// Existing autosave configuration (maintaining backward compatibility)
export interface AutosaveConfig {
  enabled: boolean;
  storage: {
    type: 'localStorage' | 'sessionStorage' | 'indexedDB';
    keyPrefix: string;
    maxItems: number;
    ttl: number; // Time to live in milliseconds
  };
  debounce: {
    delay: number; // Milliseconds
    maxWait: number; // Maximum delay before forcing save
  };
  retry: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  ui: {
    showStatus: boolean;
    statusPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    toastOnSave: boolean;
    toastOnError: boolean;
  };
}

// Logging configuration
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  targets: Array<'console' | 'file' | 'cloudwatch'>;
  cloudwatch?: {
    logGroupName: string;
    region: string;
  };
}

// Feature flags configuration
export interface FeatureFlags {
  enableBetaFeatures: boolean;
  enableAdvancedValidation: boolean;
  enableRealTimeSync: boolean;
  enableAuditTrail: boolean;
  enableOfflineMode: boolean;
}

// CLAIRE-specific configuration
export interface ClaireConfig {
  autosave: AutosaveConfig;
}

// Main service configuration
export interface ServiceConfig {
  apiEndpoint?: string;  // API endpoint URL
  frontendUrl?: string;  // Frontend URL
  api?: APIConfig;       // Additional API config
  auth: AuthConfig;
  storage?: StorageConfig;
  database?: DatabaseConfig;
  logging?: LoggingConfig;
  features?: FeatureFlags;
  autosave: AutosaveConfig;
  claire?: ClaireConfig;
  server?: {
    host: string;
    port: number;
  };
}

// Complete environment configuration
export interface EnvironmentConfig {
  webapp: ServiceConfig;
  aws?: AWSResourceConfig;
  _meta?: {
    environment: Environment;
    built: string;
    sources: {
      defaults?: string;
      environment?: string;
      local?: string;
      envVars?: string[];
    };
  };
}

// Configuration validation result
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  path: string;
  message: string;
  required: boolean;
}

export interface ConfigValidationWarning {
  path: string;
  message: string;
}

// Configuration loading options
export interface ConfigLoadOptions {
  environment?: Environment;
  skipCache?: boolean;
  validateOnly?: boolean;
  includeDefaults?: boolean;
  awsDiscovery?: boolean;
  envVarOverrides?: boolean;
}

// Configuration source metadata
export interface ConfigSource {
  type: 'defaults' | 'environment' | 'local' | 'aws' | 'envVars';
  path?: string;
  timestamp: string;
  priority: number;
}

// Configuration with source tracking
export interface ConfigWithSources {
  config: EnvironmentConfig;
  sources: ConfigSource[];
  validationResult: ConfigValidationResult;
}

// Default configuration factory
export interface DefaultConfigFactory {
  create(environment: Environment): EnvironmentConfig;
  createForAutosave(): AutosaveConfig;
}

// Environment variable mapping
export interface EnvVarMapping {
  [configPath: string]: string; // Maps config.path.to.value to ENV_VAR_NAME
} 