<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Development Guide

Complete development documentation for SYNDI.

```{toctree}
:maxdepth: 2
:hidden:

local-setup
local-development
testing
```

## Development Guides

### Local Setup
**TBD** - Setting up development environment

Topics to cover:
- Conda environment setup (syndi vs claire)
- Repository structure
- Prerequisites
- Initial configuration

### Local Development
**[Local Development Workflow](local-development.md)** - Complete workflow guide

Key topics:
- Development workflows (hot reload, production simulation, AWS testing)
- Clean vs incremental builds
- Build system behavior
- Common scenarios
- Troubleshooting

### Testing
**[Testing Guide](testing.md)** - Complete testing documentation

Key topics:
- Frontend testing (Vitest, Playwright)
- Backend testing (pytest)
- Integration testing
- JWT authentication testing
- CI/CD testing
- Test data management

## Quick Commands

### Start Development
```bash
make setup-local ENV=dev ORG=myorg
make start-dev ENV=dev ORG=myorg
```

### Testing
```bash
make test-all
make test-frontend
make test-backend
make test-e2e
```

### Clean Builds
```bash
make clean-frontend
make clean-backend
make build-frontend ENV=dev ORG=myorg
make build-backend ENV=dev ORG=myorg
```

## Related Documentation

- [Configuration System](../architecture/configuration-system.md)
- [Deployment Guide](../deployment/makefile-deployment.md)
- [Testing Authentication](../authentication/testing-auth.md)
