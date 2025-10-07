#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

#
# Cognito User Management Script
# Handles user creation, password management, group assignment, and Cognito pool detection
# with site-specific configuration support
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Group definitions for display only (bootstrap helper)
# IMPORTANT: Groups and permissions are defined in:
#   1. CloudFormation (template.yaml) - Creates Cognito groups
#   2. Config files (infra/.config/lambda/*.json) - Defines permissions via config.lambda.auth.cognito.groups
#   3. API reads from config at runtime (schema-independent)
# These are fallback defaults for CLI tools only
declare -A GROUP_DESCRIPTIONS=(
    ["ADMINS"]="Administrative users with full access"
    ["LAB_MANAGERS"]="Lab managers with oversight and approval permissions"
    ["RESEARCHERS"]="Researchers who can submit SOPs and manage drafts"
    ["CLINICIANS"]="Clinicians with patient data access"
)

declare -A GROUP_PERMISSIONS=(
    ["ADMINS"]="*"
    ["LAB_MANAGERS"]="submit:SOP*,view:*,draft:*,approve:*,manage:users"
    ["RESEARCHERS"]="submit:SOP*,view:own,view:group,draft:*"
    ["CLINICIANS"]="submit:SOP*,view:own,draft:*"
)

# Valid groups list (must match CloudFormation and config)
VALID_GROUPS="ADMINS LAB_MANAGERS RESEARCHERS CLINICIANS"

usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
  detect-cognito    Detect Cognito pool configuration for a stack
  get-token         Get JWT token for a user (outputs token to stdout)
  add-user          Create or update a user with group membership
  set-password      Set user password
  set-group         Add user to a group
  remove-user       Remove a user
  show-user         Show user details and group memberships
  list-groups       List all available groups with permissions

Options:
  --env ENV              Environment (dev|test|stage|prod) [required for most commands]
  --org ORG              Organization name [required for most commands]
  --user USER_NAME       User email/username [required for user commands]
  --password PASSWORD    User password [required for add-user, set-password]
  --group GROUP          Group name (default: RESEARCHERS)
  --region REGION        AWS region (default: us-east-1)
  --config CONFIG_FILE   Path to config JSON file (optional, for group definitions)

Examples:
  # Detect Cognito pool for a stack
  $0 detect-cognito --env stage --org uga

  # Get JWT token for a user
  TOKEN=\$($0 get-token --env stage --org uga --user admin@example.com --password 'Admin123!')

  # Add a new user
  $0 add-user --env stage --org uga --user user@example.com --password 'Pass123!' --group RESEARCHERS

  # Set user password
  $0 set-password --env stage --org uga --user user@example.com --password 'NewPass123!'

  # Add user to group
  $0 set-group --env stage --org uga --user user@example.com --group LAB_MANAGERS

  # Show user details
  $0 show-user --env stage --org uga --user user@example.com

  # Remove user
  $0 remove-user --env stage --org uga --user user@example.com

  # List available groups
  $0 list-groups --config infra/.config/lambda/stage.json
EOF
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}" >&2
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}" >&2
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}" >&2
}

log_error() {
    echo -e "${RED}❌ $1${NC}" >&2
}

