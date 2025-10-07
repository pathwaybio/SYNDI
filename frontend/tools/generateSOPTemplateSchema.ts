// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = path.resolve(__dirname, '../src/shared/schemas/SOPTemplateSchema.yaml');
const OUTPUT_PATH = path.resolve(__dirname, '../build/SOPTemplateSchema.ts');

if (process.argv.includes('--help')) {
  console.log(`Usage: npx ts-node frontend/tools/generateSOPTemplateSchema.ts`);
  process.exit(0);
}

console.log(`🔄 Generating ${OUTPUT_PATH}`);

if (!fs.existsSync(path.dirname(OUTPUT_PATH))) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
}

// Simple type mapping
const TYPE_MAP: Record<string, string> = {
  string: 'z.string()',
  number: 'z.number()',
  integer: 'z.number().int()',
  boolean: 'z.boolean()',
  date: 'z.coerce.date()',
  datetime: 'z.coerce.date()',
  array: 'z.array(z.any())',
  object: 'z.object({})',
  file: 'z.string()',
  integration: 'z.string()',
};

class SimpleZodGenerator {
  private definitions: Record<string, any> = {};
  private generatedSchemas = new Set<string>();
  private uiMetadata: Record<string, any> = {}; // Store UI metadata
  private processingStack: Set<string> = new Set(); // Track circular references

  constructor(private schema: Record<string, any>) {
    this.definitions = schema.definitions || {};
  }

  private safePropertyName(name: string): string {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `"${name}"`;
  }

