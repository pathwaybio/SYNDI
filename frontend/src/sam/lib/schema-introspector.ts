// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { SOPTemplateSchemaUIMetadata } from '../../../build/SOPTemplateSchema';

/**
 * Automatically introspect a Zod schema to extract field definitions
 */
export function extractFieldsFromSchema(schema: z.ZodSchema, schemaName?: string) {
  const fields: any[] = [];
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      // Get UI metadata for this field - check both schema-specific and global metadata
      const uiMetadata = (SOPTemplateSchemaUIMetadata as any)[fieldName] || {};
      
      fields.push({
        name: fieldName,
        zodType: fieldSchema,
        uiConfig: {
          component_type: uiMetadata.component_type || getSimpleComponentType(fieldSchema as z.ZodSchema),
          title: uiMetadata.title || formatTitle(fieldName),
          description: uiMetadata.description,
          required: uiMetadata.required !== undefined ? uiMetadata.required : isRequired(fieldSchema as z.ZodSchema),
          options: uiMetadata.options,
          validation: extractValidationRules(fieldSchema as z.ZodSchema)
        }
      });
    }
  }
  
  return fields;
}

/**
 * Simple fallback component type detection for schemas without UI metadata
 */
function getSimpleComponentType(schema: z.ZodSchema): string {
  // Unwrap optional/nullable
  let baseSchema = schema;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    baseSchema = schema.unwrap();
  }
  
  if (baseSchema instanceof z.ZodObject) return 'nested-object';
  if (baseSchema instanceof z.ZodBoolean) return 'checkbox';
  if (baseSchema instanceof z.ZodNumber) return 'number-input';
  if (baseSchema instanceof z.ZodEnum) return 'select';
  if (baseSchema instanceof z.ZodDate) return 'date-picker';
  if (baseSchema instanceof z.ZodArray) return 'tag-input'; // Fallback to input for arrays (TODO: implement multi-select)
  
  // For strings, check validation rules
  if (baseSchema instanceof z.ZodString) {
    const validation = extractValidationRules(baseSchema);
    if (validation.email) return 'email-input';
    if (validation.url) return 'url-input';
    // Could add more validation-based detection here
    return 'input';
  }
  
  // Everything else defaults to input
  return 'input';
}

/**
 * Check if a field is required
 */
function isRequired(schema: z.ZodSchema): boolean {
  return !(schema instanceof z.ZodOptional);
}

/**
 * Extract validation rules from Zod schema
 */
function extractValidationRules(schema: z.ZodSchema): any {
  const rules: any = {};
  
  // Unwrap optional/nullable to get to the base schema
  let baseSchema = schema;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    baseSchema = schema.unwrap();
  }
  
  if (baseSchema instanceof z.ZodString) {
    // Extract string validations like min, max, regex, etc.
    const checks = (baseSchema as any)._def.checks || [];
    
    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          rules.min_length = check.value;
          break;
        case 'max':
          rules.max_length = check.value;
          break;
        case 'regex':
          rules.pattern = check.regex.source;
          break;
        case 'email':
          rules.email = true;
          break;
        case 'url':
          rules.url = true;
          break;
      }
    }
  }
  
  if (baseSchema instanceof z.ZodNumber) {
    const checks = (baseSchema as any)._def.checks || [];
    
    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          rules.min_value = check.value;
          break;
        case 'max':
          rules.max_value = check.value;
          break;
        case 'int':
          rules.integer_only = true;
          break;
      }
    }
  }
  
  return rules;
}

/**
 * Format field name to human-readable title
 */
function formatTitle(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

/**
 * Analyze schema relationships by looking at field types
 */
export function extractSchemaRelationships(schema: z.ZodSchema, schemaName: string) {
  const relationships: any[] = [];
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      let baseSchema = fieldSchema as z.ZodSchema;
      
      // Unwrap arrays
      if (baseSchema instanceof z.ZodArray) {
        const arrayType = baseSchema.element;
        
        // Check if it's an array of other schemas
        if (isSchemaReference(arrayType)) {
          relationships.push({
            type: 'contains',
            targetSchema: getSchemaName(arrayType),
            fieldName,
            cardinality: 'many',
            canCreate: true,
            canDelete: true
          });
        }
      }
      
      // Check for direct schema references
      if (isSchemaReference(baseSchema)) {
        relationships.push({
          type: 'references',
          targetSchema: getSchemaName(baseSchema),
          fieldName,
          cardinality: 'one'
        });
      }
    }
  }
  
  return relationships;
}

/**
 * Check if a schema is a reference to another schema
 */
function isSchemaReference(schema: z.ZodSchema): boolean {
  // This would need to be enhanced to detect references to TaskSchema, FieldSchema, etc.
  // For now, we'll use naming conventions
  const schemaString = schema.toString();
  return schemaString.includes('TaskSchema') || 
         schemaString.includes('FieldSchema') || 
         schemaString.includes('TaskGroupSchema');
}

/**
 * Get schema name from a schema reference
 */
function getSchemaName(schema: z.ZodSchema): string {
  const schemaString = schema.toString();
  
  if (schemaString.includes('TaskGroupSchema')) return 'TaskGroup';
  if (schemaString.includes('TaskSchema')) return 'Task';
  if (schemaString.includes('FieldSchema')) return 'Field';
  
  return 'Unknown';
} 