<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# AI Agent Context for CLAIRE MVP Implementation

## Project Overview
CLAIRE is a TypeScript Electronic Lab Notebook (ELN) data collection system that renders schema-driven SOPs as tabbed forms with regulatory-compliant immutable storage. This document provides context for AI agents implementing the system.

## Core Nomenclature (CRITICAL)
- **SOPTemplate**: The generic schema that defines what SOPs are in general (meta-schema)
- **SOP**: A specific Standard Operating Procedure schema that complies with the SOPTemplate
- **SOPMetadata**: Additional data attached to an SOP (filename, author, etc.)
- **ELN**: The actual filled-out data collected using an SOP

## Flow

**General data flow:**

SOPTemplate (meta-schema) → SOP (specific procedure) → ELN (filled data)

In practice, the SOPTemplate serves dual purposes:
- **SAM (Authoring)**:     SOPTemplateSchema → [Create New SOP] → sopTest1.yaml
- **CLAIRE (Validation)**: SOPTemplateSchema → [Validate SOP]   → ✅ sopTest1.yaml conforms


## Current Project State
- **Base Project**: Working SAM application, a template-driven SOP authoring app
- **Goal**: Extend SAM app with CLAIRE client/server webapp MVP functionality to operationalize the authored SOPs and deploy to AWS with user authentication (and in most cases, also authorization)
- **Implementation Status**: Third refactoring of CLAIRE, this time starting fresh with modular prompts
- **DO NOT REGRESS FRONTEND FUNCTIONALITY**: <project-root>/frontend/src/sam/ works perfectly and has dependencies in <project-root>/frontend/src/shared/, <project-root>/frontend/.config/, do not regress
- **do not edit <project-root>/frontend/build/ targets directly** These files are generated
- **<project-root>/Makefile** for creating targets
- **<project-root>/docs/source** for markdowns 

## Directory Structure
```
<root>/
├── frontend/
│   ├── src/
│   │   ├── shared/           # Existing shared utilities
│   │   │   ├── schema/SOPTemplateSchema.yaml
│   │   │   │                 # Template for authoring SOPs (source)  
│   │   │   ├── lib/          # config-loader.ts, auth.tsx (basic versions)
│   │   │   ├── hooks/        # useSimpleAutosave.ts
│   │   │   ├── components/   # Reusable UI components
│   │   │   ├── types/        # Reusable types (config.ts)
│   │   │   └── views/        # Webapp-wide views (LoginPage.tsx)
│   │   ├── sam/              # SAM-specific code: SOP editor (adds no SOP schema template properties)
│   │   └── claire/           # CLAIRE-specific code: ELN data collector
│   ├── tests/                # unit and e2e tests
│   ├── build/
│   │   └── SOPTemplateSchema.ts  # Existing Zod schema for enforcing SOP template rules on new SOPs
│   └── public/
│       └── config.json       # env-specific target, copied from webapp/{env}.json
├── backend/
│   ├── rawscribe/            # Python FastAPI backend
│   │   ├── .config
│   │   │   └── config.json       # env-specific target, copied from lambda/{env}.json
│   │   ├── main.py               # FastAPI app with ELN API
│   │   ├── routes/           # API routes 
│   │   └── utils/            # Storage, auth, and RBAC utilities
│   └── tests/                # Backend tests (unit, integration)
├── infra/
│   ├── .config/              # Potentially sensitive configs (gitignored)
│   │   ├── stack/            # CloudFormation parameters
│   │   ├── webapp/           # Frontend service configs → webapp bucket
│   │   ├── lambda/           # Backend service configs → lambda bucket
│   │   ├── forms/            # Forms service configs → forms bucket
│   │   └── eln-drafts/       # Draft service configs → eln-drafts bucket
│   ├── example-.config/      # Example templates (committed, same structure)
│   ├── cloudformation/       # CloudFormation templates
│   └── scripts/              # Deployment scripts (deploy-configs.sh, etc.)
└── .local/s3/                # Local development S3 simulation (gitignored)
    ├── webapp/               # Local prod-simulated webapp bucket
    │   └── webapp/           # build targets created with `make deploy-frontend`
    │       ├── serve.py      # Copied from infra/, simulates CloudFront
    │       ├── assets/       # Copied from frontend/dist/
    │       ├── config.json   
    │       └── index.html
    ├── lambda/               # Local prod-simulated lambda artifacts bucket
    │   ├── function.zip      # Simulated lambda artifact, from `make deploy-backend`
    │   └── build_mock/       # For simulating lambda function (unzip'd, served with uvicorn)
    ├── forms/sops/           # Local SOP files for live dev
    ├── eln/                  # ELN bucket simulation
    │   └── submissions/      # Final ELN storage
    └── eln-drafts/           # Draft bucket simulation
        └── drafts/           # Draft storage
```

