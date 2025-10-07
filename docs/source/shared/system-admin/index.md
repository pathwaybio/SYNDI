<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# System Administration Documentation

Welcome to the SYNDI system administration documentation. This guide serves system administrators, DevOps engineers, and developers responsible for deploying, configuring, and maintaining CLAIRE, PAUL, and SAM systems.

## 🎯 Quick Navigation by Role

### 👨‍💻 **For New Developers**
Start here if you're setting up a development environment for the first time:

1. **[Local Development Setup](development/local-setup.md)** - Set up your development environment
2. **[Local Development Workflow](development/local-development.md)** - Daily development tasks
3. **[Testing Guide](development/testing.md)** - How to test your changes

**Quick Command:**
```bash
# Set up and start local development
make setup-local ENV=dev ORG=myorg
make start-dev ENV=dev ORG=myorg
```

### 🚀 **For System Administrators**
Start here if you're deploying or managing production systems:

1. **[First Deployment Guide](quickstart/first-deployment.md)** - Deploy SYNDI for the first time
2. **[Configuration System](architecture/configuration-system.md)** - Understand how configuration works
3. **[User Management](authentication/user-management.md)** - Manage users and permissions
4. **[Monitoring & Troubleshooting](monitoring/index.md)** - Keep systems healthy

**Quick Command:**
```bash
# Deploy new organization to production
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com ADMIN_PASSWORD=SecurePass2025! \
  ORG=myorg ENV=prod make rs-deploy
```

### ⚙️ **For DevOps Engineers**
Start here if you're managing infrastructure and deployments:

1. **[Deployment Architecture](architecture/deployment-architecture.md)** - How deployment works
2. **[Makefile Deployment Guide](deployment/makefile-deployment.md)** - Primary deployment method
3. **[Multi-Organization Setup](deployment/multi-organization.md)** - Supporting multiple organizations
4. **[CloudWatch Monitoring](monitoring/index.md)** - Monitor production systems

**Quick Command:**
```bash
# Quick Lambda code update
ORG=myorg ENV=stage make rs-deploy-function

# Full stack deployment
ORG=myorg ENV=stage ENABLE_AUTH=true make rs-deploy
```

---

## 📚 Complete Documentation Index

```{toctree}
:maxdepth: 2
:caption: Getting Started

quickstart/index
```

```{toctree}
:maxdepth: 2
:caption: System Architecture

architecture/index
```

```{toctree}
:maxdepth: 2
:caption: Deployment

deployment/index
```

```{toctree}
:maxdepth: 2
:caption: Configuration

configuration/index
```

```{toctree}
:maxdepth: 2
:caption: Development

development/index
```

```{toctree}
:maxdepth: 2
:caption: Authentication & RBAC

authentication/index
```

```{toctree}
:maxdepth: 2
:caption: Monitoring & Maintenance

monitoring/index
```

```{toctree}
:maxdepth: 2
:caption: Reference

reference/index
```

---

## 🏗️ Infrastructure Overview

SYNDI supports multiple deployment architectures:

### Local Development
- **Backend**: FastAPI server with hot reload (`localhost:8000`)
- **Frontend**: Vite development server (`localhost:3000`)
- **Storage**: Local filesystem simulating S3 (`.local/s3/`)
- **Authentication**: Mock authentication for development
- **Command**: `make start-dev ENV=dev ORG=myorg`

### AWS Cloud (Production)
- **Backend**: Lambda function with API Gateway
- **Frontend**: S3 + CloudFront CDN
- **Storage**: S3 buckets with encryption and versioning
- **Authentication**: AWS Cognito with role-based access control
- **Command**: `ORG=myorg ENV=prod make rs-deploy`

### Multi-Organization Support
- **Isolation**: Separate Cognito User Pools per organization
- **Resources**: Separate Lambda functions and S3 buckets per organization
- **Data**: Complete data and user isolation between organizations
- **Scaling**: Independent scaling and monitoring per organization

---

## 🔧 Key Concepts

### Configuration Hierarchy
SYNDI uses a three-tier configuration system:

1. **CloudFormation Outputs** → Lambda environment variables (infrastructure values)
2. **Base JSON configs** → Application behavior settings
3. **Org-specific overrides** → Organization-specific customizations

**Read more**: [Configuration System Architecture](architecture/configuration-system.md)

### Deployment Parameters
All deployments use four key parameters:

- `ENV`: Environment (`dev`, `test`, `stage`, `prod`)
- `ORG`: Organization identifier (required, no default)
- `ENABLE_AUTH`: Enable Cognito authentication (`true`/`false`)
- `CREATE_BUCKETS`: Create S3 buckets (`true` for first deploy, `false` for updates)

**Read more**: [Makefile Deployment Guide](deployment/makefile-deployment.md)

### Resource Naming Convention
All AWS resources follow this pattern:

- **Lambda**: `rawscribe-{env}-{org}-backend`
- **API Gateway**: `rawscribe-{env}-{org}-api`
- **S3 Buckets**: `rawscribe-{service}-{env}-{org}-{accountid}`
- **Cognito**: `rawscribe-{env}-{org}-userpool`

**Read more**: [AWS Resources Reference](reference/index.md)

---

## 📋 Common Tasks Quick Reference

### Initial Setup
```bash
# First-time organization deployment
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com ADMIN_PASSWORD=SecurePass! \
  ORG=myorg ENV=stage make rs-deploy

# Sync configuration files
make sync-configs ENV=stage ORG=myorg
```

### Daily Development
```bash
# Start local development servers
make setup-local ENV=dev ORG=myorg
make start-dev ENV=dev ORG=myorg

# Run tests
make test-all ORG=myorg
```

### Deployment Updates
```bash
# Quick code-only update (30 seconds)
ORG=myorg ENV=stage make rs-deploy-function

# Configuration changes (2 minutes)
ORG=myorg ENV=stage make rs-deploy-only

# Full rebuild (5 minutes)
ORG=myorg ENV=stage make rs-deploy
```

### Monitoring
```bash
# Check deployment status
ORG=myorg ENV=stage make check-rs

# View Lambda logs
ORG=myorg ENV=stage make rs-watch-log

# Test authentication
ORG=myorg ENV=stage make test-jwt-aws
```

---

## ⚠️ Important Security Notes

1. **No Default Organization**: ORG parameter is required for all commands (prevents accidental deployments)
2. **Environment Isolation**: Each ENV/ORG combination is completely isolated
3. **Credentials**: Never hardcode credentials; use environment variables or AWS Secrets Manager
4. **Config Files**: `infra/.config/` directory is NOT in version control
5. **Production Deployments**: Always use `ENABLE_AUTH=true` for production

---

## 🆘 Getting Help

- **Deployment Issues**: See [Deployment Troubleshooting](deployment/troubleshooting.md)
- **Configuration Problems**: See [Configuration System](architecture/configuration-system.md)
- **Authentication Issues**: See [Testing Authentication](authentication/testing-auth.md)
- **General Troubleshooting**: See [Monitoring](monitoring/index.md)
