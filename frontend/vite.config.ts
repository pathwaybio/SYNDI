// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync, readFileSync } from 'fs'

// Load configuration based on NODE_ENV
const isTestMode = process.env.NODE_ENV === 'test';
const configPath = isTestMode 
  ? path.resolve(__dirname, '../infra/.config/webapp/test.json')
  : path.resolve(__dirname, 'public/config.json');

// Config will be loaded from file - no defaults to prevent misconfigurations
let config = {
  webapp: {
    server: { port: null as number | null },
    api: { proxyTarget: null as string | null },
    apiEndpoint: null as string | null
  }
};

// Load config from file - fail if missing or invalid
if (!existsSync(configPath)) {
  console.error(`❌ Config file not found at ${configPath}`);
  console.error('   Run "make copy-configs ENV=<env> ORG=<org>" to generate configuration');
  process.exit(1);
}

try {
  const configFile = readFileSync(configPath, 'utf-8');
  const parsedConfig = JSON.parse(configFile);
  
  // Validate required config fields
  if (!parsedConfig.webapp?.server?.port) {
    console.error('❌ Missing required config: webapp.server.port');
    console.error(`   Check configuration in ${configPath}`);
    process.exit(1);
  }
  
  if (!parsedConfig.webapp?.api?.proxyTarget) {
    console.error('❌ Missing required config: webapp.api.proxyTarget');
    console.error(`   Check configuration in ${configPath}`);
    process.exit(1);
  }
  
  config.webapp.server.port = parsedConfig.webapp.server.port;
  config.webapp.api.proxyTarget = parsedConfig.webapp.api.proxyTarget;
  config.webapp.apiEndpoint = parsedConfig.webapp.apiEndpoint;
    
  // Log configuration
  const env = process.env.ENV || 'dev';
  const org = process.env.ORG;
  console.log('='.repeat(60));
  console.log('🔧 Vite Configuration:');
  console.log(`   ENV: ${env}`);
  if (org) console.log(`   ORG: ${org}`);
  console.log(`   Config: ${configPath}`);
  console.log(`   Frontend: http://localhost:${config.webapp.server.port}`);
  console.log(`   Proxy: /api/* → ${config.webapp.api.proxyTarget}`);
  console.log('='.repeat(60));
    
    if (isTestMode) {
      console.log('📋 Running in TEST mode');
    }
} catch (error) {
  console.error('❌ Failed to parse config.json:', error);
  console.error('   Check JSON syntax and structure in configuration');
  process.exit(1);
}

export default defineConfig({
  plugins: [
    react(),
    // Simple plugin to serve config from webapp bucket location
    {
      name: 'serve-webapp-config',
      configureServer(server) {
        // Vite automatically serves files from public/ at root path
        // So config.json will be available at /config.json
        const configSource = isTestMode ? 'infra/.config/webapp/test.json' : 'public/config.json';
        console.log(`📋 Serving webapp config from ${configSource} at /config.json`);
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@sam": path.resolve(__dirname, "./src/sam"),
      "@claire": path.resolve(__dirname, "./src/claire"),
      "@paul": path.resolve(__dirname, "./src/paul"),
    },
  },
  server: {
    port: config.webapp.server.port,
    proxy: {
      '/api': {
        target: config.webapp.api.proxyTarget,
        changeOrigin: true,
        secure: false,
      }
    },
    hmr: true,
    watch: {
      usePolling: true,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});