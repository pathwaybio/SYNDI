<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Configuration Repository Management

This guide explains how to manage the `infra/.config/` directory, which contains organization-specific and environment-specific configurations that may include sensitive information.

## Overview

The `infra/.config/` directory contains configuration files that are **NOT tracked in the main repository** by design:

```
infra/.config/           # NOT in git (see .gitignore)
├── cloudformation/
│   ├── dev.json
│   ├── stage.json
│   └── prod.json
├── lambda/
│   ├── dev.json
│   ├── dev-{org}.json
│   ├── stage.json
│   ├── stage-{org}.json
│   ├── prod.json
│   └── prod-{org}.json
└── webapp/
    ├── dev.json
    ├── dev-{org}.json
    ├── stage.json
    ├── stage-{org}.json
    ├── prod.json
    └── prod-{org}.json
```

**Why not in git:**
- May contain sensitive information (API keys, service account credentials)
- Organization-specific deployment details
- Infrastructure resource IDs that vary by deployment
- Each team/org should manage their own configs

## Configuration Categories

### Base Configurations (Can be shared)

Base environment configs that contain no sensitive data:

```
infra/.config/lambda/dev.json        # Development defaults
infra/.config/lambda/stage.json      # Staging defaults  
infra/.config/lambda/prod.json       # Production defaults

infra/.config/webapp/dev.json
infra/.config/webapp/stage.json
infra/.config/webapp/prod.json
```

**Contents:** Application behavior settings only
- File upload limits
- Retry policies
- CORS allowed origins (localhost only)
- UI preferences
- Feature flags

**Safe to share:** Yes, if they contain no infrastructure values

### Organization-Specific Configurations (Private)

Org-specific overrides with deployment details:

```
infra/.config/lambda/stage-myorg.json
infra/.config/lambda/prod-myorg.json

infra/.config/webapp/stage-myorg.json
infra/.config/webapp/prod-myorg.json
```

**Contents:** Org-specific customizations
- Email addresses (from_email, support_email)
- Branding information
- Custom file size limits
- Org-specific CORS domains
- Cognito IDs (auto-filled by sync-configs)
- API endpoints (auto-filled by sync-configs)

**Safe to share:** Usually NO (contains deployment details)

## Setup Options

### Option 1: Private Configuration Repository (Recommended)

Create a separate private git repository for your configurations:

```bash
# Create private config repo (one-time setup)
cd infra/.config
git init
git add .
git commit -m "Initial org configs"

# Add remote (private GitHub/GitLab repo)
git remote add origin git@github.com:yourorg/syndi-configs-private.git
git push -u origin main

# Add README explaining structure
cat > README.md << 'EOF'
# SYNDI Private Configurations

This repository contains organization-specific SYNDI configurations.

⚠️ **PRIVATE** - Contains deployment-specific resource IDs and settings

## Structure
- `cloudformation/` - CloudFormation parameters
- `lambda/` - Backend Lambda configurations
- `webapp/` - Frontend webapp configurations

## Usage
See main SYNDI documentation for configuration management.
EOF

git add README.md
git commit -m "Add README"
git push
```

**Benefits:**
- Version control for configs
- Track configuration changes
- Easy team collaboration
- Secure backup
- Can be shared with trusted team members

**Workflow:**
```bash
# Pull latest configs
cd infra/.config && git pull

# Make changes
vi lambda/stage-myorg.json

# Commit and push
git add lambda/stage-myorg.json
git commit -m "Update file size limit for stage-myorg"
git push
```

### Option 2: Environment Variables + Templating

Store sensitive values as environment variables and use templates:

**Create template:**
```bash
# infra/.config/lambda/stage-myorg.json.template
{
  "lambda": {
    "email_settings": {
      "from_email": "${FROM_EMAIL}",
      "support_email": "${SUPPORT_EMAIL}"
    },
    "private_webapp": {
      "auth": {
        "service": {
          "accounts": [
            {
              "service_id": "ci_pipeline",
              "api_key": "${CI_API_KEY}"
            }
          ]
        }
      }
    }
  }
}
```

