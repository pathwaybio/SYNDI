<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SAM User Documentation

Welcome to the SAM (SOP Authoring to Models) user documentation. This comprehensive guide will help you create, validate, and deploy Standard Operating Procedures (SOPs) that can be rendered as interactive data collection forms in CLAIRE.

## Quick Start

To get started with SAM, you'll need to set up and run the development server first:

### Setup Instructions

1. **Initial Setup** (first time only):
   ```bash
   # If config files don't exist in infra/.config/, copy from examples:
   cp -r infra/example-.config/* infra/.config/
   # Customize as needed - see [Frontend Configuration Guide](../../shared/system-admin/frontend-configuration.md) below
   
   # Then run setup to create local directories and deploy configs:
   make setup-local ENV=dev
   ```

2. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

3. **Start the Development Server**:
   ```bash
   ENV=dev ORG=any make start-frontend
   # Or for the full stack with backend:
   ENV=dev ORG=any make start-dev
   ```

4. **Access SAM**:
   - Navigate to: `http://localhost:3000/sam`
   - Default credentials (when auth is enabled):
     - Email: `dev_user@local.dev`
     - Password: `dev123`

For detailed setup instructions:
- **Frontend Configuration**: [Frontend Configuration Guide](../../shared/system-admin/frontend-configuration.md) - Explains config structure and customization
- **General Configuration**: [Configuration Guide](../../shared/system-admin/configuration.md)
- **Deployment**: [System Admin Deployment Guide](../../shared/system-admin/deployment.md)

## Documentation Sections

```{toctree}
:maxdepth: 2
:titlesonly:

getting-started
primer
creating-sops
validation
deployment
examples
schema-reference
troubleshooting
```

## Overview

SAM is a schema-driven system for creating Standard Operating Procedures that ensures:
- **Consistency**: All SOPs follow the same validated structure
- **Quality**: Built-in validation prevents errors
- **Integration**: Seamless deployment to CLAIRE for data collection
- **Compliance**: Supports regulatory requirements for immutable data storage

## Where to Begin

New to SAM? Follow this learning path:

1. **[Launching Pad](getting-started.md)** - Install, configure, and start SAM (5 minutes)
2. **[SAM Primer](primer.md)** - Core concepts and essential commands
3. **[Examples](examples.md)** - Working templates to copy and modify
4. **[Full Creation Guide](creating-sops.md)** - Comprehensive SOP authoring documentation

## Key Features

### Schema-Driven Design
Create SOPs using a structured YAML format that ensures consistency and enables validation across all procedures.

### Real-Time Validation
Validate your SOPs against the SOPTemplateSchema to catch errors before deployment.

### Visual Editor
Use SAM's interactive form builder to create and edit SOPs with instant preview capabilities.

### Easy Deployment
Deploy validated SOPs to S3 buckets where CLAIRE can serve them as data collection forms.

## Workflow

The typical SOP creation workflow:

```
1. Create SOP in SAM Editor
2. Add task groups, tasks, and fields
3. Validate the structure
4. Preview and test
5. Export as YAML
6. Deploy to S3
7. Use in CLAIRE for data collection
```

## SOP Structure at a Glance

Here's a brief preview of how SOPs are structured. For detailed tutorials, see the [SAM Primer](primer.md) and [Full Creation Guide](creating-sops.md).

### Basic SOP Components

1. **Start with Metadata**: Every SOP needs basic information:
   ```yaml
   id: "MY_SOP_001"
   name: "My First SOP"
   title: "My Laboratory Protocol"
   version: "1.0.0"
   author: "Your Name"
   ```

2. **Add Task Groups**: Organize your procedure into logical sections:
   ```yaml
   taskgroups:
     - id: main_group
       name: "Main Procedures"
       children: [tasks go here]
   ```

3. **Define Tasks**: Each task group contains tasks (rendered as tabs):
   ```yaml
   - id: setup_task
     '@type': Task
     name: "Setup"
     ordinal: 1
     children: [fields go here]
   ```

4. **Add Fields**: The actual data input elements:
   ```yaml
   - id: date_field
     '@type': Field
     name: "Experiment Date"
     type: "string"
     format: "date"
     required: true
   ```

### Key Concepts to Remember

#### Schema Independence
- Never hardcode assumptions about field names
- Use schema properties for all logic
- Keep configuration in children arrays
- The `@type` is for reference only, not application logic

#### Field Types
- **Basic**: string, number, boolean
- **Special**: date, file, array
- **Complex**: tables, nested objects

#### Configuration Objects
Place these in `children` arrays - they won't render as inputs:
- `ELNFilenameComponent`: Include field in filename
- `ExportConfiguration`: Control export behavior

### Common Patterns

#### Multi-Step Procedures
Use ordinal numbers and clear task names:
```yaml
- name: "Step 1: Preparation"
  ordinal: 1
- name: "Step 2: Processing" 
  ordinal: 2
- name: "Step 3: Analysis"
  ordinal: 3
```

#### Required vs Optional Fields
```yaml
required: true   # User must fill this
required: false  # Optional field
```

#### Validation Rules
```yaml
validation:
  min: 0
  max: 100
  pattern: "^[A-Z]{3}-[0-9]{4}$"
  message: "Format: ABC-1234"
```

## Need Help?

- **Setup Issues**: [Environment Setup Guide](getting-started.md)
- **Learning SAM**: [SAM Primer](primer.md) - Core concepts and commands
- **Creating SOPs**: [Full Creation Guide](creating-sops.md)
- **Validation Issues**: [Validation Guide](validation.md)
- **Deployment**: [Deployment Guide](deployment.md)
- **Problems**: [Troubleshooting Guide](troubleshooting.md)
- **Technical Reference**: [Schema Reference](schema-reference.md)

## Documentation Overview

This guide provides everything you need to master SAM:

- **[Environment Setup](getting-started.md)** - Get SAM running on your system
- **[SAM Primer](primer.md)** - Learn the fundamentals
- **[Creation Guide](creating-sops.md)** - Detailed SOP authoring process
- **[Examples](examples.md)** - Copy and adapt working templates
- **[Validation](validation.md) & [Deployment](deployment.md)** - Test and publish your SOPs
- **[Troubleshooting](troubleshooting.md)** - Solve common issues

## Future Enhancements

**Coming Soon**: PAUL, an AI-powered system, will automatically generate SOP schemas from unstructured information and SYNDI schemas. Until then, this documentation focuses on manual SOP creation, validation, and deployment.

## Support

For additional help:
- Review the [troubleshooting guide](troubleshooting.md)
- Check the [examples](examples.md) for working templates
- Contact your system administrator
- Submit issues on GitHub