<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Conditional Fields Design

**Dynamic Field Visibility** - Fields that appear/disappear based on other field values in SOP templates.

## Overview

Conditional fields enable dynamic form behavior where field visibility depends on the values of other fields. For example, "Show reagent volume only if experiment type = titration" creates more intuitive and streamlined SOP templates.

## Use Cases

### Laboratory Workflow Examples
- **Experiment Type Branching**: Show specific fields based on selected experiment type
- **Equipment Selection**: Display relevant parameters based on chosen instrument
- **Safety Protocols**: Show additional safety fields for hazardous procedures
- **Sample Types**: Adjust required fields based on sample characteristics

## Implementation Strategy

### Phase-Based Development

#### Phase 1: Same-Task Conditionals
- **Scope**: Fields within the same task can depend on each other
- **Complexity**: Low - single task context
- **Implementation**: Direct field references within task scope

#### Phase 2: Cross-Task References
- **Scope**: Fields can depend on fields from other tasks
- **Complexity**: Medium - cross-task field resolution
- **Implementation**: Task-qualified field paths

#### Phase 3: Complex Logic
- **Scope**: AND/OR combinations, multiple conditions
- **Complexity**: High - complex evaluation engine
- **Implementation**: Expression parser and evaluator

## Technical Architecture

### Data Structure

```typescript
interface ConditionalField extends Field {
  conditions: Array<{
    id: string;
    targetField: string;        // "task_id.field_name" or "field_name"
    operator: ConditionOperator;
    value: any;
    logicalOperator?: 'AND' | 'OR';
  }>;
  showWhen: boolean;            // Show when conditions are true/false
}

type ConditionOperator = 
  | 'equals' 
  | 'not_equals'
  | 'greater_than' 
  | 'less_than'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty';
```

### Field Reference Resolution

```typescript
interface FieldReference {
  taskId?: string;              // Optional for cross-task references
  fieldName: string;
  fieldType: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  currentValue: any;
}

class FieldResolver {
  resolveFieldPath(path: string, sopData: SOPData): FieldReference
  validateFieldType(field: FieldReference, operator: ConditionOperator): boolean
  evaluateCondition(condition: Condition, sopData: SOPData): boolean
}
```

## UI Components

### Condition Builder Interface

```
┌─ Make Field Conditional? ──────────────────────┐
│ ☑ Show this field conditionally               │
│                                                │
│ Show field when:                               │
│ ┌─ Condition Builder ─────────────────────────┐│
│ │ Field: [Task Dropdown▼] [Field Dropdown▼]  ││
│ │ Operator: [equals▼] Value: [titration____] ││
│ │ ⊕ Add another condition (AND/OR)           ││
│ └─────────────────────────────────────────────┘│
│                                                │
│ Preview: Field is currently [hidden/shown]    │
└────────────────────────────────────────────────┘
```

### Dynamic Form Behavior

```typescript
const ConditionalFieldRenderer: React.FC<{
  field: ConditionalField;
  sopData: SOPData;
  onChange: (fieldName: string, value: any) => void;
}> = ({ field, sopData, onChange }) => {
  const isVisible = useMemo(() => 
    evaluateFieldConditions(field.conditions, sopData), 
    [field.conditions, sopData]
  );
  
  if (!isVisible) return null;
  
  return <DynamicFormField field={field} onChange={onChange} />;
};
```

## Validation & Error Handling

### Circular Dependency Detection

```typescript
class DependencyAnalyzer {
  detectCircularDependencies(fields: ConditionalField[]): string[] {
    const graph = this.buildDependencyGraph(fields);
    return this.findCycles(graph);
  }
  
  private buildDependencyGraph(fields: ConditionalField[]): DependencyGraph {
    // Build directed graph of field dependencies
  }
  
  private findCycles(graph: DependencyGraph): string[] {
    // Detect circular references using DFS
  }
}
```

### Runtime Validation

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    fieldId: string;
    message: string;
    type: 'circular_dependency' | 'invalid_reference' | 'type_mismatch';
  }>;
}