# Load group definitions from config JSON if provided
load_config_groups() {
    local config_file="$1"
    
    if [[ ! -f "$config_file" ]]; then
        log_warn "Config file not found: $config_file, using defaults"
        return 0
    fi
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        log_warn "jq not installed, using default group definitions"
        return 0
    fi
    
    log_info "Loading group definitions from: $config_file"
    
    # Try to read groups from lambda.auth.cognito.groups or webapp.auth.cognito.groups
    local groups_json
    groups_json=$(jq -r '.lambda.auth.cognito.groups // .webapp.auth.cognito.groups // {}' "$config_file" 2>/dev/null)
    
    if [[ "$groups_json" == "{}" ]]; then
        log_warn "No group definitions found in config, using defaults"
        return 0
    fi
    
    # Parse each group and update our associative arrays
    local group_names
    group_names=$(echo "$groups_json" | jq -r 'keys[]' 2>/dev/null)
    
    if [[ -n "$group_names" ]]; then
        VALID_GROUPS=""
        
        while IFS= read -r group_name; do
            # Skip empty lines
            [[ -z "$group_name" ]] && continue
            # Get description
            local description
            description=$(echo "$groups_json" | jq -r --arg g "$group_name" '.[$g].description // ""' 2>/dev/null)
            
            # Get permissions (array -> comma-separated string)
            local permissions
            permissions=$(echo "$groups_json" | jq -r --arg g "$group_name" '.[$g].permissions | join(",")' 2>/dev/null)
            
            # Update arrays
            GROUP_DESCRIPTIONS["$group_name"]="$description"
            GROUP_PERMISSIONS["$group_name"]="$permissions"
            
            # Add to valid groups list
            VALID_GROUPS="$VALID_GROUPS $group_name"
            
            log_info "  Loaded group: $group_name"
        done <<< "$group_names"
        
        # Trim leading space
        VALID_GROUPS="${VALID_GROUPS# }"
        
        log_success "Loaded ${#GROUP_DESCRIPTIONS[@]} groups from config"
    fi
    
    return 0
}

# Validate group name
validate_group() {
    local group="$1"
    
    if [[ ! " $VALID_GROUPS " =~ " $group " ]]; then
        log_error "Invalid group: $group"
        log_error "Valid groups: $VALID_GROUPS"
        return 1
    fi
    
    return 0
}

# Get stack name for environment and org
get_stack_name() {
    local env="$1"
    local org="$2"
    
    if [[ -z "$env" ]] || [[ -z "$org" ]]; then
        log_error "ENV and ORG required"
        return 1
    fi
    
    echo "rawscribe-${env}-${org}"
}

# Get AWS account number
get_aws_account() {
    aws sts get-caller-identity --query Account --output text 2>/dev/null || echo ""
}