**Generate from template:**
```bash
# Set environment variables
export FROM_EMAIL=noreply@myorg.com
export SUPPORT_EMAIL=support@myorg.com
export CI_API_KEY=$(openssl rand -hex 32)

# Generate actual config
envsubst < infra/.config/lambda/stage-myorg.json.template \
  > infra/.config/lambda/stage-myorg.json
```

**Benefits:**
- Sensitive values not in files
- Can commit templates to git
- Works well with CI/CD

**Drawbacks:**
- More complex setup
- Need to manage environment variables
- Template maintenance required

### Option 3: AWS Secrets Manager (Production)

Store configurations in AWS Secrets Manager:

**Store config:**
```bash
# Upload config to Secrets Manager
aws secretsmanager create-secret \
  --name syndi/config/stage-myorg/lambda \
  --secret-string file://infra/.config/lambda/stage-myorg.json \
  --region us-east-1
```

**Retrieve config:**
```bash
# Download before deployment
aws secretsmanager get-secret-value \
  --secret-id syndi/config/stage-myorg/lambda \
  --query SecretString \
  --output text > infra/.config/lambda/stage-myorg.json
```

**Benefits:**
- Highest security
- Automatic rotation support
- Audit logging
- IAM-based access control

**Drawbacks:**
- AWS costs (minimal)
- More complex workflow
- Requires AWS access to view configs

## Gitignore Configuration

The main repository's `.gitignore` already excludes configs:

```gitignore
# Configuration files (managed separately)
infra/.config/
```

This prevents accidental commits of sensitive configuration to the main repository.

## Configuration Workflow

### Initial Setup (New Organization)

```bash
# 1. Deploy infrastructure
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ORG=myorg ENV=stage make rs-deploy

# 2. Sync configs from CloudFormation
make sync-configs ENV=stage ORG=myorg

# 3. Customize org-specific settings
vi infra/.config/lambda/stage-myorg.json
vi infra/.config/webapp/stage-myorg.json

# 4. If using private config repo, commit
cd infra/.config
git add lambda/stage-myorg.json webapp/stage-myorg.json
git commit -m "Add stage-myorg configs"
git push

# 5. Redeploy with customizations
cd ../..
ORG=myorg ENV=stage make rs-deploy-only
```

### Team Onboarding

**New team member setup:**

```bash
# 1. Clone main repository
git clone git@github.com:yourorg/syndi.git
cd syndi

# 2. Clone private config repository
git clone git@github.com:yourorg/syndi-configs-private.git infra/.config

# 3. Verify configs exist
ls infra/.config/lambda/
ls infra/.config/webapp/

# 4. Ready to deploy
ORG=myorg ENV=stage make rs-deploy
```

### Configuration Updates

**After infrastructure changes:**

```bash
# 1. Deploy infrastructure updates
ORG=myorg ENV=stage make rs-deploy

# 2. Sync updated CloudFormation outputs
make sync-configs ENV=stage ORG=myorg

# 3. Review changes
cd infra/.config
git diff

# 4. Commit if changed
git add lambda/stage-myorg.json webapp/stage-myorg.json
git commit -m "Update CloudFormation outputs after deployment"
git push
```

**For application setting changes:**

```bash
# 1. Edit config file
vi infra/.config/lambda/stage-myorg.json

# 2. Commit change
cd infra/.config
git add lambda/stage-myorg.json
git commit -m "Increase file upload limit to 100MB"
git push

# 3. Deploy changes
cd ../..
ORG=myorg ENV=stage make rs-deploy-only
```

## Security Best Practices

### Do NOT Commit

**Never commit these to main repository:**
- Cognito User Pool IDs
- Cognito Client IDs
- API Gateway endpoints
- Service account API keys
- Private email addresses
- Organization-specific domains
- Any production credentials

### Safe to Commit

**These are safe in base configs:**
- File size limits
- Retry policies
- Localhost CORS origins
- Feature flags (non-sensitive)
- UI preferences
- Generic timeout values

### Configuration Auditing

**Regular security reviews:**

