<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# User Management

This guide covers creating and managing users in SYNDI systems, including Cognito user administration, group management, and password policies.

## Overview

SYNDI uses AWS Cognito User Pools for user management, with each organization having its own isolated User Pool. Users are assigned to groups that determine their permissions.

See [RBAC System](rbac.md) for detailed information about roles and permissions.

## User Groups

SYNDI provides four core groups:

| Group | Permissions | Description |
|-------|------------|-------------|
| **ADMINS** | All (`*`) | System administrators with full access |
| **LAB_MANAGERS** | Submit, view, approve | Lab oversight and SOP approval |
| **RESEARCHERS** | Submit, view own/group, drafts | Laboratory work and data entry |
| **CLINICIANS** | Submit, view own | Clinical data entry |

**Note:** Current template.yaml creates these groups: ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS (not the legacy admin/researcher/viewer names).

## Creating Users

### During Deployment (Automated)

Create an admin user automatically during deployment:

```bash
# Deploy with admin user creation
ENABLE_AUTH=true CREATE_BUCKETS=true \
  ADMIN_USERNAME=admin@myorg.com \
  ADMIN_PASSWORD=SecurePassword2025! \
  ORG=myorg ENV=stage make rs-deploy
```

This automatically:
1. Creates Cognito user with email as username
2. Ensures ADMINS group exists
3. Adds user to ADMINS group
4. Sets permanent password (no temp password)
5. Tests authentication
6. Displays success confirmation

### Via AWS CLI

Create users manually after deployment:

```bash
# Get User Pool ID from CloudFormation
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name rawscribe-stage-myorg \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher1@myorg.com \
  --user-attributes Name=email,Value=researcher1@myorg.com Name=name,Value="Jane Researcher" \
  --temporary-password TempPass123! \
  --message-action SUPPRESS \
  --region us-east-1

# Add to RESEARCHERS group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher1@myorg.com \
  --group-name RESEARCHERS \
  --region us-east-1

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username researcher1@myorg.com \
  --password ResearcherPass123! \
  --permanent \
  --region us-east-1
```

### Via AWS Console

1. Navigate to Amazon Cognito
2. Select your User Pool (`rawscribe-{env}-{org}-userpool`)
3. Click "Create user"
4. Fill in email and temporary password
5. Select "Send invitation" or "Mark as confirmed"
6. After creation, add user to appropriate group

## Managing User Groups

### Available Groups

Groups are automatically created during deployment when `ENABLE_AUTH=true`:

```bash
# Groups created by template.yaml:
ADMINS         # Precedence 1 - Full system access
LAB_MANAGERS   # Precedence 2 - Lab oversight
RESEARCHERS    # Precedence 3 - Data entry and submission
CLINICIANS     # Precedence 4 - Clinical data entry
```

### Add User to Group

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --group-name RESEARCHERS \
  --region us-east-1
```

### Remove User from Group

```bash
aws cognito-idp admin-remove-user-from-group \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --group-name RESEARCHERS \
  --region us-east-1
```

### List User's Groups

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1
```

### List All Users in Group

```bash
aws cognito-idp list-users-in-group \
  --user-pool-id ${USER_POOL_ID} \
  --group-name RESEARCHERS \
  --region us-east-1
```

## Password Management

### Password Policy

Cognito User Pools are configured with strong password requirements (from template.yaml):

- **Minimum Length**: 8 characters
- **Requires**: Uppercase, lowercase, numbers, symbols
- **Enforced by**: Cognito automatically

### Set User Password

```bash
# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --password NewSecurePass123! \
  --permanent \
  --region us-east-1
```

### Reset Password

```bash
# Generate new temporary password
aws cognito-idp admin-reset-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1

# User must change on next login
```

### Force Password Change

```bash
# Require password change on next login
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --user-attributes Name=email,Value=user@myorg.com \
  --desired-delivery-mediums EMAIL \
  --region us-east-1
```

## User Lifecycle Management

### Enable/Disable Users

```bash
# Disable user (prevents login)
aws cognito-idp admin-disable-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1

# Enable user
aws cognito-idp admin-enable-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1
```

### Delete Users

```bash
# Permanently delete user
aws cognito-idp admin-delete-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1
```

⚠️ **Warning:** Deletion is permanent. User data (ELN submissions) in S3 is NOT deleted.

### List All Users

```bash
# List all users in pool
aws cognito-idp list-users \
  --user-pool-id ${USER_POOL_ID} \
  --region us-east-1

# With specific attributes
aws cognito-idp list-users \
  --user-pool-id ${USER_POOL_ID} \
  --region us-east-1 \
  --attributes-to-get email name
```

### Get User Details

```bash
# Get complete user information
aws cognito-idp admin-get-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1
```

## Bulk User Management

### Create Multiple Users

