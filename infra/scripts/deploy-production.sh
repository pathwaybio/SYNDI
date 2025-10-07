#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

set -e

# Source shared deployment functions
source "$(dirname "$0")/deploy-shared.sh"

echo "🟢 Deploying to PRODUCTION environment..."

# Configuration
BUCKET_NAME="myapp-production-bucket"
CLOUDFRONT_ID="E789PRODUCTION123"  # Replace with actual CloudFront distribution ID

# Safety check for production deployment
echo "⚠️  You are about to deploy to PRODUCTION!"
echo "   Bucket: ${BUCKET_NAME}"
echo "   CloudFront: ${CLOUDFRONT_ID}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [[ $confirm != "yes" ]]; then
    echo "❌ Production deployment cancelled."
    exit 1
fi

# Validate prerequisites
check_aws_cli

# Deploy the application
deploy_app "prod" "$BUCKET_NAME" "$CLOUDFRONT_ID"

echo "🎉 Production deployment complete!"
echo "Environment: https://myapp.com" 