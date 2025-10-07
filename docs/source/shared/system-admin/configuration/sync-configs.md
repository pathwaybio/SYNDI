<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Syncing Configs from CloudFormation

This guide explains how to use the `sync-configs` command to automatically update configuration files with deployed AWS resource information.

## Overview

After deploying SYNDI infrastructure, you need to update your configuration files with the actual AWS resource IDs (API endpoints, Cognito IDs, etc.). The `sync-configs` command automates this process.

**Purpose:** Update local config files with CloudFormation stack outputs  
**When to use:** After any deployment that changes infrastructure resources  
**Script:** `infra/scripts/sync-configs-from-cloudformation.py`

## Quick Command

```bash
make sync-configs ENV=stage ORG=myorg
```

## What It Does

The sync-configs command:

1. **Queries CloudFormation** for stack outputs
2. **Extracts infrastructure values:**
   - API Gateway endpoint URL
   - Cognito User Pool ID
   - Cognito App Client ID
   - CloudFront distribution URL
3. **Updates org-specific configs** via deep merge
4. **Preserves custom fields** you've added
5. **Displays what changed**

## When to Run sync-configs

### Always Run After

- ✅ **First deployment** to new organization
- ✅ **Cognito resources recreated** (EnableAuth changed)
- ✅ **API Gateway endpoint changes**
- ✅ **Stack deleted and redeployed**
- ✅ **Any infrastructure changes** in template.yaml

### Not Needed After

- ❌ Code-only updates (`rs-deploy-function`)
- ❌ Config-only changes that don't affect CloudFormation
- ❌ Lambda environment variable updates

## How It Works

### Configuration File Updates

**Webapp Config** (`infra/.config/webapp/{env}-{org}.json`):

Updated fields:
```json
{
  "webapp": {
    "apiEndpoint": "https://abc123.execute-api.us-east-1.amazonaws.com/stage",
    "api": {
      "proxyTarget": "https://abc123.execute-api.us-east-1.amazonaws.com/stage"
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

**Lambda Config** (`infra/.config/lambda/{env}-{org}.json`):

Updated fields:
```json
{
  "lambda": {
    "auth": {
      "cognito": {
        "userPoolId": "us-east-1_ABC123",
        "clientId": "abc123def456"
      }
    }
  }
}
```

**Note:** Most Lambda config comes from CloudFormation environment variables, so minimal updates needed.

### Deep Merge Strategy

The sync process uses deep merge to preserve your customizations:

**Before sync** (`stage-myorg.json`):
```json
{
  "webapp": {
    "apiEndpoint": "https://old-api.execute-api.us-east-1.amazonaws.com/stage",
    "branding": {
      "title": "SYNDI - My Organization",
      "logo": "/assets/myorg-logo.png"
    },
    "auth": {
      "cognito": {
        "userPoolId": "us-east-1_OLD123"
      }
    }
  }
}
```

**After sync:**
```json
{
  "webapp": {
    "apiEndpoint": "https://new-api.execute-api.us-east-1.amazonaws.com/stage",
    "branding": {
      "title": "SYNDI - My Organization",
      "logo": "/assets/myorg-logo.png"
    },
    "auth": {
      "cognito": {
        "userPoolId": "us-east-1_NEW456",
        "clientId": "new123client456"
      }
    },
    "api": {
      "proxyTarget": "https://new-api.execute-api.us-east-1.amazonaws.com/stage"
    }
  }
}
```

**Key points:**
- ✅ Infrastructure values updated (apiEndpoint, userPoolId, clientId)
- ✅ Custom fields preserved (branding)
- ✅ New fields added (api.proxyTarget if missing)

## Detailed Usage

### Basic Usage

```bash
# Sync configs for specific environment/org
make sync-configs ENV=stage ORG=myorg
```

### Direct Script Usage

```bash
# Run Python script directly
python3 infra/scripts/sync-configs-from-cloudformation.py \
  --env stage \
  --org myorg \
  --region us-east-1
```

### Multiple Organizations

Sync configs for multiple organizations:

```bash
# Sync org1
make sync-configs ENV=stage ORG=org1

# Sync org2
make sync-configs ENV=stage ORG=org2

# Sync org3
make sync-configs ENV=stage ORG=org3
```

Each org's config file is updated independently.

## Complete Workflow

### After First Deployment

```bash
# 1. Deploy infrastructure
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ORG=myorg ENV=stage make rs-deploy

# 2. Sync configs
make sync-configs ENV=stage ORG=myorg

# 3. Review changes
git diff infra/.config/webapp/stage-myorg.json

# 4. Commit configs (if using private repo)
cd infra/.config
git add webapp/stage-myorg.json lambda/stage-myorg.json
git commit -m "Update stage-myorg configs with deployed resource IDs"
git push
cd ../..

# 5. Test
make start-frontend ENV=stage ORG=myorg
```

### After Infrastructure Changes

```bash
# 1. Deploy infrastructure changes
ORG=myorg ENV=stage make rs-deploy

