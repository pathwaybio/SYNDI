<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Role-Based Access Control (RBAC)

CLAIRE implements a minimal role-based access control system with three core roles designed for laboratory environments.

## Overview

The RBAC system uses a permission-based model with wildcard support, allowing fine-grained access control without role proliferation. All authentication is handled by the backend with frontend UX enforcement.

## Core Roles

### Admin
- **Purpose**: System administration and user management  
- **Groups**: `['admin']`
- **Permissions**: `['*']` (all permissions)
- **Use Cases**: System setup, user management, troubleshooting, configuration changes

### Researcher  
- **Purpose**: Primary ELN users who create and submit laboratory data
- **Groups**: `['researcher']`
- **Permissions**: `['submit:SOP*', 'view:own', 'view:group', 'draft:*']`
- **Use Cases**: Fill out SOPs, save drafts, submit ELNs, view own/team data, upload files

### Viewer
- **Purpose**: Read-only access for supervisors, auditors, and quality assurance
- **Groups**: `['viewer']`  
- **Permissions**: `['view:own', 'view:group']`
- **Use Cases**: Review submitted ELNs, audit compliance, quality control

## Permission Schema

Permissions follow the format: `{action}:{resource}`

### Core Permissions
- `submit:SOP*` - Submit any SOP-based ELN
- `view:own` - View own submissions  
- `view:group` - View team/group submissions
- `draft:*` - Create/edit/delete drafts
- `file:upload` - Upload file attachments
- `export:*` - Export ELN data
- `*` - Admin wildcard (all permissions)

### Wildcard Support
- `*` - Grants all permissions (admin only)
- `submit:*` - Submit any type of data
- `view:*` - View any data
- `draft:*` - Full draft management

## Configuration

### Adding Users

Edit the appropriate config file in `infra/.config/{service}/{env}.json`:

```json
{
  "auth": {
    "users": [
      {
        "id": "researcher1",
        "username": "researcher1", 
        "email": "researcher1@lab.com",
        "name": "Jane Researcher",
        "groups": ["researcher"],
        "permissions": ["submit:SOP*", "view:own", "view:group", "draft:*"],
        "isAdmin": false
      }
    ]
  }
}
```

### Required Fields
- `id` - Unique user identifier
- `username` - Login username (no hyphens allowed)
- `email` - User email address
- `groups` - Array of group memberships
- `permissions` - Array of permission strings
- `isAdmin` - Boolean admin flag

### Deploy Configuration
After editing configs, deploy with:
```bash
make setup-local    # For development
make config ENV=dev # For specific environment
```

## Best Practices

### Role Assignment Guidelines

**Assign Admin role when:**
- User needs system configuration access
- User manages other users
- User troubleshoots system issues
- User needs unrestricted data access

**Assign Researcher role when:**
- User actively conducts laboratory work
- User needs to submit ELN data
- User works in collaborative teams
- User uploads experimental files

**Assign Viewer role when:**
- User only reviews/audits data
- User supervises but doesn't conduct experiments
- User needs read-only access for compliance
- User is external collaborator with limited access

### Security Considerations

1. **Principle of Least Privilege**: Start with Viewer role, escalate as needed
2. **Regular Audits**: Review user permissions quarterly
3. **Username Restrictions**: No hyphens in usernames (filename conflicts)
4. **Group-Based Organization**: Use groups to organize teams/departments
5. **Permission Granularity**: Use specific permissions over wildcards when possible

### Common Permission Patterns

```json
// Research Team Lead
"permissions": ["submit:SOP*", "view:group", "draft:*", "export:group"]

// Quality Assurance
"permissions": ["view:*", "export:*"]

// External Collaborator  
"permissions": ["view:own"]

// Service Account
"permissions": ["submit:*", "view:*"]
```

## Troubleshooting

### User Cannot Login
1. Verify username exists in config
2. Check username format (no hyphens)
3. Confirm auth provider configuration
4. Review authentication logs

### Access Denied Errors
1. Check user permissions array
2. Verify permission format (`action:resource`)
3. Confirm group membership
4. Test with admin user

### Permission Not Working
1. Validate permission string syntax
2. Check wildcard patterns
3. Review backend logs for auth errors
4. Verify config deployment

## AWS Cognito Implementation

For production deployments, implement RBAC using AWS Cognito User Pools with groups and custom attributes.

