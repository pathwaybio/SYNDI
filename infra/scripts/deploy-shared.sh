#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0


# Shared deployment functions
# This script is sourced by deploy-staging.sh and deploy-production.sh

deploy_app() {
    local environment=$1
    local bucket_name=$2
    local cloudfront_id=$3
    
    echo "🚀 Deploying to ${environment} environment..."
    
    # Configuration
    BUILD_DIR="frontend/dist"
    
    # Step 1: Clean and build the application
    echo "📦 Building application..."
    cd frontend
    rm -rf dist/
    npm ci
    npm run build
    cd ..
    
    # Step 2: Build composite configuration
    echo "⚙️  Building ${environment} configuration..."
    node infra/scripts/build-config.js "$environment" "${BUILD_DIR}/config.json"
    
    # Step 3: Deploy to S3
    echo "☁️  Uploading to S3 bucket: ${bucket_name}..."
    aws s3 sync "${BUILD_DIR}/" "s3://${bucket_name}/" \
        --delete \
        --cache-control "max-age=31536000,immutable" \
        --exclude "*.html" \
        --exclude "config.json"
    
    # Step 4: Upload index.html and config.json with no-cache
    echo "📄 Uploading index.html and config.json with no-cache..."
    aws s3 cp "${BUILD_DIR}/index.html" "s3://${bucket_name}/index.html" \
        --cache-control "no-cache,no-store,must-revalidate"
    aws s3 cp "${BUILD_DIR}/config.json" "s3://${bucket_name}/config.json" \
        --cache-control "no-cache,no-store,must-revalidate"
    
    # Step 5: Invalidate CloudFront cache
    echo "🔄 Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$cloudfront_id" \
        --paths "/*" \
        --output table
    
    echo "✅ ${environment} deployment complete!"
}

check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI not found. Please install it first."
        exit 1
    fi
}

validate_config() {
    local config_file=$1
    if [ ! -f "$config_file" ]; then
        echo "❌ Configuration file not found: $config_file"
        exit 1
    fi
    
    # Basic JSON validation
    if ! python3 -m json.tool "$config_file" > /dev/null 2>&1; then
        echo "❌ Invalid JSON in configuration file: $config_file"
        exit 1
    fi
    
    echo "✅ Configuration validated: $config_file"
} 