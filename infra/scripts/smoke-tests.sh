#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0


# CLAIRE Smoke Tests
# Usage: ./smoke-tests.sh <environment>
# Environments: staging, prod

set -e

ENV=${1:-staging}

if [[ ! "$ENV" =~ ^(staging|prod)$ ]]; then
    echo "❌ Error: Invalid environment '$ENV'"
    echo "Usage: $0 <environment>"
    echo "Valid environments: staging, prod"
    exit 1
fi

# Set URLs based on environment
if [[ "$ENV" == "staging" ]]; then
    FRONTEND_URL="https://staging.claire.yourdomain.com"
    API_URL="https://api-staging.claire.yourdomain.com"
elif [[ "$ENV" == "prod" ]]; then
    FRONTEND_URL="https://claire.yourdomain.com"
    API_URL="https://api.claire.yourdomain.com"
fi

echo "🧪 Running smoke tests for $ENV environment..."
echo "🌐 Frontend URL: $FRONTEND_URL"
echo "📡 API URL: $API_URL"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_status="${3:-200}"
    
    echo -n "🔍 Testing $test_name... "
    
    if response=$(eval "$test_command" 2>&1); then
        status_code=$(echo "$response" | tail -n1)
        if [[ "$status_code" == "$expected_status" ]]; then
            echo "✅ PASS"
            ((TESTS_PASSED++))
        else
            echo "❌ FAIL (Expected: $expected_status, Got: $status_code)"
            echo "   Response: $response"
            ((TESTS_FAILED++))
        fi
    else
        echo "❌ FAIL (Command failed)"
        echo "   Error: $response"
        ((TESTS_FAILED++))
    fi
}

# Frontend Tests
echo "🌐 Frontend Tests:"

run_test "Frontend Health Check" \
    "curl -s -o /dev/null -w '%{http_code}' '$FRONTEND_URL'" \
    "200"

run_test "Frontend Config Loading" \
    "curl -s -o /dev/null -w '%{http_code}' '$FRONTEND_URL/config.json'" \
    "200"

run_test "Frontend Assets Loading" \
    "curl -s -o /dev/null -w '%{http_code}' '$FRONTEND_URL/index.html'" \
    "200"

echo ""

# Backend API Tests
echo "📡 Backend API Tests:"

run_test "API Health Check" \
    "curl -s -o /dev/null -w '%{http_code}' '$API_URL/health'" \
    "200"

run_test "API Root Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' '$API_URL/'" \
    "200"

run_test "API Docs Available" \
    "curl -s -o /dev/null -w '%{http_code}' '$API_URL/docs'" \
    "200"

echo ""

# Configuration Tests
echo "⚙️ Configuration Tests:"

# Test that config contains expected structure
run_test "Frontend Config Structure" \
    "curl -s '$FRONTEND_URL/config.json' | jq -e '.webapp.api.baseUrl' > /dev/null && echo '200'" \
    "200"

# Test that API returns expected health response
run_test "API Health Response Structure" \
    "curl -s '$API_URL/health' | jq -e '.status' > /dev/null && echo '200'" \
    "200"

echo ""

# Authentication Tests (Basic)
echo "🔐 Authentication Tests:"

run_test "Private Config Requires Auth" \
    "curl -s -o /dev/null -w '%{http_code}' '$API_URL/api/config/private'" \
    "401"

echo ""

# Performance Tests (Basic)
echo "⚡ Performance Tests:"

# Test response times
frontend_time=$(curl -s -w '%{time_total}' -o /dev/null "$FRONTEND_URL")
api_time=$(curl -s -w '%{time_total}' -o /dev/null "$API_URL/health")

echo "🔍 Frontend Response Time: ${frontend_time}s"
echo "🔍 API Response Time: ${api_time}s"

# Check if response times are reasonable (< 5 seconds)
if (( $(echo "$frontend_time < 5.0" | bc -l) )); then
    echo "✅ Frontend response time acceptable"
    ((TESTS_PASSED++))
else
    echo "❌ Frontend response time too slow (${frontend_time}s > 5.0s)"
    ((TESTS_FAILED++))
fi

if (( $(echo "$api_time < 2.0" | bc -l) )); then
    echo "✅ API response time acceptable"
    ((TESTS_PASSED++))
else
    echo "❌ API response time too slow (${api_time}s > 2.0s)"
    ((TESTS_FAILED++))
fi

echo ""

# SSL/Security Tests
echo "🔒 Security Tests:"

if [[ "$ENV" == "prod" ]]; then
    run_test "HTTPS Redirect" \
        "curl -s -o /dev/null -w '%{http_code}' 'http://claire.yourdomain.com'" \
        "301"
        
    run_test "SSL Certificate Valid" \
        "curl -s --fail '$FRONTEND_URL' > /dev/null && echo '200'" \
        "200"
fi

echo ""

# Summary
echo "📊 Test Summary:"
echo "  ✅ Passed: $TESTS_PASSED"
echo "  ❌ Failed: $TESTS_FAILED"
echo "  📋 Total: $((TESTS_PASSED + TESTS_FAILED))"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo ""
    echo "🎉 All smoke tests passed! Deployment to $ENV looks good."
    exit 0
else
    echo ""
    echo "💥 Some tests failed. Please investigate before proceeding."
    echo ""
    echo "🔧 Troubleshooting:"
    echo "  1. Check CloudWatch logs for errors"
    echo "  2. Verify DNS propagation for domain names"
    echo "  3. Check AWS CloudFormation stack status"
    echo "  4. Validate SSL certificate configuration"
    echo "  5. Test individual components manually"
    exit 1
fi 