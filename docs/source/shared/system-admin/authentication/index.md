<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Authentication & Access Control

Complete authentication and authorization documentation.

```{toctree}
:maxdepth: 2
:hidden:

rbac
testing-auth
user-management
permissions
```

## Authentication Architecture

For technical implementation details:
- **[Authentication Architecture](../architecture/authentication-architecture.md)** - High-level authentication flow and JWT tokens
- **[Authentication Provider Pattern](../architecture/auth-provider-architecture.md)** - Provider abstraction and environment variable precedence

## Authentication Guides

### RBAC System
**[Role-Based Access Control](rbac.md)** - Complete RBAC guide

Key topics:
- Core roles (ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS)
- Permission schema
- User configuration
- Cognito implementation
- Best practices

### Testing Authentication
**[Testing Authentication](testing-auth.md)** - Comprehensive auth testing

Key topics:
- Local testing (fast iteration)
- AWS testing (deployed environments)
- Testing protected endpoints
- RBAC testing
- How JWT validation works
- Automated testing scripts

### User Management
**[User Management](user-management.md)** - Creating and managing users

Topics to cover:
- Creating users via Cognito
- Assigning groups
- Managing passwords
- User lifecycle

### Permissions
**[Permissions System](permissions.md)** - Permission details

## Quick Commands

### Test Authentication
```bash
# Local testing
make test-jwt-local ENV=stage ORG=myorg

# AWS testing
make test-jwt-aws ENV=stage ORG=myorg

# Full regression
make test-jwt-regression
```

### Get JWT Token
```bash
TOKEN=$(make get-rs-token ENV=stage ORG=myorg \
  USER_NAME=admin@myorg.com PASSWORD=YourPassword)
```

### Create User
```bash
# Via AWS CLI
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_ABC123 \
  --username user@myorg.com \
  --user-attributes Name=email,Value=user@myorg.com
```

## User Groups

| Group | Permissions | Use Cases |
|-------|------------|-----------|
| **ADMINS** | All (`*`) | System administration |
| **LAB_MANAGERS** | Submit, view, approve | Lab oversight |
| **RESEARCHERS** | Submit, view own/group, drafts | Laboratory work |
| **CLINICIANS** | Submit, view own | Clinical data entry |

## Related Documentation

- [Configuration System](../architecture/configuration-system.md)
- [Multi-Organization Setup](../deployment/multi-organization.md)
- [Testing Guide](../development/testing.md)
