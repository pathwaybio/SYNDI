<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# UI Configuration Editor Design

**Field Styling & Layout Customization** - Advanced interface for customizing field appearance and behavior in SOP templates.

__under construction__
This is a planned feature not fully implemented

## Overview

The UI Configuration Editor allows SOP designers to customize field styling, layout, and behavior beyond basic field properties. This includes component selection, visual styling, layout positioning, and interaction patterns.

## Core Features

### Component Type Intelligence
- **Auto-suggestion**: `type: "enum"` → suggest `"select"` component
- **Compatibility Validation**: Prevent incompatible component/type combinations
- **Live Preview**: Real-time rendering of field configurations
- **Component Library**: Access to all shadcn/ui and custom components

### Layout Management
- **Grid System**: Visual drag-and-drop field positioning
- **Responsive Design**: Mobile/tablet/desktop preview modes
- **Template Library**: Pre-built layout patterns for common workflows
- **Custom Layouts**: Save and reuse custom layout configurations

## UI Configuration Schema

### Configuration Structure

```typescript
interface UIConfiguration {
  component_type: ComponentType;
  variant: ComponentVariant;
  size: ComponentSize;
  placeholder?: string;
  label?: string;
  description?: string;
  validation_ui: ValidationUIConfig;
  layout: LayoutConfig;
  styling: StylingConfig;
  behavior: BehaviorConfig;
}

type ComponentType = 
  | 'input' | 'textarea' | 'select' | 'checkbox' | 'radio-group'
  | 'date-picker' | 'file-upload' | 'number-input' | 'password'
  | 'combobox' | 'multi-select' | 'slider' | 'switch' | 'tag-input';

interface ValidationUIConfig {
  show_validation_state: boolean;
  error_message_position: 'below' | 'tooltip' | 'inline';
  required_indicator: 'asterisk' | 'text' | 'none';
  success_indicator: boolean;
}

interface LayoutConfig {
  full_width: boolean;
  grid_column_span: number;
  grid_row_span?: number;
  alignment: 'left' | 'center' | 'right';
  margin: SpacingConfig;
  padding: SpacingConfig;
}

interface StylingConfig {
  theme_variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  custom_classes: string[];
  border_style?: BorderConfig;
  background_style?: BackgroundConfig;
}
```

## Visual Interface Design

### Main Configuration Panel

```
┌─ Field Properties ──────────────────┐  ┌─ UI Configuration ─────────────────┐
│ • Name: sample_volume               │  │ Component Type: [number-input ▼]  │
│ • Title: Sample Volume              │  │ Size: [md ▼]  Variant: [default ▼]│
│ • Type: number                      │  │ ☐ Full Width  Grid Span: [1 ▼]    │
│ • Required: ☑                       │  │ Placeholder: "Enter volume..."     │
│ • Min: 0.1  Max: 100                │  │ Description: "Volume in mL"        │
│ • Unit: mL                          │  │                                    │
└─────────────────────────────────────┘  │ Validation Display:                │
                                         │ ☑ Show validation state            │
┌─ Live Preview ──────────────────────┐  │ Error position: [below ▼]          │
│                                     │  │ Required indicator: [asterisk ▼]   │
│ Sample Volume *                     │  │                                    │
│ [Enter volume...        ] mL        │  │ Layout & Spacing:                  │
│ Volume in mL                        │  │ Alignment: [left ▼]               │
│                                     │  │ Margin: [sm ▼]  Padding: [md ▼]   │
└─────────────────────────────────────┘  └────────────────────────────────────┘
```

### Layout Grid Editor

