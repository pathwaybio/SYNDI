<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Deployment Architecture

This guide explains how SYNDI deployment works, including the SAM (Serverless Application Model) deployment process, CloudFormation stack management, and build isolation.

## Overview

SYNDI uses a **Makefile-driven SAM deployment** approach that provides:

- **Automated infrastructure provisioning** via CloudFormation
- **Build isolation** per environment and organization
- **Dependency layer caching** for faster builds
- **Automatic rollback** on deployment failures
- **Zero manual configuration** - Everything computed from ENV/ORG parameters

## Deployment Flow

### High-Level Process

```
1. Developer runs: make rs-deploy ENV=stage ORG=myorg
   ↓
2. Makefile computes deployment parameters
   ↓
3. SAM builds Lambda function + dependency layer
   ↓
4. Artifacts uploaded to S3 deployment bucket
   ↓
5. CloudFormation creates/updates stack
   ↓
6. AWS resources created (Lambda, API Gateway, Cognito, S3, CloudFront)
   ↓
7. Configuration synced from CloudFormation outputs
   ↓
8. Deployment verified and tested
```

### Detailed Deployment Steps

**Step 1: Parameter Computation (Makefile)**
```makefile
# From ENV and ORG, compute:
STACK_NAME = rawscribe-$(ENV)-$(ORG)
ACCOUNT_NUMBER = $(shell aws sts get-caller-identity --query Account --output text)
AWS_REGION = $(shell aws configure get region)
BUILD_DIR = .aws-sam-$(ENV)-$(ORG)
```

**Step 2: SAM Build**
```bash
sam build --cached --parallel \
  --config-env $(ENV)-$(ORG) \
  --build-dir .aws-sam-$(ENV)-$(ORG) \
  --cache-dir .aws-sam-$(ENV)-$(ORG)/cache
```

Builds:
- `RawscribeLambda` - Application code from `backend/`
- `DependencyLayer` - Python packages from `backend/layers/dependencies/`

**Step 3: Config Upload**
```bash
# Upload merged config to Lambda S3 bucket
aws s3 cp infra/.config/lambda/$(ENV)-$(ORG).json \
  s3://rawscribe-lambda-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)/config.json
```

**Step 4: SAM Deploy**
```bash
sam deploy --no-confirm-changeset \
  --stack-name rawscribe-$(ENV)-$(ORG) \
  --template-file .aws-sam-$(ENV)-$(ORG)/template.yaml \
  --s3-bucket rawscribe-sam-deployments-$(ACCOUNT_NUMBER) \
  --s3-prefix rawscribe-$(ENV)-$(ORG) \
  --parameter-overrides \
    Environment=$(ENV) \
    Organization=$(ORG) \
    EnableAuth=$(ENABLE_AUTH) \
    CreateBuckets=$(CREATE_BUCKETS) \
  --capabilities CAPABILITY_NAMED_IAM
```

**Step 5: CloudFormation Processing**

CloudFormation creates/updates resources defined in `template.yaml`:
1. Validates template
2. Creates change set
3. Executes changes (create/update/delete resources)
4. Outputs resource IDs
5. Updates stack status

**Step 6: Post-Deployment**
- Admin user creation (if ADMIN_USERNAME provided)
- Authentication testing
- API endpoint testing
- Display deployment summary

## SAM Template Structure

### Template Organization

`template.yaml` defines all infrastructure:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    MemorySize: 512
    Runtime: python3.9

Parameters:
  Environment, Organization, EnableAuth, CreateBuckets, etc.

Conditions:
  CreateAuth, CreateUserPool, UseExistingUserPool, IsProd

Resources:
  # IAM Roles
  LambdaExecutionRole
  
  # Lambda Resources
  DependencyLayer
  RawscribeLambda
  
  # API Gateway
  ApiGateway
  
  # Cognito (conditional)
  CognitoUserPool
  CognitoUserPoolClient
  CognitoAdminGroup
  CognitoLabManagerGroup
  CognitoResearcherGroup
  CognitoClinicianGroup
  
  # S3 (conditional)
  FrontendBucket
  FrontendBucketPolicy
  
  # CloudFront
  CloudFrontOriginAccessControl
  CloudFrontDistribution

