<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Creating SOPs in SAM

## Overview

This guide provides step-by-step instructions for creating Standard Operating Procedures (SOPs) in SAM that can be rendered as interactive data collection forms in CLAIRE.

## Understanding SOP Structure

### Core Components

Every SOP consists of three main parts:

1. **Metadata**: Basic information about the SOP (ID, version, author, etc.)
2. **Task Groups**: Logical groupings of related tasks (rendered as cards in CLAIRE)
3. **Fields**: Data input elements within tasks

### Hierarchical Organization

```
SOP
├── Metadata
├── Task Groups (Cards)
│   ├── Tasks (Tabs)
│   │   ├── Fields (Input Elements)
│   │   └── Nested Tasks (Recursive Cards)
└── Configuration Objects
```

## Step-by-Step Creation Process

### Step 1: Access SAM Editor

1. Navigate to SAM application
2. Click "New SOP" or "Create SOP"
3. The editor will open with a blank template

### Step 2: Define Metadata

Fill in the required metadata fields:

```yaml
id: "SOP_001"
name: "Cell Culture Protocol"
title: "Standard Cell Culture Maintenance Protocol"
version: "1.0.0"
author: "Dr. Jane Smith"
approver: "Lab Director"
date-published: "2024-01-15"
status: "draft"
url: "https://example.com/sops/cell-culture"
license: "MIT"
keywords: ["cell culture", "maintenance", "protocol"]
applicationCategory: "Laboratory Protocol"
```

#### Metadata Best Practices

- **ID**: Use a consistent naming convention (e.g., "SOP_XXX" or "DEPT_PROTOCOL_XXX")
- **Version**: Follow semantic versioning (MAJOR.MINOR.PATCH)
- **Status**: Start with "draft", change to "published" when approved
- **Keywords**: Include searchable terms for easy discovery

### Step 3: Create Task Groups

Task groups organize your SOP into logical sections. Each group becomes a card in CLAIRE.

```yaml
taskgroups:
  - id: general_info_group
    name: "General Information"
    title: "Experiment General Information"
    description: "Basic information about the experiment"
    ordinal: 1
    children:
      # Tasks go here
```

### Step 4: Add Tasks

Tasks are the immediate children of task groups and render as tabs in CLAIRE:

```yaml
children:
  - id: project_info_task
    '@type': Task
    name: "Project Info"
    title: "Project Information"
    description: "Project and experiment details"
    ordinal: 1
    children:
      # Fields go here
```

### Step 5: Define Fields

Fields are the actual data input elements:

```yaml
children:
  - id: project_id_field
    '@type': Field
    name: "Project ID"
    title: "Project Identifier"
    description: "Unique identifier for this project"
    type: "string"
    required: true
    validation:
      pattern: "^PROJ-[0-9]{4}$"
      message: "Must follow format: PROJ-XXXX"
```

## Field Types and Configuration

### Basic Field Types

| Type | Usage | Example Configuration |
|------|-------|----------------------|
| `string` | Text input | `type: "string"` |
| `number` | Numeric values | `type: "number", min: 0, max: 100` |
| `boolean` | Yes/No checkbox | `type: "boolean"` |
| `date` | Date picker | `type: "string", format: "date"` |
| `datetime` | Date and time | `type: "string", format: "datetime"` |
| `file` | File upload | `type: "file", file_config: { accept: ".pdf" }` |

### Advanced Field Configuration

#### Dropdown/Select Fields

```yaml
- id: sample_type_field
  '@type': Field
  name: "Sample Type"
  type: "string"
  enum: ["Blood", "Tissue", "Cell Culture", "Other"]
  default: "Blood"
```

#### Numeric Fields with Units

```yaml
- id: temperature_field
  '@type': Field
  name: "Temperature"
  type: "number"
  unit: "°C"
  min: -80
  max: 100
  description: "Storage temperature in Celsius"
```

#### Array Fields (Multiple Values)

```yaml
- id: reagents_field
  '@type': Field
  name: "Reagents Used"
  type: "array"
  items:
    type: "string"
  minItems: 1
  maxItems: 10
```

#### File Upload Fields

```yaml
- id: protocol_doc_field
  '@type': Field
  name: "Protocol Document"
  type: "file"
  file_config:
    accept: ".pdf,.docx"
    maxSize: 10485760  # 10MB in bytes
    multiple: false
```

## Special Configuration Objects

### ELN Filename Components

To include field values in the generated ELN filename:

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

### Export Configuration

To control how fields are exported:

```yaml
- id: sensitive_data_field
  '@type': Field
  name: "Sensitive Data"
  type: "string"
  children:
    - id: sensitive_export_config
      '@type': ExportConfiguration
      enabled: false  # Don't export this field
      value_immutable: true
```

## Tables

For tabular data entry:

```yaml
- id: sample_table
  '@type': Table
  name: "Sample Information"
  columns:
    - name: "Sample ID"
      type: "string"
      required: true
    - name: "Volume (mL)"
      type: "number"
      min: 0
    - name: "Concentration (mg/mL)"
      type: "number"
      min: 0
  minRows: 1
  maxRows: 20
```

