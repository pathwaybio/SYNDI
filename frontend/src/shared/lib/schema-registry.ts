// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Schema-Driven Form Generation System
 * 
 * This module creates a self-maintaining registry that automatically discovers Zod schemas
 * and their relationships, enabling dynamic form generation without hardcoded dependencies.
 * 
 * WHY THIS APPROACH:
 * - Eliminates duplication between schema definitions and UI code
 * - Automatically adapts to schema changes without manual TypeScript updates
 * - Provides a single source of truth for all schema metadata
 * - Enables truly dynamic UIs that scale with schema complexity
 */

import { z } from 'zod';
import { 
  SOPTemplateSchemaUIMetadata,
  SchemaConfigs
} from '../../../build/SOPTemplateSchema';
import { extractFieldsFromSchema } from '@sam/lib/schema-introspector';
import { logger } from '@shared/lib/logger';

/**
 * Core schema information needed for dynamic form generation
 * 
 * Combines Zod schema validation with UI metadata and relationships to enable
 * complete form generation and automatic discovery of containment rules.
 */
interface SchemaDefinition {
  name: string;
  schema: z.ZodSchema;
  uiMetadata: Record<string, any>;
  relationships: SchemaRelationship[];
}

/**
 * Describes how schemas relate to each other in the domain model
 * 
 * This enables automatic "Add X to Y" button generation and supports
 * hierarchical data structures with enforced business rules.
 */
interface SchemaRelationship {
  type: 'contains' | 'references';
  targetSchema: string;
  propertyName: string; // The property name in the parent schema that creates this relationship
  cardinality: 'one' | 'many';
  canCreate?: boolean;  // Can new instances be created in this relationship?
  canDelete?: boolean;  // Can existing instances be deleted from this relationship?
}

/**
 * Describes individual properties within a schema for form field generation
 * 
 * Each property becomes a form field with its own UI component, validation rules,
 * and configuration, enabling reusable form components across all schemas.
 */
interface PropertyDefinition {
  name: string;
  zodType: z.ZodSchema;
  uiConfig: {
    component_type: string;
    title: string;
    description?: string;
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
    validation?: any;
  };
}

/**
 * Central registry for schema-driven UI generation
 * 
 * Provides a single point of access for all schema information with lazy loading
 * and caching of expensive relationship discovery operations.
 */
class SchemaRegistry {
  private schemas = new Map<string, SchemaDefinition>();
  private relationshipGraph = new Map<string, SchemaRelationship[]>();

  constructor() {
    this.buildSchemaRegistry();
  }

  /**
   * Initialize the registry by discovering all available schemas and their relationships
   * 
   * This creates a truly self-maintaining system that scales with schema additions
   * by leveraging the generator's knowledge of what schemas exist.
   */
  private buildSchemaRegistry() {
    // Register all schemas found in the generated SchemaConfigs
    for (const config of SchemaConfigs) {
      this.schemas.set(config.name, {
        name: config.name,
        schema: config.schema,
        uiMetadata: {}, // Populated on-demand for performance
        relationships: [] // Populated after all schemas are registered
      });
    }

    // Discover relationships after all schemas are registered
    this.buildRelationshipGraph(SchemaConfigs);
    
    // Update each schema with its discovered relationships
    for (const config of SchemaConfigs) {
      const schemaInfo = this.schemas.get(config.name);
      if (schemaInfo) {
        schemaInfo.relationships = this.relationshipGraph.get(config.name) || [];
      }
    }
  }

