<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SAM System Design

**SOP Automation to Models** - Schema-driven SOP template creation system for laboratory workflow automation.

## System Overview

SAM provides dynamic SOP template creation through a client-hosted, schema-driven architecture. The system enables automated transformation of unstructured protocols into structured SOPs, leverages AI-driven automation, and supports hierarchical task organization with real-time validation.

**Core Value**: The SOP template schema enables automated transformation of unstructured protocols into structured SOPs. This was not feasible before LLMs, but even with LLMs, the well-defined SOP template data model is essential for achieving high-quality data generation for superior analytics and modeling.

## Architecture

See [Shared System Design](../../shared/design/index.md) for common infrastructure and authentication patterns.

### SAM-Specific Components

#### SOP Template Builder
- **SOPCreator**: Main orchestrator with schema-driven rendering
- **CollapsibleProperties**: Dynamic property form generation
- **ArrayPropertyHandler**: Schema-aware array management
- **SOPActionButtons**: Template operations (save, export, load, test data)

#### Legacy Components (Deprecated)
- **AdminEditor**: Legacy main orchestrator (being replaced by SOPCreator)
- **TaskGroupCard**: Recursive task group rendering with depth-based styling
- **TaskCard**: Individual task management and field containers
- **FieldCard**: Field configuration and data type selection

## Hierarchical Data Structure

SOP templates use a simplified, hierarchical structure for clear organization:

```
SOP Template
├── Basic Information (ID, Name, Title, Author, etc.)
├── Task Groups (Collapsible containers)
│   ├── Task Group Properties (ID, Name, Title, Description, Icon, Style)
│   ├── Nested Task Groups (Recursive structure)
│   └── Tasks
│       ├── Task Properties (ID, Name, Title, Description, Order, Icon, Style)
│       └── Fields/Variables
│           └── Field Properties (ID, Name, Title, Description, Type, Required, exported)
├── Import Requirements (Fields imported from other SOPs)
└── Metadata & Tags
```

## Schema-Driven Architecture

### Core Schema Registry
- **Automatic Relationship Discovery**: Schema registry discovers parent-child relationships
- **Dynamic Form Generation**: Forms generated entirely from schema introspection
- **Property Introspection**: Form fields automatically discovered from schemas
- **Type Safety**: Complete TypeScript coverage with schema-driven types

### Schema Patterns
```typescript
// Task ownership pattern (current design)
Task.children = [Field, Table, ImportedField]

// Field reference pattern
Field.parent = ["task1", "task2"]     // String IDs only
Field.readonly_in = ["task2"]         // Readonly in specific contexts
```

### Schema Registry Functions
- `getPropertyDefinitions()` - Extract field definitions from schemas
- `getRelationships()` - Discover schema relationships
- `getAddableChildren()` - Determine valid child types
- `getPropertyDefinitionsForZodSchema()` - Handle nested schemas

## Data Flow

### SOP Template Creation
```
Admin Authentication → Schema Discovery → Form Generation → 
Live Validation → Draft Autosave → Final Export → S3 Storage
```

### AI-Driven Template Generation
```
Upload Written Protocol → AI Analysis → Schema Extraction → 
Initial Template Generation → User Validation → Refinement → Final Template
```

## Advanced Features

### Conditional Fields
Fields that appear/disappear based on other field values:

```typescript
interface ConditionalField {
  condition: {
    targetField: string;
    operator: 'equals' | 'greater' | 'contains';
    value: any;
  };
  showWhen: boolean;
}
```

**Implementation Phases:**
1. **Phase 1**: Same-task conditionals only
2. **Phase 2**: Cross-task field references
3. **Phase 3**: Complex logic (AND/OR combinations)

### UI Configuration Editor
Allows SOP designers to customize field styling and layout:

- **Component Intelligence**: Auto-suggest components based on field types
- **Live Preview**: Real-time rendering of field configurations
- **Layout Grid**: Visual drag-and-drop field positioning
- **Template Library**: Pre-built layout patterns

### Table Editing Interface
Support for 2D data entry structures:

```typescript
interface TableSchema {
  id: string;
  layout: 'rows_as_samples' | 'columns_as_samples';
  fields: Array<FieldSchema>;
}
```

## YAML Schema Authoring

SOP template schema authored in YAML for simplicity:

- **Non-programmer Friendly**: YAML structure accessible to scientists
- **Code Generation**: Automatic TypeScript/Zod generation from YAML
- **Single Source of Truth**: Eliminates desynchronization
- **Version Control**: Easy to track changes in schema evolution

**Generation Process:**
```
YAML Schema → Code Generation Script → TypeScript + Zod → UI Components
```

## Visual Hierarchy

### Component Styling
- **Blue borders**: Task Groups (darker for root, lighter for nested)
- **Green borders**: Tasks
- **Purple borders**: Fields
- **Icons**: TestTube (Task Groups), Beaker (Tasks), Database/Settings (Properties)

### Collapsible Properties
All components include collapsible "Properties" sections:
- **Default State**: Expanded for immediate access
- **Visual Clutter**: Collapsible to reduce complexity
- **Context Icons**: Database (Task Groups/Tasks), Settings (Fields)

## Save Functionality

### Save Types
- **Save SOP Template**: Full validation via Zod schema, production-ready
- **Save Draft**: Bypasses validation, allows incomplete SOPs
- **Test Data Generation**: Automatic test data based on schema types
- **Load from File**: JSON/YAML import with error handling

### Validation Levels
- **Schema Validation**: Real-time Zod validation
- **Form Validation**: react-hook-form integration
- **Export Validation**: Full validation before final save
- **Draft Mode**: Graceful handling of incomplete data

## AI Integration

### Protocol Analysis
- **Document Upload**: Support for written laboratory protocols
- **Schema Extraction**: AI analysis to identify data elements
- **Template Generation**: Automatic SOP template creation
- **User Validation**: Human review and refinement of AI output

### MCP Integration
- **AI Agent**: MCP or similar for schema extraction
- **Field Detection**: Automatic identification of fields, tables, attachments
- **Relationship Discovery**: Detection of task hierarchies and dependencies

## Autosave System

### Comprehensive Implementation ✅
SAM now includes a production-ready autosave system with full configuration management and version browsing capabilities.

### Core Components
- **`useAutosave` Hook**: React Query integration with debounced saves and recovery logic
- **`AutosaveStatus`**: VS Code-style status indicators with manual save controls  
- **`AutosaveBrowser`**: Version browser for accessing previously saved drafts
- **`ConfigLoader`**: Environment-aware configuration management
- **`AutosaveStorage`**: Abstract storage with localStorage/sessionStorage implementations

### Storage Configuration
- **Type**: localStorage (SOP templates), sessionStorage (temporary)
- **Key Pattern**: `autosave[-env]:sop:${identifier}`
- **LRU Management**: Automatic cleanup when hitting storage limits
- **TTL**: 7-day expiry with automatic garbage collection

### Environment-Specific Settings
```json
{
  "dev": { "delay": 1000, "toastOnSave": true, "maxItems": 100 },
  "prod": { "delay": 5000, "toastOnSave": false, "maxItems": 50 },
  "test": { "enabled": false, "storage": "sessionStorage" }
}
```

### Integration
Zero-breaking-change integration requires only 2 lines in SOPCreator:
```typescript
const { state, actions } = useAutosave(form, { type: 'sop', identifier: form.watch('id') || 'new' });
<AutosaveStatus state={state} onManualSave={actions.manualSave} onAcceptRecovery={actions.acceptRecovery} />
```

### Recovery Workflow
- **Detection**: Automatic detection of unsaved changes on component mount
- **Prompt**: User-friendly recovery dialog with Recover/Discard options
- **Protection**: Anti-overwrite mechanism prevents accidental data loss during recovery
- **Version Browser**: Access to full history of saved drafts with search and metadata

### Technical Features
- **Debounced Saves**: Configurable delays (1s dev, 5s prod) with max-wait limits
- **Retry Logic**: Exponential backoff for failed saves with React Query integration
- **Storage Limits**: Intelligent LRU eviction when approaching localStorage quotas
- **Data Integrity**: Checksum validation and corruption detection
- **Schema Independence**: Works with any schema-driven form without hardcoded assumptions

