<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Configuration System Architecture

This document explains SYNDI's configuration architecture, including how configuration files are structured, merged, and deployed across different environments and organizations.

## Overview

SYNDI uses a **three-tier configuration system** designed to separate infrastructure values from application behavior while supporting multiple organizations:

1. **CloudFormation Outputs** → Lambda Environment Variables (infrastructure values)
2. **Base JSON Configs** → Application behavior settings  
3. **Org-specific Override Configs** → Organization customizations

This architecture follows these principles:

- **Infrastructure values** (Cognito IDs, bucket names, API endpoints) → CloudFormation outputs → Lambda environment variables
- **Application behavior** (file limits, retry logic, UI preferences) → JSON config files
- **Deployment parameters** (ENV, ORG, ENABLE_AUTH, CREATE_BUCKETS) → Makefile command line
- **Zero redundancy** - Each value defined exactly once
- **Pure functional deployment** - `f(ENV, ORG, parameters) → Infrastructure`

## Configuration File Structure

### Directory Layout

```
infra/.config/                        # Central config management (NOT in git)
├── lambda/
│   ├── dev.json                     # Base Lambda config for dev
│   ├── dev-{org}.json               # Org-specific Lambda overrides for dev
│   ├── test.json                    # Base Lambda config for test
│   ├── stage.json                   # Base Lambda config for stage
│   ├── stage-{org}.json             # Org-specific Lambda overrides for stage
│   ├── prod.json                    # Base Lambda config for prod
│   └── prod-{org}.json              # Org-specific Lambda overrides for prod
├── webapp/
│   ├── dev.json                     # Base webapp config for dev
│   ├── dev-{org}.json               # Org-specific webapp overrides for dev
│   ├── test.json                    # Base webapp config for test
│   ├── stage.json                   # Base webapp config for stage
│   ├── stage-{org}.json             # Org-specific webapp overrides for stage
│   ├── prod.json                    # Base webapp config for prod
│   └── prod-{org}.json              # Org-specific webapp overrides for prod
└── cloudformation/                   # CloudFormation parameter files
    ├── dev.json
    ├── stage.json
    └── prod.json
```

### What Goes Where

#### ✅ JSON Config Files (Application Behavior)
Store these in `infra/.config/lambda/{env}.json` or `infra/.config/webapp/{env}.json`:

- File upload limits (`max_file_size_mb`)
- Retry policies (`max_retries`, `backoff_multiplier`)
- Email settings (`from_email`, `support_email`)
- UI preferences (`theme`, `showStatus`)
- Feature flags (`autosave.enabled`)
- CORS allowed origins
- Service account configurations

#### ❌ NOT in JSON Config Files (Infrastructure Values)
These come from CloudFormation outputs or environment variables:

- S3 bucket names
- Cognito User Pool IDs
- Cognito Client IDs
- API Gateway endpoints
- Lambda function names
- Any CloudFormation outputs

## Configuration Merge Process

### 1. Base + Org-specific Merge

The `config-merger.py` script performs deep merging:

```bash
# Merge process (automatic via Makefile)
python infra/scripts/config-merger.py \
  "infra/.config/lambda/stage.json" \        # Base config
  "infra/.config/lambda/stage-uga.json" \    # Org-specific overrides
  "backend/rawscribe/.config/config.json"    # Output (merged)
```

**Deep Merge Strategy:**
- Org-specific values **override** base values
- Nested objects are merged recursively
- Arrays are replaced (not merged)
- Null values in org config remove base values

**Example:**

Base config (`stage.json`):
```json
{
  "lambda": {
    "auth": {
      "provider": "cognito",
      "required": true
    },
    "file_uploads": {
      "max_file_size_mb": 25
    }
  }
}
```

Org-specific config (`stage-uga.json`):
```json
{
  "lambda": {
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "email_settings": {
      "from_email": "noreply@uga.edu"
    }
  }
}
```

Merged result:
```json
{
  "lambda": {
    "auth": {
      "provider": "cognito",
      "required": true
    },
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "email_settings": {
      "from_email": "noreply@uga.edu"
    }
  }
}
```

### 2. CloudFormation Output Sync

After deployment, `sync-configs-from-cloudformation.py` updates org-specific configs with infrastructure values:

```bash
# Sync configs from deployed stack
make sync-configs ENV=stage ORG=uga
```

This script:
1. Queries CloudFormation stack outputs
2. Extracts API endpoint, Cognito User Pool ID, and Client ID
3. Deep-merges these values into `infra/.config/webapp/stage-uga.json`
4. Preserves all existing custom fields
5. Updates only infrastructure-related values

