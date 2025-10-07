<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Configuration Examples and Reference

This document provides minimal, working configuration examples for all SYNDI components. These examples serve as starting points for new deployments.

## Quick Reference
- [Lambda Configuration Files (Backend)](#lambda-configuration-files-backend)
- [Webapp Configuration Files (Frontend)](#webapp-configuration-files-frontend)  
- [Minimal SOP Example](#minimal-sop-example)
- [Configuration Principles](#important-configuration-principles)

## Lambda Configuration Files (Backend)

### Base Configuration File

Location: `infra/.config/lambda/{env}.json`

This is the base configuration shared by all organizations in an environment.

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
      "max_total_upload_size_mb": 100,
      "max_files_per_upload": 10,
      "allowed_extensions": [
        ".pdf", ".doc", ".docx", ".txt", 
        ".xls", ".xlsx", ".csv", 
        ".png", ".jpg", ".jpeg"
      ],
      "forbidden_extensions": [
        ".exe", ".bat", ".sh", ".php", ".js"
      ],
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
    },
    "server": {
      "host": "0.0.0.0",
      "port": 8000
    }
  }
}
```

### Organization-Specific Override File

Location: `infra/.config/lambda/{env}-{org}.json`

Organization-specific settings that override the base configuration.

```json
{
  "lambda": {
    "email_settings": {
      "from_email": "noreply@yourorg.edu",
      "support_email": "support@yourorg.edu",
      "invitation_subject": "Welcome to SYNDI Laboratory System"
    },
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "cors": {
      "allowedOrigins": [
        "https://syndi.yourorg.edu",
        "http://localhost:3000"
      ]
    },
    "private_webapp": {
      "auth": {
        "service": {
          "accounts": [
            {
              "service_id": "ci_pipeline",
              "service_name": "CI/CD Pipeline",
              "api_key": "REPLACE-WITH-SECURE-KEY",
              "groups": ["service"],
              "permissions": ["submit:*", "view:*"],
              "is_admin": false
            }
          ]
        }
      }
    }
  }
}
```

**Generate secure API key:**
```bash
openssl rand -hex 32
```

## Webapp Configuration Files (Frontend)

### Base Webapp Config

Location: `infra/.config/webapp/{env}.json`

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
    },
    "autosave": {
      "enabled": true,
      "storage": {
        "type": "localStorage",
        "keyPrefix": "claire-autosave",
        "maxItems": 50,
        "ttl": 86400000
      },
      "timerDelayMs": 15000,
      "ui": {
        "showStatus": true,
        "toastOnSave": false,
        "toastOnError": true
      }
    }
  }
}
```

**Note:** Infrastructure values (apiEndpoint, userPoolId, clientId) are filled by `sync-configs`.

### Organization Frontend Config

Location: `infra/.config/webapp/{env}-{org}.json`

```json
{
  "webapp": {
    "branding": {
      "title": "SYNDI Laboratory System",
      "org_name": "Your Organization"
    },
    "ui": {
      "theme": "light",
      "logo": "/assets/logo.png"
    }
  }
}
```

## Minimal SOP Example

Location: Upload to S3 bucket `rawscribe-forms-{env}-{org}-{accountid}/sops/`

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: TEST_001
name: "Test SOP"
title: "Test Standard Operating Procedure"
version: "1.0.0"
author: "Lab Manager"
date-published: "2024-01-01"

taskgroups:
  - id: main_group
    name: "Main"
    ordinal: 1
    children:
      - id: task_1
        '@type': Task
        name: "Sample Collection"
        ordinal: 1
        children:
          - id: sample_id
            '@type': Field
            name: "Sample ID"
            type: "string"
            required: true
            ui_config:
              placeholder: "Enter sample ID"
              help_text: "Unique identifier for this sample"
          - id: collection_date
            '@type': Field
            name: "Collection Date"
            type: "date"
            required: true
            ui_config:
              help_text: "Date sample was collected"
          - id: sample_notes
            '@type': Field
            name: "Notes"
            type: "text"
            required: false
            ui_config:
              multiline: true
              rows: 4
```

**Upload to S3:**
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 cp test-sop.yaml \
  s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID}/sops/
```

## Important Configuration Principles

### What Goes in JSON Config Files

✅ **Application behavior settings:**
- File upload limits (`max_file_size_mb`)
- Retry policies (`max_retries`, `backoff_multiplier`)
- Email settings (`from_email`, `support_email`)
- UI preferences (`theme`, `showStatus`)
- Feature flags (`autosave.enabled`)
- CORS allowed origins
- Service account configurations
- Timeout values
- Session durations

### What Does NOT Go in JSON Config Files

❌ **Infrastructure values** (these come from CloudFormation outputs → environment variables):
- S3 bucket names
- Cognito User Pool IDs
- Cognito Client IDs
- API Gateway endpoints
- Lambda function names
- CloudFront distribution IDs
- Any CloudFormation outputs

**Why:** Infrastructure values are deployment-specific and managed by CloudFormation. They're automatically set as Lambda environment variables and synced to configs via `sync-configs`.

### Configuration Hierarchy

Configuration is resolved in this order (highest to lowest priority):

1. **CloudFormation Outputs** → Lambda environment variables
2. **Org-specific config** (`{env}-{org}.json`) - Organization overrides
3. **Base config** (`{env}.json`) - Environment defaults
4. **Application defaults** - Hardcoded in code

**Example resolution for API endpoint:**
```
1. Check Lambda env var: API_ENDPOINT
2. Check org config: webapp.apiEndpoint (from stage-myorg.json)
3. Check base config: webapp.apiEndpoint (from stage.json)
4. Use default: http://localhost:8000 (development fallback)
```

### Configuration Merge Process

**Step 1:** Base + org-specific merge (via config-merger.py)
```
infra/.config/lambda/stage.json (base)
  + infra/.config/lambda/stage-myorg.json (override)
  = backend/rawscribe/.config/config.json (merged)
```

**Step 2:** CloudFormation sync (via sync-configs)
```
CloudFormation outputs
  → infra/.config/webapp/stage-myorg.json (updated)
  → infra/.config/lambda/stage-myorg.json (updated)
```

**Step 3:** Runtime loading
```
Lambda: Reads env vars first, falls back to config.json
Frontend: Reads merged config.json from public/
```

## Complete Configuration Examples

### Development Environment

**Base Lambda Config** (`infra/.config/lambda/dev.json`):
```json
{
  "lambda": {
    "auth": {
      "provider": "mock",
      "required": true,
      "users": [
        {
          "id": "dev_user",
          "email": "dev_user@local.dev",
          "username": "dev_user",
          "password": "dev123",
          "name": "Development User",
          "groups": ["admin"],
          "permissions": ["*"],
          "isAdmin": true
        }
      ]
    },
    "storage": {
      "type": "local",
      "local_path": "../.local/s3",
      "draft_bucket_name": "eln-drafts",
      "eln_bucket_name": "eln",
      "forms_bucket_name": "forms"
    },
    "server": {
      "host": "0.0.0.0",
      "port": 8000
    }
  }
}
```

**Base Webapp Config** (`infra/.config/webapp/dev.json`):
```json
{
  "webapp": {
    "apiEndpoint": "http://localhost:8000",
    "authRequired": true,
    "auth": {
      "provider": "mock"
    },
    "storage": {
      "type": "local"
    }
  }
}
```

### Staging Environment

**Base Lambda Config** (`infra/.config/lambda/stage.json`):
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
      "allowed_extensions": [".pdf", ".doc", ".txt", ".xls", ".xlsx"]
    },
    "storage": {
      "type": "s3",
      "region": "us-east-1"
    }
  }
}
```

**Org-Specific Override** (`infra/.config/lambda/stage-myorg.json`):
```json
{
  "lambda": {
    "email_settings": {
      "from_email": "noreply@myorg.edu",
      "support_email": "support@myorg.edu"
    },
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "auth": {
      "cognito": {
        "userPoolId": "us-east-1_ABC123",
        "clientId": "abc123def456"
      }
    }
  }
}
```

**Note:** Cognito IDs automatically filled by `sync-configs`.

### Production Environment

**Base Lambda Config** (`infra/.config/lambda/prod.json`):
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
      "allowed_extensions": [".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".csv"],
      "forbidden_extensions": [".exe", ".bat", ".sh"],
      "temp_storage_retention_days": 30
    },
    "retry": {
      "max_retries": 5,
      "backoff_multiplier": 2
    },
    "cors": {
      "allowedOrigins": [
        "https://syndi.production-domain.com"
      ]
    }
  }
}
```