### Cognito Setup

#### 1. User Pool Configuration
```json
{
  "UserPoolName": "claire-users",
  "Policies": {
    "PasswordPolicy": {
      "MinimumLength": 12,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": true
    }
  },
  "Schema": [
    {
      "Name": "email",
      "AttributeDataType": "String",
      "Required": true,
      "Mutable": false
    },
    {
      "Name": "custom:permissions",
      "AttributeDataType": "String",
      "Mutable": true
    }
  ]
}
```

#### 2. Cognito Groups
Create groups matching RBAC roles:
```bash
aws cognito-idp create-group \
  --group-name "admin" \
  --user-pool-id us-east-1_XXXXXXXXX \
  --description "System administrators"

aws cognito-idp create-group \
  --group-name "researcher" \
  --user-pool-id us-east-1_XXXXXXXXX \
  --description "Laboratory researchers"

aws cognito-idp create-group \
  --group-name "viewer" \
  --user-pool-id us-east-1_XXXXXXXXX \
  --description "Read-only users"
```

#### 3. User Creation
```bash
# Create researcher user
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username researcher1 \
  --user-attributes Name=email,Value=researcher1@lab.com \
                    Name=custom:permissions,Value="submit:SOP*,view:own,view:group,draft:*" \
  --message-action SUPPRESS

# Add to group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username researcher1 \
  --group-name researcher
```

### Backend Configuration

Update `infra/.config/lambda/prod.json`:
```json
{
  "auth": {
    "provider": "cognito",
    "required": true,
    "cognito": {
      "region": "us-east-1",
      "userPoolId": "us-east-1_XXXXXXXXX",
      "clientId": "XXXXXXXXXXXXXXXXXXXXXXXXXX"
    }
  }
}
```

### Frontend Configuration

Update `infra/.config/webapp/prod.json`:
```json
{
  "auth": {
    "provider": "cognito",
    "required": true,
    "cognito": {
      "region": "us-east-1",
      "userPoolId": "us-east-1_XXXXXXXXX",
      "clientId": "XXXXXXXXXXXXXXXXXXXXXXXXXX"
    }
  }
}
```

### Permission Mapping

The existing `_map_cognito_permissions()` method in `backend/rawscribe/utils/auth.py:287-300` handles group-to-permission mapping:

```python
def _map_cognito_permissions(self, groups: List[str]) -> List[str]:
    permission_mapping = {
        'admin': ['*'],
        'researcher': ['submit:SOP*', 'view:own', 'view:group', 'draft:*'],
        'viewer': ['view:own', 'view:group']
    }
    
    permissions = []
    for group in groups:
        permissions.extend(permission_mapping.get(group, ['view:own']))
    
    return list(set(permissions))
```

### Advantages of Cognito RBAC

1. **Centralized User Management**: Single identity provider for all AWS services
2. **Multi-Factor Authentication**: Built-in MFA support
3. **Federated Identity**: Integration with corporate identity providers
4. **Audit Trails**: CloudTrail logging for all authentication events
5. **Scalability**: Handles thousands of users without infrastructure management
6. **Compliance**: SOC, PCI DSS, and HIPAA eligible

### Migration Strategy

1. **Export Existing Users**: Extract from current config files
2. **Create Cognito Users**: Bulk import using AWS CLI or Console
3. **Assign Groups**: Map current roles to Cognito groups
4. **Update Configuration**: Switch auth provider to 'cognito'
5. **Test Authentication**: Verify login and permissions
6. **Deploy**: Update Lambda and webapp configs

### Best Practices for Cognito

- **Use Groups**: Assign permissions via group membership, not individual attributes
- **Custom Attributes**: Store additional permissions in `custom:permissions` for fine-grained control
- **Token Validation**: Leverage existing JWT validation in `auth.py`
- **Session Management**: Configure appropriate token expiration times
- **Backup Strategy**: Regular exports of user data for disaster recovery

## Implementation Details

The RBAC system is implemented across:
- **Backend**: `backend/rawscribe/utils/auth.py` - Permission validation
- **Frontend**: `frontend/src/shared/lib/auth.tsx` - UX enforcement  
- **Routes**: `backend/rawscribe/routes/auth.py` - Service tokens
- **Config**: `infra/.config/` - User definitions

For technical implementation details, see the [AI Agent Context](../ai/agent_context.md).