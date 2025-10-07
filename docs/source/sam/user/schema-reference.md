<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SOPTemplateSchema Reference

## Overview

The SOPTemplateSchema is the meta-schema that defines the structure and validation rules for all SOPs in the system. This reference provides complete documentation of all schema elements, properties, and validation rules.

## Schema Version

Current version: **2.0**

```yaml
# Schema declaration
'@context': https://schema.org
'@type': SoftwareApplication
additionalProperties: false  # Strict mode - no extra properties allowed
```

## Root Properties

### Required Metadata Properties

| Property | Type | Required | Description | Validation |
|----------|------|----------|-------------|------------|
| `id` | string | Yes | Unique identifier for the SOP | Must be unique across system |
| `name` | string | Yes | Short name for the SOP | Max 100 characters |
| `title` | string | Yes | Full descriptive title | Max 255 characters |
| `version` | string | Yes | Version number | Semantic versioning recommended |
| `author` | string | Yes | SOP author name | - |
| `approver` | string | Yes | SOP approver name | - |
| `date-published` | string | Yes | Publication date | ISO format: YYYY-MM-DD |
| `status` | enum | Yes | Current status | `draft`, `published`, `deprecated` |

### Bioschemas Properties

| Property | Type | Required | Description | Default |
|----------|------|----------|-------------|---------|
| `url` | string | Yes | SOP URL | Format: valid URI |
| `license` | string | Yes | License type | e.g., "MIT", "Apache-2.0" |
| `keywords` | array | Yes | Search keywords | Array of strings |
| `applicationCategory` | string | Yes | Protocol category | e.g., "Laboratory Protocol" |
| `bioschemas_type` | enum | No | Bioschemas type | `LabProtocol` |
| `conformsTo` | string | No | Schema profile URI | Bioschemas profile URL |

### Optional Metadata Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `description` | string | No | Detailed description |
| `date-deployed` | string | No | Deployment date (YYYY-MM-DD) |
| `requires` | array | No | Dependencies/requirements |

## Task Structure

### TaskGroups

Top-level container for organizing tasks. Rendered as cards in CLAIRE.

```yaml
taskgroups:
  - id: string         # Required, unique
    name: string       # Display name
    title: string      # Full title
    description: string # Description text
    ordinal: number    # Display order (1-n)
    ui_config: object  # UI configuration
    children: array    # Array of Tasks
```

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | No | Short display name |
| `title` | string | No | Full title |
| `description` | string | No | Help text |
| `ordinal` | number | No | Sort order (1-based) |
| `ui_config` | object | No | UI customization |
| `children` | array | Yes | Child Task objects |

### Tasks

Container for fields and nested tasks. Immediate children of TaskGroups render as tabs.

```yaml
'@type': Task
id: string
name: string
title: string
description: string
ordinal: number
parents: array        # Parent references
children: array       # Fields or nested Tasks
ui_config: object
```

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@type` | string | Yes | Must be "Task" |
| `id` | string | Yes | Unique identifier |
| `name` | string | No | Display name |
| `title` | string | No | Full title |
| `description` | string | No | Help text |
| `ordinal` | number | No | Sort order within parent |
| `parents` | array | No | Parent task IDs |
| `children` | array | No | Child elements |
| `ui_config` | object | No | UI customization |

## Field Types

### Basic Field

Input element for data collection.

```yaml
'@type': Field
id: string
name: string
title: string
description: string
type: string          # Data type
required: boolean
default: any
validation: object
children: array       # Configuration objects
```

### Field Data Types

| Type | Description | Additional Properties |
|------|-------------|----------------------|
| `string` | Text input | `minLength`, `maxLength`, `pattern`, `enum` |
| `number` | Numeric input | `min`, `max`, `multipleOf`, `unit` |
| `boolean` | Checkbox | - |
| `array` | Multiple values | `items`, `minItems`, `maxItems`, `uniqueItems` |
| `object` | Nested object | `properties` |
| `file` | File upload | `file_config` |

### String Field Properties

```yaml
type: "string"
format: "email|uri|date|time|datetime|uuid"  # Optional format
minLength: number
maxLength: number
pattern: "regex"      # Regular expression
enum: ["option1", "option2"]  # Allowed values
default: "default value"
```

### Number Field Properties

```yaml
type: "number"
min: number           # Minimum value
max: number           # Maximum value
multipleOf: number    # Step/increment
unit: "string"        # Display unit (°C, mL, etc.)
precision: number     # Decimal places
integer: boolean      # Integer only
```

### Boolean Field Properties

```yaml
type: "boolean"
default: true|false
```

### Array Field Properties

```yaml
type: "array"
items:
  type: "string|number|object"  # Item type
  enum: [...]         # If restricted values
