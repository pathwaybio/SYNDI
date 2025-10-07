#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

#
# AWS Integration Tests
# Tests Cognito pool creation, user management, and file upload/download
#
# Usage: ./test-aws-integration.sh [--enable-aws] [--skip-teardown] [--test-pattern PATTERN]
#
# Environment Variables:
#   ENABLE_AWS_TESTS=true    Enable AWS integration tests (default: false)
#   AWS_TEST_ORG=testaws     Organization for testing (default: testaws)
#   AWS_TEST_ENV=stage       Environment for testing (default: stage)
#   SKIP_TEARDOWN=false      Skip cleanup (for debugging, default: false)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Default configuration
ENABLE_AWS_TESTS="${ENABLE_AWS_TESTS:-false}"
AWS_TEST_ORG="${AWS_TEST_ORG:-testaws}"
AWS_TEST_ENV="${AWS_TEST_ENV:-stage}"
SKIP_TEARDOWN="${SKIP_TEARDOWN:-false}"
TEST_PATTERN="${TEST_PATTERN:-.*}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --enable-aws)
            ENABLE_AWS_TESTS=true
            shift
            ;;
        --skip-teardown)
            SKIP_TEARDOWN=true
            shift
            ;;
        --test-pattern)
            TEST_PATTERN="$2"
            shift 2
            ;;
        --org)
            AWS_TEST_ORG="$2"
            shift 2
            ;;
        --env)
            AWS_TEST_ENV="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--enable-aws] [--skip-teardown] [--test-pattern PATTERN] [--org ORG] [--env ENV]"
            exit 1
            ;;
    esac
done

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}" >&2
}

log_section() {
    echo ""
    echo -e "${MAGENTA}═══════════════════════════════════════${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}═══════════════════════════════════════${NC}"
}

# Check if AWS tests are enabled
if [[ "$ENABLE_AWS_TESTS" != "true" ]]; then
    log_warn "AWS integration tests are DISABLED"
    log_info "To enable, run with: --enable-aws"
    log_info "Or set: ENABLE_AWS_TESTS=true"
    log_info ""
    log_info "💡 AWS tests incur charges and require AWS credentials"
    log_info "   These tests create real AWS resources (Cognito, S3)"
    log_info "   and should only be run when necessary."
    echo ""
    exit 0
fi

# Run a test and track results
run_test() {
    local test_name="$1"
    local test_fn="$2"
    
    # Skip if doesn't match pattern
    if [[ ! "$test_name" =~ $TEST_PATTERN ]]; then
        return 0
    fi
    
    echo ""
    log_info "Running: $test_name"
    
    if $test_fn; then
        log_success "PASS: $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "FAIL: $test_name"
        FAILED_TESTS+=("$test_name")
        ((TESTS_FAILED++))
        return 1
    fi
}

# Assert helpers
assert_command_succeeds() {
    local cmd="$1"
    local message="${2:-Command should succeed}"
    
    if eval "$cmd" > /dev/null 2>&1; then
        return 0
    else
        log_error "$message"
        log_error "  Failed command: $cmd"
        return 1
    fi
}

assert_cognito_user_exists() {
    local pool_id="$1"
    local username="$2"
    local region="${3:-us-east-1}"
    
    if aws cognito-idp admin-get-user \
        --user-pool-id "$pool_id" \
        --username "$username" \
        --region "$region" > /dev/null 2>&1; then
        return 0
    else
        log_error "User should exist: $username"
        return 1
    fi
}

assert_s3_file_exists() {
    local bucket="$1"
    local key="$2"
    local region="${3:-us-east-1}"
    
    if aws s3api head-object \
        --bucket "$bucket" \
        --key "$key" \
        --region "$region" > /dev/null 2>&1; then
        return 0
    else
        log_error "S3 object should exist: s3://$bucket/$key"
        return 1
    fi
}

assert_s3_file_matches() {
    local bucket="$1"
    local key="$2"
    local local_file="$3"
    local region="${4:-us-east-1}"
    
    # Download file
    local temp_file=$(mktemp)
    if ! aws s3 cp "s3://$bucket/$key" "$temp_file" --region "$region" > /dev/null 2>&1; then
        log_error "Failed to download s3://$bucket/$key"
        rm -f "$temp_file"
        return 1
    fi
    
    # Compare checksums
    local original_md5=$(md5sum "$local_file" | awk '{print $1}')
    local downloaded_md5=$(md5sum "$temp_file" | awk '{print $1}')
    
    rm -f "$temp_file"
    
    if [[ "$original_md5" == "$downloaded_md5" ]]; then
        return 0
    else
        log_error "File checksum mismatch for s3://$bucket/$key"
        log_error "  Original:   $original_md5"
        log_error "  Downloaded: $downloaded_md5"
        return 1
    fi
}

#############################################
# Test Infrastructure Setup/Teardown
#############################################

STACK_NAME=""
USER_POOL_ID=""
CLIENT_ID=""
TEST_BUCKET=""
AWS_REGION="us-east-1"