class ConditionalFieldValidator {
  validateConditions(field: ConditionalField, availableFields: Field[]): ValidationResult
  validateOperatorCompatibility(fieldType: string, operator: ConditionOperator): boolean
  validateValueType(value: any, fieldType: string, operator: ConditionOperator): boolean
}
```

## Performance Considerations

### Evaluation Optimization

```typescript
class ConditionEvaluator {
  private memoizedResults = new Map<string, boolean>();
  
  evaluateWithMemoization(conditions: Condition[], sopData: SOPData): boolean {
    const key = this.generateCacheKey(conditions, sopData);
    
    if (this.memoizedResults.has(key)) {
      return this.memoizedResults.get(key)!;
    }
    
    const result = this.evaluate(conditions, sopData);
    this.memoizedResults.set(key, result);
    return result;
  }
  
  clearCache(): void {
    this.memoizedResults.clear();
  }
}
```

### Change Detection

```typescript
const useConditionalFields = (fields: ConditionalField[], sopData: SOPData) => {
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  
  // Only re-evaluate when relevant fields change
  const relevantData = useMemo(() => {
    const relevantFields = extractRelevantFields(fields);
    return pick(sopData, relevantFields);
  }, [fields, sopData]);
  
  useEffect(() => {
    const newVisibility = evaluateAllConditions(fields, relevantData);
    setVisibilityMap(newVisibility);
  }, [fields, relevantData]);
  
  return visibilityMap;
};
```

## Schema Integration

### Schema Definition Updates

```yaml
# Add to SOP Template Schema
ConditionalField:
  allOf:
    - $ref: '#/definitions/Field'
    - type: object
      properties:
        conditions:
          type: array
          items:
            type: object
            properties:
              id: { type: string }
              targetField: { type: string }
              operator: 
                type: string
                enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains']
              value: { }
              logicalOperator:
                type: string
                enum: ['AND', 'OR']
        showWhen:
          type: boolean
          default: true
```

### Registry Integration

```typescript
class SchemaRegistry {
  // Add conditional field support
  getConditionalFields(taskId: string): ConditionalField[]
  resolveFieldDependencies(fieldId: string): string[]
  validateConditionalLogic(fields: ConditionalField[]): ValidationResult
}
```

## Implementation Roadmap

### Phase 1 (Same-Task Conditionals)
1. **Data Structure**: Define conditional field schema
2. **UI Builder**: Create condition builder interface
3. **Evaluation Engine**: Simple within-task evaluation
4. **Form Integration**: Update form renderer for conditionals
5. **Validation**: Basic validation and error handling

### Phase 2 (Cross-Task References)
1. **Path Resolution**: Implement task-qualified field paths
2. **Dependency Tracking**: Cross-task dependency analysis
3. **UI Enhancement**: Task/field selection in condition builder
4. **Performance**: Optimize cross-task evaluation
5. **Testing**: Comprehensive cross-task scenarios

### Phase 3 (Complex Logic)
1. **Expression Parser**: AND/OR logic evaluation
2. **Advanced UI**: Complex condition builder interface
3. **Optimization**: Advanced memoization and caching
4. **Migration Tools**: Convert simple to complex conditionals
5. **Documentation**: User guides and examples

## User Experience

### Design Principles
- **Progressive Disclosure**: Start simple, add complexity as needed
- **Visual Feedback**: Clear indication of conditional relationships
- **Error Prevention**: Guide users to valid configurations
- **Real-time Preview**: Show form behavior as conditions are built

### Accessibility
- **Screen Readers**: Announce visibility changes
- **Keyboard Navigation**: Full keyboard accessibility
- **Visual Indicators**: Clear visual cues for conditional fields
- **Focus Management**: Proper focus handling for dynamic fields

## Testing Strategy

### Unit Tests
- Condition evaluation logic
- Circular dependency detection
- Field reference resolution
- Type validation

### Integration Tests
- Form rendering with conditionals
- Cross-task field resolution
- Schema registry integration
- Performance with large forms

### E2E Tests
- Complete user workflows
- Complex conditional scenarios
- Error handling and recovery
- Accessibility compliance 