# 2. Sync updated values
make sync-configs ENV=stage ORG=myorg

# 3. Review what changed
git diff infra/.config/

# 4. Test with updated configs
make start-frontend ENV=stage ORG=myorg
```

### After Cognito Recreation

If you deleted and recreated Cognito User Pool:

```bash
# 1. Redeploy with new User Pool
ENABLE_AUTH=true CREATE_BUCKETS=false \
  ORG=myorg ENV=stage make rs-deploy

# 2. Sync new Cognito IDs
make sync-configs ENV=stage ORG=myorg

# 3. Verify new IDs
cat infra/.config/webapp/stage-myorg.json | jq '.webapp.auth.cognito'

# Output should show new User Pool and Client IDs
```

## Configuration File Creation

### Auto-Creation

If org-specific config doesn't exist, sync-configs creates it:

```bash
# First sync to new org
make sync-configs ENV=stage ORG=neworg
```

**Output:**
```
📝 Creating new org-specific config: infra/.config/webapp/stage-neworg.json
📝 Creating new org-specific lambda config: infra/.config/lambda/stage-neworg.json
```

**Created files contain:**
- CloudFormation outputs (API endpoint, Cognito IDs)
- Minimal structure
- Ready for customization

### Manual Pre-Creation (Optional)

You can create minimal configs before sync:

**Create** `infra/.config/webapp/stage-neworg.json`:
```json
{
  "webapp": {
    "branding": {
      "title": "SYNDI - New Organization",
      "org_name": "New Org Labs"
    }
  }
}
```

**Then run sync:**
```bash
make sync-configs ENV=stage ORG=neworg
```

**Result:** CloudFormation values merged with your custom branding.

## Troubleshooting

### "Stack does not exist"

**Symptom:**
```
❌ Stack 'rawscribe-stage-myorg' not found in region us-east-1
   Make sure you've deployed first: make rs-deploy ENV=... ORG=...
```

**Solution:**
```bash
# Deploy infrastructure first
ORG=myorg ENV=stage make rs-deploy

# Then sync
make sync-configs ENV=stage ORG=myorg
```

### No Outputs Found

**Symptom:** Sync completes but configs not updated

**Solution:**
```bash
# Check stack outputs
aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-myorg \
  --query 'Stacks[0].Outputs'

# Should show ApiEndpoint, CognitoUserPoolId, etc.
# If empty, stack deployment may have failed
```

### Configs Not Updated

**Symptom:** Config files unchanged after sync

**Solution:**
```bash
# Verify config directory exists
ls -la infra/.config/webapp/
ls -la infra/.config/lambda/

# Check file permissions
ls -la infra/.config/webapp/stage-myorg.json

# Run with verbose Python output
python3 -u infra/scripts/sync-configs-from-cloudformation.py \
  --env stage --org myorg --region us-east-1
```

### Wrong Region

**Symptom:** "Stack not found" in wrong region

**Solution:**
```bash
# Check configured region
aws configure get region

# Or specify region explicitly
python3 infra/scripts/sync-configs-from-cloudformation.py \
  --env stage --org myorg --region eu-west-1
```

## Manual Sync (Alternative)

If you prefer manual sync or sync-configs fails:

```bash
# Get stack outputs
STACK_NAME=rawscribe-stage-myorg

API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' \
  --output text)

# Update webapp config manually
jq --arg endpoint "$API_ENDPOINT" \
   --arg poolId "$POOL_ID" \
   --arg clientId "$CLIENT_ID" \
   '.webapp.apiEndpoint = $endpoint |
    .webapp.auth.cognito.userPoolId = $poolId |
    .webapp.auth.cognito.clientId = $clientId' \
   infra/.config/webapp/stage-myorg.json > tmp.json

mv tmp.json infra/.config/webapp/stage-myorg.json
```

## Best Practices

1. **Always sync after first deployment** - Ensures configs have correct values
2. **Sync after infrastructure changes** - Keeps configs in sync with AWS
3. **Review changes before committing** - Use `git diff` to verify updates
4. **Commit synced configs** - Track changes in private config repo
5. **Sync before local testing** - Ensures frontend knows correct API endpoint
6. **Don't manually edit synced values** - They'll be overwritten on next sync
7. **Add custom fields separately** - Sync preserves them

## Implementation Details

The sync-configs script (`infra/scripts/sync-configs-from-cloudformation.py`):

- Uses `boto3` to query CloudFormation
- Imports `deep_merge` from `config-merger.py`
- Reads existing org-specific configs
- Merges CloudFormation outputs
- Writes updated configs
- Preserves custom fields via deep merge

**Source code:** `infra/scripts/sync-configs-from-cloudformation.py`

## Related Documentation

- [Configuration System](../architecture/configuration-system.md) - How configs work
- [First Deployment](../quickstart/first-deployment.md) - Using sync in workflow
- [Makefile Deployment](../deployment/makefile-deployment.md) - Deployment commands
- [Config Repository](config-repository.md) - Managing config files
