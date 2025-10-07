#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

#
# Build System Regression Tests
# Tests clean, build, config, and deploy targets to ensure they work correctly
#
# Usage: ./test-build-system.sh [test_pattern]
# Examples:
#   ./test-build-system.sh              # Run all tests
#   ./test-build-system.sh "clean"      # Run only clean tests
#   ./test-build-system.sh "backend"    # Run only backend tests
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Test configuration
TEST_ENV="test"
TEST_ORG="testorg"
TEST_PATTERN="${1:-.*}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

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

# Assert helper functions
assert_file_exists() {
    local file="$1"
    local message="${2:-File should exist: $file}"
    if [[ -f "$file" ]]; then
        return 0
    else
        log_error "$message"
        log_error "  Missing: $file"
        return 1
    fi
}

assert_file_not_exists() {
    local file="$1"
    local message="${2:-File should not exist: $file}"
    if [[ ! -f "$file" ]]; then
        return 0
    else
        log_error "$message"
        log_error "  Found: $file"
        return 1
    fi
}

assert_dir_exists() {
    local dir="$1"
    local message="${2:-Directory should exist: $dir}"
    if [[ -d "$dir" ]]; then
        return 0
    else
        log_error "$message"
        log_error "  Missing: $dir"
        return 1
    fi
}

assert_dir_not_exists() {
    local dir="$1"
    local message="${2:-Directory should not exist: $dir}"
    if [[ ! -d "$dir" ]]; then
        return 0
    else
        log_error "$message"
        log_error "  Found: $dir"
        return 1
    fi
}