```bash
# Check for sensitive data in main repo
cd /path/to/syndi
git grep -i "api[_-]key" infra/
git grep -i "password" infra/
git grep -i "@.*\.com" infra/

# Should return no results in committed files
```

**Audit config repo access:**
```bash
# Review who has access to private config repo
# Use GitHub/GitLab settings to manage access
# Regularly review and revoke unnecessary access
```

## Backup and Recovery

### Backup Configurations

**Option 1: Git-based backup (if using private repo)**
```bash
# Automatic via git push
cd infra/.config && git push
```

**Option 2: Manual backup**
```bash
# Create timestamped backup
tar -czf syndi-configs-$(date +%Y%m%d).tar.gz infra/.config/
mv syndi-configs-*.tar.gz ~/backups/
```

**Option 3: AWS backup (if using Secrets Manager)**
```bash
# Secrets Manager automatically maintains versions
aws secretsmanager list-secret-version-ids \
  --secret-id syndi/config/stage-myorg/lambda
```

### Recovery

**Restore from private git repo:**
```bash
# Clone or pull latest
git clone git@github.com:yourorg/syndi-configs-private.git infra/.config
# Or if already cloned:
cd infra/.config && git pull
```

**Restore from backup:**
```bash
# Extract backup
tar -xzf ~/backups/syndi-configs-20250130.tar.gz
```

**Rebuild from CloudFormation:**
```bash
# Sync from deployed stack (recreates configs)
make sync-configs ENV=stage ORG=myorg

# Then manually add custom settings
vi infra/.config/lambda/stage-myorg.json
```

## Multi-Organization Management

When managing multiple organizations:

```
infra/.config/
├── lambda/
│   ├── stage-org1.json
│   ├── stage-org2.json
│   ├── stage-org3.json
│   ├── prod-org1.json
│   ├── prod-org2.json
│   └── prod-org3.json
└── webapp/
    ├── stage-org1.json
    ├── stage-org2.json
    ├── stage-org3.json
    ├── prod-org1.json
    ├── prod-org2.json
    └── prod-org3.json
```

**Branching strategy:**
```bash
# Option 1: One config repo with org-specific branches
git checkout -b org1
# Edit org1 configs
git commit -m "Update org1 configs"
git push origin org1

git checkout -b org2
# Edit org2 configs
git commit -m "Update org2 configs"
git push origin org2

# Option 2: One config repo, all orgs in main branch
# All org configs committed together
# Access controlled via GitHub/GitLab permissions
```

## Troubleshooting

### Config Files Not Found

**Symptom:** Deployment fails with "Config file not found"

**Solution:**
```bash
# Check if configs exist
ls infra/.config/lambda/stage-myorg.json

# If missing, sync from CloudFormation
make sync-configs ENV=stage ORG=myorg

# Or restore from backup/git
cd infra/.config && git pull
```

### Configs Out of Sync

**Symptom:** Deployment uses old API endpoint or Cognito IDs

**Solution:**
```bash
# Re-sync from CloudFormation
make sync-configs ENV=stage ORG=myorg

# Verify updated
cat infra/.config/webapp/stage-myorg.json | jq '.webapp.apiEndpoint'
```

### Accidentally Committed Sensitive Data

**Immediate action:**
```bash
# Remove from git history (DANGEROUS - rewrites history)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch infra/.config/lambda/stage-myorg.json' \
  --prune-empty --tag-name-filter cat -- --all

# Force push (if working alone)
git push origin --force --all

# Better: Rotate all sensitive values immediately
# - Generate new API keys
# - Create new service accounts
# - Update all configs
```

**Prevention:**
```bash
# Verify .gitignore is working
git check-ignore infra/.config/lambda/stage-myorg.json
# Should output the filename (means it's ignored)

# Check what would be committed
git status
# infra/.config/ should never appear
```

## Related Documentation

- [Configuration System](../architecture/configuration-system.md) - How configs work
- [Sync Configs Guide](sync-configs.md) - Using sync-configs command
- [Config Files Guide](config-files.md) - Config file structure
- [Multi-Organization Setup](../deployment/multi-organization.md) - Managing multiple orgs