## Field Descriptions

### Lambda Config Fields

**file_uploads:**
- `max_file_size_mb` - Maximum size per file (MB)
- `max_total_upload_size_mb` - Maximum total upload size (MB)
- `max_files_per_upload` - Maximum number of files per request
- `allowed_extensions` - List of permitted file extensions
- `forbidden_extensions` - List of blocked file extensions
- `temp_storage_retention_days` - Days to keep temporary files

**retry:**
- `max_retries` - Maximum retry attempts for failed operations
- `backoff_multiplier` - Exponential backoff multiplier
- `initialDelay` - Initial delay before first retry (ms)

**cors:**
- `allowedOrigins` - Array of permitted CORS origins

**auth.cognito:**
- `region` - AWS region (e.g., "us-east-1")
- `userPoolId` - Cognito User Pool ID (auto-filled by sync-configs)
- `clientId` - Cognito App Client ID (auto-filled by sync-configs)

**email_settings:**
- `from_email` - Email sender address
- `support_email` - Support/reply-to address
- `invitation_subject` - Subject for user invitation emails
- `use_ses` - Use AWS SES for emails (true/false)

**private_webapp.auth.service.accounts:**
- `service_id` - Unique service identifier
- `service_name` - Human-readable service name
- `api_key` - Secure API key (generate with `openssl rand -hex 32`)
- `groups` - Array of group memberships
- `permissions` - Array of permission strings
- `is_admin` - Boolean admin flag