  private extractUIMetadata(prop: any, propName: string): any {
    const metadata: any = {};
    
    // Extract basic metadata - prefer explicit title over generated label
    if (prop.title) {
      metadata.title = prop.title;
    } else {
      // Generate title from field name if no explicit title
      metadata.title = propName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    if (prop.description) metadata.description = prop.description;
    if (prop.required !== undefined) metadata.required = prop.required;
    
    // Extract UI configuration
    if (prop.ui_config) metadata.ui_config = prop.ui_config;
    
    // Extract enum options for selects
    if (prop.enum) {
      metadata.options = prop.enum.map((value: string) => ({ value, label: value }));
    }
    
    // Extract ALL validation metadata that affects UI
    if (prop.validation) {
      metadata.validation = prop.validation;
      
      // Extract specific validation rules for UI hints
      if (prop.validation.min_length) metadata.minLength = prop.validation.min_length;
      if (prop.validation.max_length) metadata.maxLength = prop.validation.max_length;
      if (prop.validation.pattern) metadata.pattern = prop.validation.pattern;
      if (prop.validation.email) metadata.inputType = 'email';
      if (prop.validation.url) metadata.inputType = 'url';
      if (prop.validation.min_value !== undefined) metadata.min = prop.validation.min_value;
      if (prop.validation.max_value !== undefined) metadata.max = prop.validation.max_value;
      if (prop.validation.min_items) metadata.minItems = prop.validation.min_items;
      if (prop.validation.max_items) metadata.maxItems = prop.validation.max_items;
      if (prop.validation.min_date) metadata.minDate = prop.validation.min_date;
      if (prop.validation.max_date) metadata.maxDate = prop.validation.max_date;
      if (prop.validation.custom_refinements) metadata.customRefinements = prop.validation.custom_refinements;
    }
    
    // Extract format hints
    if (prop.format) metadata.format = prop.format;
    
    // Handle $ref cases - if this is an object type that references another schema,
    // it should be treated as a nested object
    if (prop.$ref) {
      // For $ref fields, always treat as nested object unless explicitly overridden
      if (prop.ui_config?.component_type) {
        metadata.component_type = prop.ui_config.component_type;
      } else {
        metadata.component_type = 'nested-object';
      }
    } else {
      // Determine component type from field properties for non-$ref cases
      if (prop.ui_config?.component_type) {
        metadata.component_type = prop.ui_config.component_type;
      } else {
        metadata.component_type = this.inferComponentType(prop, propName);
      }
    }
    
    // Extract placeholder if available
    if (prop.placeholder) metadata.placeholder = prop.placeholder;
    
    // Extract default value
    if (prop.default !== undefined) metadata.default = prop.default;
    
    // Extract additional UI hints from validation
    if (prop.validation?.email || prop.format === 'email') {
      metadata.inputType = 'email';
    }
    if (prop.validation?.url || prop.format === 'uri') {
      metadata.inputType = 'url';
    }
    
    return metadata;
  }

  private inferComponentType(prop: any, propName: string): string {
    // Check UI config first
    if (prop.ui_config?.component_type) return prop.ui_config.component_type;
    
    // Infer from enum
    if (prop.enum) return 'select';
    
    // Infer from type and format
    if (prop.type === 'boolean') return 'checkbox';
    if (prop.type === 'number' || prop.type === 'integer') return 'number-input';
    if (prop.type === 'array') return 'tag-input'; // Tag input for arrays
    
    // Handle nested objects
    if (prop.type === 'object' && prop.properties) return 'nested-object';
    
    // Date handling - check format first
    if (prop.format === 'date' || prop.format === 'date-time') return 'date-picker';
    
    // String handling
    if (prop.type === 'string') {
      // Check validation rules for specific string types
      if (prop.validation?.email || prop.format === 'email') return 'email-input';
      if (prop.validation?.url || prop.format === 'uri') return 'url-input';
      if (prop.validation?.uuid) return 'input'; // Could be uuid-input if we had one
      
      // Large text areas
      if (prop.maxLength && prop.maxLength > 100) return 'textarea';
      
      // Password fields (if we had password validation)
      // if (prop.validation?.password) return 'password';
      
      return 'input';
    }
    
    return 'input';
  }

  private generateZodType(prop: any, propName: string = '', context: any = {}): string {
    // Store UI metadata for this field (for root fields and object properties, but not definitions)
    if (propName && (!context.isDefinition || context.isRoot || context.isObject)) {
      this.uiMetadata[propName] = this.extractUIMetadata(prop, propName);
    }

    // Handle preprocessing - NOW IMPLEMENTED
    if (prop.preprocess) {
      const innerType = this.generateZodTypeInner(prop, propName, context);
      return `z.preprocess(${prop.preprocess.function_name}, ${innerType})`;
    }

    return this.generateZodTypeInner(prop, propName, context);
  }

  private generateZodTypeInner(prop: any, propName: string = '', context: any = {}): string {
    // Handle enums
    if (prop.enum) {
      const values = prop.enum.map((v: string) => `'${v}'`).join(', ');
      return `z.enum([${values}])`;
    }

    // Handle $ref
    if (prop.$ref) {
      const refName = prop.$ref.split('/').pop() + 'Schema';
      const defName = prop.$ref.split('/').pop();
      
      // Check if we're currently processing this definition (circular reference)
      const isCircular = this.processingStack.has(defName);
      return isCircular ? `z.lazy((): z.ZodType<any> => ${refName})` : refName;
    }

    // Handle oneOf/anyOf
    if (prop.oneOf || prop.anyOf) {
      const schemas = (prop.oneOf || prop.anyOf).map((schema: any) => {
        if (schema.$ref) {
          const refName = schema.$ref.split('/').pop() + 'Schema';
          const defName = schema.$ref.split('/').pop();
          
          // Check if we're currently processing this definition (circular reference)
          const isCircular = this.processingStack.has(defName);
          return isCircular ? `z.lazy((): z.ZodType<any> => ${refName})` : refName;
        }
        return this.generateZodTypeInner(schema, propName, context);
      });
      return `z.union([${schemas.join(', ')}])`;
    }

    // Handle arrays
    if (prop.type === 'array') {
      let itemType = 'z.any()';
      if (prop.items) {
        if (prop.items.$ref) {
          const refName = prop.items.$ref.split('/').pop() + 'Schema';
          const defName = prop.items.$ref.split('/').pop();
          
          // Check if we're currently processing this definition (circular reference)
          const isCircular = this.processingStack.has(defName);
          itemType = isCircular ? `z.lazy((): z.ZodType<any> => ${refName})` : refName;
        } else {
          itemType = this.generateZodTypeInner(prop.items, propName + '_item', context);
        }
      }
      return `z.array(${itemType})`;
    }

    // Handle objects
    if (prop.type === 'object' && prop.properties) {
      return this.generateObjectType(prop);
    }

    // Handle basic types
    let baseType = TYPE_MAP[prop.type] || 'z.any()';

    // Apply validation if present
    if (prop.validation) {
      baseType = this.applyValidations(baseType, prop.validation);
    }
    
    // Apply format-based validation automatically
    if (prop.format === 'uri') {
      baseType += '.url()';
    }
    if (prop.format === 'email') {
      baseType += '.email()';
    }

    return baseType;
  }

  private generateObjectType(prop: any): string {
    const lines = ['z.object({'];
    const required = prop.required || [];

    // Add @type property for JSON-LD compatibility only if not already defined
    const hasExplicitType = prop.properties && ('@type' in prop.properties || '"@type"' in prop.properties);
    if (!hasExplicitType) {
      lines.push(`  '@type': z.string().optional(),`);
    }

    for (const [key, val] of Object.entries(prop.properties || {})) {
      const safeName = this.safePropertyName(key);
      let zodType = this.generateZodType(val, key, { isObject: true });

      // Apply default if present
      if ((val as any).default !== undefined) {
        const defaultVal = typeof (val as any).default === 'string' ? `'${(val as any).default}'` : JSON.stringify((val as any).default);
        zodType += `.default(${defaultVal})`;
      }

      // Apply optional if not required
      if (!required.includes(key as string)) {
        zodType += '.optional()';
      }

      lines.push(`  ${safeName}: ${zodType},`);
    }

    lines.push('})');
    
    // Apply strict mode if additionalProperties is false
    if (prop.additionalProperties === false) {
      lines.push('.strict()');
    }
    
    return lines.join('\n  ');
  }

  private applyValidations(baseType: string, validation: any): string {
    let result = baseType;

    // String validations
    if (validation.min_length) result += `.min(${validation.min_length})`;
    if (validation.max_length) result += `.max(${validation.max_length})`;
    if (validation.pattern) result += `.regex(/${validation.pattern}/)`;
    if (validation.email) result += '.email()';
    if (validation.url) result += '.url()';
    if (validation.uuid) result += '.uuid()';

    // Number validations  
    if (validation.min_value !== undefined) result += `.min(${validation.min_value})`;
    if (validation.max_value !== undefined) result += `.max(${validation.max_value})`;
    if (validation.positive) result += '.positive()';
    if (validation.non_negative) result += '.nonnegative()';

    // Array validations
    if (validation.min_items) result += `.min(${validation.min_items})`;
    if (validation.max_items) result += `.max(${validation.max_items})`;
    if (validation.unique_items) result += `.refine((arr) => new Set(arr).size === arr.length, { message: "Array items must be unique" })`;

    // Date validations
    if (validation.min_date) result += `.min(new Date('${validation.min_date}'))`;
    if (validation.max_date) result += `.max(new Date('${validation.max_date}'))`;

    // Custom refinements - NOW IMPLEMENTED
    if (validation.custom_refinements) {
      validation.custom_refinements.forEach((refinement: any) => {
        const escapedCondition = refinement.condition.replace(/'/g, "\\'");
        const escapedMessage = refinement.error_message.replace(/'/g, "\\'");
        result += `.refine((val) => ${escapedCondition}, { message: '${escapedMessage}' })`;
      });
    }

    // Transform - NOW IMPLEMENTED  
    if (validation.transform) {
      result += `.transform(${validation.transform.function_name})`;
    }

    return result;
  }

  private generateDefinition(name: string, def: any): string {
    if (this.generatedSchemas.has(name)) return '';
    this.generatedSchemas.add(name);

    const lines: string[] = [];
    if (def.description) {
      lines.push(`// ${def.description}`);
    }

    // Add to processing stack to detect circular references
    this.processingStack.add(name);
    let zodType = this.generateZodType(def, name, { isDefinition: true });
    
    // For object types with strict mode, we need to add @type support only if not explicitly defined
    const hasExplicitType = def.properties && ('@type' in def.properties || '"@type"' in def.properties);
    if (def.type === 'object' && def.additionalProperties === false && !zodType.includes("'@type'") && !hasExplicitType) {
      // Find the position right before .strict() - handle various formatting
      const strictMatch = zodType.match(/(\s*}\)\s*)(\.strict\(\))/s);
      if (strictMatch) {
        // Insert @type property before the closing brace
        const [fullMatch, beforeStrict, strictCall] = strictMatch;
        const insertPosition = zodType.lastIndexOf(fullMatch);
        const beforeBrace = zodType.substring(0, zodType.lastIndexOf('})'));
        const afterBrace = zodType.substring(zodType.lastIndexOf('})'));
        
        // Add comma if there are other properties
        const needsComma = beforeBrace.trim().endsWith('}') || beforeBrace.includes(': ');
        const comma = needsComma ? ',' : '';
        
        zodType = beforeBrace + comma + `\n    '@type': z.string().optional(),\n  ` + afterBrace;
      }
    }
    
    // Remove from processing stack when done
    this.processingStack.delete(name);
    
    lines.push(`export const ${name}Schema = ${zodType};`);
    lines.push('');

    return lines.join('\n');
  }

  public generate(): string {
    // Reset UI metadata for this generation
    this.uiMetadata = {};
    
    // Header
    const lines: string[] = [];
    lines.push("import { z } from 'zod';");
    lines.push('');
    
    if (this.schema.zod_generation?.schema_name) {
      lines.push(`// Generated Zod schema: ${this.schema.zod_generation.schema_name}`);
      lines.push('');
    }

    // Generate definitions in order (simple topological sort)
    const sortedDefs = this.sortDefinitions();
    for (const defName of sortedDefs) {
      const defCode = this.generateDefinition(defName, this.definitions[defName]);
      if (defCode) lines.push(defCode);
    }

    // Generate main schema
    const mainSchemaName = this.schema.zod_generation?.schema_name || 'SOPTemplateSchema';
    lines.push(`// Main SOP Template Schema`);
    lines.push(`export const ${mainSchemaName} = z.object({`);

    // Track root-level fields for separate export
    const rootFieldMetadata: Record<string, any> = {};

    // Process root properties
    for (const [key, prop] of Object.entries(this.schema)) {
      if (['definitions', 'zod_generation', 'schema_dependencies'].includes(key)) continue;

      const safeName = this.safePropertyName(key);
      let zodType: string;

      // Handle special case where prop is a raw value (like "@context": "https://schema.org")
      if (typeof prop === 'string') {
        zodType = `z.literal('${prop}')`;
        // Store metadata for raw string values
        this.uiMetadata[key] = {
          title: key.replace(/[-_@]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          component_type: 'input',
          default: prop
        };
      } else {
        zodType = this.generateZodType(prop, key, { isRoot: true });

        // Apply defaults
        if (prop.default !== undefined) {
          const defaultVal = typeof prop.default === 'string' ? `'${prop.default}'` : JSON.stringify(prop.default);
          zodType += `.default(${defaultVal})`;
        }

        // Root level required handling
        if (!prop.required) {
          zodType += '.optional()';
        }
      }

      lines.push(`  ${safeName}: ${zodType},`);
      
      // Store root field metadata separately
      if (this.uiMetadata[key]) {
        rootFieldMetadata[key] = this.uiMetadata[key];
      }
    }

    lines.push('})');

    // Apply strict mode if additionalProperties is false or if zod_generation.strict_mode is true
    if (this.schema.additionalProperties === false || this.schema.zod_generation?.strict_mode) {
      lines.push('.strict()');
    }

    // Add cross-field validations - NOW IMPLEMENTED
    if (this.schema.schema_dependencies?.cross_field_validations) {
      this.schema.schema_dependencies.cross_field_validations.forEach((validation: any) => {
        lines.push(`.refine((data) => {`);
        lines.push(`  // ${validation.name}`);
        lines.push(`  return ${validation.condition};`);
        lines.push(`}, {`);
        lines.push(`  message: "${validation.error_message}",`);
        lines.push(`  path: ["${validation.error_path || validation.fields[0]}"],`);
        lines.push(`})`);
      });
    }

    lines.push(';');
    lines.push('');

    // Generate UI metadata export
    lines.push('// UI Metadata for form generation');
    lines.push(`export const ${mainSchemaName}UIMetadata = ${JSON.stringify(this.uiMetadata, null, 2)};`);
    lines.push('');

    // Generate root fields metadata export
    lines.push('// Root-level fields metadata for main form');
    lines.push(`export const ${mainSchemaName}RootFields = ${JSON.stringify(rootFieldMetadata, null, 2)};`);
    lines.push('');

    // Generate type exports
    lines.push(`export type ${mainSchemaName}Type = z.infer<typeof ${mainSchemaName}>;`);
    lines.push('');

    // Generate schema registry for automatic discovery
    lines.push('// Schema registry for automatic discovery');
    lines.push('export const SchemaRegistry = {');
    for (const defName of sortedDefs) {
      lines.push(`  ${defName}: { name: '${defName}', schema: ${defName}Schema },`);
    }
    lines.push('};');
    lines.push('');
    
    // Generate schema configs array for easy iteration
    lines.push('// Schema configurations array for easy iteration');
    lines.push('export const SchemaConfigs = [');
    for (const defName of sortedDefs) {
      lines.push(`  { name: '${defName}', schema: ${defName}Schema },`);
    }
    lines.push(`  { name: '${mainSchemaName}', schema: ${mainSchemaName} },`);
    lines.push('];');
    lines.push('');

    return lines.join('\n');
  }

  private sortDefinitions(): string[] {
    // Simple dependency resolution
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      // Find dependencies
      const deps = this.findDependencies(this.definitions[name]);
      for (const dep of deps) {
        if (this.definitions[dep] && !visited.has(dep)) {
          visit(dep);
        }
      }

      sorted.push(name);
    };

    Object.keys(this.definitions).forEach(visit);
    return sorted;
  }

  private findDependencies(obj: any): string[] {
    const deps: string[] = [];
    const traverse = (current: any) => {
      if (current?.$ref) {
        const refName = current.$ref.split('/').pop();
        if (refName && this.definitions[refName]) {
          deps.push(refName);
        }
      }
      if (typeof current === 'object' && current !== null) {
        Object.values(current).forEach(traverse);
      }
      if (Array.isArray(current)) {
        current.forEach(traverse);
      }
    };
    traverse(obj);
    return [...new Set(deps)];
  }
}

function main() {
  try {
    const yamlContent = fs.readFileSync(INPUT_PATH, 'utf-8');
    const schema = yaml.load(yamlContent) as any;

    if (!schema || typeof schema !== 'object') {
      throw new Error('Invalid YAML schema structure');
    }

    const generator = new SimpleZodGenerator(schema);
    const output = generator.generate();

    fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
    
    console.log(`✅ Zod schema written to ${OUTPUT_PATH}`);
    
    const schemaName = schema.zod_generation?.schema_name || 'SOPTemplateSchema';
    const definitionCount = Object.keys(schema.definitions || {}).length;
    console.log(`📊 Generated schema '${schemaName}' with ${definitionCount} definitions`);

  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