## Existing Resources

### Key Files to Reference
- **SOP Schema**: `frontend/build/SOPTemplateSchema.ts` - Zod validation schema, built with `make schemas`
- **Sample SOP**: `.local/s3/forms/sops/sopTest1.yaml` - Test data
- **Current Config**: `frontend/src/shared/lib/config-loader.ts`
- **Auth Context**: `frontend/src/shared/lib/auth.tsx` (supports 3-role RBAC: Admin, Researcher, Viewer)
- **Autosave Hook**: `frontend/src/shared/hooks/useAutosave.ts` - Existing autosave logic

### Implementation
- **Configuration System**: - Simple bucket-based deployment from `infra/.config/` to service buckets
- **Tests**: All tests passing; failing tests are skipped
- **Source**: 
  - `infra/example-.config/{service}/{env}.json` - examples of configs
  - `infra/.config/{service}/{env}.json` - sensitive configs (gitignored), can mirror examples, pre-prod
- **Staging**:
  - **Hot reload servers** for rapid development served from:
    - fronend(webapp): `frontend/src/main.tsx`, 
    - backend(lambda function): `backend/rawscribe/main.py`
  - **Locally staged servers** for emulating production, served from:
    - webapp bucket: `.local/s3/webapp/webapp/index.html`
    - lambda function bucket: `.local/s3/lambda/build_mock/server.py`
- **Config Targets**: 
  - webapp/frontend:
    - dev: `frontend/public/config.json`
    - locally staged:`.local/s3/webapp/webapp/public/config.json` 
    - prod: `s3://<webapp-bucket-name>/webapp/public/config.json`
  - lambda/backend:
    - dev: `backend/rawscribe/.config/config.json`
    - locally staged: `.local/s3/lambda/function.zip
        ->`.local/s3/lambda/build_mock/rawscribe/.config/config.json`
    - prod: `s3://<lambda-bucket-name>/rawscribe/.config/config.json`

- **Deployment**: 
  - Make rules:
    - `make setup-local` RUN ONCE - creates local configs and deploys to hot reload servers
    - `make config ENV="dev"` deploys to hot reload servers for dev
    - `make start-dev ENV="{env}` deploys to hot reload servers for dev
    - `make mirror ENV="{env}` builds and deploys .local/s3 for prod emulation
    - `make stop-all` stops all local servers, dev and staged
  - Retrieving config:
    - **Frontend**: `fetch('/config.json')` from webapp bucket (public config only)
    - **Backend**: load from `config_loader.load_config()` with graceful failure (no fallbacks)
    - **Security**: Public/private config split - sensitive data only in private backend configs

## Development Environment Setup
```bash

# run all tests
make test-all

# start hot reload servers
make start-dev

# stage locally to emulate production
make mirror
```

## Testing Structure
- **Locally Staged Data and Apps**: `.local/s3/` - S3 simulation for live, manual testing
- **Test Fixtures**: `fixtures/s3-simulation/` - S3 simulation for Playwright testing (same structure)

## Key Dependencies
- **Frontend**: React, TypeScript, React Hook Form, Zod, RJSF, Lucide React
- **Backend**: FastAPI, Pydantic, boto3, PyJWT
- **Development**: Node.js 18+, Python 3.9+
We avoid Docker by not using LocalStack, simplifying the dev tech stack, set-up, and maintenance, while also minimizing compute requirements, and vendor (AWS) dependence.

## Important Context for AI Agents

### Schema Independence
- **Critical**: Never embed assumptions about form field names, schemas or schema patterns
- **Use**: Only explicit schema declarations (format, type, ui_config, validation)
- **Avoid**: Name pattern matching (e.g., checking if field contains 'date' or splitting id on '_')
- **Strict Schemas**: The `SOPTemplateSchema.yaml` uses `additionalProperties: false` to enforce a strict structure. The Zod schema generator translates this to `.strict()`, preventing any properties not explicitly defined in the schema. This is critical for data integrity.
- **@type**: Used for providing context to SOP developers (sam), avoid in SOP presentation (claire) so as to maintain schema independence.