### Webapp Config Fields

**branding:**
- `title` - Application title (browser tab)
- `org_name` - Organization display name

**ui:**
- `theme` - UI theme ("light" or "dark")
- `logo` - Path to logo image

**auth.session:**
- `timeout` - Session timeout (milliseconds)
- `refreshBuffer` - Time before expiry to refresh token (ms)

**autosave:**
- `enabled` - Enable autosave (true/false)
- `storage.type` - Storage type ("localStorage", "sessionStorage", "api")
- `storage.keyPrefix` - Prefix for storage keys
- `storage.maxItems` - Maximum autosave items
- `storage.ttl` - Time to live (milliseconds)
- `timerDelayMs` - Delay before autosave triggers (ms)
- `ui.showStatus` - Show autosave status indicator
- `ui.toastOnSave` - Show toast notification on save
- `ui.toastOnError` - Show toast on error

## Minimal SOP Example

Location: Upload to S3 bucket `rawscribe-forms-{env}-{org}-{accountid}/sops/`

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: TEST_001
name: "Test SOP"
title: "Test Standard Operating Procedure"
version: "1.0.0"
author: "Lab Manager"
date-published: "2024-01-01"

taskgroups:
  - id: main_group
    name: "Main"
    ordinal: 1
    children:
      - id: task_1
        '@type': Task
        name: "Sample Collection"
        ordinal: 1
        children:
          - id: sample_id
            '@type': Field
            name: "Sample ID"
            type: "string"
            required: true
            ui_config:
              placeholder: "Enter sample ID"
              help_text: "Unique identifier for this sample"
          - id: collection_date
            '@type': Field
            name: "Collection Date"
            type: "date"
            required: true
            ui_config:
              help_text: "Date sample was collected"
          - id: sample_type
            '@type': Field
            name: "Sample Type"
            type: "select"
            required: true
            ui_config:
              options:
                - value: "blood"
                  label: "Blood"
                - value: "tissue"
                  label: "Tissue"
                - value: "cell_culture"
                  label: "Cell Culture"
          - id: sample_notes
            '@type': Field
            name: "Notes"
            type: "text"
            required: false
            ui_config:
              multiline: true
              rows: 4
              placeholder: "Additional notes about the sample"
```

**Upload to S3:**
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 cp test-sop.yaml \
  s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID}/sops/

# Verify upload
aws s3 ls s3://rawscribe-forms-stage-myorg-${ACCOUNT_ID}/sops/
```

## Important Configuration Principles

### What Goes in JSON Config Files

✅ **Application behavior settings:**
- File upload limits
- Retry policies
- Email settings
- UI preferences
- Feature flags
- CORS origins
- Service accounts
- Timeout values
- Autosave settings

### What Does NOT Go in JSON Config Files

❌ **Infrastructure values** (these come from CloudFormation):
- S3 bucket names
- Cognito User Pool IDs
- Cognito Client IDs
- API Gateway endpoints
- Lambda function names
- CloudFront distribution IDs
- Any CloudFormation outputs

**Why:** Infrastructure values vary by deployment and are managed by CloudFormation. They're:
1. Output by CloudFormation stack
2. Set as Lambda environment variables
3. Synced to config files via `sync-configs`

### Configuration Hierarchy

1. **Base config** (`{env}.json`) - Shared settings for all organizations
2. **Org override** (`{env}-{org}.json`) - Organization-specific overrides
3. **Environment variables** - Infrastructure values from CloudFormation
4. **Runtime merge** - ConfigLoader.py merges all sources

### Deep Merge Example

**Base** (`stage.json`):
```json
{
  "lambda": {
    "file_uploads": {
      "max_file_size_mb": 25,
      "allowed_extensions": [".pdf", ".doc"]
    }
  }
}
```

**Override** (`stage-myorg.json`):
```json
{
  "lambda": {
    "file_uploads": {
      "max_file_size_mb": 50
    },
    "email_settings": {
      "from_email": "noreply@myorg.com"
    }
  }
}
```

**Merged Result:**
```json
{
  "lambda": {
    "file_uploads": {
      "max_file_size_mb": 50,
      "allowed_extensions": [".pdf", ".doc"]
    },
    "email_settings": {
      "from_email": "noreply@myorg.com"
    }
  }
}
```

**Key points:**
- `max_file_size_mb` overridden (50 not 25)
- `allowed_extensions` preserved from base
- `email_settings` added from override

## Related Documentation

- [Configuration System](../architecture/configuration-system.md) - Overall configuration strategy
- [Sync Configs](sync-configs.md) - Syncing from CloudFormation
- [Config Repository](config-repository.md) - Managing config files
- [Multi-Organization Setup](../deployment/multi-organization.md) - Per-org configs