  /**
   * Discover relationships between schemas by analyzing their properties
   * 
   * This creates a complete relationship graph that enables dynamic UI generation.
   * For example, if TaskGroup has a 'children' property that references Task schema,
   * then TaskGroup can contain Task, and the UI can automatically show "Add Task" buttons.
   */
  private buildRelationshipGraph(schemaConfigs: Array<{name: string, schema: z.ZodSchema}>) {
    this.relationshipGraph.clear();
    
    // Initialize empty relationship lists for all schemas
    schemaConfigs.forEach(config => {
      this.relationshipGraph.set(config.name, []);
    });

    // Pass 1: Find forward relationships (array properties that reference other schemas)
    // This discovers patterns like: taskgroups → TaskGroup, exported_fields → Field
    for (const parentConfig of schemaConfigs) {
      if (parentConfig.schema instanceof z.ZodObject) {
        const shape = parentConfig.schema.shape;
        
        if (shape) {
          for (const [propertyName, propertySchema] of Object.entries(shape)) {
            // Skip 'parents' properties - they're handled in Pass 2 to avoid circular logic
            if (propertyName === 'parents' || propertyName === 'editable_in') {
              continue;
            }
            
            const relationships = this.extractRelationshipsFromProperty(
              propertyName, 
              propertySchema as z.ZodSchema, 
              schemaConfigs
            );
            
            // Add discovered relationships to the parent schema
            const parentRelationships = this.relationshipGraph.get(parentConfig.name) || [];
            parentRelationships.push(...relationships);
            this.relationshipGraph.set(parentConfig.name, parentRelationships);
          }
        }
      }
    }

    // Pass 2: Process 'parents' properties to create inverse containment relationships
    // This ensures bidirectional relationships are properly established
    for (const childConfig of schemaConfigs) {
      if (childConfig.schema instanceof z.ZodObject) {
        const shape = childConfig.schema.shape;
        
        for (const [propertyName, propertySchema] of Object.entries(shape)) {
          if (propertyName === 'parents') {
            const parentSchemas = this.findSchemaReferences(propertySchema as z.ZodSchema, schemaConfigs);
            
            // For each parent schema, add inverse "contains" relationship
            for (const parentSchemaName of parentSchemas) {
              const parentRelationships = this.relationshipGraph.get(parentSchemaName) || [];
              
              // Avoid duplicate relationships
              const existingRelationship = parentRelationships.find(rel => 
                rel.type === 'contains' && 
                rel.targetSchema === childConfig.name
              );
              
              if (!existingRelationship) {
                parentRelationships.push({
                  type: 'contains',
                  targetSchema: childConfig.name,
                  propertyName: 'parents',
                  cardinality: 'many',
                  canCreate: true,
                  canDelete: true
                });
                
                this.relationshipGraph.set(parentSchemaName, parentRelationships);
              }
              
              // Also add the reverse reference relationship to child
              const childRelationships = this.relationshipGraph.get(childConfig.name) || [];
              const existingChildRef = childRelationships.find(rel =>
                rel.type === 'references' &&
                rel.targetSchema === parentSchemaName &&
                rel.propertyName === 'parents'
              );
              
              if (!existingChildRef) {
                childRelationships.push({
                  type: 'references',
                  targetSchema: parentSchemaName,
                  propertyName: 'parents',
                  cardinality: 'one',
                  canCreate: false,
                  canDelete: false
                });
                
                this.relationshipGraph.set(childConfig.name, childRelationships);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Analyze a schema property to determine what relationships it creates
   * 
   * Only array properties that reference other schemas create containment relationships.
   * This enables the UI to know what types of objects can be added to each container.
   */
  private extractRelationshipsFromProperty(
    propertyName: string, 
    propertySchema: z.ZodSchema, 
    schemaConfigs: Array<{name: string, schema: z.ZodSchema}>
  ): SchemaRelationship[] {
    const relationships: SchemaRelationship[] = [];
    
    // Unwrap Zod wrappers to get to the core type
    // This handles .optional(), .nullable(), and .default() wrappers
    let baseSchema = propertySchema;
    while (baseSchema instanceof z.ZodOptional || 
           baseSchema instanceof z.ZodNullable || 
           baseSchema instanceof z.ZodDefault) {
      if (baseSchema instanceof z.ZodDefault) {
        baseSchema = baseSchema._def.innerType; // ZodDefault doesn't have unwrap()
      } else {
        baseSchema = baseSchema.unwrap();
      }
    }
    
    // Handle union types (like TaskGroup.children which can be TaskGroup[] | Task[])
    if (baseSchema instanceof z.ZodUnion) {
      for (const option of baseSchema.options) {
        if (option instanceof z.ZodArray) {
          const referencedSchemas = this.findSchemaReferences(option.element, schemaConfigs);
          for (const referencedSchema of referencedSchemas) {
            relationships.push({
              type: 'contains',
              targetSchema: referencedSchema,
              propertyName: propertyName,
              cardinality: 'many',
              canCreate: true,
              canDelete: true
            });
          }
        }
      }
    }
    // Handle direct array types (like taskgroups: TaskGroup[])
    else if (baseSchema instanceof z.ZodArray) {
      const referencedSchemas = this.findSchemaReferences(baseSchema.element, schemaConfigs);
      for (const referencedSchema of referencedSchemas) {
        relationships.push({
          type: 'contains',
          targetSchema: referencedSchema,
          propertyName: propertyName,
          cardinality: 'many',
          canCreate: true,
          canDelete: true
        });
      }
    }
    
    return relationships;
  }

  /**
   * Find which registered schemas are referenced by a given Zod schema
   * 
   * This uses reference equality to match schemas, which works because each schema
   * is a unique object instance. Handles circular references safely through visited tracking.
   */
  private findSchemaReferences(
    schema: z.ZodSchema, 
    schemaConfigs: Array<{name: string, schema: z.ZodSchema}>,
    visited: Set<z.ZodSchema> = new Set()
  ): string[] {
    // Prevent infinite recursion in circular schemas
    if (visited.has(schema)) {
      return [];
    }
    visited.add(schema);
    
    const references: string[] = [];
    
        // Unwrap optional and nullable schemas first
    let unwrappedSchema = schema;
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
      unwrappedSchema = schema.unwrap();
    }
    
    // Handle lazy schemas used for circular dependencies (like TaskGroup containing TaskGroup)
    if (unwrappedSchema instanceof z.ZodLazy) {
      try {
        const lazyType = unwrappedSchema._def.getter();
        // Use reference equality to match against registered schemas
        for (const config of schemaConfigs) {
          if (lazyType === config.schema) {
            references.push(config.name);
            break;
          }
        }
      } catch (e) {
        // Lazy evaluation can fail during introspection - safe to ignore
      }
    }
    // Check for direct schema references using reference equality
    else {
      for (const config of schemaConfigs) {
        if (unwrappedSchema === config.schema) {
          references.push(config.name);
          break;
        }
      }
    }
    
    // Recursively analyze union types
    if (unwrappedSchema instanceof z.ZodUnion) {
      for (const option of unwrappedSchema.options) {
        references.push(...this.findSchemaReferences(option, schemaConfigs, visited));
      }
    }
    
    visited.delete(schema); // Clean up for sibling searches
    return [...new Set(references)]; // Remove duplicates
  }

  /**
   * Get schemas that can be created as children of a given parent schema
   * 
   * This powers dynamic "Add X to Y" button generation in the UI by enforcing
   * business rules about what can contain what.
   */
  getAddableChildren(parentSchema: string): string[] {
    const relationships = this.relationshipGraph.get(parentSchema) || [];
    return relationships
      .filter(rel => rel.type === 'contains' && rel.canCreate)
      .map(rel => rel.targetSchema);
  }

  /**
   * Get form field definitions for a schema using automatic introspection
   * 
   * This eliminates the need to manually define form fields for each schema,
   * ensuring forms stay in sync with schema changes and enabling truly dynamic UIs.
   */
  getPropertyDefinitions(schemaName: string): PropertyDefinition[] {
    const schemaDefinition = this.schemas.get(schemaName);
    if (!schemaDefinition) return [];

    return extractFieldsFromSchema(schemaDefinition.schema, schemaName);
  }

  /**
   * Get form field definitions for any Zod schema (including nested objects)
   * 
   * This enables recursive form generation for nested objects without requiring
   * the nested schema to be registered in the schema registry.
   */
  getPropertyDefinitionsForZodSchema(zodSchema: z.ZodSchema): PropertyDefinition[] {
    // Unwrap optional/nullable schemas to get to the actual schema
    let unwrappedSchema = zodSchema;
    while (unwrappedSchema instanceof z.ZodOptional || 
           unwrappedSchema instanceof z.ZodNullable || 
           unwrappedSchema instanceof z.ZodDefault) {
      if (unwrappedSchema instanceof z.ZodDefault) {
        unwrappedSchema = unwrappedSchema._def.innerType;
      } else {
        unwrappedSchema = unwrappedSchema.unwrap();
      }
    }
    
    return extractFieldsFromSchema(unwrappedSchema);
  }

  /**
   * Validate a field value using its Zod schema
   * 
   * This uses the actual Zod validation instead of duplicating rules in the UI.
   */
  validateField(zodSchema: z.ZodSchema, value: any): { isValid: boolean; error?: string } {
    try {
      zodSchema.parse(value);
      return { isValid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          isValid: false, 
          error: error.errors[0]?.message || 'Invalid value' 
        };
      }
      return { isValid: false, error: 'Validation failed' };
    }
  }

  /**
   * Get all relationships for a schema (what it can contain, what it references)
   * 
   * This enables advanced UI features like relationship visualizations and allows
   * components to understand their context in the larger data model.
   */
  getRelationships(schemaName: string): SchemaRelationship[] {
    return this.relationshipGraph.get(schemaName) || [];
  }

  /**
   * Get all available schema names in the registry
   * 
   * This enables truly dynamic discovery without hardcoding schema lists,
   * allowing components to iterate over schemas without knowing them in advance.
   */
  getAllSchemaNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get schemas that have no parents - these are the root schemas
   * 
   * This identifies true root schemas that should be displayed at the top level,
   * serving as natural starting points for building hierarchical structures.
   */
  getParentlessSchemas(): string[] {
    const allSchemas = this.getAllSchemaNames();
    const childSchemas = new Set<string>();
    
    // Find all schemas that are targets of 'contains' relationships
    for (const relationships of this.relationshipGraph.values()) {
      for (const relationship of relationships) {
        if (relationship.type === 'contains') {
          childSchemas.add(relationship.targetSchema);
        }
      }
    }
    
    // Return schemas that are not children of any other schema
    return allSchemas.filter(schema => !childSchemas.has(schema));
  }
}

/**
 * Global singleton instance of the schema registry
 * 
 * Ensures consistent schema information across the entire application and provides
 * a stable API that components can depend on. Schema discovery happens automatically
 * on first import, making all registered schemas and their relationships available.
 */
export const schemaRegistry = new SchemaRegistry();

/**
 * Create a simple default object for a given schema name
 * 
 * Creates a minimal object with ID and children array. Schema type detection
 * happens automatically via detectSchemaType() based on object structure,
 * maintaining schema independence as outlined in agent_context.md
 */
export const createDefaultObject = (schemaName: string): any => {
  const obj: any = {
    id: `${schemaName.toLowerCase()}_${Date.now()}`,
    '@type': schemaName // enumerable since schemas include '@type': z.string().optional()
  };
  
  // Only add children array if the schema supports it
  const properties = schemaRegistry.getPropertyDefinitions(schemaName);
  const hasChildrenProperty = properties.some(prop => prop.name === 'children');
  
  if (hasChildrenProperty) {
    obj.children = [];
  }
  
  return obj;
};

/**
 * Detect the schema type of an object by matching its structure against registered schemas
 * 
 * This enables automatic schema type detection without hardcoding property checks,
 * making the system truly schema-driven and adaptable to schema changes.
 */
export const detectSchemaType = (obj: any): string | null => {
  if (!obj || typeof obj !== 'object') return null;
  
  // JSON-LD standard: just return @type
  if (obj['@type'] && typeof obj['@type'] === 'string') {
    const allSchemas = schemaRegistry.getAllSchemaNames();
    if (allSchemas.includes(obj['@type'])) {
      return obj['@type'];
    }
  }
  
  // Log warning if @type is missing - violates JSON-LD design principle
  if (!obj['@type']) {
    logger.warn('schema-registry', 
      `Schema object missing @type property. All schema objects should include @type for JSON-LD compliance.`, 
      'forms', 
      { objectKeys: Object.keys(obj), sampleData: obj }
    );
    
    // Since all schema objects should have @type, missing @type likely means
    // this is a configuration object or malformed data, not a schema object
    return null;
  }
  
  // If we reach here, @type was present but didn't match any registered schema
  // This could happen with stale data or unregistered schemas
  logger.debug('schema-registry', 
    `Object has @type "${obj['@type']}" but no matching registered schema found.`, 
    'forms',
    { type: obj['@type'], availableSchemas: schemaRegistry.getAllSchemaNames() }
  );
  
  return null;
};

/**
 * Type exports for components that need to work with schema registry data structures
 */
export type { SchemaDefinition, SchemaRelationship, PropertyDefinition };

/**
 * Schema-Agnostic Configuration Detection Utilities
 * 
 * These functions detect configuration objects based on their structural properties
 * rather than hardcoded schema names, maintaining schema independence as outlined
 * in agent_context.md: "do not hardcode schema names, it breaks schema independence"
 */

/**
 * Detects if an object is a filename component configuration
 * 
 * SCHEMA INDEPENDENCE: Identifies filename components by checking for the presence
 * of `filename_component: true` property and `order` number, as specified in
 * agent_context.md: "Look for objects with a `filename_component: true` property"
 * 
 * Use this for:
 * - Backend filename generation logic
 * - Processing children arrays to find filename configuration
 * - Schema-agnostic detection without hardcoded type names
 * 
 * @param obj - Object to test
 * @returns Boolean indicating if obj is a filename component
 */
export const isFilenameComponent = (obj: any): boolean => {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof obj.filename_component === 'boolean' &&
    obj.filename_component === true &&
    typeof obj.order === 'number'
  );
};

/**
 * Detects if an object is an export configuration
 * 
 * SCHEMA INDEPENDENCE: Identifies export configurations by checking for properties
 * that indicate export-related functionality, without relying on schema names.
 * 
 * Use this for:
 * - Backend export logic
 * - Processing children arrays to find export configuration
 * - SAM authoring tools detecting configuration objects
 * 
 * @param obj - Object to test
 * @returns Boolean indicating if obj is an export configuration
 */
export const isExportConfiguration = (obj: any): boolean => {
  return !!(
    obj &&
    typeof obj === 'object' &&
    (
      typeof obj.enabled === 'boolean' ||
      typeof obj.name === 'string' ||
      typeof obj.value_immutable === 'boolean' ||
      typeof obj.default_immutable === 'boolean'
    )
  );
};

/**
 * Detects if an object should be rendered as a form input
 * 
 * SCHEMA INDEPENDENCE: Determines renderability by checking for the presence of
 * a `type` property, as specified in agent_context.md: "CLAIRE only renders
 * schema elements with `type` properties as form inputs"
 * 
 * Use this for:
 * - CLAIRE form renderers distinguishing inputs from configuration
 * - Filtering children arrays to separate fields from configuration objects
 * - Schema-agnostic form generation logic
 * 
 * @param obj - Object to test
 * @returns Boolean indicating if object should be rendered as form input
 */
export const isRenderableField = (obj: any): boolean => {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof obj.type === 'string'
  );
};

/**
 * Filters an array to extract only filename component configurations
 * 
 * SCHEMA INDEPENDENCE: Uses structural detection rather than schema name matching.
 * From agent_context.md: "Configuration objects in `children` arrays specify
 * which fields should be used in filename generation"
 * 
 * @param children - Array of child objects (typically from field.children)
 * @returns Array of filename component objects found in children
 */
export const extractFilenameComponents = (children?: any[]): any[] => {
  if (!Array.isArray(children)) return [];
  return children.filter(isFilenameComponent);
};

/**
 * Filters an array to extract only export configuration objects
 * 
 * SCHEMA INDEPENDENCE: Uses structural detection rather than schema name matching.
 * 
 * @param children - Array of child objects (typically from field.children)
 * @returns Array of export configuration objects found in children
 */
export const extractExportConfigurations = (children?: any[]): any[] => {
  if (!Array.isArray(children)) return [];
  return children.filter(isExportConfiguration);
};

/**
 * Detects configuration objects that should not be rendered
 * 
 * SCHEMA INDEPENDENCE: From agent_context.md: "Assume the object should not be
 * rendered if it lacks a `type` property". This is the inverse of isRenderableField.
 * 
 * Use this for:
 * - Filtering out configuration objects from rendering pipelines
 * - Backend processing of non-renderable metadata
 * 
 * @param obj - Object to test
 * @returns Boolean indicating if object is a configuration object
 */
export const isConfigurationObject = (obj: any): boolean => {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof obj.type !== 'string' // Lacks 'type' property = configuration object
  );
}; 