Outputs:
  ApiEndpoint, CognitoUserPoolId, CognitoClientId, etc.
```

### Conditional Resource Creation

Resources are conditionally created based on parameters:

```yaml
Conditions:
  CreateAuth: !Equals [!Ref EnableAuth, 'true']
  CreateUserPool: !And
    - !Condition CreateAuth
    - !Equals [!Ref CognitoUserPoolId, '']
  UseExistingUserPool: !And
    - !Condition CreateAuth
    - !Not [!Equals [!Ref CognitoUserPoolId, '']]
```

**Examples:**
- `ENABLE_AUTH=true` → Creates Cognito resources
- `ENABLE_AUTH=false` → Skips Cognito creation
- `CREATE_BUCKETS=true` → Creates S3 buckets
- `CREATE_BUCKETS=false` → References existing buckets

## Build Directory Isolation

Each ENV/ORG combination has isolated build artifacts:

```
.aws-sam-stage-myorg/           # Stage environment, myorg organization
├── build.toml                  # SAM build metadata
├── cache/                      # Build cache (speeds up rebuilds)
│   └── hash files
├── DependencyLayer/            # Python dependencies layer
│   └── python/
│       ├── fastapi/
│       ├── boto3/
│       ├── pydantic/
│       └── ... (all requirements.txt packages)
├── RawscribeLambda/           # Application code
│   ├── rawscribe/
│   │   ├── main.py
│   │   ├── routes/
│   │   └── utils/
│   └── (dependencies from layer not included here)
└── template.yaml              # Processed CloudFormation template
```

**Isolation benefits:**
- Different orgs can build/deploy simultaneously
- No cross-contamination between builds
- Each org can use different dependency versions
- Parallel CI/CD pipelines possible

### Build Cache

SAM caches dependency layer builds:

```
.aws-sam-stage-myorg/cache/
└── hash-of-requirements.txt/   # Cache key from requirements.txt hash
    └── DependencyLayer/        # Cached layer
```

**When cache is used:**
- `requirements.txt` unchanged
- Using `--cached` flag (automatic in Makefile)
- Same ENV/ORG combination

**When cache is invalidated:**
- `requirements.txt` modified
- Build directory deleted
- Cache directory cleared

## Deployment Commands Explained

### rs-deploy (Full Build and Deploy)

**Command:**
```bash
make rs-deploy ENV=stage ORG=myorg
```

**Process:**
1. Calls `rs-build` target
2. SAM builds Lambda + layer (uses cache if possible)
3. Calls `rs-deploy-only` target
4. Handles ROLLBACK_COMPLETE state
5. Uploads config to S3
6. SAM deploys via CloudFormation
7. Creates admin user if credentials provided
8. Tests deployment

**Build artifacts created:**
```
.aws-sam-stage-myorg/
├── DependencyLayer/       # Built from backend/layers/dependencies/
├── RawscribeLambda/       # Built from backend/
└── template.yaml          # Processed template
```

**Time:** 5-7 minutes (or 30 seconds if layer cached)

### rs-deploy-only (Deploy Without Build)

**Command:**
```bash
make rs-deploy-only ENV=stage ORG=myorg
```

**Process:**
1. Uses existing `.aws-sam-stage-myorg/` build
2. Checks for ROLLBACK_COMPLETE state
3. Deletes failed stack if needed
4. Uploads config to S3
5. SAM deploys using existing build
6. Creates admin user if credentials provided

**Time:** 1-2 minutes

**Requirement:** Must have existing build directory from previous `rs-deploy`

### rs-deploy-function (Quick Lambda Update)

**Command:**
```bash
make rs-deploy-function ENV=stage ORG=myorg
```

**Process:**
1. Creates minimal zip of Python code only
2. No dependencies included (uses existing layer)
3. Directly updates Lambda via AWS API
4. Bypasses CloudFormation completely
5. Uploads via S3 if package > 69MB

**Build artifacts:**
```
backend/.build/lambda/
├── package/                  # Temporary build
│   └── rawscribe/           # Code only, no dependencies
└── function-minimal.zip     # ~2MB (code only)
```

**Time:** 30 seconds

**Limitations:** 
- Can't update environment variables
- Can't update infrastructure
- Can't update dependencies

## CloudFormation Stack Management

### Stack Lifecycle

```
NO_STACK
  ↓ (first deployment)
