<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Configuration Management

Complete configuration management documentation.

```{toctree}
:maxdepth: 2
:hidden:

config-repository
config-examples
sync-configs
```

## Configuration Guides

### Configuration Architecture
**[Configuration System](../architecture/configuration-system.md)** - How the config system works

Key topics:
- Three-tier configuration
- Base + org-specific merging
- CloudFormation sync
- Configuration precedence

### Config Repository Management
**[Config Repository](config-repository.md)** - Managing infra/.config/

Key topics:
- Private git repository setup
- Configuration tracking
- Team onboarding
- Security practices
- Backup and recovery

### Sync Configs
**TBD** - Using sync-configs command

### Config Files
**TBD** - Config file structure reference

### Config Examples
**TBD** - Working configuration examples

## Quick Commands

### Deploy Configuration
```bash
make config ENV=stage ORG=myorg
```

### Sync from CloudFormation
```bash
make sync-configs ENV=stage ORG=myorg
```

### Verify Configuration
```bash
cat backend/rawscribe/.config/config.json | jq .
cat frontend/public/config.json | jq .
```

## Related Documentation

- [Deployment Guide](../deployment/makefile-deployment.md)
- [Multi-Organization Setup](../deployment/multi-organization.md)
- [Local Development](../development/local-development.md)
