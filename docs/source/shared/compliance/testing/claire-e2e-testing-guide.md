<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# E2E Testing Guide for CLAIRE

_under construction_

This guide covers the End-to-End (E2E) testing system for the CLAIRE Electronic Lab Notebook, focusing on sustainable, CI-friendly testing practices.

## Overview

The E2E testing system is designed with these principles:
- **Zero-setup** for developers
- **CI-friendly** for GitHub Actions
- **Schema-agnostic** testing approach
- **Static fixtures** checked into repository
- **NODE_ENV-based** test attributes (no manual scripts)

## Quick Start

```bash
# Run all E2E tests with proper config
make test-e2e

# Run only ReviewSubmitPanel tests
make test-e2e-reviewsubmit

# Run with visual UI for debugging
make test-e2e-ui

# Run in debug mode
make test-e2e-debug
```

## Test Structure

```
frontend/tests/
├── e2e/                     # E2E tests using Playwright
│   ├── reviewsubmit/        # ReviewSubmitPanel component tests
│   │   ├── display.spec.ts     # Data display and rendering
│   │   ├── interaction.spec.ts # UI interactions  
│   │   ├── validation.spec.ts  # Form validation
│   │   └── edge-cases.spec.ts  # Edge cases & performance
│   ├── helpers/             # Test utilities
│   │   ├── page-objects.ts     # Page Object Model
│   │   └── test-utils.ts       # Test data builders
│   └── test-component.html  # Standalone test component
├── fixtures/                # Static test data (checked in)
│   ├── sops/               # SOP schema fixtures
│   │   ├── basic-sop.json      # Standard SOP for most tests
│   │   ├── all-field-types-sop.json  # All field types
│   │   └── minimal-sop.json    # Minimal edge case
│   ├── eln-data/           # ELN form data fixtures
│   │   ├── complete-form.json  # Fully filled form
│   │   ├── partial-form.json   # Partial form (missing required)
│   │   └── empty-form.json     # Empty form
│   └── test-scenarios/     # Test scenarios with metadata
│       ├── sopTest1-complete.json  # Complete test scenario
│       └── sopTest1-partial.json   # Partial test scenario
└── README.md
```

## Key Features

### Automatic Test Attributes

Test attributes are automatically enabled when `NODE_ENV=test`:

```typescript
// In ReviewSubmitPanel.tsx
const testAttrs = process.env.NODE_ENV === 'test' ? {
  'data-testid': 'review-submit-panel'
} : {};

return <div {...testAttrs} className="space-y-6">
```

**Benefits:**
- ✅ **Zero-setup** - Test runners automatically set NODE_ENV=test
- ✅ **Production-safe** - No test attributes in production builds
- ✅ **No scripts** - No need for complex attribute management

### Static Test Fixtures

All test data is stored as JSON files checked into the repository:

```typescript
// Automatic fixture loading
static async loadBasicSOP(): Promise<SOP> {
  return basicSOP as SOP;
}

static async loadCompleteELNData(): Promise<ELNFormData> {
  return completeELNData as ELNFormData;
}
```

**Benefits:**
- ✅ **Consistent** across environments
- ✅ **Schema-compliant** with SOPTemplateSchema
- ✅ **Version controlled** - changes tracked in git
- ✅ **Fast** - no API calls or complex setup

### Standalone Test Component

For fast, isolated testing, we use a standalone HTML file (`test-component.html`) that mimics the ReviewSubmitPanel structure:

- Static HTML with proper data-testid attributes
- Interactive features (collapsible cards, etc.)
- Representative test data
- No dependencies on full application stack

## Make Rules Integration

The Makefile provides convenient commands that handle environment setup:

```makefile
test-e2e:
	@$(MAKE) config ENV=test  # Sets up test config files
	@cd frontend && NODE_ENV=test npx playwright test

test-e2e-reviewsubmit:
	@$(MAKE) config ENV=test
	@cd frontend && NODE_ENV=test npx playwright test tests/e2e/reviewsubmit

test-e2e-integration:
	@$(MAKE) config ENV=test
	@$(MAKE) start-backend ENV=test &  # Real backend integration
	@cd frontend && NODE_ENV=test npx playwright test
```

## Test Data Management

### SOP Fixtures

SOP fixtures follow the actual SOPTemplateSchema structure:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "id": "basic-sop-fixture",
  "taskgroups": [
    {
      "id": "taskgroup_basic_info",
      "_schemaType": "TaskGroup",
      "children": [
        {
          "id": "task_patient_data", 
          "_schemaType": "Task",
          "children": [
            {
              "id": "patient_id",
              "_schemaType": "Field",
              "type": "string",
              "required": true
            }
          ]
        }
      ]
    }
  ]
}
```

Note: `_schemaType` fields are being phased out in favor of a more standardized schema structure.

**Key Properties:**
- `type`: For fields, identifies data type (string, integer, boolean, date, enum, array)
- `children`: Array of nested schema elements (indicates containers)
- `parent`: Array defining hierarchy relationships  
- `ui_config`: Rendering configuration (icons, variants)
- `ordinal`: Display order for elements
- **No `_schemaType`**: Structure determined by presence of `type` (fields) vs `children` (containers)
(_schemaType is going away)

### ELN Data Fixtures

ELN fixtures represent completed form data:

```json
{
  "values": {
    "patient_id": "PT-001",
    "patient_age": 35,
    "consent_given": true
  },
  "metadata": {
    "sop_id": "basic-sop-fixture",
    "completion_percentage": 100
  }
}
```

### Test Scenarios

Test scenarios combine SOPs, ELN data, and expected validation results:

```json
{
  "name": "Basic Valid Form",
  "sop_id": "basic-sop-fixture", 
  "eln_data": {
    "patient_id": "P001",
    "additional_fields": "..."
  },
  "expected_validation": {
    "isValid": true,
    "missingRequiredFields": [],
    "totalFields": 6
  }
}
```

## Page Object Model

The `ReviewSubmitPageObject` class abstracts UI interactions:

```typescript
const reviewPanel = new ReviewSubmitPageObject(page);