setup_test_infrastructure() {
    log_section "Setting Up Test Infrastructure"
    
    log_info "Building Lambda package..."
    make rs-build ENV=$AWS_TEST_ENV ORG=$AWS_TEST_ORG > /dev/null 2>&1
    
    log_info "Deploying test stack to AWS..."
    log_warn "This will create real AWS resources and incur charges"
    
    # Deploy stack with Cognito and buckets
    ENABLE_AUTH=true CREATE_BUCKETS=true \
        make rs-deploy ENV=$AWS_TEST_ENV ORG=$AWS_TEST_ORG > /dev/null 2>&1
    
    # Get stack outputs
    STACK_NAME="rawscribe-$AWS_TEST_ENV-$AWS_TEST_ORG"
    USER_POOL_ID=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
        --output text \
        --region $AWS_REGION)
    CLIENT_ID=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' \
        --output text \
        --region $AWS_REGION)
    TEST_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs[?OutputKey==`FormsBucketName`].OutputValue' \
        --output text \
        --region $AWS_REGION)
    
    log_success "Infrastructure created:"
    log_info "  Stack:      $STACK_NAME"
    log_info "  User Pool:  $USER_POOL_ID"
    log_info "  Client ID:  $CLIENT_ID"
    log_info "  Bucket:     $TEST_BUCKET"
}

teardown_test_infrastructure() {
    if [[ "$SKIP_TEARDOWN" == "true" ]]; then
        log_warn "Skipping teardown (--skip-teardown enabled)"
        log_warn "⚠️  AWS resources still exist and will incur charges!"
        log_info "To clean up manually, run:"
        log_info "  make rs-teardown ENV=$AWS_TEST_ENV ORG=$AWS_TEST_ORG"
        return 0
    fi
    
    log_section "Tearing Down Test Infrastructure"
    
    log_info "Deleting test users..."
    # Delete all test users
    for username in test_admin test_researcher test_viewer; do
        aws cognito-idp admin-delete-user \
            --user-pool-id "$USER_POOL_ID" \
            --username "$username" \
            --region $AWS_REGION 2>/dev/null || true
    done
    
    log_info "Emptying S3 bucket..."
    if [[ -n "$TEST_BUCKET" ]]; then
        aws s3 rm "s3://$TEST_BUCKET" --recursive --region $AWS_REGION > /dev/null 2>&1 || true
    fi
    
    log_info "Deleting CloudFormation stack..."
    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --region $AWS_REGION
    
    log_info "Waiting for stack deletion (this may take a few minutes)..."
    aws cloudformation wait stack-delete-complete \
        --stack-name "$STACK_NAME" \
        --region $AWS_REGION 2>/dev/null || true
    
    log_success "Infrastructure cleaned up"
}

#############################################
# Cognito User Management Tests
#############################################

test_cognito_create_user() {
    log_info "Creating test user via cognito-user-manager..."
    
    make cognito-add-user \
        ENV=$AWS_TEST_ENV \
        ORG=$AWS_TEST_ORG \
        USER_NAME=test_researcher \
        PASSWORD='TestPass123!' \
        GROUP=RESEARCHERS > /dev/null 2>&1
    
    assert_cognito_user_exists "$USER_POOL_ID" "test_researcher" "$AWS_REGION"
}

test_cognito_show_user() {
    log_info "Showing user details..."
    
    assert_command_succeeds \
        "make cognito-show-user ENV=$AWS_TEST_ENV ORG=$AWS_TEST_ORG USER_NAME=test_researcher > /dev/null 2>&1" \
        "cognito-show-user should work"
}

test_cognito_set_password() {
    log_info "Changing user password..."
    
    assert_command_succeeds \
        "make cognito-set-password ENV=$AWS_TEST_ENV ORG=$AWS_TEST_ORG USER_NAME=test_researcher PASSWORD='NewPass123!' > /dev/null 2>&1" \
        "Password change should succeed"
}

test_cognito_set_group() {
    log_info "Adding user to LAB_MANAGERS group..."
    
    assert_command_succeeds \
        "make cognito-set-group ENV=$AWS_TEST_ENV ORG=$AWS_TEST_ORG USER_NAME=test_researcher GROUP=LAB_MANAGERS > /dev/null 2>&1" \
        "Group assignment should succeed"
}

test_cognito_multiple_users() {
    log_info "Creating multiple users..."
    
    for user in test_admin test_viewer; do
        make cognito-add-user \
            ENV=$AWS_TEST_ENV \
            ORG=$AWS_TEST_ORG \
            USER_NAME=$user \
            PASSWORD='TestPass123!' \
            GROUP=RESEARCHERS > /dev/null 2>&1
    done
    
    assert_cognito_user_exists "$USER_POOL_ID" "test_admin" "$AWS_REGION" &&
    assert_cognito_user_exists "$USER_POOL_ID" "test_viewer" "$AWS_REGION"
}

#############################################
# File Upload/Download Tests (Binary Integrity)
#############################################

