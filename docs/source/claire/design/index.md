<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# CLAIRE System Design

**Compliant Ledger-based Automation for Integrated Reporting and Export** - Electronic Lab Notebook data capture system.

## System Overview

CLAIRE provides structured ELN data capture against validated SOP templates. The system imports and resolves data from prerequisite ELNs, supports instrument integration, and maintains full audit trails for compliance.

**Core Value**: Structured data capture with provenance tracking enables superior analytics and regulatory compliance through well-defined data lineage.

## Architecture

See [Shared System Design](../../shared/design/index.md) for common infrastructure and authentication patterns.

### ELN-Specific Components

#### Form Resolution System
- **Resolver Logic**: `logic/resolver.ts` handles dynamic form state management
- **Field Resolution**: Import and merge field values from prerequisite ELNs
- **Dependency Management**: Schema-driven validation rules and field dependencies
- **Audit Trail**: Derivation mapping for complete provenance tracking

#### Data Capture Components
- **ELNCreator**: Main data capture interface against SOP templates
- **Form Renderer**: Dynamic React forms with auto-populated instrument fields
- **Validation Engine**: Real-time validation using schemas generated from resolved fields
- **Attachment Handler**: File upload support for higher-dimensional data

## Data Flow

### ELN Generation Workflow
```
User Authentication → SOP Template Loading → Form Resolution → 
Data Entry → Validation → Autosave → Submission → S3 Storage
```

### Detailed Flow
```
User Authentication (AWS Cognito)
   ↓
(SOP Templates + Prerequisite ELNs + Instrument & External DB data)
   ↓
Resolver (resolveSOPForm) → resolvedFields[], derivationMap
   ↓
UI Renderer (React form, auto-populated instrument fields)
   ↓
User Input
   ↓
Validation (Zod schema generated from resolvedFields)
   ↓
Instrument Control Code Generation
   ↓
Attach Auth Token + ELN generation (values, attachments, provenance, instrument code)
   ↓
Authenticated S3 Upload
```

## Form Resolution Logic

### Core Resolver Functions
```typescript
interface Resolver {
  resolveSOPForm(sopTemplate: SOPTemplate, prerequisites: ELN[]): ResolvedForm
  resolveFieldValue(field: Field, prerequisiteData: any[]): ResolvedValue
  buildDerivationMap(resolvedFields: ResolvedField[]): DerivationMap
  validateFieldDependencies(fields: Field[]): ValidationResult
}
```

### Resolution Pipeline
1. **Field Discovery**: Extract all fields from SOP template
2. **Prerequisite Analysis**: Identify required data from previous ELNs
3. **Value Resolution**: Import and merge values from prerequisite ELNs
4. **Editability Determination**: Set field read/write permissions based on import status
5. **Dependency Validation**: Ensure all required prerequisites are available
6. **Schema Generation**: Create dynamic Zod schema for validation

### Field Import Modes
- **readonly**: Field value imported from prerequisite, cannot be modified
- **overrideable**: Field has default from prerequisite but can be changed
- **editable**: Field must be filled by user, no import available

## Instrument Integration

### Auto-Population
- **Instrument Fields**: Automatically populated from connected laboratory instruments
- **External Database**: Integration with external data sources
- **Code Generation**: Instrument control code generation for automated workflows

### Integration Patterns
```typescript
interface InstrumentIntegration {
  fieldType: 'instrument';
  instrumentId: string;
  dataPath: string;
  refreshInterval?: number;
}
```

## SOP Chaining

### Prerequisite System
```typescript
interface SOPRequirement {
  sop_id: string;
  version: string;
  import: Array<{
    name: string;
    mode: 'readonly' | 'overrideable' | 'editable';
  }>;
}
```

### Chaining Process
1. **Dependency Analysis**: Identify required prerequisite SOPs
2. **ELN Discovery**: Locate completed ELNs for prerequisites
3. **Data Extraction**: Extract required field values
4. **Conflict Resolution**: Handle overlapping field definitions
5. **Audit Mapping**: Track data lineage for compliance

## Data Validation