**What gets synced:**
- `webapp.apiEndpoint` ← CloudFormation `ApiEndpoint` output
- `webapp.auth.cognito.userPoolId` ← CloudFormation `CognitoUserPoolId` output
- `webapp.auth.cognito.clientId` ← CloudFormation `CognitoClientId` output
- `webapp.api.proxyTarget` ← CloudFormation `ApiEndpoint` output

### 3. Runtime Configuration Loading

#### Lambda Backend
The Lambda function receives configuration from two sources:

**Environment Variables (from CloudFormation):**
```yaml
Environment:
  Variables:
    ENV: stage
    ORG: uga
    CONFIG_S3_BUCKET: rawscribe-lambda-stage-uga-123456789
    CONFIG_S3_KEY: config.json
    COGNITO_REGION: us-east-1
    COGNITO_USER_POOL_ID: us-east-1_ABC123
    COGNITO_CLIENT_ID: abc123def456
    FORMS_BUCKET: rawscribe-forms-stage-uga-123456789
    ELN_BUCKET: rawscribe-eln-stage-uga-123456789
    DRAFTS_BUCKET: rawscribe-eln-drafts-stage-uga-123456789
```

**Config File (uploaded to S3):**
The merged JSON config is uploaded to S3 during deployment:
```bash
# Automatic via rs-deploy-only
aws s3 cp infra/.config/lambda/stage-uga.json \
  s3://rawscribe-lambda-stage-uga-123456789/config.json
```

**Auth Provider System:**

The backend uses pluggable authentication providers with environment-aware configuration:

```python
# backend/rawscribe/utils/auth_providers/factory.py
provider = AuthProviderFactory.create(config)  # Returns CognitoProvider or JWTProvider

# backend/rawscribe/utils/auth_providers/cognito_provider.py
# Environment variables take precedence (CloudFormation truth)
def get_user_pool_id(self) -> str:
    return os.environ.get('COGNITO_USER_POOL_ID') or \
           self._cognito_config.get('userPoolId')
```

**Runtime Config Endpoint:**

Clients can query `/api/config/runtime` to get actual deployed configuration:

```bash
curl https://api.example.com/api/config/runtime
```

Returns:
```json
{
  "auth": {
    "provider": "cognito",
    "config": {
      "userPoolId": "us-east-1_ABC123",
      "clientId": "abc123def456",
      "region": "us-east-1",
      "source": "environment"
    }
  }
}
```

The `source` field indicates whether config came from environment variables (CloudFormation) or config file (baked into Lambda).

#### Frontend Webapp
Configuration is built into the static assets:

```bash
# Build process merges configs
python infra/scripts/config-merger.py \
  "infra/.config/webapp/stage.json" \
  "infra/.config/webapp/stage-uga.json" \
  "frontend/public/config.json"

# Frontend build includes config.json
npm run build  # config.json → frontend/dist/config.json
```

Frontend loads config at runtime:
```typescript
// Fetch config based on environment
const config = await fetch('/config.json').then(r => r.json());
```

## Configuration Workflow

### Initial Deployment (New Organization)

```bash
# 1. Deploy infrastructure with bucket creation
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ORG=neworg ENV=stage make rs-deploy

# 2. Sync configs from CloudFormation outputs
make sync-configs ENV=stage ORG=neworg

# 3. Review and customize org-specific config
vi infra/.config/webapp/stage-neworg.json
vi infra/.config/lambda/stage-neworg.json

# 4. Redeploy with updated configs
ORG=neworg ENV=stage make rs-deploy-only
```

### Updating Application Settings

```bash
# 1. Edit base or org-specific config
vi infra/.config/lambda/stage-uga.json

# 2. Deploy configuration changes
ORG=uga ENV=stage make rs-deploy-only
```

### Updating Infrastructure

When CloudFormation outputs change (e.g., new Cognito pool):

```bash
# 1. Deploy infrastructure changes
ORG=uga ENV=stage make rs-deploy

# 2. Sync updated values to configs
make sync-configs ENV=stage ORG=uga

# 3. Verify changes
git diff infra/.config/webapp/stage-uga.json
```

## Configuration Examples

### Minimal Lambda Config (Base)

