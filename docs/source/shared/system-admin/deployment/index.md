<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Deployment Overview

Complete deployment documentation for SYNDI systems.

```{toctree}
:maxdepth: 2
:hidden:

makefile-deployment
manual-testing-guide
user-management-api
multi-organization
troubleshooting
```

## Deployment Guides

### Primary Method
**[Makefile Deployment](makefile-deployment.md)** - Complete Makefile-driven deployment guide

Key topics:
- Choosing the right deploy command
- Deployment parameters (ENABLE_AUTH, CREATE_BUCKETS)
- Complete workflows
- Troubleshooting

### Manual Testing
**[Manual Testing Guide](manual-testing-guide.md)** - Step-by-step testing procedures

Key topics:
- Fresh stack creation
- Function updates
- Stack re-deployment
- Complete teardown
- Test user management

### User Management
**[User Management API](user-management-api.md)** - REST API for user management

Key topics:
- Creating test users
- Listing users with credentials
- Removing test users
- Securing production deployments

### Multi-Organization
**[Multi-Organization Setup](multi-organization.md)** - Managing multiple organizations

Key topics:
- Deploying new organizations
- Resource isolation
- Configuration management
- Cost tracking

### Troubleshooting
**[Troubleshooting Guide](troubleshooting.md)** - Common issues and solutions

## Quick Commands

### Initial Deployment
```bash
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com ADMIN_PASSWORD=SecurePass! \
  ORG=myorg ENV=stage make rs-deploy
```

### Code Updates
```bash
make rs-deploy-function ENV=stage ORG=myorg
```

### Config Updates
```bash
make rs-deploy-only ENV=stage ORG=myorg
```

## Related Documentation

- [Configuration System](../architecture/configuration-system.md)
- [Testing Authentication](../authentication/testing-auth.md)
- [Local Development](../development/local-development.md)