minItems: number      # Minimum items
maxItems: number      # Maximum items
uniqueItems: boolean  # No duplicates
```

### File Field Properties

```yaml
type: "file"
file_config:
  accept: ".pdf,.jpg"  # Accepted file types
  maxSize: 10485760    # Max size in bytes
  multiple: boolean    # Multiple files allowed
  required: boolean    # File required
```

## Special Schema Objects

### Table

For tabular data entry with defined columns.

```yaml
'@type': Table
id: string
name: string
columns:              # Column definitions
  - id: string
    name: string
    type: string
    required: boolean
    validation: object
minRows: number       # Minimum rows
maxRows: number       # Maximum rows
```

**Column Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Column identifier |
| `name` | string | Column header |
| `type` | string | Data type |
| `required` | boolean | Required field |
| `enum` | array | Allowed values |
| `validation` | object | Validation rules |

### ImportTemplate

Defines structure for bulk data import.

```yaml
'@type': ImportTemplate
format: "csv|xlsx|json"
columns:
  - field: string     # Field mapping
    header: string    # Column header
    type: string      # Data type
    required: boolean
    enum: array       # Allowed values
```

## Configuration Objects

### ELNFilenameComponent

Marks fields for inclusion in generated filenames.

```yaml
'@type': ELNFilenameComponent
id: string
order: number         # Position in filename (1-n)
filename_component: true
```

**Usage:**
```yaml
- id: patient_id_field
  '@type': Field
  name: "Patient ID"
  type: "string"
  children:
    - id: patient_id_filename
      '@type': ELNFilenameComponent
      order: 1
      filename_component: true
```

### ExportConfiguration

Controls how fields are exported.

```yaml
'@type': ExportConfiguration
id: string
enabled: boolean      # Include in export
value_immutable: boolean  # Cannot change value
default_immutable: boolean  # Cannot change default
format: string        # Export format
```

## UI Configuration

### UIConfiguration Object

```yaml
ui_config:
  component_type: "card|field|table"  # Component type
  variant: "default|outlined|elevated"  # Style variant
  icon: "string"      # Icon name
  collapsible: boolean  # Can collapse
  defaultCollapsed: boolean  # Start collapsed
  showBorder: boolean  # Show border
  className: "string"  # CSS class
  style: object       # Inline styles
```

### Available Icons

Common laboratory and UI icons:

| Icon | Usage |
|------|-------|
| `flask` | General lab work |
| `beaker` | Chemical procedures |
| `microscope` | Microscopy |
| `dna` | Molecular biology |
| `thermometer` | Temperature |
| `clock` | Time-sensitive |
| `calendar` | Date-related |
| `file` | Documents |
| `database` | Data storage |
| `alert-triangle` | Warnings |
| `info` | Information |
| `check-circle` | Validation |
| `x-circle` | Errors |
| `settings` | Configuration |
| `user` | User-related |

## Validation Rules

### Field Validation

```yaml
validation:
  required: boolean
  min: number         # Minimum value/length
  max: number         # Maximum value/length
  minLength: number   # String minimum length
  maxLength: number   # String maximum length
  pattern: "regex"    # Regular expression
  enum: array         # Allowed values
  message: "string"   # Custom error message
  
  # Advanced
  precision: number   # Decimal places
  multipleOf: number  # Step value
  unique: boolean     # Unique value
  immutable: boolean  # Cannot change after set
```

### Cross-Field Validation

```yaml
schema_dependencies:
  cross_field_validations:
    - name: "validation_name"
      fields: ["field1", "field2"]
      condition:
        type: "comparison|calculation|conditional"
        operator: "equals|less_than|greater_than"
        formula: "expression"  # For calculations
      error_message: "Custom error message"