# Detect Cognito pool configuration for a stack
# Returns: user_pool_id client_id is_stack_managed
detect_cognito() {
    local env="$1"
    local org="$2"
    local region="${3:-us-east-1}"
    local quiet="${4:-false}"
    
    local stack_name
    stack_name=$(get_stack_name "$env" "$org")
    
    if [[ "$quiet" != "true" ]]; then
        log_info "Detecting Cognito configuration for stack: $stack_name"
    fi
    
    # Check if stack exists
    if ! aws cloudformation describe-stacks --stack-name "$stack_name" --region "$region" &>/dev/null; then
        log_error "Stack not found: $stack_name"
        return 1
    fi
    
    # Try to get Cognito pool from stack resources
    local pool_id
    pool_id=$(aws cloudformation describe-stack-resources \
        --stack-name "$stack_name" \
        --region "$region" \
        --query "StackResources[?ResourceType=='AWS::Cognito::UserPool'].PhysicalResourceId" \
        --output text 2>/dev/null || echo "")
    
    local client_id
    client_id=$(aws cloudformation describe-stack-resources \
        --stack-name "$stack_name" \
        --region "$region" \
        --query "StackResources[?ResourceType=='AWS::Cognito::UserPoolClient'].PhysicalResourceId" \
        --output text 2>/dev/null || echo "")
    
    local is_stack_managed="false"
    
    if [[ -n "$pool_id" ]] && [[ "$pool_id" != "None" ]]; then
        # Validate that we also have client_id for stack-managed pool
        if [[ -z "$client_id" ]] || [[ "$client_id" == "None" ]]; then
            if [[ "$quiet" != "true" ]]; then
                log_error "Found pool but missing client: $pool_id (incomplete stack resources)"
            fi
            return 1
        fi
        
        is_stack_managed="true"
        if [[ "$quiet" != "true" ]]; then
            log_success "Found stack-managed Cognito pool: $pool_id"
        fi
    else
        # Try to get from stack outputs
        pool_id=$(aws cloudformation describe-stacks \
            --stack-name "$stack_name" \
            --region "$region" \
            --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        client_id=$(aws cloudformation describe-stacks \
            --stack-name "$stack_name" \
            --region "$region" \
            --query "Stacks[0].Outputs[?OutputKey=='CognitoClientId'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        if [[ -n "$pool_id" ]] && [[ "$pool_id" != "None" ]]; then
            # Validate that we also have client_id for external pool
            if [[ -z "$client_id" ]] || [[ "$client_id" == "None" ]]; then
                if [[ "$quiet" != "true" ]]; then
                    log_error "Found pool but missing client: $pool_id (incomplete stack outputs)"
                fi
                return 1
            fi
            
            if [[ "$quiet" != "true" ]]; then
                log_success "Found external Cognito pool (from outputs): $pool_id"
            fi
        else
            if [[ "$quiet" != "true" ]]; then
                log_error "No Cognito pool found for stack: $stack_name"
            fi
            return 1
        fi
    fi
    
    # Output in parseable format
    echo "POOL_ID=$pool_id"
    echo "CLIENT_ID=$client_id"
    echo "IS_STACK_MANAGED=$is_stack_managed"
    echo "REGION=$region"
    
    return 0
}

# Show user details and group memberships
show_user() {
    local user_name="$1"
    local pool_id="$2"
    local region="$3"
    
    if [[ -z "$user_name" ]] || [[ -z "$pool_id" ]] || [[ -z "$region" ]]; then
        log_error "USER_NAME, POOL_ID, and REGION required"
        return 1
    fi
    
    log_info "User details for: $user_name"
    echo "   Pool: $pool_id" >&2
    echo "" >&2
    
    # Get user details
    if ! aws cognito-idp admin-get-user \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --region "$region" &>/dev/null; then
        log_error "User not found: $user_name"
        return 1
    fi
    
    # Get user attributes
    echo "📋 User Attributes:" >&2
    aws cognito-idp admin-get-user \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --region "$region" \
        --query 'UserAttributes[*].[Name,Value]' \
        --output table >&2
    
    echo "" >&2
    
    # Get user status
    local user_status
    user_status=$(aws cognito-idp admin-get-user \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --region "$region" \
        --query 'UserStatus' \
        --output text)
    
    echo "📊 Status: $user_status" >&2
    echo "" >&2
    
    # Get groups
    echo "👥 Group Memberships:" >&2
    local groups
    groups=$(aws cognito-idp admin-list-groups-for-user \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --region "$region" \
        --query 'Groups[*].[GroupName,Description]' \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$groups" ]]; then
        echo "   (No groups assigned)"
    else
        echo "$groups" | while IFS=$'\t' read -r group_name description; do
            local perms="${GROUP_PERMISSIONS[$group_name]:-unknown}"
            echo "   • $group_name - $description"
            echo "     Permissions: $perms"
        done
    fi
    
    return 0
}

# Set user password
set_password() {
    local user_name="$1"
    local password="$2"
    local pool_id="$3"
    local region="$4"
    
    if [[ -z "$user_name" ]] || [[ -z "$password" ]] || [[ -z "$pool_id" ]] || [[ -z "$region" ]]; then
        log_error "USER_NAME, PASSWORD, POOL_ID, and REGION required"
        return 1
    fi
    
    log_info "Setting password for: $user_name"
    echo "   Pool: $pool_id" >&2
    
    if ! aws cognito-idp admin-set-user-password \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --password "$password" \
        --permanent \
        --region "$region" 2>&1; then
        log_error "Failed to set password (check password policy requirements)"
        return 1
    fi
    
    log_success "Password updated successfully"
    return 0
}

# Add user to group (creates group if needed)
set_group() {
    local user_name="$1"
    local group="$2"
    local pool_id="$3"
    local region="$4"
    
    if [[ -z "$user_name" ]] || [[ -z "$group" ]] || [[ -z "$pool_id" ]] || [[ -z "$region" ]]; then
        log_error "USER_NAME, GROUP, POOL_ID, and REGION required"
        return 1
    fi
    
    # Validate group
    if ! validate_group "$group"; then
        return 1
    fi
    
    log_info "Adding $user_name to group: $group"
    echo "   Pool: $pool_id" >&2
    
    # Check if group exists, create if not
    if ! aws cognito-idp get-group \
        --user-pool-id "$pool_id" \
        --group-name "$group" \
        --region "$region" &>/dev/null; then
        
        log_info "Creating group: $group"
        local description="${GROUP_DESCRIPTIONS[$group]}"
        
        if ! aws cognito-idp create-group \
            --user-pool-id "$pool_id" \
            --group-name "$group" \
            --description "$description" \
            --region "$region" 2>&1; then
            log_error "Failed to create group: $group"
            return 1
        fi
        
        log_success "Group created: $group"
    else
        log_info "Group already exists: $group"
    fi
    
    # Add user to group
    if aws cognito-idp admin-add-user-to-group \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --group-name "$group" \
        --region "$region" 2>&1; then
        log_success "User added to group: $group"
    else
        log_warn "User may already be in group: $group"
    fi
    
    return 0
}

# Create or update user with group membership
add_user() {
    local user_name="$1"
    local password="$2"
    local group="$3"
    local pool_id="$4"
    local region="$5"
    
    if [[ -z "$user_name" ]] || [[ -z "$password" ]] || [[ -z "$pool_id" ]] || [[ -z "$region" ]]; then
        log_error "USER_NAME, PASSWORD, POOL_ID, and REGION required"
        return 1
    fi
    
    # Default group
    group="${group:-RESEARCHERS}"
    
    # Validate group
    if ! validate_group "$group"; then
        return 1
    fi
    
    log_info "Managing user: $user_name"
    echo "   Pool: $pool_id" >&2
    echo "   Group: $group" >&2
    echo "" >&2
    
    # Check if user exists
    if aws cognito-idp admin-get-user \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --region "$region" &>/dev/null; then
        log_success "User exists"
    else
        log_info "Creating new user"
        
        if ! aws cognito-idp admin-create-user \
            --user-pool-id "$pool_id" \
            --username "$user_name" \
            --user-attributes Name=email,Value="$user_name" Name=email_verified,Value=true \
            --message-action SUPPRESS \
            --region "$region" 2>&1; then
            log_error "Failed to create user"
            return 1
        fi
        
        log_success "User created"
    fi
    
    echo "" >&2
    
    # Set password
    if ! set_password "$user_name" "$password" "$pool_id" "$region"; then
        return 1
    fi
    
    echo "" >&2
    
    # Set group
    if ! set_group "$user_name" "$group" "$pool_id" "$region"; then
        return 1
    fi
    
    echo "" >&2
    log_success "User configuration complete!"
    echo "   Login: $user_name" >&2
    echo "   Group: $group" >&2
    echo "   Status: Active" >&2
    
    return 0
}

# Remove user
remove_user() {
    local user_name="$1"
    local pool_id="$2"
    local region="$3"
    
    if [[ -z "$user_name" ]] || [[ -z "$pool_id" ]] || [[ -z "$region" ]]; then
        log_error "USER_NAME, POOL_ID, and REGION required"
        return 1
    fi
    
    log_info "Removing user: $user_name"
    echo "   Pool: $pool_id" >&2
    
    # Check if user exists
    if ! aws cognito-idp admin-get-user \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --region "$region" &>/dev/null; then
        log_warn "User does not exist: $user_name"
        return 0
    fi
    
    # Delete user
    if aws cognito-idp admin-delete-user \
        --user-pool-id "$pool_id" \
        --username "$user_name" \
        --region "$region" 2>&1; then
        log_success "User deleted successfully"
    else
        log_error "Failed to delete user"
        return 1
    fi
    
    return 0
}

# List available groups with permissions
list_groups() {
    echo "📋 Available Cognito Groups:" >&2
    echo "" >&2
    
    for group in $VALID_GROUPS; do
        local description="${GROUP_DESCRIPTIONS[$group]}"
        local permissions="${GROUP_PERMISSIONS[$group]}"
        
        echo "  • $group" >&2
        echo "    Description: $description" >&2
        echo "    Permissions: $permissions" >&2
        echo "" >&2
    done
}

# Get JWT token for a user
get_token() {
    local user_name="$1"
    local password="$2"
    local pool_id="$3"
    local client_id="$4"
    local region="$5"
    
    if [[ -z "$user_name" ]] || [[ -z "$password" ]] || [[ -z "$pool_id" ]] || [[ -z "$client_id" ]] || [[ -z "$region" ]]; then
        log_error "USER_NAME, PASSWORD, POOL_ID, CLIENT_ID, and REGION required"
        return 1
    fi
    
    # Get token from Cognito (suppress stderr to avoid pollution)
    local token
    token=$(aws cognito-idp admin-initiate-auth \
        --user-pool-id "$pool_id" \
        --client-id "$client_id" \
        --auth-flow ADMIN_USER_PASSWORD_AUTH \
        --auth-parameters USERNAME="$user_name",PASSWORD="$password" \
        --region "$region" \
        --query 'AuthenticationResult.IdToken' \
        --output text 2>/dev/null)
    
    if [[ -z "$token" ]] || [[ "$token" == "None" ]]; then
        log_error "Authentication failed for user: $user_name" >&2
        return 1
    fi
    
    # Output token to stdout (no log messages to keep it clean)
    echo "$token"
    return 0
}

# Main command dispatcher
main() {
    if [[ $# -lt 1 ]]; then
        usage
        exit 1
    fi
    
    local command="$1"
    shift
    
    # Parse arguments
    local env="" org="" user_name="" password="" group="" region="us-east-1" config_file=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env) env="$2"; shift 2 ;;
            --org) org="$2"; shift 2 ;;
            --user) user_name="$2"; shift 2 ;;
            --password) password="$2"; shift 2 ;;
            --group) group="$2"; shift 2 ;;
            --region) region="$2"; shift 2 ;;
            --config) config_file="$2"; shift 2 ;;
            *) log_error "Unknown option: $1"; usage; exit 1 ;;
        esac
    done
    
    # Auto-detect config file from ENV and ORG if not provided
    if [[ -z "$config_file" ]] && [[ -n "$env" ]]; then
        # Always check merged config at backend/rawscribe/.config/config.json (created by 'make config')
        if [[ -f "$PROJECT_ROOT/backend/rawscribe/.config/config.json" ]]; then
            config_file="$PROJECT_ROOT/backend/rawscribe/.config/config.json"
        else
            # Fallback: Try infra/.config/lambda source files
            if [[ -n "$org" ]] && [[ -f "$PROJECT_ROOT/infra/.config/lambda/${env}-${org}.json" ]]; then
                config_file="$PROJECT_ROOT/infra/.config/lambda/${env}-${org}.json"
            elif [[ -f "$PROJECT_ROOT/infra/.config/lambda/${env}.json" ]]; then
                config_file="$PROJECT_ROOT/infra/.config/lambda/${env}.json"
            else
                log_error "Config file not found for ENV=$env ORG=$org"
                log_error "Expected locations:"
                log_error "  - backend/rawscribe/.config/config.json (merged config)"
                log_error "  - infra/.config/lambda/${env}-${org}.json"
                log_error "  - infra/.config/lambda/${env}.json"
                log_error ""
                log_error "Run 'make config ENV=$env ORG=$org' first"
                exit 1
            fi
        fi
    fi
    
    # Load config (will use defaults if config not found or no groups defined)
    if [[ -n "$config_file" ]]; then
        load_config_groups "$config_file"
    fi
    
    # Execute command
    case "$command" in
        detect-cognito)
            if [[ -z "$env" ]] || [[ -z "$org" ]]; then
                log_error "ENV and ORG required for detect-cognito"
                exit 1
            fi
            detect_cognito "$env" "$org" "$region"
            ;;
        
        get-token)
            if [[ -z "$env" ]] || [[ -z "$org" ]] || [[ -z "$user_name" ]] || [[ -z "$password" ]]; then
                log_error "ENV, ORG, USER, and PASSWORD required for get-token"
                exit 1
            fi
            
            # Detect pool and client
            eval "$(detect_cognito "$env" "$org" "$region" | grep -E "^(POOL_ID|CLIENT_ID)=")"
            
            if [[ -z "$POOL_ID" ]] || [[ -z "$CLIENT_ID" ]]; then
                log_error "Could not detect Cognito pool or client"
                exit 1
            fi
            
            get_token "$user_name" "$password" "$POOL_ID" "$CLIENT_ID" "$region"
            ;;
        
        list-groups)
            list_groups
            ;;
        
        show-user)
            if [[ -z "$env" ]] || [[ -z "$org" ]] || [[ -z "$user_name" ]]; then
                log_error "ENV, ORG, and USER required for show-user"
                exit 1
            fi
            
            # Detect pool
            eval "$(detect_cognito "$env" "$org" "$region" | grep "^POOL_ID=")"
            
            if [[ -z "$POOL_ID" ]]; then
                log_error "Could not detect Cognito pool"
                exit 1
            fi
            
            show_user "$user_name" "$POOL_ID" "$region"
            ;;
        
        add-user)
            if [[ -z "$env" ]] || [[ -z "$org" ]] || [[ -z "$user_name" ]] || [[ -z "$password" ]]; then
                log_error "ENV, ORG, USER, and PASSWORD required for add-user"
                exit 1
            fi
            
            # Detect pool
            eval "$(detect_cognito "$env" "$org" "$region" | grep "^POOL_ID=")"
            
            if [[ -z "$POOL_ID" ]]; then
                log_error "Could not detect Cognito pool"
                exit 1
            fi
            
            add_user "$user_name" "$password" "$group" "$POOL_ID" "$region"
            ;;
        
        set-password)
            if [[ -z "$env" ]] || [[ -z "$org" ]] || [[ -z "$user_name" ]] || [[ -z "$password" ]]; then
                log_error "ENV, ORG, USER, and PASSWORD required for set-password"
                exit 1
            fi
            
            # Detect pool
            eval "$(detect_cognito "$env" "$org" "$region" | grep "^POOL_ID=")"
            
            if [[ -z "$POOL_ID" ]]; then
                log_error "Could not detect Cognito pool"
                exit 1
            fi
            
            set_password "$user_name" "$password" "$POOL_ID" "$region"
            ;;
        
        set-group)
            if [[ -z "$env" ]] || [[ -z "$org" ]] || [[ -z "$user_name" ]] || [[ -z "$group" ]]; then
                log_error "ENV, ORG, USER, and GROUP required for set-group"
                exit 1
            fi
            
            # Detect pool
            eval "$(detect_cognito "$env" "$org" "$region" | grep "^POOL_ID=")"
            
            if [[ -z "$POOL_ID" ]]; then
                log_error "Could not detect Cognito pool"
                exit 1
            fi
            
            set_group "$user_name" "$group" "$POOL_ID" "$region"
            ;;
        
        remove-user)
            if [[ -z "$env" ]] || [[ -z "$org" ]] || [[ -z "$user_name" ]]; then
                log_error "ENV, ORG, and USER required for remove-user"
                exit 1
            fi
            
            # Detect pool
            eval "$(detect_cognito "$env" "$org" "$region" | grep "^POOL_ID=")"
            
            if [[ -z "$POOL_ID" ]]; then
                log_error "Could not detect Cognito pool"
                exit 1
            fi
            
            remove_user "$user_name" "$POOL_ID" "$region"
            ;;
        
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Run main
main "$@"