#### Schema Structure Assumptions that are Allowed:

- **Rendering**:
  - `taskgroups`: SOP schemas have a `taskgroups` array property, rendered as cards. Each array item is a hierarchy of _schema objects_: 
    - `children`/`parents` (_optional_) if present, property defines _schema object_ hierarchy.
    - Immediate children of `taskgroups` render as tabs
    - Ancestors of immediate children of `taskgroups` render as nested cards, recursively:
      - [ cards ] (`taskgroups`) → [ tabs ] → [ nested cards ] (recursive)
  - _Schema object_ properties:
    - `id` for rendering, import, export identification; 
    - `ui_config`, `name`, `title`, `description` (_optional_) for rendering
    - `type`,`validation` (_optional_) for rendering as **RJSF inputs**. Only render if `type` property is present
    - `ordinal` (_optional_) an integer, (0,n), dictates where to render, relative to siblings, and the value can/should be rendered unless its an item in the `taskgroups` array or an immediate child (tab). **Examples**: a step in a protocol, or a reagent to source/prepare should render the `ordinal` value. In the task groups array and immediate children, the ordinal indicates where to put the card/tab; so if the ordinal is '1' for a card or tab, just make sure it shows up first.
    - `annotation` is to be rendered as a string input type on an SOP object with a 'type': it's to allow SOP executers to add annotations on any schema object that an SOP author creates, giving more flexibility to the SOPs themselves. The SOP author should be able to disable annotations per object, to enforce stricter SOPs for operational QC, and that functionality is TBD.
- **Schema Type Detection**: 
  - **SAM Usage**: Use `detectSchemaType()` from `frontend/src/shared/lib/schema-registry.ts` to identify schema element types for rendering context in SOP authoring interface. This provides schema names to SOP builders for reference during development.
  - **CLAIRE Usage**: Use `detectSchemaType()` for schema element identification in ELN components. 
  - **Antipattern**: Using `detectSchemaType()` for structural logic creates assumptions about schema structure that violate schema independence principles. Use schema-driven approaches through the schema registry and property analysis instead.
  - **JSON-LD Type Annotation**: All schema objects include an `@type` property following JSON-LD standards for reliable type detection:
    - Runtime objects created via `createDefaultObject()` use a non-enumerable `@type` property to avoid validation issues
    - The schema generator automatically adds `'@type': z.string().optional()` to all object schemas with `additionalProperties: false`
    - This ensures compatibility with both JSON-LD conventions and Zod's strict validation.
    - The `@type` is intended for rendering hints during SOP construction: DO NOT use it to create links between application logic and the SOP template data model.
- **Filename Generation**: Special _schema objects_ for ELN filename generation and placed in `children` arrays:
  - specify which fields should be used in filename generation. To identify these components:
    - Look for objects with a `filename_component: true` property
    - Has no `type` property (do not render it)
  - Properties: `filename_component: true` (marks as filename component) and `order: number` (specifies sequence)
  - **Example**: A Field schema element with PatientId has its id has a child `ELNFilenameComponent` with `filename_component: true, order: 2`; then the PatientId field's value becomes the 2nd component in the ELN filename: 
  `<prefix>-<component1>-<PatientID-value>-<component...>-<component-n>-<suffix>.json`. **Remember**: do not hardcode `ELNFilenameComponent` or any other schema name, it breaks schema independence.
  - **Design Rationale**: These `filename_component` objects are not rendered as form inputs, they are used to send configuration information to the backend

### Schema Design: Children vs Properties for Non-Renderable Objects

#### **Design Principle**
Schema objects that should **not be rendered as user inputs** but are **configuration objects** should be placed in the `children` arrays of schema objects rather than as direct properties.

#### **Why This Matters**
- **CLAIRE** (user-facing forms) only renders schema elements with `type` properties as form inputs
- **SAM** (designer tools) needs to detect and manage these configuration objects
- **Backend** processes these configurations for filename generation, export logic, etc.

#### **Example: Field Schema**
Here, `Field` is a terminal schema object with configuration objects `ELNFilenameComponent` and `ExportConfiguration`. **DO NOT HARDCODE ANY OF THESE OBJECT NAMES** it will break schema independence.
```yaml
Field:
  type: string          # ✅ Rendered as input string by CLAIRE
  name: "Project ID"    # ✅ Used as label
  children:             # ✅ Configuration objects (no `type` property, not rendered)
    - $ref: '#/definitions/ELNFilenameComponent'  # For filename generation
    - $ref: '#/definitions/ExportConfiguration'    # For export settings
```

