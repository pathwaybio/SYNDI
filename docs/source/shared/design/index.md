<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Shared System Design

**SYNDI Shared Infrastructure** - Common patterns, authentication, and infrastructure components used across SAM and CLAIRE.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend Framework | React + Vite |
| UI Components | shadcn/ui + Radix |
| Form Management | react-hook-form + Zod |
| State Management | @tanstack/react-query |
| YAML Processing | js-yaml |
| File Storage | AWS S3 (pre-signed URLs) |
| Authentication | AWS Cognito |
| Infrastructure | CloudFormation |
| Deployment | S3 + CloudFront |

## Frontend Organization

### Service Separation
SYNDI follows a clean service separation pattern in the frontend:

- **`frontend/src/sam/`** - SAM-specific implementation (SOP creation and validation)
- **`frontend/src/claire/`** - CLAIRE-specific implementation (ELN data capture) *[Future]*
- **`frontend/src/paul/`** - PAUL-specific implementation (Protocol analysis) *[Future]*
- **`frontend/src/shared/`** - Shared components, hooks, and utilities across all services

### Shared Infrastructure
The shared directory contains reusable components and utilities:

- **`shared/components/ui/`** - shadcn/ui components (Button, Card, Form, etc.)
- **`shared/components/`** - Custom shared components (Layout, Autosave, etc.)
- **`shared/hooks/`** - Shared React hooks (useAutosave, useToast)
- **`shared/lib/`** - Shared utilities and business logic
- **`shared/schemas/`** - Schema definitions used across services
- **`shared/views/`** - Shared page components (Login, etc.)

### Component Naming Conventions
- **React Components**: PascalCase (e.g., `AutosaveBrowser.tsx`)
- **React Hooks**: camelCase with `use` prefix (e.g., `useAutosave.ts`)
- **Utility Libraries**: kebab-case (e.g., `config-loader.ts`)
- **Types/Interfaces**: PascalCase matching component names

### Benefits of This Structure
- **Clean Service Boundaries**: Each service has its own implementation space
- **Reusable Shared Components**: Common UI patterns shared across services
- **Consistent Naming**: Clear conventions for easy navigation
- **Scalable Architecture**: Easy to add new services (CLAIRE, PAUL) without conflicts
- **Type Safety**: TypeScript throughout with proper interfaces

## Authentication System

### AWS Cognito Integration
- **JWT Token Management**: Frontend manages authentication tokens for both SOP and ELN workflows
- **Token Validation**: Backend services validate tokens using Cognito's JWT verification
- **Role-based Access**: Admin vs user authorization for different workflows
- **Local Development**: Simulated tokens for development and testing

### Authentication Flow
```
User Login → Cognito Validation → JWT Token → API Requests → Backend Validation
```

### Token Usage
- **SOP Templates**: Admin-level access required for template creation
- **ELN Submissions**: User-level access for data capture
- **API Endpoints**: All requests include authentication tokens

## Infrastructure Architecture

### AWS Services
- **S3 Buckets**: 
  - `webapp/` - Frontend static files
  - `forms/` - SOP templates storage
  - `eln/` - ELN submission storage
- **CloudFront**: Frontend distribution and caching
- **Lambda**: Backend API endpoints
- **Cognito**: User management and authentication

### Environment Configuration

Configuration loaded from `infra/config/[service]/[env].json`:

```typescript
interface ServiceConfig {
  apiEndpoint: string;
  authRequired: boolean;
  storageType: 'local' | 'remote';
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
  };
}
```

### Environment Mapping
```
Production:  infra/config/*/prod.json → S3 buckets
Staging:     infra/config/*/stage.json → staging environment  
Development: infra/config/*/dev.json → local servers
Testing:     tests/fixtures/s3-simulation → Playwright fixtures
```

## Schema System Foundation