Create a script for bulk user creation:

```bash
#!/bin/bash
# bulk-create-users.sh

USER_POOL_ID="us-east-1_ABC123"
GROUP="RESEARCHERS"

# Read from CSV or array
USERS=(
  "researcher1@myorg.com:Jane Researcher"
  "researcher2@myorg.com:John Researcher"
  "researcher3@myorg.com:Bob Researcher"
)

for user in "${USERS[@]}"; do
  EMAIL="${user%%:*}"
  NAME="${user##*:}"
  
  echo "Creating user: $EMAIL"
  
  aws cognito-idp admin-create-user \
    --user-pool-id ${USER_POOL_ID} \
    --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=name,Value="$NAME" \
    --temporary-password TempPass123! \
    --message-action SUPPRESS \
    --region us-east-1
  
  aws cognito-idp admin-add-user-to-group \
    --user-pool-id ${USER_POOL_ID} \
    --username "$EMAIL" \
    --group-name "$GROUP" \
    --region us-east-1
  
  echo "✅ Created $EMAIL"
done
```

### Export Users

Export user list for backup:

```bash
# Export to JSON
aws cognito-idp list-users \
  --user-pool-id ${USER_POOL_ID} \
  --region us-east-1 > users-backup-$(date +%Y%m%d).json

# Export just usernames and emails
aws cognito-idp list-users \
  --user-pool-id ${USER_POOL_ID} \
  --region us-east-1 \
  --query 'Users[].[Username, Attributes[?Name==`email`].Value | [0]]' \
  --output table
```

## Username Requirements

### Format Rules

- **Must be**: Valid email address
- **No hyphens**: Hyphens conflict with filesystem delimiters
- **Case sensitive**: `User@org.com` ≠ `user@org.com`
- **Unique**: Per User Pool (org-specific isolation)

### Valid Usernames

```bash
✅ admin@myorg.com
✅ researcher1@myorg.com
✅ jane.researcher@myorg.com
✅ jane_researcher@myorg.com
```

### Invalid Usernames

```bash
❌ user-with-hyphens@myorg.com  # No hyphens allowed
❌ user@org                      # Not a valid email
❌ user_only                     # Must be email format
```

## Role Assignment Best Practices

### Principle of Least Privilege

Start with the minimum permissions needed:

1. **New user** → RESEARCHERS or CLINICIANS
2. **Team lead** → LAB_MANAGERS
3. **IT admin** → ADMINS (sparingly)

### Role Assignment Guidelines

**Assign ADMINS when:**
- User needs system configuration access
- User manages other users
- User troubleshoots system issues
- User needs unrestricted data access

**Assign LAB_MANAGERS when:**
- User oversees laboratory operations
- User needs to approve submissions
- User manages team members
- User requires broad data visibility

**Assign RESEARCHERS when:**
- User actively conducts laboratory work
- User needs to submit ELN data
- User works in collaborative teams
- User uploads experimental files

**Assign CLINICIANS when:**
- User performs clinical data entry
- User needs to submit clinical forms
- User should only see own data
- User has limited system interaction

### Multiple Groups

Users can belong to multiple groups:

```bash
# Add user to multiple groups
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --group-name RESEARCHERS

aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --group-name LAB_MANAGERS
```

**Permission resolution:** User gets combined permissions from all groups.

## Security Considerations

### Password Security

1. **Strong Passwords**: Enforce minimum 8 characters with complexity
2. **Regular Rotation**: Encourage users to change passwords quarterly
3. **No Sharing**: Each user must have individual account
4. **Temporary Passwords**: Require change on first login

### Account Security

1. **Regular Audits**: Review user list quarterly
2. **Disable Inactive Users**: Disable users who haven't logged in for 90+ days
3. **Remove Departed Users**: Delete accounts promptly when users leave
4. **Monitor Failed Logins**: Set up CloudWatch alarms for failed auth attempts

### Access Control

1. **Least Privilege**: Assign minimum required role
2. **Group-Based**: Use groups, not individual permissions
3. **Regular Reviews**: Audit group membership quarterly
4. **Separation of Duties**: Admins shouldn't be the only researchers

## Troubleshooting

### User Cannot Login

**Symptoms:**
- "Incorrect username or password"
- "User does not exist"

**Solutions:**
```bash
# Check if user exists
aws cognito-idp admin-get-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1

# Check user status
aws cognito-idp admin-get-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --query 'UserStatus' \
  --region us-east-1

# Possible statuses:
# - UNCONFIRMED: User needs to confirm email
# - CONFIRMED: User can login
# - FORCE_CHANGE_PASSWORD: User must change temp password
# - RESET_REQUIRED: Admin reset password
```

### "User is disabled"

**Solution:**
```bash
# Enable the user
aws cognito-idp admin-enable-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1
```