```
┌─ Form Layout Designer ─────────────────────────────────────────────┐
│ Device: [Desktop ▼] [Tablet] [Mobile]  Template: [Default ▼]      │
├────────────────────────────────────────────────────────────────────┤
│ ┌─ Grid (12 columns) ──────────────────────────────────────────────┐│
│ │ ┌─Field1──┐ ┌─Field2──┐ ┌─Field3──┐ ┌─Field4──┐              ││
│ │ │Sample   │ │Volume   │ │Temp     │ │pH       │              ││
│ │ │ID       │ │(mL)     │ │(°C)     │ │Level    │              ││
│ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘              ││
│ │                                                              ││
│ │ ┌─Field5──────────────────┐ ┌─Field6──────────────────┐      ││
│ │ │Procedure Notes          │ │Equipment Used           │      ││
│ │ │                         │ │                         │      ││
│ │ └─────────────────────────┘ └─────────────────────────┘      ││
│ └──────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Field Properties:          Layout Actions:                     │
│ Selected: Sample ID        [Save as Template] [Reset Layout]   │
│ Span: 3 columns           [Import Template]  [Export Layout]   │
│ Order: 1                                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Component Intelligence System

### Auto-Suggestion Engine

```typescript
class ComponentSuggestionEngine {
  suggestComponents(field: Field): ComponentSuggestion[] {
    const suggestions: ComponentSuggestion[] = [];
    
    // Base type suggestions
    switch (field.type) {
      case 'string':
        if (field.validation?.maxLength <= 50) {
          suggestions.push({ component: 'input', confidence: 0.9 });
        } else {
          suggestions.push({ component: 'textarea', confidence: 0.8 });
        }
        break;
        
      case 'number':
        suggestions.push({ component: 'number-input', confidence: 0.9 });
        if (field.validation?.min !== undefined && field.validation?.max !== undefined) {
          suggestions.push({ component: 'slider', confidence: 0.7 });
        }
        break;
        
      case 'boolean':
        suggestions.push({ component: 'checkbox', confidence: 0.8 });
        suggestions.push({ component: 'switch', confidence: 0.7 });
        break;
        
      case 'date':
        suggestions.push({ component: 'date-picker', confidence: 0.9 });
        break;
    }
    
    // Enhanced suggestions based on field metadata
    if (field.enum_values?.length) {
      if (field.enum_values.length <= 5) {
        suggestions.push({ component: 'radio-group', confidence: 0.8 });
      } else {
        suggestions.push({ component: 'select', confidence: 0.9 });
        if (field.enum_values.length > 20) {
          suggestions.push({ component: 'combobox', confidence: 0.8 });
        }
      }
    }
    
    // Context-based suggestions
    if (field.name.includes('email')) {
      suggestions.push({ component: 'input', variant: 'email', confidence: 0.9 });
    }
    
    if (field.name.includes('password')) {
      suggestions.push({ component: 'password', confidence: 0.9 });
    }
    
    if (field.name.includes('tags') || field.name.includes('keywords')) {
      suggestions.push({ component: 'tag-input', confidence: 0.8 });
    }
    
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
}

interface ComponentSuggestion {
  component: ComponentType;
  variant?: string;
  confidence: number;
  reasoning?: string;
}
```

### Compatibility Validation

```typescript
class ComponentValidator {
  validateCompatibility(field: Field, config: UIConfiguration): ValidationResult {
    const errors: string[] = [];
    
    // Type compatibility checks
    if (field.type === 'number' && config.component_type === 'textarea') {
      errors.push('Number fields cannot use textarea component');
    }
    
    if (field.type === 'boolean' && !['checkbox', 'switch', 'radio-group'].includes(config.component_type)) {
      errors.push('Boolean fields must use checkbox, switch, or radio-group');
    }
    
    // Validation rule compatibility
    if (field.validation?.min !== undefined && config.component_type === 'checkbox') {
      errors.push('Min validation not applicable to checkbox components');
    }
    
    // Layout compatibility
    if (config.layout.full_width && config.layout.grid_column_span > 1) {
      errors.push('Cannot specify both full_width and grid_column_span');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings: this.generateWarnings(field, config)
    };
  }
  
  private generateWarnings(field: Field, config: UIConfiguration): string[] {
    const warnings: string[] = [];
    
    if (field.type === 'string' && config.component_type === 'slider') {
      warnings.push('Slider component unusual for string fields');
    }
    
    return warnings;
  }
}
```

## Template System

### Pre-built Templates

```typescript
interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  category: 'laboratory' | 'general' | 'custom';
  fields: FieldLayoutConfig[];
  responsive_breakpoints: ResponsiveConfig;
}

const BUILT_IN_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'laboratory-standard',
    name: 'Laboratory Standard',
    description: 'Common layout for laboratory data entry',
    category: 'laboratory',
    fields: [
      { name: 'sample_id', position: { col: 1, row: 1, span: 2 } },
      { name: 'date', position: { col: 3, row: 1, span: 2 } },
      { name: 'operator', position: { col: 5, row: 1, span: 2 } },
      { name: 'procedure', position: { col: 1, row: 2, span: 6 } },
      { name: 'results', position: { col: 1, row: 3, span: 6 } }
    ]
  },
  
  {
    id: 'two-column',
    name: 'Two Column Layout',
    description: 'Split layout for detailed forms',
    category: 'general',
    fields: [] // Dynamic based on available fields
  }
];
```

### Custom Template Management

```typescript
class TemplateManager {
  saveCustomTemplate(template: LayoutTemplate): Promise<void>
  loadCustomTemplate(templateId: string): Promise<LayoutTemplate>
  deleteCustomTemplate(templateId: string): Promise<void>
  getAvailableTemplates(category?: string): Promise<LayoutTemplate[]>
  
