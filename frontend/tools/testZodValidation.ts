// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the generated schema
import { SOPTemplateSchema } from '../build/SOPTemplateSchema.js';

function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.log('Usage: npx tsx frontend/tools/testZodValidation.ts <sop-path>');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx frontend/tools/testZodValidation.ts .local/s3/forms/sops/sopTest1.yaml');
    process.exit(1);
  }

  const [sopPath] = args;

  if (!fs.existsSync(sopPath)) {
    console.error(`❌ SOP file not found: ${sopPath}`);
    process.exit(1);
  }

  try {
    // Load the SOP data
    const sopContent = fs.readFileSync(sopPath, 'utf-8');
    const sopData = yaml.load(sopContent) as Record<string, any>;

    console.log('\n🔍 Testing SOP against generated Zod schema...');
    console.log('=' .repeat(50));

    try {
      // Validate against the generated Zod schema
      SOPTemplateSchema.parse(sopData);
      console.log('✅ SOP is valid according to generated Zod schema!');
    } catch (error: any) {
      console.log('❌ SOP validation failed:');
      
      if (error.issues) {
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          
          if (issue.code === 'unrecognized_keys') {
            console.log(`  • Unrecognized keys at '${path}': ${issue.keys.join(', ')}`);
          } else if (issue.code === 'invalid_type') {
            console.log(`  • Type mismatch at '${path}': expected ${issue.expected}, got ${issue.received}`);
          } else if (issue.code === 'missing_keys') {
            console.log(`  • Missing required keys at '${path}': ${issue.missingKeys.join(', ')}`);
          } else {
            console.log(`  • ${issue.code} at '${path}': ${issue.message}`);
          }
        }
      } else {
        console.log(`  • ${error.message}`);
      }
    }

    console.log('\n' + '=' .repeat(50));
  } catch (error: any) {
    console.error(`❌ Error during validation: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 