// Navigation and setup
await reviewPanel.waitForLoaded();

// Field interactions  
const value = await reviewPanel.getFieldValue('Patient ID');
const isRequired = await reviewPanel.isFieldRequired('Patient ID');

// Card interactions
await reviewPanel.toggleCard('Basic Information');
const isExpanded = await reviewPanel.isCardExpanded('Basic Information');

// Validation checks
const summary = await reviewPanel.getValidationSummary();
const missingFields = await reviewPanel.getMissingRequiredFields();
```

## Development Workflow

### Test-First Development

1. **Write tests** for new component behavior
2. **Run tests** to see them fail  
3. **Implement feature** to make tests pass
4. **Refactor** with confidence that tests catch regressions

### Schema-Agnostic Testing

Tests follow the same principles as the components:

```typescript
// ✅ Good - Schema-driven  
const isField = (element: any) => Boolean(element.type && FIELD_TYPES.includes(element.type));
const isContainer = (element: any) => Boolean(element.children && element.children.length > 0);

// ❌ Bad - Hardcoded assumptions  
const isPatientField = (element: any) => element.id.includes('patient');
const usesSchemaType = (element: any) => element._schemaType === 'Field'; // _schemaType is deprecated
```

**Guidelines:**
- Identify fields by `element.type` property (string, integer, boolean, etc.)
- Identify containers by `element.children` array presence
- Use schema structure (`children`, `parent`) for navigation
- Test validation based on `required` and `validation` properties  
- Never use `_schemaType` (deprecated SAM-only property)
- Never hardcode field names or specific counts

### Adding New Tests

1. **Create test file** in appropriate subdirectory
2. **Use page objects** for UI interactions
3. **Load static fixtures** for consistent data
4. **Test multiple scenarios** (valid, invalid, edge cases)

Example:
```typescript
test('renders enum fields as badges', async () => {
  const sop = await TestDataBuilder.loadAllFieldTypesSOP();
  const elnData = await TestDataBuilder.loadCompleteELNData();
  
  // Use page object for interactions
  const fieldValue = await reviewPanel.getFieldValue('Sample Type');
  expect(fieldValue).toContain('blood');
});
```

## CI/CD Integration

### GitHub Actions

Tests run efficiently in CI with:
- **Fast startup** using static fixtures
- **Parallel execution** for speed  
- **Proper isolation** between test runs
- **Minimal resource usage**

### Environment Configuration

```yaml
# In GitHub Actions workflow
- name: Run E2E Tests
  run: |
    make config ENV=test
    cd frontend && NODE_ENV=test npx playwright test
```

The `ENV=test` ensures:
- Test config files are deployed to `frontend/public/config.json`
- Backend configs use test settings
- API endpoints point to test environment

## Debugging

### Visual Debugging

```bash
# Open test in browser with visible actions
make test-e2e-headed

# Use Playwright Inspector for step-by-step debugging  
make test-e2e-debug
```

### Test Reports

```bash
# View detailed HTML report after test run
npx playwright show-report
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Test attributes not found | Ensure `NODE_ENV=test` is set |
| Fixture not found | Check file paths in `fixtures/` directory |
| Component not rendering | Verify SOP schema structure in fixtures |
| Port mismatch | Check `playwright.config.ts` baseURL matches dev server |

## Performance Monitoring

### Targets

- **Form Load**: <2 seconds  
- **Field Interactions**: <100ms
- **Memory Usage**: <100MB for form data
- **Test Execution**: <30 seconds for full suite

### Monitoring

```typescript
test('loads large forms within performance targets', async () => {
  const startTime = performance.now();
  
  await reviewPanel.waitForLoaded();
  
  const loadTime = performance.now() - startTime;
  expect(loadTime).toBeLessThan(2000); // 2 second target
});
```

## Best Practices

### Do ✅

- Use static fixtures for consistent test data
- Follow schema-agnostic principles
- Test user workflows, not implementation details
- Use page objects for complex interactions
- Test validation behavior comprehensively

### Don't ❌

- Hardcode field names or specific field counts
- Rely on external services or APIs
- Create overly complex test setup procedures
- Test internal component state directly
- Skip edge cases and error scenarios

## Future Enhancements

### Potential Additions

- **Visual regression testing** with screenshot comparisons
- **Accessibility testing** for WCAG compliance  
- **Cross-browser testing** with extended browser matrix
- **Performance monitoring** with continuous tracking
- **Integration testing** with real backend services

### Test Data Expansion

- **Complex nested schemas** for advanced hierarchy testing
- **Internationalization** support with multi-language data
- **Real-world scenarios** based on production usage patterns
- **Error simulation** for network and API failure cases 