test_png_upload_download() {
    log_info "Testing PNG file upload/download integrity..."
    
    # Create a test PNG file (1x1 red pixel)
    local test_png=$(mktemp --suffix=.png)
    # PNG signature + IHDR + IDAT + IEND (minimal valid PNG)
    echo -ne '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$test_png"
    
    local original_size=$(stat -c%s "$test_png" 2>/dev/null || stat -f%z "$test_png" 2>/dev/null)
    local original_md5=$(md5sum "$test_png" | awk '{print $1}')
    
    log_info "  Original size: $original_size bytes"
    log_info "  Original MD5:  $original_md5"
    
    # Upload to S3
    local s3_key="test-uploads/test-image-$(date +%s).png"
    aws s3 cp "$test_png" "s3://$TEST_BUCKET/$s3_key" \
        --content-type "image/png" \
        --region $AWS_REGION > /dev/null 2>&1
    
    # Verify file exists
    assert_s3_file_exists "$TEST_BUCKET" "$s3_key" "$AWS_REGION" || {
        rm -f "$test_png"
        return 1
    }
    
    # Download and verify
    local downloaded_png=$(mktemp --suffix=.png)
    aws s3 cp "s3://$TEST_BUCKET/$s3_key" "$downloaded_png" \
        --region $AWS_REGION > /dev/null 2>&1
    
    local downloaded_size=$(stat -c%s "$downloaded_png" 2>/dev/null || stat -f%z "$downloaded_png" 2>/dev/null)
    local downloaded_md5=$(md5sum "$downloaded_png" | awk '{print $1}')
    
    log_info "  Downloaded size: $downloaded_size bytes"
    log_info "  Downloaded MD5:  $downloaded_md5"
    
    # Cleanup
    rm -f "$test_png" "$downloaded_png"
    aws s3 rm "s3://$TEST_BUCKET/$s3_key" --region $AWS_REGION > /dev/null 2>&1 || true
    
    # Verify integrity
    if [[ "$original_md5" != "$downloaded_md5" ]]; then
        log_error "PNG file corrupted during upload/download!"
        log_error "  Size changed: $original_size → $downloaded_size bytes"
        log_error "  MD5 mismatch: $original_md5 → $downloaded_md5"
        return 1
    fi
    
    if [[ "$original_size" != "$downloaded_size" ]]; then
        log_error "File size changed (possible byte addition bug)"
        log_error "  Original:   $original_size bytes"
        log_error "  Downloaded: $downloaded_size bytes"
        log_error "  Difference: $((downloaded_size - original_size)) bytes"
        return 1
    fi
    
    log_success "PNG file integrity verified"
    return 0
}

test_pdf_upload_download() {
    log_info "Testing PDF file upload/download integrity..."
    
    # Create a minimal PDF file
    local test_pdf=$(mktemp --suffix=.pdf)
    cat > "$test_pdf" << 'EOF'
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
164
%%EOF
EOF
    
    local s3_key="test-uploads/test-doc-$(date +%s).pdf"
    
    # Upload, verify, and check integrity
    aws s3 cp "$test_pdf" "s3://$TEST_BUCKET/$s3_key" \
        --content-type "application/pdf" \
        --region $AWS_REGION > /dev/null 2>&1
    
    local result=0
    assert_s3_file_matches "$TEST_BUCKET" "$s3_key" "$test_pdf" "$AWS_REGION" || result=1
    
    # Cleanup
    rm -f "$test_pdf"
    aws s3 rm "s3://$TEST_BUCKET/$s3_key" --region $AWS_REGION > /dev/null 2>&1 || true
    
    return $result
}

#############################################
# Main Test Execution
#############################################

echo "════════════════════════════════════════"
echo "  AWS Integration Tests"
echo "════════════════════════════════════════"
echo "Environment: $AWS_TEST_ENV"
echo "Organization: $AWS_TEST_ORG"
echo "Region: $AWS_REGION"
echo "Pattern: $TEST_PATTERN"
echo ""
log_warn "⚠️  These tests create real AWS resources and incur charges"
echo ""

# Setup infrastructure
setup_test_infrastructure

# Run Cognito tests
log_section "Cognito User Management Tests"
run_test "Cognito: Create user" test_cognito_create_user
run_test "Cognito: Show user details" test_cognito_show_user
run_test "Cognito: Set password" test_cognito_set_password
run_test "Cognito: Set group" test_cognito_set_group
run_test "Cognito: Create multiple users" test_cognito_multiple_users

# Run file integrity tests
log_section "File Upload/Download Integrity Tests"
run_test "File: PNG upload/download integrity" test_png_upload_download
run_test "File: PDF upload/download integrity" test_pdf_upload_download

# Teardown infrastructure
teardown_test_infrastructure

# Summary
echo ""
log_section "Test Summary"
echo -e "${GREEN}✅ Passed: $TESTS_PASSED${NC}"
echo -e "${RED}❌ Failed: $TESTS_FAILED${NC}"
echo "📋 Total: $((TESTS_PASSED + TESTS_FAILED))"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo ""
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
fi

echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    log_success "All AWS integration tests passed! 🎉"
    exit 0
else
    log_error "Some tests failed. Please investigate."
    exit 1
fi