##### **Benefits**
- **CLAIRE**: Only renders user inputs, ignores configuration children
- **SAM**: Can detect configuration schemas via `detectSchemaType()` for designer tools
- **Backend**: Can be send data from  configuration children to execute business logic
- **Clear separation**: User data vs. configuration metadata

##### **Alternative (Avoid)**
```yaml
Field:
  type: string
  export: {...}         # ❌ Would be rendered as form input
  eln_filename: {...}   # ❌ Would be rendered as form input
```

This design ensures configuration objects serve their intended purpose without interfering with user-facing form rendering.


### Schema-Driven UI
- **`ui_config` Property**: Schema elements can have a `ui_config` property that dictates their appearance and behavior (e.g., icons, card styles, collapsibility).
- **`UIConfigProvider`**: The application uses a `UIConfigProvider` (`frontend/src/shared/lib/ui-config-provider.tsx`) to process these properties. This centralizes UI logic and ensures consistent rendering based on the schema.
- **Principle**: Instead of hardcoding UI decisions in components, use the `useUIConfig` hook to interpret the schema's `ui_config` and apply the correct styles and behaviors.


### File Naming Conventions
- **Python**: snake_case (`config_loader.py`, `auth_provider.py`)
- **TypeScript**: kebab-case (`config-loader.ts`, `auth-provider.ts`)
- **React Components**: PascalCase (`ELNCreator.tsx`, `TabRenderer.tsx`)

### Test Structure
- **Frontend**: `tests/` directory at frontend root with `unit/` for unit tests, `e2e/` end-to-end integration.
- **Backend**: `tests/` directory at backend root with `unit/`, `integration/`

### Performance Targets
- SOP Load Time: <2 seconds
- Form Render Time: <1 second
- Field Response Time: <100ms
- Memory Usage: <100MB for form data
- Draft Save Time: <500ms

### Debug Panel Requirements
- **Debug Panel**: Must render both SOP metadata AND ELN form data, including user-entered form data

## Batch I/O

In addition to manually inputing & submitting data, users can input data via:
- authorized RESTful commands
- uploads
- integrated, API-enabled instruments (TBD)
- integrated, API-enabled sample registries (TBD)
Traditionally, outputs to ELN only, but hooks can be developed to detect the ELN submission and trigger sample registry submissions and instrument programs based on the ELN contents.

### Sample Registry Records
Sample registry integration into input fields is TBD

### Instrument Readouts
Instrument integration into input fields is TBD

### File Uploads

CLAIRE supports file attachments for ELN fields with `type: "file"`. The system uses a two-stage process:

#### Stage 1: Temporary Upload (Draft)
- Files uploaded via `/api/v1/files/upload` are stored in draft storage
- Filename format: `{user_id}-{field_id}-{file_upload_uuid}-{original_filename}.{ext}`
- Location: `.local/s3/eln-drafts/drafts/{sop_id}/attachments/`
- Example: `dev_user-field_123-a1b2c3d4-protocol.pdf`

#### Stage 2: ELN Attachment (Final)
- When ELN is submitted, files move from draft to final storage via `/api/v1/files/attach-to-eln`
- **Filename preserved**: Same exact filename as draft (keeps file_upload_uuid for audit trail)
- Location: `.local/s3/eln/submissions/{sop_id}/attachments/`
- Operation: Simple copy/move with no renaming

#### Key Implementation Points
- File IDs generated by `FilenameGenerator.generate_temp_file_id()` (8-char, no dashes)
- Both S3 and Local storage backends supported
- Schema-driven configuration via `file_config` in SOP field definitions
- Files are SOP-scoped for proper organization and access control

## How to Use This Context

1. **Read this file first** before starting any prompt
2. **Reference existing files** mentioned in the "Key Files to Reference" section
3. **Follow the directory structure** exactly as specified

## Memory Preferences
- Maintain schema independence - never embed field name assumptions
- User prefers simpler Functional Approach over OOP unless OOP is well justified
- Auth, autosave, and schema logic go in `lib/` not `utils/`
- View components go in `views/` not `pages/`
- User prefers correct, concise, clear, and comprehensive responses
- User reads through documents thoroughly until no more edits needed
- Use `frontend/src/shared/lib/logger` instead of `console.log`

This context file should be referenced by AI agents before implementing any prompt to ensure consistency and awareness of existing resources. 