## File Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── admin/                    # SOP template builder
│   │   │   ├── SOPCreator.tsx        # Schema-driven form builder ✨ with autosave
│   │   │   ├── CollapsibleProperties.tsx  # Dynamic property renderer
│   │   │   ├── CollapsableSchema.tsx # Nested schema renderer
│   │   │   ├── ArrayPropertyHandler.tsx   # Array management
│   │   │   ├── SOPActionButtons.tsx  # Action buttons
│   │   │   ├── TagInput.tsx          # Tag input component
│   │   │   ├── TaskGroupCard.tsx     # Legacy task group component
│   │   │   ├── TaskCard.tsx          # Legacy task component
│   │   │   ├── FieldCard.tsx         # Legacy field component
│   │   │   └── AdminFormUtils.ts     # Legacy utility functions
│   │   ├── ui/                       # ✨ Autosave UI components
│   │   │   ├── autosave-status.tsx   # VS Code-style status indicators
│   │   │   └── autosave-browser.tsx  # Version browser with search
│   │   └── schema/                   # Schema registry demo
│   │       └── SchemaRegistryDemo.tsx
│   ├── hooks/                        # ✨ Autosave logic
│   │   └── useAutosave.ts            # React Query + debounced saves + recovery
│   ├── lib/                          # ✨ Core autosave infrastructure  
│   │   ├── config-loader.ts          # Environment-aware configuration
│   │   └── autosave-storage.ts       # Abstract storage with LRU cache
│   ├── views/                        # Main application views
│   │   ├── SOPCreatorPage.tsx        # Main SOP creation interface
│   │   ├── SchemaRegistryDemoPage.tsx # Schema registry demo
│   │   ├── AdminEditor.tsx           # Legacy (unused)
│   │   └── SOPEditor.tsx             # Legacy (unused)
│   └── build/                        # Generated from YAML schema
│       └── SOPTemplateSchema.ts      # All schema definitions & UI metadata
├── config/webapp/             # ✨ frontend environment configurations
│   ├── dev.json                      # Development settings (1s saves, toasts)
│   ├── prod.json                     # Production settings (5s saves, conservative)
│   └── test.json                     # Test settings (autosave disabled)
infra/config/webapp/              # ✨ System-wide configuration files -- this needs attention
    ├── dev.json                      # Integrated with frontend/config/ during build
    ├── prod.json                     # Deployed to S3 in production
    └── test.json                     # Used by test fixtures
```

## SOP Template Schema

```typescript
const FieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'file', 'instrument']),
  required: z.boolean().optional(),
  mode: z.enum(['readonly', 'overrideable', 'editable']).optional(),
  mimetype: z.string().optional(),
});

const TableSchema = z.object({
  id: z.string(),
  layout: z.enum(['rows_as_samples', 'columns_as_samples']),
  fields: z.array(FieldSchema),
});

const AttachmentSchema = z.object({
  name: z.string(),
  mimetype: z.string(),
  required: z.boolean().optional(),
});

export const SOPTemplateSchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  fields: z.array(FieldSchema).optional(),
  tables: z.array(TableSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  requires: z.array(z.object({
    sop_id: z.string(),
    version: z.string(),
    import: z.array(FieldSchema.pick({ name: true, mode: true })),
  })).optional(),
});
```

## BioSchemas Integration

### Semantic Interoperability
- **JSON-LD Generation**: BioSchemas Protocol-compatible metadata
- **Schema.org Compliance**: Standard vocabulary for laboratory protocols
- **Metadata Enrichment**: Automatic metadata generation from SOP structure

### Approval Workflow
```
SOP Creation → Live Validation → Draft Saving → 
Peer Review → Approval → JSON-LD Generation → 
Publish to Forms S3 Bucket
```

## Implementation Status

### Completed Features
✅ Schema-driven form generation  
✅ Dynamic property introspection  
✅ Real-time validation  
✅ **Production autosave system with version browsing**  
✅ Template export/import  
✅ Hierarchical data structure  
✅ Component architecture  
✅ **Environment-aware configuration management**
✅ **VS Code-style UX with recovery workflows**

### In Progress
🚧 Conditional field implementation  
🚧 AI integration (PAUL)  

### Planned Features
📋 Visual workflow editor (https://reactflow.dev/examples/overview) 
- **Plugin Architecture**: Custom field types and validators for registry/equipment integration
- **API Integration**: External system connections

## Future Architectural Considerations

### Scalability
- **Component Library**: Reusable SOP editor components
- **Caching**: Template and schema caching strategies
- **State Management**: Consider Zustand for complex state

### Extensibility
- **Theme System**: Customizable visual design
- **Mobile Support**: Responsive design patterns

## Advanced Design Topics

```{toctree}
:maxdepth: 1
:titlesonly:

conditional-fields
ui-configuration
```

