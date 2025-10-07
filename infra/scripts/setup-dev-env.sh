#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

set -e

echo "🛠️  Setting up DEV environment for local development..."

# Configuration
CONFIG_DIR="frontend/.config"
DEV_CONFIG="infra/config/webapp/dev.json"

# Step 1: Ensure private config directory exists
mkdir -p ${CONFIG_DIR}

# Step 2: Build development configuration to private directory
echo "⚙️  Building development configuration..."
node infra/scripts/build-config.js dev "${CONFIG_DIR}/config.json"

# Step 3: Install dependencies if needed
echo "📦 Installing dependencies..."
cd frontend
npm ci
cd ..

echo "✅ Development environment setup complete!"
echo ""
echo "Environment Detection:"
echo "  - Vite Mode: development → detected as 'dev'"
echo "  - Config: /.config/config.json (private, not in public/)"
echo "  - Features: Frequent autosave, dev APIs, verbose logging"
echo ""
echo "Ready to run: npm run dev"
echo ""
echo "🔧 To reset your dev environment, run this script again." 