`infra/.config/lambda/stage.json`:
```json
{
  "lambda": {
    "auth": {
      "provider": "cognito",
      "required": true,
      "cognito": {
        "region": "us-east-1"
      }
    },
    "file_uploads": {
      "max_file_size_mb": 25,
      "allowed_extensions": [".pdf", ".doc", ".txt", ".xls", ".xlsx"],
      "temp_storage_retention_days": 7
    },
    "retry": {
      "max_retries": 3,
      "backoff_multiplier": 2
    },
    "cors": {
      "allowedOrigins": [
        "http://localhost:3000",
        "http://localhost:5173"
      ]
    }
  }
}
```

### Organization-Specific Lambda Override

`infra/.config/lambda/stage-uga.json`:
```json
{
  "lambda": {
    "email_settings": {
      "from_email": "noreply@uga.edu",
      "support_email": "support@uga.edu"
    },
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "cors": {
      "allowedOrigins": [
        "https://syndi.uga.edu",
        "http://localhost:3000"
      ]
    }
  }
}
```

### Minimal Webapp Config (Base)

`infra/.config/webapp/stage.json`:
```json
{
  "webapp": {
    "apiEndpoint": "TO_BE_FILLED_BY_SYNC_CONFIGS",
    "auth": {
      "required": true,
      "provider": "cognito",
      "cognito": {
        "region": "us-east-1",
        "userPoolId": "TO_BE_FILLED_BY_SYNC_CONFIGS",
        "clientId": "TO_BE_FILLED_BY_SYNC_CONFIGS"
      },
      "session": {
        "timeout": 3600000,
        "refreshBuffer": 300000
      }
    }
  }
}
```

### Organization-Specific Webapp Override

`infra/.config/webapp/stage-uga.json`:
```json
{
  "webapp": {
    "branding": {
      "title": "SYNDI - University of Georgia",
      "org_name": "UGA Research Labs"
    },
    "ui": {
      "theme": "light",
      "logo": "/assets/uga-logo.png"
    }
  }
}
```

Note: Infrastructure values (apiEndpoint, userPoolId, clientId) are automatically filled by `sync-configs`.

## Configuration Precedence

Configuration values are resolved in this order (highest to lowest priority):

1. **Lambda Environment Variables** (from CloudFormation)
2. **Org-specific JSON Config** (`{env}-{org}.json`)
3. **Base JSON Config** (`{env}.json`)
4. **Application Defaults** (hardcoded in code)

Example resolution for `COGNITO_USER_POOL_ID`:
```
1. Check Lambda env var: COGNITO_USER_POOL_ID
2. Check org config: lambda.auth.cognito.userPoolId (from stage-uga.json)
3. Check base config: lambda.auth.cognito.userPoolId (from stage.json)
4. Use default: None (authentication disabled)
```

## Troubleshooting

### Config Merge Issues

**Problem:** Org-specific config not taking effect

**Solution:**
```bash
# Verify merge is happening
make config ENV=stage ORG=uga

# Check merged output
cat backend/rawscribe/.config/config.json | jq '.lambda.file_uploads'
```

### CloudFormation Sync Issues

**Problem:** `sync-configs` not updating values

**Solution:**
```bash
# Verify stack exists and has outputs
aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-uga \
  --query 'Stacks[0].Outputs'

# Run sync with debug output
python -u infra/scripts/sync-configs-from-cloudformation.py \
  --env stage --org uga
```

### Missing Configuration

**Problem:** Lambda can't find config values

**Solution:**
```bash
# Check environment variables
aws lambda get-function-configuration \
  --function-name rawscribe-stage-uga-backend \
  --query 'Environment.Variables'

# Check S3 config upload
aws s3 cp s3://rawscribe-lambda-stage-uga-123456789/config.json - | jq
```

## Best Practices

1. **Use Base Configs for Shared Settings**: Put common settings in base configs (`stage.json`)
2. **Use Org Configs for Customizations**: Put organization-specific values in org configs (`stage-uga.json`)
3. **Never Hardcode Infrastructure Values**: Always use CloudFormation outputs or environment variables
4. **Run sync-configs After Deployment**: Always sync configs after deploying infrastructure changes
5. **Version Control Base Configs**: Base configs can be committed (no sensitive data)
6. **Keep Org Configs Private**: Org-specific configs may contain sensitive information
7. **Validate JSON**: Use `jq` to validate JSON before deployment
8. **Document Custom Fields**: Add comments (via commit messages) explaining custom config fields

## Related Documentation

- [Deployment Guide](../deployment/makefile-deployment.md) - How to deploy with configs
- [Config Examples](../configuration/config-examples.md) - More configuration examples
- [Sync Configs Guide](../configuration/sync-configs.md) - Detailed sync-configs usage
- [Makefile Reference](../reference/makefile-commands.md) - All config-related commands