### "Invalid password format"

**Cause:** Password doesn't meet policy requirements

**Solution:** Ensure password has:
- At least 8 characters
- Uppercase letter
- Lowercase letter
- Number
- Symbol

### User Has Wrong Permissions

**Check user's groups:**
```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1
```

**Fix:**
```bash
# Add to correct group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --group-name RESEARCHERS

# Remove from wrong group
aws cognito-idp admin-remove-user-from-group \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --group-name CLINICIANS
```

## Finding Resources

### Discover User Pool

```bash
# Find User Pool by organization
ENV=stage
ORG=myorg

USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?contains(Name,'rawscribe-${ENV}-${ORG}')].Id | [0]" \
  --output text --region us-east-1)

echo "User Pool ID: ${USER_POOL_ID}"
```

### Using Makefile

```bash
# Show User Pool ID
make show-rs-user-pool ENV=stage ORG=myorg

# Show Client ID
make show-rs-client-id ENV=stage ORG=myorg
```

## Advanced User Management

### Custom Attributes

Store additional user metadata:

```bash
# Create user with custom attributes
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --user-attributes \
    Name=email,Value=user@myorg.com \
    Name=name,Value="User Name" \
    Name=custom:department,Value="Biochemistry" \
    Name=custom:lab_id,Value="LAB-001" \
  --region us-east-1
```

**Note:** Custom attributes must be defined in User Pool schema (see template.yaml).

### Update User Attributes

```bash
# Update user's name
aws cognito-idp admin-update-user-attributes \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --user-attributes Name=name,Value="New Name" \
  --region us-east-1
```

### User Status Management

```bash
# Confirm user (skip email verification)
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --region us-east-1

# Check last login
aws cognito-idp admin-get-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@myorg.com \
  --query 'UserLastModifiedDate' \
  --region us-east-1
```

## User Management Scripts

### Complete User Creation Script

```bash
#!/bin/bash
# create-user.sh

set -e

# Parameters
USER_POOL_ID="${1}"
EMAIL="${2}"
GROUP="${3:-RESEARCHERS}"
PASSWORD="${4}"

if [ -z "$PASSWORD" ]; then
    echo "Usage: $0 <user-pool-id> <email> <group> <password>"
    exit 1
fi

echo "Creating user $EMAIL in group $GROUP..."

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" \
  --temporary-password TempPass123! \
  --message-action SUPPRESS \
  --region us-east-1

# Add to group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ${USER_POOL_ID} \
  --username "$EMAIL" \
  --group-name "$GROUP" \
  --region us-east-1

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent \
  --region us-east-1

echo "✅ User $EMAIL created successfully"
```

**Usage:**
```bash
./create-user.sh us-east-1_ABC123 researcher@myorg.com RESEARCHERS Pass123!
```

## Best Practices

### User Naming

1. **Use email addresses** - Clear, unique, professional
2. **Organizational domains** - `user@myorg.com` pattern
3. **Role indicators** - `admin@myorg.com`, `researcher1@myorg.com`
4. **No generic names** - Avoid `admin`, `test`, `user`

### Group Management

1. **Use standard groups** - ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS
2. **Assign sparingly** - Not everyone needs ADMINS
3. **Document assignments** - Keep track of who has what role
4. **Review regularly** - Quarterly group membership audits

### Password Management

1. **Strong passwords** - Meet policy requirements
2. **Unique passwords** - Different from other systems
3. **Secure storage** - Use password manager
4. **Regular rotation** - Change quarterly for sensitive roles
5. **No sharing** - Each person gets own account

### Audit Trail

1. **CloudTrail logging** - Enabled automatically for Cognito
2. **Regular reviews** - Check authentication logs
3. **Monitor failures** - Alert on repeated failed logins
4. **Track changes** - Review user/group modifications

## Multi-Organization Considerations

### User Isolation

Users are **completely isolated** between organizations:

- User `admin@org1.com` in org1's User Pool
- User `admin@org2.com` in org2's User Pool
- Cannot share users between orgs
- Cannot authenticate across orgs

### Cross-Organization Users

If someone needs access to multiple organizations:

```bash
# Create separate account in each org
# Org 1
aws cognito-idp admin-create-user \
  --user-pool-id ${ORG1_POOL_ID} \
  --username user@org1.com \
  --region us-east-1

# Org 2
aws cognito-idp admin-create-user \
  --user-pool-id ${ORG2_POOL_ID} \
  --username user@org2.com \
  --region us-east-1
```

## Related Documentation

- [RBAC System](rbac.md) - Roles and permissions
- [Testing Authentication](testing-auth.md) - Testing user login
- [Multi-Organization Setup](../deployment/multi-organization.md) - Multi-org management
- [Configuration System](../architecture/configuration-system.md) - Config management