### Dynamic Schema Architecture
- **Zod Validation**: Real-time schema validation with TypeScript integration
- **Relationship Discovery**: Automatic parent-child relationship detection
- **Property Introspection**: Dynamic field definitions from schema metadata
- **UI Generation**: Component types derived from schema configurations

### Schema Registry Pattern
```typescript
interface SchemaDefinition {
  name: string;
  schema: z.ZodSchema;
  uiMetadata: Record<string, any>;
  relationships: SchemaRelationship[];
}
```

### Core Registry Functions
- `getPropertyDefinitions()` - Extract field definitions
- `getRelationships()` - Discover schema relationships
- `getAddableChildren()` - Determine valid child types
- `validateField()` - Real-time field validation

## Configuration Management

### Multi-Environment Support
```typescript
class ConfigLoader {
  async loadConfig(environment?: string): Promise<EnvironmentConfig>
  private detectEnvironment(): string // Maps Vite modes to env names
  private fetchConfigForEnvironment(env: string): Promise<EnvironmentConfig>
  private getFallbackConfig(service: string, env: string): ServiceConfig
}
```

### Configuration Loading Strategy
- **Production**: Configs served from S3 via CloudFront
- **Development**: Configs served by Vite proxy from `infra/config`
- **Testing**: Configs served from Playwright fixtures
- **Fallback**: Built-in defaults for each environment

## Error Handling & Validation

### Multi-Level Validation
- **Schema Validation**: Zod schemas with real-time feedback
- **Form Validation**: react-hook-form integration
- **Network Retry**: Exponential backoff via React Query
- **Storage Fallback**: localStorage → sessionStorage degradation

### Error Recovery Patterns
- **Optimistic Updates**: Immediate UI feedback with rollback
- **Conflict Resolution**: User-controlled recovery prompts
- **Circuit Breaker**: Prevent cascade failures
- **Graceful Degradation**: Progressive feature reduction

## Security & Compliance

### Data Protection
- **Transit Security**: HTTPS for all communications
- **At-rest Security**: S3 encryption for stored data
- **Client-side Storage**: Encrypted localStorage for drafts
- **Token Security**: Secure JWT handling and refresh

### Access Control
- **Authentication**: Cognito-based user validation
- **Authorization**: Role-based access control
- **API Security**: Token validation on all endpoints
- **Audit Trail**: Request logging and provenance tracking

## Development Guidelines

### Component Patterns
- **Single Responsibility**: Each component handles one concern
- **TypeScript Interfaces**: Clear prop and state definitions
- **Error Boundaries**: Graceful error handling
- **Performance**: Lazy loading and memoization

### Code Organization
- **Feature-based Structure**: Co-locate related components
- **Shared Utilities**: Common functions in dedicated modules
- **Type Definitions**: Shared types across components
- **Import Hierarchy**: Clear dependency structure

### Testing Strategy
- **Unit Tests**: Component and utility testing
- **Integration Tests**: Component interaction patterns
- **E2E Tests**: Complete user workflows via Playwright
- **Visual Regression**: UI consistency validation

## File Structure

