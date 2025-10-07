#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

set -e

# Source shared deployment functions
source "$(dirname "$0")/deploy-shared.sh"

echo "🟡 Deploying to STAGING environment..."

# Configuration
BUCKET_NAME="myapp-staging-bucket"
CLOUDFRONT_ID="E123STAGING456"  # Replace with actual CloudFront distribution ID

# Validate prerequisites
check_aws_cli

# Deploy the application
deploy_app "stage" "$BUCKET_NAME" "$CLOUDFRONT_ID"

echo "🎉 Staging deployment complete!"
echo "Environment: https://staging.myapp.com" 