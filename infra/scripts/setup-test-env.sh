#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

set -e

echo "🧪 Setting up TEST environment for Playwright..."

# Configuration
BUILD_DIR="frontend/dist"
PUBLIC_DIR="frontend/public"

# Step 1: Ensure public directory exists
mkdir -p ${PUBLIC_DIR}

# Step 2: Build test configuration
echo "⚙️  Building test configuration..."
node infra/scripts/build-config.js test "${PUBLIC_DIR}/config.json"

# Step 3: Build the application for testing
echo "📦 Building application for testing..."
cd frontend
npm ci
npm run build
cd ..

# Step 4: Build test configuration for build output
echo "📄 Building test config for build output..."
node infra/scripts/build-config.js test "${BUILD_DIR}/config.json"

echo "✅ Test environment setup complete!"
echo ""
echo "Environment Detection:"
echo "  - Vite Mode: test → detected as 'test'"
echo "  - Config: /config.json (from infra/config/webapp/test.json)"
echo "  - Features: Autosave disabled, mock APIs, minimal UI feedback"
echo ""
echo "Ready to run: npm run test:e2e" 