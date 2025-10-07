<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SAM (by SYNDI) Primer

A concise introduction to SAM's core concepts, essential commands, and common patterns. This primer gives you the foundational knowledge needed to start creating SOPs effectively.

## Essential Setup Commands

### First Time Setup
```bash
# 1. Copy configs if they don't exist
cp -r infra/example-.config/* infra/.config/

# 2. Create local directories and deploy configs
make setup-local ENV=dev

# 3. Install dependencies
cd frontend && npm install && cd ..

# 4. Start the server
ENV=dev ORG=any make start-frontend

# 5. Access SAM at http://localhost:3000/sam
# Login: dev_user@local.dev / dev123
```

## Essential Concepts

### SOP Structure Hierarchy
```
SOP
├── Metadata (id, name, version, author, etc.)
├── Task Groups (rendered as cards)
│   ├── Tasks (rendered as tabs)
│   │   ├── Fields (input elements)
│   │   └── Nested Tasks (recursive cards)
└── Configuration Objects (non-rendered)
```

### Required Metadata Fields
- `id` - Unique identifier
- `name` - Short name  
- `title` - Full title
- `version` - Version number
- `author` - Author name
- `approver` - Approver name
- `date-published` - Publication date
- `status` - draft/published/deprecated
- `url` - SOP URL
- `license` - License type
- `keywords` - Search keywords array
- `applicationCategory` - Protocol category

## Field Types Quick Reference

| Type | Usage | Example |
|------|-------|---------|
| `string` | Text input | Names, IDs |
| `number` | Numeric values | Measurements |
| `boolean` | Checkbox | Yes/No |
| `date` | Date picker | Experiment date |
| `file` | File upload | Documents |
| `array` | Multiple values | Lists |

### Field Configuration Example
```yaml
- id: sample_field
  '@type': Field
  name: "Sample ID"
  type: "string"
  required: true
  validation:
    pattern: "^S[0-9]{6}$"
    message: "Format: S followed by 6 digits"
```

## Special Configuration Objects

### ELN Filename Component
```yaml
children:
  - id: field_filename
    '@type': ELNFilenameComponent
    order: 1
    filename_component: true
```

### Export Configuration
```yaml
children:
  - id: field_export
    '@type': ExportConfiguration
    enabled: true
    value_immutable: true
```

## Understanding Validation

### Common Validation Errors and How to Fix Them

| Error | Cause | Solution |
|-------|-------|----------|
| Missing required field | Required field not provided | Add the field |
| Type mismatch | Wrong data type | Fix quotes on numbers |
| Additional properties | Unknown fields | Remove or move to children |
| Invalid enum | Value not in list | Use allowed value |
| Pattern mismatch | Regex validation failed | Match required pattern |

### Validation Commands
```bash
# In SAM Editor
Click "Validate" button

# Command line
make validate-sop FILE=my-sop.yaml

# Validate all SOPs
make validate-all-sops DIR=.local/s3/forms/sops
```

## Deployment Workflow

### Local Development
```bash
# 1. Create/edit SOP in SAM
# 2. Export as YAML
# 3. Copy to local S3 simulation
cp my-sop.yaml .local/s3/forms/sops/

# 4. Test in CLAIRE
# Navigate to http://localhost:3000/claire
```

### Production Deployment
```bash
# 1. Validate thoroughly
make validate-sop FILE=my-sop.yaml

# 2. Deploy to staging
make rs-deploy-stage ORG=myorg

# 3. After testing, deploy to production
make rs-deploy-prod ORG=myorg
```

## Common Troubleshooting Solutions

### SOP Not Appearing
1. Check file location: `.local/s3/forms/sops/`
2. Verify `.yaml` extension
3. Restart CLAIRE: `make restart-claire`

### Validation Failures
1. Check all required fields present
2. Verify types (no quotes on numbers)
3. Ensure unique IDs
4. Remove extra properties

### Fields Not Rendering
1. Field must have `type` property
2. Check parent-child relationships
3. Verify UI configuration

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save/Autosave |
| Ctrl+N | New SOP |
| Ctrl+E | Export |
| Ctrl+V | Validate |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |

## Best Practices

### DO's
✅ Use descriptive IDs
✅ Validate after each section  
✅ Test locally first
✅ Version appropriately
✅ Document special requirements

### DON'Ts
❌ Hardcode field assumptions
❌ Skip validation
❌ Deploy without testing
❌ Use special characters in IDs
❌ Create huge forms (>100 fields)

## Example Minimal SOP

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: MINIMAL_001
name: "Minimal SOP"
title: "Minimal Example SOP"
version: "1.0.0"
author: "Your Name"
approver: "Approver Name"
date-published: "2024-01-20"
status: "draft"
url: "https://example.com/sops/minimal"
license: "MIT"
keywords: ["example", "minimal"]
applicationCategory: "Laboratory Protocol"

taskgroups:
  - id: main_group
    name: "Main"
    title: "Main Procedures"
    ordinal: 1
    children:
      - id: task_1
        '@type': Task
        name: "Data Entry"
        ordinal: 1
        children:
          - id: field_1
            '@type': Field
            name: "Sample ID"
            type: "string"
            required: true
```

## Getting Help

- **Documentation**: Full guides in this directory
- **Examples**: [examples.md](examples.md)
- **Schema Reference**: [schema-reference.md](schema-reference.md)
- **Troubleshooting**: [troubleshooting.md](troubleshooting.md)
- **Configuration**: [Frontend Configuration Guide](../../shared/system-admin/frontend-configuration.md)
