#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

# Load site-specific configuration from .local/<org>/<env>/aws-resources.json
# Usage: source scripts/load-site-config.sh [org] [env]

# Default values
ORG=${1:-${ORG:-pwb}}
ENV=${2:-${ENV:-stage}}

# Configuration file path
CONFIG_FILE="infra/.config/lambda/${ENV}-${ORG}.json"

# Check if configuration exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Configuration file not found at $CONFIG_FILE" >&2
    echo "Please create site-specific configuration following the template in:" >&2
    echo "  docs/source/shared/system-admin/site-configuration-template.md" >&2
    return 1 2>/dev/null || exit 1
fi

# Validate JSON
if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
    echo "Error: Invalid JSON in $CONFIG_FILE" >&2
    return 1 2>/dev/null || exit 1
fi

# Export AWS configuration
export AWS_ACCOUNT_ID=$(jq -r '.aws_account_id' "$CONFIG_FILE")
export AWS_REGION=$(jq -r '.region' "$CONFIG_FILE")

# Export Cognito configuration
export COGNITO_REGION=$(jq -r '.region' "$CONFIG_FILE")
export COGNITO_USER_POOL_ID=$(jq -r '.lambda.auth.cognito.userPoolId' "$CONFIG_FILE")
export COGNITO_USER_POOL_NAME=$(jq -r '.lambda.auth.cognito.userPoolName // "rawscribe-${ENV}-${ORG}-userpool"' "$CONFIG_FILE")
export COGNITO_CLIENT_ID=$(jq -r '.lambda.auth.cognito.clientId' "$CONFIG_FILE")

# Export API Gateway configuration
export API_GATEWAY_ID=$(jq -r '.api_gateway.api_id // empty' "$CONFIG_FILE")
export API_GATEWAY_NAME=$(jq -r '.api_gateway.api_name // empty' "$CONFIG_FILE")
export API_GATEWAY_ENDPOINT=$(jq -r '.api_gateway.endpoint // empty' "$CONFIG_FILE")

# Export Lambda configuration
export LAMBDA_FUNCTION_NAME=$(jq -r '.lambda_function.function_name // "rawscribe-${ENV}-${ORG}-backend"' "$CONFIG_FILE")
export LAMBDA_EXECUTION_ROLE=$(jq -r '.lambda_function.execution_role // "rawscribe-${ENV}-${ORG}-lambda-execution-role"' "$CONFIG_FILE")

# Export S3 bucket names
export S3_LAMBDA_BUCKET=$(jq -r '.lambda.storage.lambda_bucket_name // "rawscribe-lambda-${ENV}-${ORG}-${AWS_ACCOUNT_ID}"' "$CONFIG_FILE")
export S3_FORMS_BUCKET=$(jq -r '.lambda.storage.forms_bucket_name // empty' "$CONFIG_FILE")
export S3_ELN_BUCKET=$(jq -r '.lambda.storage.eln_bucket_name // empty' "$CONFIG_FILE")
export S3_ELN_DRAFTS_BUCKET=$(jq -r '.lambda.storage.draft_bucket_name // empty' "$CONFIG_FILE")

# Export test user configuration (be careful with passwords!)
export TEST_USERNAME=$(jq -r '.test_users.admin.username // empty' "$CONFIG_FILE")
export TEST_USER_GROUPS=$(jq -r '.test_users.admin.groups | join(",") // empty' "$CONFIG_FILE")

# Export email settings for CDK
export EMAIL_FROM=$(jq -r '.email_settings.from_email // empty' "$CONFIG_FILE")
export EMAIL_REPLY_TO=$(jq -r '.email_settings.reply_to // empty' "$CONFIG_FILE")
# Check if we should use SES (Simple Email Service) for production
if [ "$ENV" = "prod" ] && [ ! -z "$EMAIL_FROM" ]; then
    export USE_SES=true
else
    export USE_SES=false
fi

# Print loaded configuration (without sensitive data)
echo "Loaded configuration for ${ORG}/${ENV}:"
echo "  AWS Account: ${AWS_ACCOUNT_ID}"
echo "  Region: ${AWS_REGION}"
echo "  User Pool: ${COGNITO_USER_POOL_ID}"
echo "  API Endpoint: ${API_GATEWAY_ENDPOINT}"
echo "  Lambda Function: ${LAMBDA_FUNCTION_NAME}"
echo "  S3 Buckets: forms, eln, drafts, lambda"

# Set organization and environment for other scripts
export ORG
export ENV

# Success
return 0 2>/dev/null || exit 0