```
project/
├── infra/
│   └── config/                # Environment configurations
│       ├── eln/[env].json     # ELN service configs
│       ├── forms/[env].json   # Forms service configs
│       └── webapp/[env].json  # Webapp configs
├── frontend/
│   ├── src/
│   │   ├── sam/                      # SAM-specific implementation
│   │   │   ├── components/          # SAM UI components
│   │   │   ├── hooks/               # SAM-specific hooks
│   │   │   ├── lib/                 # SAM business logic
│   │   │   │   ├── schema-registry.ts    # Schema management
│   │   │   │   └── schema-introspector.ts # Schema analysis
│   │   │   ├── types/               # SAM TypeScript types
│   │   │   └── views/               # SAM pages/views
│   │   ├── shared/                  # Shared across services
│   │   │   ├── components/          # Shared UI components
│   │   │   │   ├── ui/             # shadcn/ui components
│   │   │   │   │   ├── button.tsx  # Button component
│   │   │   │   │   ├── card.tsx    # Card component
│   │   │   │   │   ├── form.tsx    # Form components
│   │   │   │   │   ├── toast.tsx   # Toast notifications
│   │   │   │   │   └── ...         # Other UI components
│   │   │   │   ├── ActionButtonGroup.tsx # Reusable action buttons
│   │   │   │   ├── AutosaveBrowser.tsx   # Autosave version browser
│   │   │   │   ├── AutosaveStatus.tsx    # Autosave status indicator
│   │   │   │   ├── Layout.tsx            # Application layout
│   │   │   │   └── ThemeProvider.tsx     # Theme context provider
│   │   │   ├── hooks/               # Shared hooks
│   │   │   │   ├── useAutosave.ts   # Autosave management
│   │   │   │   └── useToast.ts      # Notification system
│   │   │   ├── lib/                 # Shared utilities
│   │   │   │   ├── auth.tsx         # Authentication logic
│   │   │   │   ├── autosave-storage.ts   # Autosave storage
│   │   │   │   ├── config-loader.ts      # Configuration management
│   │   │   │   └── utils.ts         # Utility functions
│   │   │   ├── schemas/             # Schema definitions
│   │   │   │   └── SOPTemplateSchema.yaml # SOP template schema
│   │   │   └── views/               # Shared views
│   │   │       └── LoginPage.tsx    # Login page
│   │   └── main.tsx                 # Application entry point
│   ├── tools/                       # Build tools
│   │   └── generateSOPTemplateSchema.ts # Schema generation
│   └── public/                      # Static assets
└── tests/
    ├── fixtures/s3-simulation/       # Test data
    └── e2e/                          # Playwright tests
```

## Deployment Pipeline

### Build Process
1. **Configuration Copy**: Environment configs copied to dist/
2. **Schema Generation**: YAML schemas compiled to TypeScript
3. **Asset Optimization**: Static asset bundling and compression
4. **CloudFormation**: Infrastructure provisioning

### Environment Promotion
```
Development → Testing → Staging → Production
    ↓            ↓         ↓          ↓
Local Dev → Playwright → AWS Stage → AWS Prod
```

### Monitoring & Observability
- **Application Metrics**: Performance and usage tracking
- **Error Tracking**: Centralized error logging
- **User Analytics**: Usage pattern analysis
- **Health Checks**: Service availability monitoring

## Autosave Infrastructure ✅

### Reusable Autosave System
**Status**: Implemented for SAM, ready for CLAIRE integration

The autosave system provides a complete, reusable solution for client-side draft management across all SYNDI applications.

### Key Components
- **`useAutosave` Hook**: Environment-aware, configurable autosave with React Query integration
- **Storage Abstraction**: Pluggable storage (localStorage, sessionStorage, future IndexedDB)
- **Configuration Management**: Environment-specific settings via JSON config files
- **Version Management**: LRU cache with automatic cleanup and version browsing
- **Recovery Workflows**: VS Code-style recovery prompts and anti-overwrite protection

### Cross-Application Benefits
- **Zero Schema Dependencies**: Works with any schema-driven form
- **Environment Flexibility**: Different behaviors for dev/test/stage/prod
- **Minimal Integration**: 2-3 lines of code to add to existing forms
- **Extensible Design**: Ready for ELN forms, protocol builders, data entry workflows

## Future Considerations

### Scalability
- **Caching Strategy**: Template and schema caching
- **Performance**: Virtual scrolling for large datasets
- **Load Balancing**: Multi-region deployment
- **Database**: Consider transition from S3 to RDS for complex queries

### Extensibility  
- **Plugin Architecture**: Custom field types and validators
- **API Integration**: External system connections
- **Mobile Support**: Progressive Web App capabilities
- **Offline Mode**: Service worker implementation
- **CLAIRE Integration**: Extend autosave to ELN data capture forms
