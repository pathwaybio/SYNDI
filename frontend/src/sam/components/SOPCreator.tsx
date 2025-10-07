// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { schemaRegistry } from "@shared/lib/schema-registry";
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Button } from '@shared/components/ui/button';
import { Badge } from '@shared/components/ui/badge';
import { SOPActionButtons } from './SOPActionButtons';
import { Plus, Save, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { CollapsibleProperties } from './CollapsibleProperties';
import { CollapsableSchema } from './CollapsableSchema';
import { ArrayPropertyHandler } from './ArrayPropertyHandler';
import * as yaml from 'js-yaml';
import { Tabs, TabsList, TabsTrigger } from '@shared/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/components/ui/collapsible';
import { Form } from '@shared/components/ui/form';
import { useAutosave } from '@shared/hooks/useAutosave';
import { AutosaveStatus } from '@shared/components/AutosaveStatus';
import { AutosaveBrowserCompact } from '@shared/components/AutosaveBrowser';
import { parseFile } from '@shared/lib/file-parser';
import { exportData, generateTimestampedFilename } from '@shared/lib/file-export';
import { getSOPDisplayTitle } from '@shared/lib/sop-metadata';
import { createFileInput, FILE_ACCEPT_PATTERNS } from '@shared/lib/file-input';
import { logger } from '@shared/lib/logger';

interface SOPCreatorProps {
  mainSchema: string;
  uiConfig: string;
}

export const SOPCreator: React.FC<SOPCreatorProps> = ({ mainSchema, uiConfig }) => {
  const [debugView, setDebugView] = useState<'json' | 'yaml'>('yaml');
  const [isExpanded, setIsExpanded] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Get the main schema properties using the registry
  const mainSchemaProperties = schemaRegistry.getPropertyDefinitions(mainSchema);
  
  // Create a dynamic Zod schema for validation
  const createDynamicSchema = () => {
    const schemaShape: Record<string, z.ZodSchema> = {};
    
    // Add main schema properties
    mainSchemaProperties.forEach(prop => {
      schemaShape[prop.name] = prop.zodType;
    });
    
    return z.object(schemaShape);
  };

  const DynamicSchema = createDynamicSchema();
  type DynamicSchemaType = z.infer<typeof DynamicSchema>;

  // Initialize form with react-hook-form and Zod validation
  const form = useForm<DynamicSchemaType>({
    resolver: zodResolver(DynamicSchema),
    defaultValues: getDefaultValues(),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  // Watch for form errors
  const formErrors = form.formState.errors;

  // Initialize autosave system
  const { state, actions } = useAutosave(form, {
    type: 'sop',
    identifier: form.watch('id') || 'new',
    debounceMs: 5000,  // Default until config loads
    maxWait: 30000      // Default until config loads
  });

  // Generate default values for the dynamic schema
  function getDefaultValues(): DynamicSchemaType {
    const defaults: any = {};
    
    // Add main schema defaults including nested objects
    mainSchemaProperties.forEach(prop => {
      // Handle literal values first
      if (prop.zodType instanceof z.ZodLiteral) {
        defaults[prop.name] = (prop.zodType as z.ZodLiteral<any>)._def.value;
      }
      // Handle nested objects
      else if (prop.uiConfig.component_type === 'nested-object') {
        const nestedProperties = schemaRegistry.getPropertyDefinitionsForZodSchema(prop.zodType);
        const nestedDefaults: any = {};
        
        nestedProperties.forEach(nestedProp => {
          // Handle literals in nested objects
          if (nestedProp.zodType instanceof z.ZodLiteral) {
            nestedDefaults[nestedProp.name] = (nestedProp.zodType as z.ZodLiteral<any>)._def.value;
          }
          // Handle required fields in nested objects
          else if (nestedProp.uiConfig.required) {
            if (nestedProp.zodType instanceof z.ZodString) {
              nestedDefaults[nestedProp.name] = '';
            } else if (nestedProp.zodType instanceof z.ZodArray) {
              nestedDefaults[nestedProp.name] = [];
            } else if (nestedProp.zodType instanceof z.ZodBoolean) {
              nestedDefaults[nestedProp.name] = false;
            } else if (nestedProp.zodType instanceof z.ZodNumber) {
              nestedDefaults[nestedProp.name] = 0;
            }
          }
          // Initialize optional fields with appropriate empty values
          else {
            // Unwrap ZodOptional to check the inner type
            let innerType = nestedProp.zodType;
            if (nestedProp.zodType instanceof z.ZodOptional) {
              innerType = nestedProp.zodType.unwrap();
            }
            
            if (innerType instanceof z.ZodString) {
              nestedDefaults[nestedProp.name] = '';
            } else if (innerType instanceof z.ZodArray) {
              nestedDefaults[nestedProp.name] = [];
            }
          }
        });
        
        defaults[prop.name] = nestedDefaults;
      }
      // Handle array properties (like taskgroups, requires)
      else if (prop.zodType instanceof z.ZodArray || 
               (prop.zodType instanceof z.ZodDefault && prop.zodType._def.innerType instanceof z.ZodArray)) {
        defaults[prop.name] = [];
      }
      // Handle regular required fields
      else if (prop.uiConfig.required) {
        if (prop.zodType instanceof z.ZodString) {
          defaults[prop.name] = '';
        } else if (prop.zodType instanceof z.ZodArray) {
          defaults[prop.name] = [];
        } else if (prop.zodType instanceof z.ZodBoolean) {
          defaults[prop.name] = false;
        } else if (prop.zodType instanceof z.ZodNumber) {
          defaults[prop.name] = 0;
        }
      }
    });
    
    return defaults;
  }

  // Clear messages helper
  const clearMessages = () => {
    setValidationErrors([]);
    setSuccessMessage('');
  };

  // Handle main schema form data changes with validation
  const handleMainSchemaChange = (fieldName: string, value: any) => {
    clearMessages();
    form.setValue(fieldName as any, value, { 
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true
    });
  };

  // Handle array property changes using schema-driven approach
  const handleArrayPropertyChange = (propertyName: string, newArray: any[]) => {
    clearMessages();
    form.setValue(propertyName as any, newArray, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true
    });
    setSuccessMessage(`Updated ${propertyName}`);
  };

  // Collect all form data for export
  const getAllFormData = () => {
    const allData = form.getValues();
    return allData;
  };

  // Generate test data for all schemas
  const generateTestData = () => {
    clearMessages();
    const testData: DynamicSchemaType = getDefaultValues();
    
    // Helper function to generate appropriate test data based on component type
    const generateTestValue = (prop: any) => {
      // Don't override literal values
      if (prop.zodType instanceof z.ZodLiteral) {
        return (prop.zodType as z.ZodLiteral<any>)._def.value;
      }
      
      // Generate data based on component type
      switch (prop.uiConfig.component_type) {
        case 'tag-input':
          return [`test-${prop.name}-1`, `test-${prop.name}-2`];
        case 'checkbox':
          return true;
        case 'number-input':
          return 42;
        case 'date-picker':
          return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        case 'email-input':
          return `test-${prop.name}@example.com`;
        case 'url-input':
          return `https://example.com/${prop.name}`;
        case 'select':
          return prop.uiConfig.options?.[0]?.value || `test-${prop.name}`;
        case 'textarea':
          return `This is test content for ${prop.uiConfig.title || prop.name}. Lorem ipsum dolor sit amet.`;
        case 'nested-object':
          // Handle nested objects recursively
          const nestedProperties = schemaRegistry.getPropertyDefinitionsForZodSchema(prop.zodType);
          const nestedData: any = {};
          nestedProperties.forEach(nestedProp => {
            nestedData[nestedProp.name] = generateTestValue(nestedProp);
          });
          return nestedData;
        default:
          return `Test ${prop.name}`;
      }
    };
    
    // Generate test data for main schema
    mainSchemaProperties.forEach(prop => {
      testData[prop.name as keyof DynamicSchemaType] = generateTestValue(prop) as any;
    });

    // Generate test data for array properties using schema discovery
    const arrayProperties = ['taskgroups', 'requires'];
    arrayProperties.forEach(arrayProp => {
      const relationships = schemaRegistry.getRelationships(mainSchema);
      const containsRelationship = relationships.find(rel => 
        rel.type === 'contains' && rel.propertyName === arrayProp
      );
      
      if (containsRelationship) {
        const itemSchemaName = containsRelationship.targetSchema;
        const itemProperties = schemaRegistry.getPropertyDefinitions(itemSchemaName);
        
        // Create a sample item with test data
        const sampleItem: any = {
          id: `${itemSchemaName.toLowerCase()}_test_1`,
        };
        
        // Generate test values for each property
        itemProperties.forEach(prop => {
          if (prop.name === 'id') return; // Skip ID as we already set it
          
          // Handle literal values
          if (prop.zodType instanceof z.ZodLiteral) {
            sampleItem[prop.name] = (prop.zodType as z.ZodLiteral<any>)._def.value;
          }
          // Generate test values based on property type
          else {
            sampleItem[prop.name] = generateTestValue(prop);
          }
        });
        
        testData[arrayProp as keyof DynamicSchemaType] = [sampleItem] as any;
      }
    });

    form.reset(testData);
    setSuccessMessage('Form has been filled with synthetic test data for quick testing.');
  };

  // Clear all form data
  const clearAllData = () => {
    const shouldClear = window.confirm('Are you sure you want to clear the entire form? This action cannot be undone.');
    if (shouldClear) {
      clearMessages();
      form.reset(getDefaultValues());
      setSuccessMessage('The form has been reset to its initial state.');
    }
  };

  // Export form data as YAML file with optional validation
  const exportAsYAML = async (isDraft: boolean = false) => {
    try {
      clearMessages();
      
      // Get raw form data
      const formData = form.getValues();
      
      // For final exports, perform validation
      if (!isDraft) {
        const validationResult = DynamicSchema.safeParse(formData);
        
        if (!validationResult.success) {
          const errors = validationResult.error.errors.map(err => 
            `${err.path.join('.')}: ${err.message}`
          );
          setValidationErrors(errors);
          // Also trigger form validation to show field-level errors
          form.trigger();
          return;
        }
      }
      
      // For drafts, use raw data without validation
      // Handle missing/incomplete fields gracefully by using form data as-is
      const allData = isDraft ? formData : getAllFormData();
      
      // Generate filename and export
      const filename = generateTimestampedFilename('sop-template', 'yaml', isDraft);
      
      await exportData(allData, {
        format: 'yaml',
        filename,
        isDraft,
        metadata: {
          is_draft: isDraft,
          status: isDraft ? 'draft' : 'final'
        }
      });
      
      const sopTitle = getSOPDisplayTitle(allData);
      const actionWord = isDraft ? 'Draft saved' : 'Final SOP Template exported';
      setSuccessMessage(`${actionWord} - "${sopTitle}" has been exported as ${filename}`);
      
      logger.debug('SOPCreator', `Form data exported as ${isDraft ? 'draft' : 'final'} YAML`, 'forms', allData);
    } catch (error) {
      logger.error('SOPCreator', 'Error exporting YAML', 'forms', error);
      const errorMessage = isDraft 
        ? 'Error saving draft. Please check the console for details.' 
        : 'Error exporting form data. Please check the console for details.';
      setValidationErrors([errorMessage]);
    }
  };

  // Load SOP from JSON file
  const loadFromJSON = () => {
    createFileInput(FILE_ACCEPT_PATTERNS.SOP_FILES, async (file) => {
      try {
        clearMessages();
        const { content } = await parseFile(file);
        
        // Reset form with loaded data
        form.reset(content);
        
        const loadedTitle = getSOPDisplayTitle(content, 'Loaded SOP');
        setSuccessMessage(`Successfully loaded SOP template "${loadedTitle}" from ${file.name}`);
        
        logger.debug('SOPCreator', 'SOP loaded from file', 'forms', content);
      } catch (error) {
        logger.error('SOPCreator', 'Error loading SOP file', 'forms', error);
        setValidationErrors([
          `Error loading file "${file.name}": ${error instanceof Error ? error.message : 'Invalid file format'}`
        ]);
      }
    });
  };

  // Handler functions for SOPActionButtons
  const handleLoadTestData = () => generateTestData();
  const handleClearForm = () => clearAllData();
  const handleExportDraft = async () => await exportAsYAML(true);
  const handleExportFinal = async () => await exportAsYAML(false);
  const handleLoadFromJSON = () => loadFromJSON();

  // Helper to get debug data as string
  const getDebugDataString = () => {
    const allData = getAllFormData();
    if (debugView === 'yaml') {
      return yaml.dump(allData, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });
    }
    return JSON.stringify(allData, null, 2);
  };

  // Convert form errors to simple object for CollapsibleProperties
  const getFieldErrors = (prefix: string = '') => {
    const errors: Record<string, string> = {};
    
    if (prefix) {
      // For nested schemas
      const nestedErrors = formErrors[prefix as keyof typeof formErrors];
      if (nestedErrors && typeof nestedErrors === 'object' && 'message' in nestedErrors) {
        // If it's a direct error
        errors[prefix] = nestedErrors.message as string;
      } else if (nestedErrors && typeof nestedErrors === 'object') {
        // If it has nested fields
        Object.entries(nestedErrors).forEach(([key, value]) => {
          if (value && typeof value === 'object' && 'message' in value) {
            errors[key] = value.message as string;
          }
        });
      }
    } else {
      // For main schema
      Object.entries(formErrors).forEach(([key, value]) => {
        if (value && typeof value === 'object' && 'message' in value) {
          errors[key] = value.message as string;
        }
      });
    }
    
    return errors;
  };

  return (
    <div className="space-y-6">
      {/* Top Action Buttons */}
      <SOPActionButtons
        onClearForm={handleClearForm}
        onExportDraft={handleExportDraft}
        onExportFinal={handleExportFinal}
        onLoadFromJSON={handleLoadFromJSON}
      />

      {/* Autosave Status and Browser */}
      <div className="flex items-center gap-2">
        <AutosaveStatus 
          state={state} 
          onManualSave={actions.manualSave}
          onAcceptRecovery={actions.acceptRecovery}
          onRejectRecovery={actions.rejectRecovery}
          onToggleEnabled={actions.toggleEnabled}
        />
        <AutosaveBrowserCompact actions={actions} />
      </div>

      {/* Validation Messages - Only show on export attempt */}
      {validationErrors.length > 0 && (
        <div className="relative w-full rounded-lg border border-red-500/50 p-4 text-red-700 bg-red-50">
          <div className="font-semibold mb-2">Please fix the following validation errors:</div>
          <ul className="list-disc list-inside space-y-1">
            {validationErrors.map((error, index) => (
              <li key={index} className="text-sm">{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Success Messages */}
      {successMessage && (
        <div className="relative w-full rounded-lg border border-green-500/50 p-4 text-green-700 bg-green-50">
          {successMessage}
        </div>
      )}

      <Form {...form}>
        <div className="space-y-6">
          {/* Main Schema Properties */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">Standard Operating Procedure</span>
            <Badge variant="outline">{mainSchemaProperties.length} properties</Badge>
          </div>
          
          <CollapsibleProperties 
            schema_name={mainSchema}
            defaultOpen={true}
            formData={form.watch()}
            onFormDataChange={handleMainSchemaChange}
            errors={getFieldErrors()}
            excludedProperties={['taskgroups', 'requires']}
            title="Properties"
          />

          {/* Schema-driven Array Property Sections */}
          <ArrayPropertyHandler
            propertyName="taskgroups"
            parentSchemaName={mainSchema}
            formData={form.watch('taskgroups' as any) || []}
            onFormDataChange={(newArray) => handleArrayPropertyChange('taskgroups', newArray)}
            errors={getFieldErrors('taskgroups')}
            title="Task Groups"
          />

          <ArrayPropertyHandler
            propertyName="requires"
            parentSchemaName={mainSchema}
            formData={form.watch('requires' as any) || []}
            onFormDataChange={(newArray) => handleArrayPropertyChange('requires', newArray)}
            errors={getFieldErrors('requires')}
            title="Import Requirements"
          />
        </div>
      </Form>

      <SOPActionButtons
        onClearForm={handleClearForm}
        onExportDraft={handleExportDraft}
        onExportFinal={handleExportFinal}
        onLoadFromJSON={handleLoadFromJSON}
      />

      {/* Collapsible section for SOP Schema */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <Card className="mb-4">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span>SOP Schema</span>
                </div>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent>
              <div className="space-y-2 text-sm">
                {/* Toggle Tabs for YAML/JSON */}
                <div className="mb-2">
                  <Tabs value={debugView} onValueChange={v => setDebugView(v as 'yaml' | 'json')}>
                    <TabsList>
                      <TabsTrigger value="yaml">YAML</TabsTrigger>
                      <TabsTrigger value="json">JSON</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {/* Resizable debug window */}
                <pre
                  className="bg-muted p-2 rounded text-xs overflow-auto max-h-40 resize-y min-h-[120px]"
                  style={{ minHeight: 120, resize: 'vertical', maxHeight: 2000 }}
                >
                  {getDebugDataString()}
                </pre>
              </div>
              <SOPActionButtons
                onClearForm={handleClearForm}
                onExportDraft={handleExportDraft}
                onExportFinal={handleExportFinal}
                onLoadFromJSON={handleLoadFromJSON}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
