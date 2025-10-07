<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Quick Start Guide

Get up and running with SYNDI quickly.

```{toctree}
:maxdepth: 2
:hidden:

first-deployment
daily-workflow
```

## First-Time Setup

**For New Developers:**
1. [Local Setup Guide](../development/local-setup.md) - TBD
2. [Local Development Workflow](../development/local-development.md)
3. [Testing Guide](../development/testing.md)

**For System Administrators:**
1. **First Deployment Guide** - TBD
2. [Multi-Organization Setup](../deployment/multi-organization.md)
3. [User Management](../authentication/user-management.md) - TBD

## Common Commands

### Development
```bash
make start-dev ENV=dev ORG=myorg
make test-all
```

### Deployment
```bash
# Initial deployment
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com ADMIN_PASSWORD=SecurePass! \
  ORG=myorg ENV=stage make rs-deploy

# Quick code update
make rs-deploy-function ENV=stage ORG=myorg
```

### Monitoring
```bash
make check-rs ENV=stage ORG=myorg
make rs-watch-log ENV=stage ORG=myorg
```

## Daily Workflow Reference

**TBD** - Common daily tasks and commands

## Related Documentation

- [Deployment Guide](../deployment/makefile-deployment.md)
- [Configuration System](../architecture/configuration-system.md)
- [Testing Guide](../development/testing.md)
