# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Configuration types and validation for the CLAIRE MVP hierarchical configuration system

Python equivalent of the TypeScript configuration interfaces with Pydantic validation
"""

from typing import Dict, List, Optional, Union, Literal, Any
from pydantic import BaseModel, Field, field_validator, validator, model_validator
from datetime import datetime, timezone
from enum import Enum


class Environment(str, Enum):
    """Environment enumeration"""
    DEV = "dev"
    TEST = "test"
    STAGE = "stage"
    PROD = "prod"


class AWSResourceConfig(BaseModel):
    """AWS resource discovery configuration"""
    region: str
    cloudformation: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    
    @field_validator('cloudformation')
    @classmethod
    def validate_cloudformation(cls, v):
        """Ensure CloudFormation config has required fields"""
        if not isinstance(v, dict):
            return {}
        return {
            'stack_name': v.get('stack_name', ''),
            'output_mappings': v.get('output_mappings', {})
        }


class DatabaseConfig(BaseModel):
    """Database configuration"""
    host: str
    port: int = Field(default=5432, ge=1, le=65535)
    database: str
    ssl: bool = True
    connection_pool: Dict[str, int] = Field(default_factory=lambda: {
        'min': 2,
        'max': 10,
        'idle': 5
    })


class StorageConfig(BaseModel):
    """Storage configuration (S3, local, etc.)"""
    type: Literal['local', 's3', 'azure', 'gcs']  # Required - no default!
    bucket_name: Optional[str] = None
    draft_bucket_name: Optional[str] = None  # Separate bucket for mutable drafts
    eln_bucket_name: Optional[str] = None    # Separate bucket for ELN submissions
    forms_bucket_name: Optional[str] = None  # Separate bucket for SOP forms
    sops_bucket_name: Optional[str] = None   # Separate bucket for SOPs (if different from forms)
    region: Optional[str] = None
    endpoint: Optional[str] = None
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    local_path: Optional[str] = None
    
    @model_validator(mode='before')
    @classmethod
    def validate_local_config(cls, data):
        """Validate local storage configuration"""
        if isinstance(data, dict):
            if data.get('type') == 'local' and data.get('local_path') is None:
                data['local_path'] = './.local/s3'
        return data


class AuthConfig(BaseModel):
    """Authentication configuration (simplified to 2 providers)"""
    provider: Literal['cognito', 'jwt']  # Only 2 providers after v3 migration
    required: bool = True  # Auth required by default
    cognito: Optional[Dict[str, str]] = None
    jwt: Optional[Dict[str, Any]] = None  # Changed to Any to support mockUsers array
    session: Dict[str, int] = Field(default_factory=lambda: {
        'timeout': 24 * 60 * 60 * 1000,  # 24 hours in milliseconds
        'refresh_buffer': 5 * 60 * 1000   # 5 minutes in milliseconds
    })


class APIConfig(BaseModel):
    """API configuration"""
    base_url: str = "/api"
    timeout: int = Field(default=30000, ge=1000)  # milliseconds
    retries: Dict[str, int] = Field(default_factory=lambda: {
        'max_retries': 3,
        'backoff_multiplier': 2,
        'initial_delay': 1000
    })
    endpoints: Dict[str, str] = Field(default_factory=lambda: {
        'auth': '/auth',
        'sops': '/sops',
        'forms': '/forms',
        'files': '/files',
        'users': '/users'
    })


class AutosaveConfig(BaseModel):
    """Autosave configuration (backward compatibility)"""
    enabled: bool = True
    storage: Dict[str, Any] = Field(default_factory=dict)
    debounce: Dict[str, int] = Field(default_factory=dict)
    retry: Dict[str, int] = Field(default_factory=dict)
    ui: Dict[str, Any] = Field(default_factory=dict)
    
    @field_validator('storage')
    @classmethod
    def validate_storage(cls, v):
        """Validate storage configuration"""
        return {
            'type': v.get('type', 'localStorage'),
            'key_prefix': v.get('key_prefix', 'autosave'),
            'max_items': v.get('max_items', 50),
            'ttl': v.get('ttl', 7 * 24 * 60 * 60 * 1000)  # 7 days
        }
    
    @field_validator('debounce')
    @classmethod
    def validate_debounce(cls, v):
        """Validate debounce configuration"""
        return {
            'delay': v.get('delay', 1000),
            'max_wait': v.get('max_wait', 15000)
        }
    
    @field_validator('retry')
    @classmethod
    def validate_retry(cls, v):
        """Validate retry configuration"""
        return {
            'max_retries': v.get('max_retries', 3),
            'backoff_multiplier': v.get('backoff_multiplier', 2),
            'initial_delay': v.get('initial_delay', 500)
        }
    
    @field_validator('ui')
    @classmethod
    def validate_ui(cls, v):
        """Validate UI configuration"""
        return {
            'show_status': v.get('show_status', True),
            'status_position': v.get('status_position', 'bottom-right'),
            'toast_on_save': v.get('toast_on_save', False),
            'toast_on_error': v.get('toast_on_error', True)
        }


class LoggingConfig(BaseModel):
    """Logging configuration"""
    level: Literal['debug', 'info', 'warn', 'error'] = 'info'
    targets: List[Literal['console', 'file', 'cloudwatch']] = Field(default_factory=lambda: ['console'])
    cloudwatch: Optional[Dict[str, str]] = None


class FeatureFlags(BaseModel):
    """Feature flags configuration"""
    enable_beta_features: bool = False
    enable_advanced_validation: bool = True
    enable_real_time_sync: bool = False
    enable_audit_trail: bool = False
    enable_offline_mode: bool = False


class ServiceConfig(BaseModel):
    """Main service configuration"""
    api: APIConfig = Field(default_factory=APIConfig)
    auth: AuthConfig = Field(default_factory=AuthConfig)
    storage: StorageConfig = Field(default_factory=lambda: StorageConfig(type='local'))
    database: Optional[DatabaseConfig] = None
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    features: FeatureFlags = Field(default_factory=FeatureFlags)
    autosave: AutosaveConfig = Field(default_factory=AutosaveConfig)


class ConfigMetadata(BaseModel):
    """Configuration metadata"""
    environment: Environment
    built: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    sources: Dict[str, Any] = Field(default_factory=dict)


class EnvironmentConfig(BaseModel):
    """Complete environment configuration"""
    webapp: ServiceConfig = Field(default_factory=ServiceConfig)
    aws: Optional[AWSResourceConfig] = None
    meta: Optional[ConfigMetadata] = None


class ConfigValidationError(BaseModel):
    """Configuration validation error"""
    path: str
    message: str
    required: bool = False


class ConfigValidationWarning(BaseModel):
    """Configuration validation warning"""
    path: str
    message: str


class ConfigValidationResult(BaseModel):
    """Configuration validation result"""
    valid: bool
    errors: List[ConfigValidationError] = Field(default_factory=list)
    warnings: List[ConfigValidationWarning] = Field(default_factory=list)


class ConfigLoadOptions(BaseModel):
    """Configuration loading options"""
    environment: Optional[Environment] = None
    skip_cache: bool = False
    validate_only: bool = False
    include_defaults: bool = True
    aws_discovery: bool = True
    env_var_overrides: bool = True


class ConfigSource(BaseModel):
    """Configuration source metadata"""
    type: Literal['defaults', 'environment', 'local', 'aws', 'envVars']
    path: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    priority: int


class ConfigWithSources(BaseModel):
    """Configuration with source tracking"""
    config: EnvironmentConfig
    sources: List[ConfigSource] = Field(default_factory=list)
    validation_result: ConfigValidationResult = Field(default_factory=lambda: ConfigValidationResult(valid=True))


class DefaultConfigFactory:
    """Factory for creating default configurations"""
    
    @staticmethod
    def create(environment: Environment) -> EnvironmentConfig:
        """Create default configuration for environment"""
        return EnvironmentConfig(
            webapp=ServiceConfig(
                api=APIConfig(),
                auth=AuthConfig(provider='jwt'),  # Changed from 'mock' to 'jwt'
                storage=StorageConfig(type='local'),
                logging=LoggingConfig(
                    level='info' if environment == Environment.PROD else 'debug'
                ),
                features=FeatureFlags(
                    enable_beta_features=environment == Environment.DEV,
                    enable_audit_trail=environment == Environment.PROD
                ),
                autosave=AutosaveConfig(
                    storage={
                        'type': 'localStorage',
                        'key_prefix': f'autosave-{environment.value}',
                        'max_items': 100 if environment == Environment.PROD else 50,
                        'ttl': 7 * 24 * 60 * 60 * 1000
                    },
                    debounce={
                        'delay': 5000 if environment == Environment.PROD else 1000,
                        'max_wait': 30000 if environment == Environment.PROD else 15000
                    },
                    retry={
                        'max_retries': 3,
                        'backoff_multiplier': 2,
                        'initial_delay': 1000 if environment == Environment.PROD else 500
                    },
                    ui={
                        'show_status': True,
                        'status_position': 'bottom-right',
                        'toast_on_save': environment == Environment.DEV,
                        'toast_on_error': True
                    }
                )
            ),
            meta=ConfigMetadata(environment=environment)
        )
    
    @staticmethod
    def create_for_autosave() -> AutosaveConfig:
        """Create default autosave configuration"""
        return AutosaveConfig()


# Environment variable mappings for backend services
ENV_VAR_MAPPINGS = {
    # Lambda service environment variables (for ELN processing)
    'lambda.storage.backend': 'LAMBDA_STORAGE_BACKEND',
    'lambda.storage.eln_bucket': 'ELN_BUCKET_NAME',
    'lambda.storage.draft_bucket': 'ELN_DRAFT_BUCKET_NAME', 
    'lambda.storage.forms_bucket': 'FORMS_BUCKET_NAME',
    'lambda.storage.local_path': 'LAMBDA_STORAGE_LOCAL_PATH',
    'lambda.logging.level': 'LAMBDA_LOG_LEVEL',
    
    # General AWS environment variables
    'aws.region': 'AWS_REGION',
    'aws.account_id': 'AWS_ACCOUNT_ID'
}


def validate_environment_config(config_dict: Dict[str, Any]) -> ConfigValidationResult:
    """Validate environment configuration dictionary"""
    errors = []
    warnings = []
    
    try:
        # Attempt to parse the configuration
        EnvironmentConfig.parse_obj(config_dict)
        
        # Additional business logic validation
        webapp_config = config_dict.get('webapp', {})
        
        # Check for required fields
        if not webapp_config.get('api', {}).get('base_url'):
            errors.append(ConfigValidationError(
                path='webapp.api.base_url',
                message='API base URL is required',
                required=True
            ))
        
        if not webapp_config.get('auth', {}).get('provider'):
            errors.append(ConfigValidationError(
                path='webapp.auth.provider',
                message='Auth provider is required',
                required=True
            ))
        
        if not webapp_config.get('storage', {}).get('type'):
            errors.append(ConfigValidationError(
                path='webapp.storage.type',
                message='Storage type is required',
                required=True
            ))
        
        # Check for warnings
        auth_provider = webapp_config.get('auth', {}).get('provider')
        environment = config_dict.get('meta', {}).get('environment')
        
        if auth_provider == 'jwt' and environment == 'prod':
            warnings.append(ConfigValidationWarning(
                path='webapp.auth.provider',
                message='JWT auth in production should use secure secrets (not dev defaults)'
            ))
        
    except Exception as e:
        errors.append(ConfigValidationError(
            path='root',
            message=f'Configuration parsing failed: {str(e)}',
            required=True
        ))
    
    return ConfigValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings
    ) 