## Validation Rules

### Field-Level Validation

```yaml
validation:
  required: true
  minLength: 3
  maxLength: 50
  pattern: "^[A-Z][a-zA-Z0-9-]*$"
  message: "Must start with capital letter"
```

### Cross-Field Validation

```yaml
schema_dependencies:
  cross_field_validations:
    - name: "date_validation"
      fields: ["start_date", "end_date"]
      condition: "start_date <= end_date"
      error_message: "End date must be after start date"
```

## UI Configuration

Control the appearance of elements:

```yaml
ui_config:
  component_type: "card"
  variant: "outlined"
  icon: "beaker"
  collapsible: true
  defaultCollapsed: false
  className: "important-section"
```

### Available Icons

Common icons for laboratory procedures:
- `flask` - General lab work
- `beaker` - Chemical procedures
- `microscope` - Microscopy
- `dna` - Molecular biology
- `thermometer` - Temperature-related
- `clock` - Time-sensitive procedures
- `alert-triangle` - Warnings
- `info` - Information sections

## Complete Example

Here's a complete minimal SOP:

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: EXAMPLE_001
name: "Example Protocol"
title: "Example Laboratory Protocol"
version: "1.0.0"
author: "Lab User"
approver: "Lab Manager"
date-published: "2024-01-20"
status: "draft"
url: "https://example.com/sops/example"
license: "MIT"
keywords: ["example", "template"]
applicationCategory: "Laboratory Protocol"

taskgroups:
  - id: main_group
    name: "Main Procedures"
    title: "Main Laboratory Procedures"
    ordinal: 1
    children:
      - id: setup_task
        '@type': Task
        name: "Setup"
        title: "Experiment Setup"
        ordinal: 1
        children:
          - id: exp_date_field
            '@type': Field
            name: "Experiment Date"
            type: "string"
            format: "date"
            required: true
          
          - id: operator_field
            '@type': Field
            name: "Operator"
            type: "string"
            required: true
            
      - id: procedure_task
        '@type': Task
        name: "Procedure"
        title: "Main Procedure"
        ordinal: 2
        children:
          - id: sample_id_field
            '@type': Field
            name: "Sample ID"
            type: "string"
            required: true
            children:
              - id: sample_id_filename
                '@type': ELNFilenameComponent
                order: 1
                filename_component: true
                
          - id: temperature_field
            '@type': Field
            name: "Temperature"
            type: "number"
            unit: "°C"
            min: -80
            max: 100
            required: true
```

## Testing Your SOP

### In SAM Editor

1. Use the **Preview** panel to see how your SOP will render
2. Click **Validate** to check for schema compliance
3. Use the **Debug Panel** to view the YAML/JSON structure
4. Test all field interactions

### Local Testing

1. Export your SOP as YAML
2. Save to `.local/s3/forms/sops/your-sop.yaml`
3. Start CLAIRE locally: `make start-dev`
4. Navigate to CLAIRE and test the form

## Common Patterns

### Multi-Step Procedures

```yaml
taskgroups:
  - id: procedure_group
    name: "Procedure"
    children:
      - id: step1_task
        '@type': Task
        name: "Step 1: Preparation"
        ordinal: 1
        # ... fields
      
      - id: step2_task
        '@type': Task
        name: "Step 2: Processing"
        ordinal: 2
        # ... fields
        
      - id: step3_task
        '@type': Task
        name: "Step 3: Analysis"
        ordinal: 3
        # ... fields
```

### Conditional Fields

While full conditional logic is limited, you can:

1. Group related optional fields together
2. Use clear descriptions indicating when fields apply
3. Use validation rules to enforce dependencies

### Reusable Components

For frequently used field sets:

1. Create template YAML snippets
2. Copy and modify IDs when reusing
3. Maintain consistent naming conventions

## Tips and Best Practices

### DO's

✅ **Use descriptive IDs**: Make them meaningful and unique
✅ **Add helpful descriptions**: Guide users on what to enter
✅ **Set appropriate validation**: Prevent invalid data entry
✅ **Test thoroughly**: Try edge cases and invalid inputs
✅ **Version appropriately**: Track changes with semantic versioning
✅ **Document special requirements**: Use field descriptions

### DON'Ts

❌ **Don't hardcode assumptions**: Keep fields schema-independent
❌ **Don't over-nest**: Keep hierarchy reasonable (max 3-4 levels)
❌ **Don't create huge forms**: Split into logical sections
❌ **Don't skip validation**: Always validate before deployment
❌ **Don't use special characters in IDs**: Stick to alphanumeric and underscores

## Next Steps

- [Validate your SOP](validation.md)
- [Deploy to CLAIRE](deployment.md)
- [View examples](examples.md)
- [Troubleshooting guide](troubleshooting.md)

## Getting Help

If you encounter issues:

1. Check the validation errors carefully
2. Compare with working examples
3. Use the debug panel to inspect structure
4. Consult the [schema reference](schema-reference.md)
5. Contact your system administrator