CREATE_IN_PROGRESS
  ↓ (success)
CREATE_COMPLETE
  ↓ (update deployment)
UPDATE_IN_PROGRESS
  ↓ (success)
UPDATE_COMPLETE
  ↓ (failed update)
UPDATE_ROLLBACK_IN_PROGRESS
  ↓
ROLLBACK_COMPLETE (requires deletion before redeployment)
```

### Automatic ROLLBACK_COMPLETE Handling

The Makefile automatically handles failed deployments:

```bash
# Check if stack in ROLLBACK_COMPLETE
STACK_STATUS=$(aws cloudformation describe-stacks ...)

if [ "$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
  # Delete failed stack
  aws cloudformation delete-stack --stack-name $(STACK_NAME)
  
  # Wait for deletion
  aws cloudformation wait stack-delete-complete --stack-name $(STACK_NAME)
  
  # Proceed with fresh deployment
fi
```

### Stack Outputs

CloudFormation provides outputs that become configuration values:

```yaml
Outputs:
  ApiEndpoint:
    Value: !Sub 'https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/${Environment}'
    
  CognitoUserPoolId:
    Value: !If [CreateUserPool, !Ref CognitoUserPool, !Ref CognitoUserPoolId]
    
  CognitoClientId:
    Value: !If [CreateUserPool, !Ref CognitoUserPoolClient, !Ref CognitoClientId]
```

These outputs are:
1. Retrieved by `sync-configs`
2. Merged into org-specific config files
3. Used by frontend and backend at runtime

## Dependency Layer Architecture

### Layer Build Process

**Source:** `backend/layers/dependencies/requirements.txt`

**Build:**
```bash
# SAM builds layer using BuildMethod: python3.9
# Equivalent to:
pip install -r requirements.txt -t python/
zip -r layer.zip python/
```

**Result:** Lambda layer with all Python packages

### Layer Usage

Lambda function references layer:

```yaml
RawscribeLambda:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref DependencyLayer
```

**At runtime:**
- Layer mounted at `/opt/python/`
- Python automatically searches `/opt/python/` for imports
- Application code can import all layer packages

### Layer Caching Strategy

**Cache key:** Hash of `requirements.txt`

**Cache reuse:**
- `make rs-deploy` with unchanged requirements.txt → Reuses cached layer (30 sec build)
- `make rs-deploy` with changed requirements.txt → Rebuilds layer (5 min build)

**Force layer rebuild:**
```bash
rm -rf .aws-sam-stage-myorg/cache/
make rs-deploy ENV=stage ORG=myorg
```

## Environment Variables

### Lambda Environment Variables

Set by CloudFormation from template.yaml:

```yaml
Environment:
  Variables:
    ENV: !Ref Environment                    # stage
    ORG: !Ref Organization                   # myorg
    CONFIG_S3_BUCKET: !Sub 'rawscribe-lambda-${Environment}-${Organization}-${AWS::AccountId}'
    CONFIG_S3_KEY: config.json
    COGNITO_REGION: !Ref AWS::Region
    COGNITO_USER_POOL_ID: !If [CreateUserPool, !Ref CognitoUserPool, ...]
    COGNITO_CLIENT_ID: !If [CreateUserPool, !Ref CognitoUserPoolClient, ...]
    FORMS_BUCKET: !Sub 'rawscribe-forms-${Environment}-${Organization}-${AWS::AccountId}'
    ELN_BUCKET: !Sub 'rawscribe-eln-${Environment}-${Organization}-${AWS::AccountId}'
    DRAFTS_BUCKET: !Sub 'rawscribe-eln-drafts-${Environment}-${Organization}-${AWS::AccountId}'
```

**Benefits:**
- Infrastructure values automatically set
- No hardcoded resource IDs
- Updates automatically on redeployment
- Different values per environment/org

### Configuration Precedence

Lambda loads configuration in this order:

1. **Environment variables** (from CloudFormation) - Highest priority
2. **Config file from S3** (`CONFIG_S3_BUCKET/CONFIG_S3_KEY`)
3. **Bundled config** (if S3 load fails)
4. **Application defaults** - Lowest priority

## Resource Naming

All resources follow consistent naming patterns:

### CloudFormation Stack
```
Pattern: rawscribe-{env}-{org}
Example: rawscribe-stage-myorg
```

### Lambda Function
```
Pattern: rawscribe-{env}-{org}-backend
Example: rawscribe-stage-myorg-backend

Configured in template.yaml:
  FunctionName: !Sub 'rawscribe-${Environment}-${Organization}-backend'
```

### Lambda Layer
```
Pattern: rawscribe-deps-{env}-{org}
Example: rawscribe-deps-stage-myorg

Configured in template.yaml:
  LayerName: !Sub 'rawscribe-deps-${Environment}-${Organization}'
```

### API Gateway
```
Pattern: rawscribe-{env}-{org}-api
Example: rawscribe-stage-myorg-api

Configured in template.yaml:
  Name: !Sub 'rawscribe-${Environment}-${Organization}-api'
  StageName: !Ref Environment
```

### Cognito User Pool
```
Pattern: rawscribe-{env}-{org}-userpool
Example: rawscribe-stage-myorg-userpool

Configured in template.yaml:
  UserPoolName: !Sub 'rawscribe-${Environment}-${Organization}-userpool'
```

### S3 Buckets
```
Pattern: rawscribe-{service}-{env}-{org}-{accountid}
Examples:
  rawscribe-lambda-stage-myorg-288761742376
  rawscribe-forms-stage-myorg-288761742376
  rawscribe-eln-stage-myorg-288761742376
  rawscribe-eln-drafts-stage-myorg-288761742376
  syndi-frontend-stage-myorg-288761742376

Configured in template.yaml:
  BucketName: !Sub 'rawscribe-forms-${Environment}-${Organization}-${AWS::AccountId}'
```

### IAM Roles
```
Pattern: rawscribe-{env}-{org}-lambda-role
Example: rawscribe-stage-myorg-lambda-role

Configured in template.yaml:
  RoleName: !Sub 'rawscribe-${Environment}-${Organization}-lambda-role'
```

## Build Artifacts

### SAM Build Directory

```
.aws-sam-{ENV}-{ORG}/
├── build.toml                 # Build metadata
├── cache/                     # Dependency layer cache
│   └── {hash}/
│       └── DependencyLayer/
├── DependencyLayer/           # Built layer (ready for upload)
│   └── python/
│       └── {all packages}/
├── RawscribeLambda/          # Built Lambda (ready for upload)
│   └── rawscribe/
│       ├── main.py
│       ├── routes/
│       ├── utils/
│       └── .config/          # Bundled config
└── template.yaml             # Processed template with substitutions
```

### Lambda Package Contents

**Full package** (from `rs-deploy`):
- Application code (`rawscribe/`)
- Configuration (`.config/config.json`)
- No dependencies (in separate layer)

**Minimal package** (from `rs-deploy-function`):
- Application code only
- No configuration
- No dependencies
- Much smaller (~2MB vs ~10MB)

## Multi-Organization Isolation

### Build Isolation

Each organization gets separate build directory:

```
.aws-sam-stage-org1/       # Organization 1 build
.aws-sam-stage-org2/       # Organization 2 build
.aws-sam-stage-org3/       # Organization 3 build
```

**Benefits:**
- Parallel builds possible
- No version conflicts
- Independent deployment schedules
- Isolated dependency versions

### Runtime Isolation

Each organization gets separate resources:

```
Organization 1:
├── Lambda: rawscribe-stage-org1-backend
├── API: rawscribe-stage-org1-api
├── Cognito: rawscribe-stage-org1-userpool
└── S3: rawscribe-*-stage-org1-{accountid}

Organization 2:
├── Lambda: rawscribe-stage-org2-backend
├── API: rawscribe-stage-org2-api
├── Cognito: rawscribe-stage-org2-userpool
└── S3: rawscribe-*-stage-org2-{accountid}
```

**Isolation guarantees:**
- User from org1 cannot authenticate to org2
- Lambda from org1 cannot access org2's S3 buckets
- API endpoints completely separate
- Zero data leakage between organizations

## Deployment Parameters

### Required Parameters

**ENV** - Environment name
- Values: `dev`, `test`, `stage`, `prod`
- Usage: Resource naming, configuration selection
- Example: `ENV=stage`

**ORG** - Organization identifier
- Values: Any lowercase alphanumeric string
- Usage: Resource naming, multi-org isolation
- Example: `ORG=myorg`
- **No default** - Must be explicitly provided for security

### Optional Parameters

**ENABLE_AUTH** - Enable Cognito authentication
- Values: `true`, `false`
- Default: `true`
- Effect: Creates/uses Cognito User Pool

**CREATE_BUCKETS** - Create S3 buckets
- Values: `true`, `false`
- Default: `false`
- Effect: Creates S3 buckets (use `true` for first deployment)

**ADMIN_USERNAME** - Create admin user
- Values: Email address
- Default: None
- Effect: Creates and configures admin user during deployment

**ADMIN_PASSWORD** - Admin user password
- Values: String meeting Cognito password policy
- Default: None
- Effect: Sets permanent password for admin user

## Deployment Strategies

### Blue-Green Deployment

Deploy to new organization, test, then switch:

```bash
# Deploy to "blue" org
ORG=myorg-blue ENV=prod make rs-deploy

# Test thoroughly
make test-jwt-aws ENV=prod ORG=myorg-blue

# If good, switch DNS/routing to blue
# Keep green as fallback
```

### Canary Deployment

Deploy to subset of users first:

```bash
# Deploy to canary org
ORG=myorg-canary ENV=prod make rs-deploy

# Route 10% of traffic to canary
# Monitor metrics

# If stable, deploy to main
ORG=myorg ENV=prod make rs-deploy
```

### Rolling Updates

Update organizations one at a time:

```bash
# Update org1
ORG=org1 ENV=prod make rs-deploy-function

# Test
make test-jwt-aws ENV=prod ORG=org1

# If successful, update org2
ORG=org2 ENV=prod make rs-deploy-function

# Repeat for all orgs
```

## Shared Resources

### SAM Deployment Bucket

One shared S3 bucket for all SAM deployments:

```
rawscribe-sam-deployments-{accountid}
```

**Purpose:** Stores CloudFormation templates and deployment artifacts

**Organization:**
```
rawscribe-sam-deployments-288761742376/
├── rawscribe-stage-org1/        # Org1 artifacts
│   ├── template.yaml
│   └── deployment-artifacts/
├── rawscribe-stage-org2/        # Org2 artifacts
│   ├── template.yaml
│   └── deployment-artifacts/
└── rawscribe-prod-org1/         # Prod artifacts
    ├── template.yaml
    └── deployment-artifacts/
```

**Isolation:** Each org uses unique S3 prefix within shared bucket

## Troubleshooting Deployment

### Build Failures

See [Deployment Troubleshooting](../deployment/troubleshooting.md#build-failures)

### Stack Failures

See [Deployment Troubleshooting](../deployment/troubleshooting.md#deployment-failures)

### Resource Conflicts

See [Deployment Troubleshooting](../deployment/troubleshooting.md#resource-cleanup)

## Performance Optimization

### Speed Up Deployments

1. **Use appropriate command:**
   - Code only: `rs-deploy-function` (30 sec)
   - Config only: `rs-deploy-only` (1-2 min)
   - Full: `rs-deploy` (5-7 min, or 30 sec with cache)

2. **Keep requirements.txt stable:**
   - Pin versions to avoid unexpected updates
   - Layer rebuild adds 4-5 minutes

3. **Use build cache:**
   - Don't delete `.aws-sam-*` unnecessarily
   - Cache saves 4-5 minutes on layer builds

4. **Parallel deployments:**
   - Deploy multiple orgs simultaneously
   - Each uses isolated build directory

### Monitor Performance

```bash
# Check Lambda cold start time
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=rawscribe-stage-myorg-backend \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region us-east-1
```

## Related Documentation

- [Makefile Deployment](../deployment/makefile-deployment.md) - Deployment commands
- [Configuration System](configuration-system.md) - How configuration works
- [Multi-Organization Setup](../deployment/multi-organization.md) - Multi-org deployment
- [Deployment Troubleshooting](../deployment/troubleshooting.md) - Common issues