```

### Conditional Validation

```yaml
conditional_validation:
  - when:
      field: "trigger_field"
      equals: "value"
    then:
      field: "target_field"
      required: true
      validation:
        min: 10
        max: 100
```

## Schema Extensions

### Custom Properties

While `additionalProperties: false` prevents arbitrary properties, you can extend functionality through:

1. **UI Config**: Custom UI properties
2. **Validation**: Custom validation rules
3. **Children**: Configuration objects
4. **Metadata**: Using description fields

### Annotations

Allow user comments on any field:

```yaml
annotation: boolean   # Enable annotations
annotation_required: boolean  # Require annotation
annotation_maxLength: number  # Max annotation length
```

## JSON-LD Support

### Context and Types

All schema objects support JSON-LD annotations:

```yaml
'@context': "https://schema.org"
'@type': "SchemaType"
```

**Important:** The `@type` property is for development reference only. Do not use for application logic - use schema-driven approaches instead.

## Best Practices

### Schema Independence

✅ **DO:**
- Use explicit type declarations
- Define all properties needed
- Use schema registry for type detection
- Keep configuration in children arrays

❌ **DON'T:**
- Parse field IDs for logic
- Match on field names
- Hardcode schema assumptions
- Use @type for application logic

### Performance Considerations

1. **Limit nesting depth**: Maximum 4-5 levels
2. **Reasonable field counts**: <100 fields per SOP
3. **Optimize validation**: Simple patterns preferred
4. **Minimize cross-field validation**: Performance impact

### Maintainability

1. **Use semantic IDs**: Meaningful, descriptive
2. **Version appropriately**: Track all changes
3. **Document thoroughly**: Use descriptions
4. **Follow conventions**: Consistent patterns

## Validation Examples

### Email Validation

```yaml
type: "string"
format: "email"
validation:
  pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
  message: "Please enter a valid email address"
```

### URL Validation

```yaml
type: "string"
format: "uri"
validation:
  pattern: "^https?://.+"
  message: "URL must start with http:// or https://"
```

### Phone Number

```yaml
type: "string"
validation:
  pattern: "^\\+?[1-9]\\d{1,14}$"
  message: "Enter valid international phone number"
```

### Custom Pattern

```yaml
type: "string"
validation:
  pattern: "^[A-Z]{3}-[0-9]{4}-[A-Z]{2}$"
  message: "Format: ABC-1234-XY"
```

## Error Messages

### Standard Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| `REQUIRED_FIELD` | Required field missing | "This field is required" |
| `TYPE_MISMATCH` | Wrong data type | "Expected number, got string" |
| `PATTERN_MISMATCH` | Regex validation failed | "Does not match required pattern" |
| `RANGE_ERROR` | Value out of range | "Value must be between X and Y" |
| `LENGTH_ERROR` | String length invalid | "Must be at least X characters" |
| `ENUM_ERROR` | Value not in allowed list | "Must be one of: [values]" |
| `UNIQUE_ERROR` | Duplicate value | "This value already exists" |

### Custom Messages

Always provide user-friendly error messages:

```yaml
validation:
  required: true
  message: "Patient ID is required for all samples"
  
  pattern: "^P[0-9]{6}$"
  message: "Patient ID must be P followed by 6 digits (e.g., P123456)"
```

## Migration Guide

### From Version 1.x to 2.0

Key changes:
1. Strict mode enforced (`additionalProperties: false`)
2. Bioschemas properties required
3. `@type` annotations added
4. UI config standardized

Migration steps:
1. Add required Bioschemas fields
2. Move custom properties to children
3. Update validation rules
4. Test thoroughly

## Summary

The SOPTemplateSchema provides:

- **Strict validation**: Ensures data integrity
- **Flexible structure**: Supports complex protocols
- **UI customization**: Rich presentation options
- **Schema independence**: Future-proof design
- **Standards compliance**: Bioschemas/JSON-LD support

## Next Steps

- [Create your first SOP](creating-sops.md)
- [View examples](examples.md)
- [Validate SOPs](validation.md)
- [Deploy to production](deployment.md)
