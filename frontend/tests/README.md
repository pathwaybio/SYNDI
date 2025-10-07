<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Frontend Tests

Look under ./docs/ for latest info

This directory contains the comprehensive test suite for the CLAIRE frontend, focusing on schema-agnostic component testing.

## Test Structure

```
frontend/tests/
├── e2e/                    # End-to-end tests using Playwright
│   ├── reviewsubmit/       # ReviewSubmitPanel component tests
│   │   ├── display.spec.ts     # Data display and rendering tests
│   │   ├── interaction.spec.ts # UI interaction tests
│   │   ├── validation.spec.ts  # Validation and form state tests
│   │   └── edge-cases.spec.ts  # Edge cases and performance tests
│   └── helpers/            # Test utilities and page objects
│       ├── page-objects.ts     # Page Object Model for UI interactions
│       └── test-utils.ts       # Test data builders and utilities
├── fixtures/               # Static test data (checked into repo)
│   ├── sops/              # SOP schema fixtures
│   │   ├── basic-sop.json      # Standard SOP for most tests
│   │   ├── all-field-types-sop.json  # All supported field types
│   │   └── minimal-sop.json    # Minimal SOP for edge cases
│   └── eln-data/          # ELN form data fixtures
│       ├── complete-form.json  # Fully filled form data
│       ├── partial-form.json   # Partially filled form (missing required)
│       └── empty-form.json     # Empty form data
└── README.md              # This file
```

## ReviewSubmitPanel Test Coverage

### Display Tests (`display.spec.ts`)
- **Field Type Rendering**: All supported field types (string, number, boolean, date, datetime, enum, array)
- **Schema Structure**: Collapsible cards, nested tasks, hierarchy display, ordinals, icons
- **Text Display Hierarchy**: name → title → description → id fallback logic
- **Tooltips**: Info icon display and hover behavior
- **Error Handling**: Malformed data, missing properties

### Interaction Tests (`interaction.spec.ts`)
- **Collapsible Cards**: Default expanded state, toggling, persistence, independent operation
- **Tooltips**: Hover behavior, content display, hiding
- **Responsive Layout**: Grid adaptation, mobile collapse, zebra striping
- **Keyboard Navigation**: Tab order, enter key for toggles, accessibility
- **Loading States**: Component loading behavior

### Validation Tests (`validation.spec.ts`)
- **Validation Summary**: Ready/missing badges, field counts, dynamic updates
- **Required Fields**: Asterisk display, "Required" messages, missing field alerts
- **Submit Button**: Enabled/disabled states, loading indicators, icons

### Edge Cases (`edge-cases.spec.ts`)
- **Empty Data**: No taskgroups, no children, no form data
- **Invalid Data**: Malformed arrays, invalid dates, missing IDs, corrupted schema
- **Performance**: Load times, interaction responsiveness, memory usage
- **Browser Compatibility**: Different viewports, network conditions

## Test Data Management

### Static Fixtures
All test data is stored as static JSON files in the `fixtures/` directory:
- **Checked into repository** for consistency across environments
- **Schema-compliant** fixtures that match actual SOP/ELN structure
- **Reusable** across different test scenarios

### Test Data Builder
The `TestDataBuilder` class provides:
- Async methods to load static fixtures
- Legacy methods for creating dynamic test data
- Type-safe data creation with proper interfaces

### No External Dependencies
Tests are **self-contained** and don't rely on:
- Live backend servers (mocked API calls)
- External data sources
- Complex setup scripts

## Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Test Commands
```bash
# Run all e2e tests
npm run test:e2e

# Run specific test suites
npm run test:e2e tests/e2e/reviewsubmit

# Run with UI (visual test runner)
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed

# Debug tests
npm run test:e2e:debug
```

### Make Commands
```bash
# Configure test environment and run all e2e tests
make test-e2e

# Run ReviewSubmitPanel tests only
make test-e2e-reviewsubmit

# Run with visual UI
make test-e2e-ui

# Run in debug mode
make test-e2e-debug

# Run integration tests with real backend
make test-e2e-integration
```

## Development Workflow

### Test-First Development
1. **Write tests** for new functionality first
2. **Run tests** to see them fail
3. **Implement feature** to make tests pass
4. **Refactor** with confidence that tests catch regressions

### Test Attributes
The system uses **`NODE_ENV=test`** to automatically enable `data-testid` attributes:
- **Automatic**: Test runners set `NODE_ENV=test`
- **Zero-setup**: No manual attribute management needed
- **Production-safe**: Attributes only appear in test environment

### Page Object Model
Use the `ReviewSubmitPageObject` class for UI interactions:
```typescript
const reviewPanel = new ReviewSubmitPageObject(page);
await reviewPanel.navigateToReviewTab();
const fieldValue = await reviewPanel.getFieldValue('patient_id');
```

### Schema-Agnostic Testing
Tests follow the same principles as the components:
- **No hardcoded field names** or patterns
- **Schema-driven assertions** based on SOP structure  
- **Type-based rendering** using `element.type` for fields
- **Container detection** using `element.children` arrays
- **Recursive structure** support
- **No `_schemaType`** dependency (deprecated SAM property)

## CI/CD Integration

### GitHub Actions
Tests are designed to run efficiently in CI:
- **Fast startup** with static fixtures
- **Parallel execution** support
- **Proper test isolation**
- **Minimal resource usage**

### Environment Setup
```bash
# Automatic test configuration
make config ENV=test

# Run tests with proper config
NODE_ENV=test npx playwright test
```

## Debugging

### Visual Debugging
```bash
# Open test in browser
npm run test:e2e:headed

# Use Playwright Inspector
npm run test:e2e:debug
```

### Test Reports
```bash
# View test report (after test run)
npx playwright show-report
```

### Common Issues
- **Test attributes not found**: Ensure `NODE_ENV=test` is set
- **Fixture not found**: Check file paths in `fixtures/` directory
- **Component not rendering**: Verify SOP schema structure in fixtures

## Schema-Agnostic Principles

### Key Guidelines
1. **Discover from Schema**: Never hardcode field names or types
2. **Type-Based Logic**: Use `element.type` for rendering decisions
3. **Recursive Structure**: Support arbitrary nesting levels
4. **Validation from Schema**: Use `required` and `validation` properties
5. **UI Config Driven**: Icons, titles, descriptions from `ui_config`

### Anti-Patterns to Avoid
- Checking field names (e.g., `if (field.id.includes('date'))`)
- Using deprecated `_schemaType` property
- Hardcoded field counts or specific field assumptions
- Non-recursive rendering logic
- Bypassing schema validation rules 