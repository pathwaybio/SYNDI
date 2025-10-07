<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SAM Developer Documentation

**SAM** (SOP Automation to Models) is the validation and authoring service for Standard Operating Procedures in the SYNDI ecosystem. This documentation covers the technical implementation, architecture, and development guidelines for the SAM frontend.

## Frontend Architecture

### Technology Stack
- **React 18** with TypeScript
- **Vite** for build tooling and development server
- **shadcn/ui** + **Radix UI** for component library
- **React Hook Form** + **Zod** for form validation
- **TanStack Query** for state management and caching
- **Tailwind CSS** for styling

### Directory Structure

```
frontend/src/
├── sam/                           # SAM-specific implementation
│   ├── components/                # SAM UI components
│   │   ├── SOPCreator.tsx        # Main SOP creation interface
│   │   ├── SOPActionButtons.tsx  # Action buttons for SOP operations
│   │   ├── ArrayPropertyHandler.tsx  # Array property management
│   │   ├── CollapsibleProperties.tsx # Property grouping UI
│   │   ├── CollapsableSchema.tsx     # Schema container component
│   │   ├── DynamicFormField.tsx      # Dynamic form field renderer
│   │   ├── DynamicSchemaCard.tsx     # Schema card component
│   │   └── TagInput.tsx              # Tag input component
│   ├── hooks/                     # SAM-specific hooks
│   │   └── useSOPTemplates.ts    # SOP template management
│   ├── lib/                       # SAM business logic
│   │   ├── schema-registry.ts    # Schema management and validation
│   │   └── schema-introspector.ts # Schema analysis utilities
│   ├── types/                     # SAM TypeScript types
│   │   └── index.ts              # Type definitions
│   └── views/                     # SAM pages/views
│       ├── SOPCreatorPage.tsx    # SOP creation page
│       └── UserForm.tsx          # User form interface
└── shared/                        # Shared across services
    ├── components/                # Shared UI components
    │   ├── ui/                   # shadcn/ui components
    │   │   ├── button.tsx        # Button component
    │   │   ├── card.tsx          # Card component
    │   │   ├── form.tsx          # Form components
    │   │   ├── input.tsx         # Input components
    │   │   ├── toast.tsx         # Toast notifications
    │   │   └── ...               # Other UI components
    │   ├── ActionButtonGroup.tsx # Reusable action button group
    │   ├── AutosaveBrowser.tsx   # Autosave version browser
    │   ├── AutosaveStatus.tsx    # Autosave status indicator
    │   ├── Layout.tsx            # Application layout
    │   └── ThemeProvider.tsx     # Theme context provider
    ├── hooks/                     # Shared hooks
    │   ├── useAutosave.ts        # Autosave functionality
    │   └── useToast.ts           # Toast notifications
    ├── lib/                       # Shared utilities
    │   ├── auth.tsx              # Authentication logic
    │   ├── autosave-storage.ts   # Autosave storage abstraction
    │   ├── config-loader.ts      # Configuration management
    │   └── utils.ts              # Utility functions
    ├── schemas/                   # Schema definitions
    │   └── SOPTemplateSchema.yaml # SOP template schema
    └── views/                     # Shared views
        └── LoginPage.tsx         # Login page
```

## Key Components

### SOPCreator.tsx
The main interface for creating and editing Standard Operating Procedures.

**Features:**
- Dynamic form generation from YAML schemas
- Real-time validation with Zod
- Autosave integration with version management
- Test data generation
- Export to YAML format
- Import from JSON/YAML files

**Usage:**
```jsx
<SOPCreator 
  mainSchema="sopTemplate" 
  uiConfig="sopTemplateUI" 
/>
```

### Schema Registry System
Central system for managing schema definitions and relationships.

**Core Functions:**
- `getPropertyDefinitions()` - Extract field definitions from schemas
- `getRelationships()` - Discover parent-child relationships
- `getAddableChildren()` - Determine valid child schema types
- `validateField()` - Real-time field validation

### Autosave Integration
SAM integrates with the shared autosave system to provide:
- Automatic draft saving every 5 seconds
- Version browsing and recovery
- Loss prevention with recovery prompts
- Environment-specific configuration

## Development Guidelines

### Component Naming
- **Components**: PascalCase (e.g., `SOPCreator.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useSOPTemplates.ts`)
- **Utilities**: kebab-case (e.g., `schema-registry.ts`)

### Code Organization
- **Single Responsibility**: Each component handles one specific concern
- **TypeScript First**: All components use TypeScript with proper interfaces
- **Error Boundaries**: Graceful error handling throughout
- **Performance**: Lazy loading and memoization where appropriate

### Schema-Driven Development
SAM follows a schema-driven approach where:
1. **Schemas define structure** - YAML schemas describe data models
2. **UI generates dynamically** - Components adapt to schema changes
3. **Validation follows schema** - Zod validators match schema definitions
4. **Relationships are discovered** - Parent-child connections auto-detected

### Testing Strategy
- **Unit Tests**: Component and utility testing
- **Integration Tests**: Schema registry and form interaction
- **E2E Tests**: Complete SOP creation workflows
- **Schema Validation**: YAML schema compliance testing

## API Integration

### Configuration Management
SAM uses environment-aware configuration loading:

```typescript
// Development: loads from infra/config/webapp/dev.json
// Production: loads from S3 via CloudFront
const config = await configLoader.loadConfig();
```

### Authentication
- **JWT Tokens**: AWS Cognito integration for authentication
- **Role-based Access**: Admin access required for SOP template creation
- **Token Validation**: Automatic token refresh and validation

## Build and Deployment

### Development
```bash
cd frontend
npm install
npm run dev
```

### Schema Generation
```bash
npm run generate:schemas
```

### Build
```bash
npm run build
```

### Testing
```bash
npm run test        # Unit tests
npm run test:e2e    # End-to-end tests
npm run test:schema # Schema validation tests
```

## Future Enhancements

### Planned Features
- **Collaborative Editing**: Real-time multi-user SOP editing
- **Version Control**: Git-like versioning for SOP templates
- **Template Library**: Shareable SOP template 
- **Advanced Validation**: Custom validation rules and constraints
- **Export Formats**: Additional export formats (PDF, Word, etc.)

### Architecture Improvements
- **Micro-frontends**: Split SAM into smaller, focused applications
- **Offline Support**: Service worker for offline SOP creation
- **Performance**: Virtual scrolling for large schema forms
- **Accessibility**: Enhanced ARIA support and keyboard navigation
