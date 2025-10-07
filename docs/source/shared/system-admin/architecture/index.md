<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# System Architecture

Understanding how SYNDI systems work together.

```{toctree}
:maxdepth: 2
:hidden:

configuration-system
deployment-architecture
authentication-architecture
auth-provider-architecture
```

## Architecture Overview

SYNDI consists of:
- **CLAIRE** - Frontend web application (React + TypeScript)
- **Rawscribe** - Backend Lambda API (Python + FastAPI)
- **SAM** - SOP Automation Models (YAML schemas)

## Configuration Architecture

**[Configuration System](configuration-system.md)** - Complete guide

Key concepts:
- Three-tier configuration (CloudFormation → JSON → Runtime)
- Base configs + org-specific overrides
- Deep merge strategy
- CloudFormation output sync

## Deployment Architecture

**[Deployment Architecture](deployment-architecture.md)** - How deployment works

Key topics:
- SAM (Serverless Application Model) deployment
- CloudFormation stack management
- Build directory isolation
- Dependency layer caching

## Authentication Architecture

**[Authentication Architecture](authentication-architecture.md)** - High-level authentication overview

**[Authentication Provider Pattern](auth-provider-architecture.md)** - Technical implementation details

Key topics:
- AWS Cognito integration
- JWT token flow
- RBAC implementation
- Multi-organization isolation
- Pluggable authentication providers
- Configuration priority (environment variables vs config files)

## Related Documentation

- [Deployment Guide](../deployment/makefile-deployment.md)
- [Multi-Organization Setup](../deployment/multi-organization.md)
- [RBAC System](../authentication/rbac.md)
