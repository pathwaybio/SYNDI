<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Permission System

SYNDI uses a permission-based authorization system that separates permissions from roles/groups.

## Permission Format

Permissions follow the format: `action:resource`

Examples:
- `submit:SOP*` - Can submit any SOP
- `view:own` - Can view own entries
- `draft:*` - Can manage drafts
- `*` - Wildcard (all permissions)

## Standard Permissions

### Data Submission
- `submit:SOP*` - Submit any SOP (Standard Operating Procedure)
- `submit:*` - Submit any entry type

### Data Viewing
- `view:*` - View all entries
- `view:own` - View only own entries
- `view:group` - View entries from own group

### Draft Management
- `draft:*` - Create, update, delete drafts

### Approval Workflow
- `approve:*` - Approve submissions

### User Management
- `manage:users` - Create, update, delete users
- `*` - Includes all permissions (ADMINS only)

## Group-to-Permission Mapping

Groups are mapped to permissions via configuration files in `infra/.config/lambda/`:

**Example** (`infra/.config/lambda/stage.json`):
```json
{
  "lambda": {
    "auth": {
      "cognito": {
        "groups": {
          "ADMINS": {
            "description": "Administrative users with full access",
            "permissions": ["*"]
          },
          "LAB_MANAGERS": {
            "description": "Lab managers with oversight and approval permissions",
            "permissions": [
              "submit:SOP*",
              "view:*",
              "draft:*",
              "approve:*",
              "manage:users"
            ]
          },
          "RESEARCHERS": {
            "description": "Researchers who can submit SOPs and manage drafts",
            "permissions": [
              "submit:SOP*",
              "view:own",
              "view:group",
              "draft:*"
            ]
          },
          "CLINICIANS": {
            "description": "Clinicians with patient data access",
            "permissions": [
              "submit:SOP*",
              "view:own",
              "draft:*"
            ]
          }
        }
      }
    }
  }
}
```

**Important**: Permissions are NOT hardcoded in Python. They are read from config.json at runtime, respecting schema independence.

## Permission Checking

### In Code
```python
from rawscribe.routes.auth import get_current_user

@router.post("/some-endpoint")
async def my_endpoint(current_user: dict = Depends(get_current_user)):
    # Check specific permission
    user_permissions = current_user.get('permissions', [])
    has_permission = '*' in user_permissions or 'manage:users' in user_permissions
    
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires manage:users permission")
```

### Via API
Check user's permissions in the decoded JWT token:
```json
{
  "sub": "user@example.com",
  "cognito:groups": ["LAB_MANAGERS"],
  "permissions": [
    "submit:SOP*",
    "view:*",
    "draft:*",
    "approve:*",
    "manage:users"
  ]
}
```

## Adding New Permissions

### 1. Define Permission in auth.py
```python
permission_mapping = {
    'LAB_MANAGERS': [
        'submit:SOP*',
        'view:*', 
        'draft:*',
        'approve:*',
        'manage:users',
        'export:data'  # NEW permission
    ],
}
```

### 2. Use in Route Handler
```python
@router.get("/v1/data/export")
async def export_data(current_user: dict = Depends(get_current_user)):
    user_permissions = current_user.get('permissions', [])
    has_permission = '*' in user_permissions or 'export:data' in user_permissions
    
    if not has_permission:
        raise HTTPException(status_code=403, detail="Requires export:data permission")
    
    # ... export logic
```

## Permission vs Group Strategy

**Use permissions, not groups** in authorization checks:

❌ **Bad** (tightly coupled to groups):
```python
user_groups = current_user.get('cognito:groups', [])
if 'ADMINS' not in user_groups:
    raise HTTPException(status_code=403)
```

✅ **Good** (flexible, permission-based):
```python
user_permissions = current_user.get('permissions', [])
has_permission = '*' in user_permissions or 'manage:users' in user_permissions
if not has_permission:
    raise HTTPException(status_code=403, detail="Requires manage:users permission")
```

**Why?**
- Groups can change without breaking code
- Multiple groups can have same permission
- Clear what action is being authorized
- Easier to audit and understand

## Example Scenarios

### Scenario 1: User Management
**Who can manage users?**
- ✅ ADMINS (have `*`)
- ✅ LAB_MANAGERS (have `manage:users`)
- ❌ RESEARCHERS (no permission)

### Scenario 2: Data Approval
**Who can approve submissions?**
- ✅ ADMINS (have `*`)
- ✅ LAB_MANAGERS (have `approve:*`)
- ❌ RESEARCHERS (no permission)
- ❌ CLINICIANS (no permission)

### Scenario 3: Draft Management
**Who can manage drafts?**
- ✅ ADMINS (have `*`)
- ✅ LAB_MANAGERS (have `draft:*`)
- ✅ RESEARCHERS (have `draft:*`)
- ✅ CLINICIANS (have `draft:*`)

## Related Documentation

- [Authentication Testing](testing-auth.md)
- [User Management API](../../deployment/user-management-api.md)
- [Groups and Roles](../configuration/cognito-groups.md)