assert_dir_empty() {
    local dir="$1"
    local message="${2:-Directory should be empty: $dir}"
    if [[ ! -d "$dir" ]] || [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
        return 0
    else
        log_error "$message"
        log_error "  Contains: $(ls -A "$dir" | head -5 | tr '\n' ' ')"
        return 1
    fi
}

#############################################
# Config Tests
#############################################

test_config_generates_files() {
    make clean-config > /dev/null 2>&1 || true
    make config ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    assert_file_exists "frontend/public/config.json" "Frontend config should be generated" &&
    assert_file_exists "backend/rawscribe/.config/config.json" "Backend config should be generated"
}

test_clean_config_removes_files() {
    make config ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    make clean-config > /dev/null 2>&1
    
    assert_file_not_exists "frontend/public/config.json" "Frontend config should be removed" &&
    assert_file_not_exists "backend/rawscribe/.config/config.json" "Backend config should be removed"
}

#############################################
# Backend Build Tests
#############################################

test_clean_backend_removes_all() {
    # Build first to ensure artifacts exist
    make rs-build ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1 || true
    
    # Clean
    make clean-backend > /dev/null 2>&1
    
    # Verify cleanup
    assert_dir_not_exists "backend/.build" "Build directory should be removed" &&
    assert_dir_empty ".local/s3/lambda" "Lambda directory should be empty/removed" &&
    assert_file_not_exists ".lambda-prereqs-$TEST_ENV-$TEST_ORG" "Prereqs touch file should be removed" &&
    assert_file_not_exists "backend/.build/lambda/.deps-installed" "Deps touch file should be removed"
}

test_backend_build_creates_artifacts() {
    make clean-backend > /dev/null 2>&1
    make rs-build ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    assert_file_exists ".local/s3/lambda/function.zip" "Lambda zip should be created" &&
    assert_file_exists "backend/rawscribe/.config/config.json" "Merged config should exist" &&
    assert_file_exists ".lambda-prereqs-$TEST_ENV-$TEST_ORG" "Prereqs touch file should exist" &&
    assert_file_exists "backend/.build/lambda/.deps-installed" "Deps touch file should exist" &&
    log_info "Verifying config in Lambda zip..." &&
    unzip -l .local/s3/lambda/function.zip 2>/dev/null | grep -q "rawscribe/.config/config.json" &&
    log_success "Config found in Lambda zip at standard path"
}

test_backend_incremental_build() {
    # Initial build
    make clean-backend > /dev/null 2>&1
    make rs-build ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Touch a source file
    touch backend/rawscribe/main.py
    
    # Rebuild and capture output
    output=$(make rs-build ENV=$TEST_ENV ORG=$TEST_ORG 2>&1)
    
    # Should NOT reinstall dependencies
    if echo "$output" | grep -q "Installing Python dependencies"; then
        log_error "Incremental build should NOT reinstall dependencies"
        return 1
    fi
    
    # Should rebuild package
    if ! echo "$output" | grep -q "Building Lambda package"; then
        log_error "Incremental build should rebuild package"
        return 1
    fi
    
    return 0
}

test_backend_requirements_change_triggers_reinstall() {
    # Initial build
    make clean-backend > /dev/null 2>&1
    make rs-build ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Change requirements
    echo "# test comment" >> backend/rawscribe/requirements.txt
    
    # Rebuild and capture output
    output=$(make rs-build ENV=$TEST_ENV ORG=$TEST_ORG 2>&1)
    
    # Revert change
    git checkout backend/rawscribe/requirements.txt 2>/dev/null || true
    
    # Should reinstall dependencies
    if ! echo "$output" | grep -q "Installing Python dependencies"; then
        log_error "Requirements change should trigger dependency reinstall"
        return 1
    fi
    
    return 0
}

test_backend_config_locations() {
    make clean-backend > /dev/null 2>&1
    make rs-build ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Count config.json files (should be exactly 2: one external, one in zip)
    config_count=$(find .local/s3/lambda -name "config.json" | wc -l)
    
    if [[ "$config_count" -ne 1 ]]; then
        log_error "Should have exactly 1 external config.json, found $config_count"
        find .local/s3/lambda -name "config.json"
        return 1
    fi
    
    # Verify config exists in zip
    if ! unzip -l .local/s3/lambda/function.zip | grep -q "rawscribe/.config/config.json"; then
        log_error "Config should exist inside zip at rawscribe/.config/config.json"
        return 1
    fi
    
    return 0
}

#############################################
# Frontend Build Tests
#############################################

test_clean_frontend_removes_all() {
    make build-frontend ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1 || true
    make clean-frontend > /dev/null 2>&1
    
    assert_dir_not_exists "frontend/dist" "Dist directory should be removed" &&
    assert_file_not_exists "frontend/public/config.json" "Config should be removed" &&
    assert_dir_empty ".local/s3/webapp" "Webapp directory should be empty/removed"
}

test_frontend_build_creates_artifacts() {
    make clean-frontend > /dev/null 2>&1
    make build-frontend ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    assert_file_exists "frontend/dist/index.html" "Built index.html should exist" &&
    assert_file_exists "frontend/public/config.json" "Config should exist for build"
}

test_frontend_config_change_triggers_rebuild() {
    # Initial build
    make clean-frontend > /dev/null 2>&1
    make build-frontend ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Record initial timestamp
    initial_time=$(stat -c %Y frontend/dist/index.html 2>/dev/null || stat -f %m frontend/dist/index.html 2>/dev/null)
    
    sleep 1
    
    # Change config (by regenerating it)
    make config ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Deploy should rebuild
    make deploy-frontend ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Check if rebuild occurred
    new_time=$(stat -c %Y frontend/dist/index.html 2>/dev/null || stat -f %m frontend/dist/index.html 2>/dev/null)
    
    if [[ "$new_time" -le "$initial_time" ]]; then
        log_error "Config change should trigger frontend rebuild"
        return 1
    fi
    
    return 0
}

#############################################
# Integration Tests
#############################################

test_full_clean_build_cycle() {
    # Full clean
    make clean-backend > /dev/null 2>&1
    make clean-frontend > /dev/null 2>&1
    make clean-config > /dev/null 2>&1
    
    # Full build
    make config ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    make rs-build ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    make build-frontend ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Verify all artifacts
    assert_file_exists "frontend/public/config.json" &&
    assert_file_exists "backend/rawscribe/.config/config.json" &&
    assert_file_exists ".local/s3/lambda/function.zip" &&
    assert_file_exists "frontend/dist/index.html" &&
    log_info "Verifying config in Lambda zip at standard path..." &&
    unzip -l .local/s3/lambda/function.zip 2>/dev/null | grep -q "rawscribe/.config/config.json" &&
    log_success "Config found in Lambda zip"
}

test_cognito_user_manager_finds_config() {
    make clean-backend > /dev/null 2>&1
    make rs-build ENV=$TEST_ENV ORG=$TEST_ORG > /dev/null 2>&1
    
    # Test that cognito-user-manager can find the config
    # (list-groups doesn't require AWS credentials)
    if ! infra/scripts/cognito-user-manager.sh list-groups > /dev/null 2>&1; then
        log_error "cognito-user-manager should be able to run list-groups"
        return 1
    fi
    
    return 0
}

#############################################
# Run All Tests
#############################################

echo "════════════════════════════════════════"
echo "  Build System Regression Tests"
echo "════════════════════════════════════════"
echo "Environment: $TEST_ENV"
echo "Organization: $TEST_ORG"
echo "Pattern: $TEST_PATTERN"
echo ""

# Config tests
run_test "Config: Generate files" test_config_generates_files
run_test "Config: Clean removes files" test_clean_config_removes_files

# Backend tests
run_test "Backend: Clean removes all artifacts" test_clean_backend_removes_all
run_test "Backend: Build creates artifacts" test_backend_build_creates_artifacts
run_test "Backend: Incremental build (code change)" test_backend_incremental_build
run_test "Backend: Requirements change triggers reinstall" test_backend_requirements_change_triggers_reinstall
run_test "Backend: Config locations (only 2)" test_backend_config_locations

# Frontend tests
run_test "Frontend: Clean removes all artifacts" test_clean_frontend_removes_all
run_test "Frontend: Build creates artifacts" test_frontend_build_creates_artifacts
run_test "Frontend: Config change triggers rebuild" test_frontend_config_change_triggers_rebuild

# Integration tests
run_test "Integration: Full clean-build cycle" test_full_clean_build_cycle
run_test "Integration: cognito-user-manager finds config" test_cognito_user_manager_finds_config

# Summary
echo ""
echo "════════════════════════════════════════"
echo "  Test Summary"
echo "════════════════════════════════════════"
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
    log_success "All build system tests passed! 🎉"
    exit 0
else
    log_error "Some tests failed. Please investigate."
    exit 1
fi

