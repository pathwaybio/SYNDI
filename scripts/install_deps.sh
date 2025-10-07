#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0


set -e

echo "🔧 Initializing project dependencies..."

# Step 1: Check for Node
if ! command -v npm &> /dev/null; then
  echo "❌ npm not found. Please install Node.js and try again."
  exit 1
fi

# Step 2: Create package.json if missing
if [ ! -f package.json ]; then
  echo "📦 Initializing package.json..."
  npm init -y
fi

# Step 3: Install core packages
echo "📦 Installing project dependencies..."
npm install react react-dom zod react-hook-form js-yaml lucide-react class-variance-authority tailwind-variants

# Step 4: Install dev dependencies
echo "🛠 Installing dev tools..."
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom eslint prettier

# Step 5: Initialize TailwindCSS
echo "🎨 Setting up TailwindCSS..."
npx tailwindcss init -p

# Step 6: Initialize shadcn/ui
echo "🌿 Installing shadcn/ui..."
npx shadcn-ui@latest init

# Optionally install shadcn/ui components
echo "🧩 Installing core UI components from shadcn/ui..."
npx shadcn-ui@latest add input
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add table
npx shadcn-ui@latest add form
npx shadcn-ui@latest add button

# Step 7: Optional: Add Playwright for e2e tests
echo "🧪 Installing Playwright for e2e testing..."
npm install -D playwright @playwright/test

echo "✅ Installation complete!"
echo "👉 Tailwind + shadcn/ui ready."
echo "👉 Run 'npm run dev' to start development."
