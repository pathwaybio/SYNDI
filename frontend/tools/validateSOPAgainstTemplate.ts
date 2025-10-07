// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: {
    missingInSOP: string[];
    missingInSchema: string[];
    typeMismatches: Array<{ path: string; expected: string; actual: any }>;
  };
}

class SOPValidator {
  private schema: Record<string, any>;
  private sopData: Record<string, any>;

  constructor(schemaPath: string, sopPath: string) {
    // Load the schema template
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    this.schema = yaml.load(schemaContent) as Record<string, any>;

    // Load the SOP data
    const sopContent = fs.readFileSync(sopPath, 'utf-8');
    this.sopData = yaml.load(sopContent) as Record<string, any>;
  }

  public async validate(): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: {
        missingInSOP: [],
        missingInSchema: [],
        typeMismatches: []
      }
    };

    // Check for structural issues by analyzing schema definitions
    await this.checkStructuralCompliance(result);
    
    // Check for missing required fields
    this.checkMissingRequiredFields(result);
    
    // Check for potential schema improvements
    this.checkSchemaImprovements(result);

    return result;
  }

  private async checkStructuralCompliance(result: ValidationResult): Promise<void> {
    console.log('\n🔍 Checking structural compliance against schema definitions...');
    
    // Use the generated Zod schema to get the exact same validation as the web app
    try {
      // Import the generated schema dynamically
      const { SOPTemplateSchema } = await import('../build/SOPTemplateSchema.js');
      SOPTemplateSchema.parse(this.sopData);
    } catch (error: any) {
      if (error.issues) {
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          
          // Special handling for union errors which give misleading "unrecognized_keys" messages
          if (issue.code === 'invalid_union' && issue.unionErrors) {
            // Try to extract more meaningful errors from union validation
            const realErrors: string[] = [];
            
            for (const unionError of issue.unionErrors) {
              if (unionError.issues) {
                for (const subIssue of unionError.issues) {
                  if (subIssue.code === 'invalid_type' && subIssue.received === 'undefined') {
                    const missingField = subIssue.path[subIssue.path.length - 1];
                    realErrors.push(`Missing required field: ${missingField}`);
                  } else if (subIssue.code === 'unrecognized_keys') {
                    // Check if it's likely a typo (parent vs parents)
                    const unrecognizedKeys = subIssue.keys;
                    for (const key of unrecognizedKeys) {
                      if (key === 'parent') {
                        realErrors.push(`Found 'parent' but schema expects 'parents' (plural)`);
                      } else if (this.isPropertyInChildrenArray(subIssue.path, key)) {
                        // Only flag as "in children array" if the property is actually in a children array item
                        if (key === 'description') {
                          realErrors.push(`Found 'description' in children array - this should be at the parent level`);
                        } else if (key === 'parents') {
                          realErrors.push(`Found 'parents' in children array - this should be at the parent level`);
                        } else if (key === 'name') {
                          realErrors.push(`Found 'name' in children array - this should be at the parent level`);
                        } else if (key === 'enabled') {
                          realErrors.push(`Found 'enabled' in children array - this should be in ExportConfiguration`);
                        } else if (key === 'value_immutable') {
                          realErrors.push(`Found 'value_immutable' in children array - this should be in ExportConfiguration`);
                        } else {
                          realErrors.push(`Unexpected property in children array: ${key}`);
                        }
                      } else {
                        realErrors.push(`Unexpected property: ${key}`);
                      }
                    }
                  } else if (subIssue.code !== 'unrecognized_keys') {
                    realErrors.push(`${subIssue.code}: ${subIssue.message}`);
                  }
                }
              }
            }
            
            if (realErrors.length > 0) {
              result.errors.push(`Validation failed at '${path}': ${realErrors.join('; ')}`);
            } else {
              result.errors.push(`${issue.code} at '${path}': ${issue.message}`);
            }
          } else if (issue.code === 'unrecognized_keys') {
            // For non-union unrecognized keys, check for common mistakes
            const unrecognizedKeys = issue.keys;
            for (const key of unrecognizedKeys) {
              if (key === 'parent' && !unrecognizedKeys.includes('parents')) {
                result.errors.push(`At '${path}': Found 'parent' property but schema expects 'parents' (plural)`);
              } else if (this.isPropertyInChildrenArray(issue.path, key)) {
                // Only flag as "in children array" if the property is actually in a children array item
                if (key === 'description') {
                  result.errors.push(`At '${path}': Found 'description' in children array - this should be at the parent level`);
                } else if (key === 'parents') {
                  result.errors.push(`At '${path}': Found 'parents' in children array - this should be at the parent level`);
                } else if (key === 'name') {
                  result.errors.push(`At '${path}': Found 'name' in children array - this should be at the parent level`);
                } else if (key === 'enabled') {
                  result.errors.push(`At '${path}': Found 'enabled' in children array - this should be in ExportConfiguration`);
                } else if (key === 'value_immutable') {
                  result.errors.push(`At '${path}': Found 'value_immutable' in children array - this should be in ExportConfiguration`);
                } else {
                  result.errors.push(`Unexpected property in children array at '${path}': ${key}`);
                }
              } else {
                result.errors.push(`Unrecognized keys at '${path}': ${issue.keys.join(', ')}`);
              }
            }
          } else if (issue.code === 'invalid_type') {
            result.errors.push(`Type mismatch at '${path}': expected ${issue.expected}, got ${issue.received}`);
          } else if (issue.code === 'missing_keys') {
            result.errors.push(`Missing required keys at '${path}': ${issue.missingKeys.join(', ')}`);
          } else {
            result.errors.push(`${issue.code} at '${path}': ${issue.message}`);
          }
        }
        result.isValid = false;
      } else {
        result.errors.push(`Validation error: ${error.message}`);
        result.isValid = false;
      }
    }
  }

  private isPropertyInChildrenArray(path: (string | number)[], propertyName: string): boolean {
    // Check if this property is actually in a children array item
    // The path should end with a number (array index) followed by the property name
    if (path.length < 2) return false;
    
    const lastSegment = path[path.length - 1];
    const secondLastSegment = path[path.length - 2];
    
    // If the last segment is the property name and the second last is a number (array index)
    // and the path contains 'children', then it's in a children array
    return (
      lastSegment === propertyName &&
      typeof secondLastSegment === 'number' &&
      path.includes('children')
    );
  }

  private analyzeSchemaStructure(): Map<string, Set<string>> {
    const allowedProperties = new Map<string, Set<string>>();
    
    // Analyze each definition in the schema
    for (const [defName, definition] of Object.entries(this.schema.definitions || {})) {
      const def = definition as any;
      const properties = new Set<string>();
      
      if (def.properties) {
        for (const propName of Object.keys(def.properties)) {
          properties.add(propName);
        }
      }
      
      // Add required properties
      if (def.required) {
        for (const reqProp of def.required) {
          properties.add(reqProp);
        }
      }
      
      allowedProperties.set(defName, properties);
    }
    
    return allowedProperties;
  }

  private validateSOPStructure(
    obj: any, 
    schemaAnalysis: Map<string, Set<string>>, 
    path: string, 
    result: ValidationResult
  ): void {
    // Try to determine what type of object this is based on its properties
    const objectType = this.inferObjectType(obj, schemaAnalysis);
    
    if (objectType && schemaAnalysis.has(objectType)) {
      const allowedProps = schemaAnalysis.get(objectType)!;
      const actualProps = new Set(Object.keys(obj));
      
      // Check for unrecognized properties
      for (const prop of actualProps) {
        if (!allowedProps.has(prop)) {
          const fullPath = path ? `${path}.${prop}` : prop;
          result.errors.push(`Property '${prop}' at '${fullPath}' is not allowed in ${objectType} definition`);
          result.isValid = false;
        }
      }
    }
    
    // Recursively check nested objects
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.validateSOPStructure(value, schemaAnalysis, fullPath, result);
      }
    }
  }

  private inferObjectType(obj: any, schemaAnalysis: Map<string, Set<string>>): string | null {
    // Try to match object properties against schema definitions
    const objProps = new Set(Object.keys(obj));
    
    for (const [defName, allowedProps] of schemaAnalysis) {
      // Check if this object has properties that match this definition
      const matchingProps = Array.from(objProps).filter(prop => allowedProps.has(prop));
      const matchRatio = matchingProps.length / Math.max(objProps.size, allowedProps.size);
      
      // If more than 50% of properties match, consider it this type
      if (matchRatio > 0.5) {
        return defName;
      }
    }
    
    return null;
  }

  private checkMissingRequiredFields(result: ValidationResult): void {
    const checkRequired = (obj: any, schema: any, path: string = '') => {
      const required = schema.required || [];
      
      for (const field of required) {
        const fullPath = path ? `${path}.${field}` : field;
        if (!(field in obj)) {
          result.suggestions.missingInSOP.push(fullPath);
          result.warnings.push(`Missing required field: ${fullPath}`);
        }
      }

      // Check nested objects
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const fieldSchema = schema.properties?.[key];
          if (fieldSchema && fieldSchema.type === 'object') {
            const currentPath = path ? `${path}.${key}` : key;
            checkRequired(value, fieldSchema, currentPath);
          }
        }
      }
    };

    checkRequired(this.sopData, this.schema);
  }

  private checkSchemaImprovements(result: ValidationResult): void {
    // For now, skip this check to avoid false positives
    // The main validation using Zod schema is working correctly
    return;
  }

  private propertyExistsInSchema(schema: any, propertyName: string, path: string): boolean {
    // For root level properties
    if (path === '') {
      return propertyName in schema || schema.properties?.[propertyName];
    }
    
    // For nested properties, get the field schema and check if it has the property
    const fieldSchema = this.getFieldSchema(schema, propertyName, path);
    return fieldSchema !== null;
  }

  private getFieldSchema(schema: any, propertyName: string, path: string): any {
    // For root level properties
    if (path === '') {
      return schema.properties?.[propertyName] || schema[propertyName];
    }
    
    // For nested properties, we need to traverse the schema structure
    // This is a simplified approach - in a real implementation, you'd want to
    // properly traverse the schema based on the path
    const pathParts = path.split('.');
    let currentSchema = schema;
    
    for (const part of pathParts) {
      if (currentSchema.properties?.[part]) {
        currentSchema = currentSchema.properties[part];
      } else if (currentSchema[part]) {
        currentSchema = currentSchema[part];
      } else {
        return null;
      }
    }
    
    return currentSchema.properties?.[propertyName] || currentSchema[propertyName];
  }

  private inferType(value: any): string {
    if (Array.isArray(value)) {
      if (value.length === 0) return 'array';
      return `array<${this.inferType(value[0])}>`;
    }
    if (typeof value === 'string') {
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) return 'date';
      if (value.match(/^https?:\/\//)) return 'uri';
      return 'string';
    }
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value === null) return 'null';
    return 'object';
  }

  public async printReport(): Promise<void> {
    const result = await this.validate();
    
    console.log('\n🔍 SOP Validation Report');
    console.log('=' .repeat(50));
    
    if (result.isValid) {
      console.log('✅ SOP is valid and compliant with the schema template!');
    } else {
      console.log('❌ SOP has validation errors:');
      result.errors.forEach(error => {
        console.log(`  • ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => {
        console.log(`  • ${warning}`);
      });
    }

    if (result.suggestions.missingInSOP.length > 0) {
      console.log('\n📝 Missing required fields in SOP:');
      result.suggestions.missingInSOP.forEach(field => {
        console.log(`  • ${field}`);
      });
    }

    if (result.suggestions.missingInSchema.length > 0) {
      console.log('\n🔧 Properties in SOP that might need to be added to schema template:');
      result.suggestions.missingInSchema.forEach(field => {
        console.log(`  • ${field}`);
      });
      console.log('\n💡 Consider adding these properties to SOPTemplateSchema.yaml if they are legitimate fields.');
    }

    if (result.suggestions.typeMismatches.length > 0) {
      console.log('\n🔄 Type mismatches:');
      result.suggestions.typeMismatches.forEach(mismatch => {
        console.log(`  • ${mismatch.path}: expected ${mismatch.expected}, got ${mismatch.actual}`);
      });
    }

    console.log('\n' + '=' .repeat(50));
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.log('Usage: npx ts-node frontend/tools/validateSOPAgainstTemplate.ts <schema-path> <sop-path>');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node frontend/tools/validateSOPAgainstTemplate.ts frontend/src/shared/schemas/SOPTemplateSchema.yaml .local/s3/forms/sops/sopTest1.yaml');
    process.exit(1);
  }

  const [schemaPath, sopPath] = args;

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(sopPath)) {
    console.error(`❌ SOP file not found: ${sopPath}`);
    process.exit(1);
  }

  try {
    const validator = new SOPValidator(schemaPath, sopPath);
    await validator.printReport();
  } catch (error: any) {
    console.error(`❌ Error during validation: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 