### Multi-Level Validation
- **Schema Validation**: Dynamic Zod schemas based on resolved fields
- **Business Rules**: SOP-specific validation logic
- **Dependency Validation**: Ensure prerequisite data consistency
- **Instrument Validation**: Verify instrument data integrity

### Validation Timing
- **Import**: Validate prerequisite data during resolution
- **Runtime**: Real-time validation during user input
- **Submission**: Final validation before ELN storage

## File Structure

```
# WARNING - this needs updating
frontend/
├── src/
│   ├── components/
│   │   └── eln/                      # ELN data capture components
│   │       ├── ELNCreator.tsx        # Main ELN interface
│   │       ├── FormResolver.tsx      # Prerequisite resolution
│   │       ├── InstrumentFields.tsx  # Instrument integration
│   │       └── AttachmentUpload.tsx  # File attachment handling
│   ├── logic/
│   │   └── resolver.ts               # Core form resolution logic
│   └── views/
│       └── ELNCreatorPage.tsx        # ELN creation page

backend/
├── rawscribe/
│   ├── main.py                       # FastAPI application entry point
│   ├── .config/
│   │   └── config.json               # Local configuration settings
│   ├── routes/                       # API endpoint definitions
│   │   ├── auth.py                   # Authentication endpoints
│   │   ├── config.py                 # Configuration endpoints
│   │   ├── drafts.py                 # Draft ELN management
│   │   ├── eln.py                    # ELN submission and retrieval
│   │   ├── files.py                  # File upload and attachment
│   │   └── sops.py                   # SOP template management
│   └── utils/                        # Core utility modules
│       ├── config_loader.py          # Configuration loading and validation
│       ├── config_types.py           # Pydantic models for configuration
│       ├── auth.py                   # Authentication and JWT handling
│       ├── access_control.py         # General access control utilities
│       ├── eln_access_control.py     # ELN-specific access control
│       ├── storage.py                # S3 and local storage abstraction
│       ├── filename_generator.py     # Regulatory-compliant filename generation
|       ├── document_utils.py         # Document preparation and filename utilities
│       ├── eln_filename_utils.py     # ELN filename parsing and validation
│       └── schema_utils.py           # SOP schema processing utilities
```

## Storage & Compliance

### ELN Storage Pattern
```
S3 Bucket: eln/
├── submissions/
│   ├── [sop-id]/
│   │   ├── [timestamp]/
│   │   │   ├── data.yaml           # ELN form data
│   │   │   ├── provenance.json     # Audit trail
│   │   │   └── attachments/        # File uploads
```

### Audit Trail
- **Data Provenance**: Complete lineage tracking
- **Field Sources**: Track source of each field value
- **Modification History**: Record all changes
- **User Attribution**: Associate actions with authenticated users

### Compliance Features
- **Immutable Records**: ELN submissions cannot be modified
- **Digital Signatures**: Cryptographic validation
- **Version Control**: Track template and data versions
- **Regulatory Metadata**: BioSchemas-compatible JSON-LD

## Remote Autosave

### ELN-Specific Autosave
- **Storage Backend**: S3 via Lambda endpoints
- **Authentication**: AWS Cognito tokens required
- **High-stakes Mode**: Aggressive saving for critical lab data
- **Conflict Resolution**: Handle concurrent editing sessions

### Configuration
```typescript
const ELN_AUTOSAVE_CONFIG = {
  storage: { 
    type: 'remote',
    apiEndpoint: process.env.REACT_APP_ELN_DRAFTS_API,
    authProvider: () => getCognitoToken()
  },
  triggers: { 
    mode: 'high-stakes', 
    changeDelay: 1000,
    periodicInterval: 15000
  }
};
```

## Implementation Status

### Completed Features
✅ Form resolution framework  
✅ Basic prerequisite data import  
✅ Instrument field definitions  
✅ Remote autosave configuration  

### In Development
🚧 ELN Creator interface  
🚧 Advanced form resolution  
🚧 Instrument integration  
🚧 Attachment management  

### Planned Features
📋 Advanced SOP chaining  
📋 Workflow automation  
📋 Real-time collaboration  
📋 Advanced audit reporting