  applyTemplate(template: LayoutTemplate, fields: Field[]): FieldLayoutConfig[] {
    // Map template positions to actual fields
    // Handle missing fields gracefully
    // Maintain template integrity where possible
  }
}
```

## Live Preview System

### Real-time Rendering

```tsx
const LivePreviewRenderer: React.FC<{
  field: Field;
  config: UIConfiguration;
  sampleData?: any;
}> = ({ field, config, sampleData }) => {
  const [previewValue, setPreviewValue] = useState(sampleData || getDefaultValue(field));
  
  // Generate the actual component based on configuration
  const PreviewComponent = useMemo(() => {
    return generateDynamicComponent(field, config);
  }, [field, config]);
  
  return (
    <div className="live-preview-container">
      <div className="preview-header">
        <span className="preview-label">Live Preview</span>
        <div className="preview-controls">
          <Button size="sm" onClick={() => setPreviewValue(getDefaultValue(field))}>
            Reset
          </Button>
          <Button size="sm" onClick={() => setPreviewValue(getTestValue(field))}>
            Test Data
          </Button>
        </div>
      </div>
      
      <div className="preview-content" style={generatePreviewStyles(config)}>
        <PreviewComponent
          value={previewValue}
          onChange={setPreviewValue}
          {...config}
        />
      </div>
      
      <div className="preview-info">
        <small className="text-muted-foreground">
          Component: {config.component_type} | Value: {JSON.stringify(previewValue)}
        </small>
      </div>
    </div>
  );
};
```

### Multi-Device Preview

```tsx
const ResponsivePreview: React.FC<{
  config: UIConfiguration;
  field: Field;
}> = ({ config, field }) => {
  const [selectedDevice, setSelectedDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  
  const deviceStyles = {
    mobile: { width: '375px', padding: '16px' },
    tablet: { width: '768px', padding: '24px' },
    desktop: { width: '1200px', padding: '32px' }
  };
  
  return (
    <div className="responsive-preview">
      <DeviceSelector selected={selectedDevice} onChange={setSelectedDevice} />
      
      <div className="preview-viewport" style={deviceStyles[selectedDevice]}>
        <LivePreviewRenderer field={field} config={config} />
      </div>
      
      <PreviewMetrics device={selectedDevice} config={config} />
    </div>
  );
};
```

## Integration with Schema System

### Schema Registry Extensions

```typescript
class SchemaRegistry {
  // Add UI configuration support
  getUIConfiguration(fieldId: string): UIConfiguration
  setUIConfiguration(fieldId: string, config: UIConfiguration): void
  validateUIConfiguration(field: Field, config: UIConfiguration): ValidationResult
  
  // Template integration
  applyUITemplate(templateId: string, fields: Field[]): void
  exportUIConfiguration(fields: Field[]): UIConfigurationExport
  importUIConfiguration(config: UIConfigurationExport): void
}
```

### Configuration Persistence

```typescript
interface UIConfigurationExport {
  version: string;
  templates: LayoutTemplate[];
  field_configurations: Record<string, UIConfiguration>;
  global_settings: {
    default_theme: string;
    responsive_breakpoints: ResponsiveConfig;
    accessibility_settings: AccessibilityConfig;
  };
}
```

## Performance Considerations

### Rendering Optimization

```tsx
const OptimizedConfigEditor: React.FC<UIConfigEditorProps> = ({ field, config, onChange }) => {
  // Debounce configuration changes to prevent excessive re-renders
  const debouncedConfig = useDebounce(config, 300);
  
  // Memoize expensive operations
  const suggestions = useMemo(() => 
    componentSuggestionEngine.suggestComponents(field), 
    [field.type, field.validation]
  );
  
  const validationResult = useMemo(() => 
    componentValidator.validateCompatibility(field, debouncedConfig),
    [field, debouncedConfig]
  );
  
  // Virtualize large option lists
  const componentOptions = useVirtualizedOptions(AVAILABLE_COMPONENTS);
  
  return (
    <ConfigEditorLayout>
      {/* Optimized component rendering */}
    </ConfigEditorLayout>
  );
};
```

## Implementation Roadmap

### Phase 1: Basic Configuration
1. **Core UI Schema**: Define comprehensive configuration structure
2. **Component Library**: Integrate with shadcn/ui components
3. **Basic Editor**: Simple configuration interface
4. **Live Preview**: Real-time component rendering
5. **Validation**: Basic compatibility checking

### Phase 2: Advanced Features
1. **Layout Grid**: Visual drag-and-drop interface
2. **Template System**: Pre-built and custom templates
3. **Auto-suggestions**: Intelligent component recommendations
4. **Responsive Design**: Multi-device preview and configuration
5. **Import/Export**: Configuration persistence and sharing

### Phase 3: Professional Features
1. **Theme System**: Advanced styling and theming
2. **Accessibility**: Comprehensive accessibility tools
3. **Performance**: Optimization for large forms
4. **Collaboration**: Team-based configuration sharing
5. **Analytics**: Usage analytics and optimization recommendations 