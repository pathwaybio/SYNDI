// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { schemaRegistry } from '@shared/lib/schema-registry';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { z } from 'zod';
import { TagInput } from './TagInput';

interface CollapsiblePropertiesProps {
  title?: string;
  schema_name: string;
  defaultOpen?: boolean;
  formData?: Record<string, any>;
  onFormDataChange?: (fieldName: string, value: any) => void;
  errors?: Record<string, string | Record<string, string>>;
  excludedProperties?: string[];
  zodSchema?: z.ZodSchema; // For nested objects
}

export const CollapsibleProperties: React.FC<CollapsiblePropertiesProps> = ({ 
  title,
  schema_name, 
  defaultOpen = false, 
  formData = {},
  onFormDataChange,
  errors = {},
  excludedProperties = [],
  zodSchema
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  // Use zodSchema if provided, otherwise get from registry
  const properties = zodSchema 
    ? schemaRegistry.getPropertyDefinitionsForZodSchema(zodSchema)
    : schemaRegistry.getPropertyDefinitions(schema_name);

  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    // Find the property definition for validation
    const property = properties.find(prop => prop.name === fieldName);
    
    // Perform real-time Zod validation
    if (property) {
      // Check for required field validation first
      const isRequired = property.uiConfig?.required;
      const isEmpty = value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
      
      if (isRequired && isEmpty) {
        // Special message for required fields
        setValidationErrors(prev => ({
          ...prev,
          [fieldName]: `${property.uiConfig?.title || fieldName} is required`
        }));
      } else {
        // Perform full Zod validation
        const validation = schemaRegistry.validateField(property.zodType, value);
        
        // Update validation errors state
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          if (validation.isValid) {
            delete newErrors[fieldName]; // Remove error if valid
          } else {
            newErrors[fieldName] = validation.error || 'Invalid value';
          }
          return newErrors;
        });
      }
    }
    
    // Call parent onChange handler
    if (onFormDataChange) {
      onFormDataChange(fieldName, value);
    }
  }, [properties, onFormDataChange]);

  // Filter out excluded properties - memoized to prevent infinite loops
  const filteredProperties = useMemo(() => {
    return properties.filter(prop => !excludedProperties.includes(prop.name));
  }, [properties, excludedProperties]);

  // Don't validate on initial load - only validate after user interaction
  // This prevents showing validation errors when the form first loads

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
          <span>{title}</span>
          {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </CardTitle>
      </CardHeader>
      <Collapsible open={isOpen}>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProperties.map(prop => {
                // Combine validation errors from both props and real-time validation
                const propsError = errors[prop.name];
                const realtimeError = validationErrors[prop.name];
                const hasError = !!propsError || !!realtimeError;
                const isRequired = prop.uiConfig?.required;
                const errorValue = realtimeError || propsError; // Prioritize real-time errors
                const isStringError = typeof errorValue === 'string';
                
                // Check if this is a literal field (has a specific required value)
                const isLiteralField = prop.zodType instanceof z.ZodLiteral;
                const literalValue = isLiteralField ? (prop.zodType as z.ZodLiteral<any>)._def.value : undefined;
                
                // If it's a literal field, display as label instead of input
                if (isLiteralField && literalValue) {
                  return (
                    <div key={`prop-${prop.name}`} className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">
                        {prop.uiConfig?.title || prop.name}
                      </label>
                      <div className="p-2 bg-gray-50 border rounded text-sm text-gray-800">
                        {literalValue}
                      </div>
                      {prop.uiConfig?.description && (
                        <p className="text-xs text-gray-500 mt-1">{prop.uiConfig.description}</p>
                      )}
                    </div>
                  );
                }
                
                return (
                  <div key={`prop-${prop.name}`} className="space-y-1">
                    <label className={cn(
                      "text-sm font-medium flex items-center gap-1",
                      hasError ? "text-red-600" : "text-gray-700"
                    )}>
                      {prop.uiConfig?.title || prop.name}
                      {isRequired && (
                        <span className="text-red-500 font-bold">*</span>
                      )}
                      {hasError && (
                        <span className="text-red-500 text-xs ml-1">
                          (validation error)
                        </span>
                      )}
                    </label>
                    
                    {prop.uiConfig?.component_type === 'date-picker' && (
                      <input 
                        type="date" 
                        className={cn(
                          "w-full border rounded p-2",
                          hasError && "border-red-500"
                        )}
                        value={formData[prop.name] || ''}
                        onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                      />
                    )}
                    
                    {prop.uiConfig?.component_type === 'select' && (
                      <select 
                        className={cn(
                          "w-full border rounded p-2",
                          hasError && "border-red-500"
                        )}
                        value={formData[prop.name] || ''}
                        onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                      >
                        <option value="">Select...</option>
                        {prop.uiConfig.options?.map((option: { value: string; label: string }) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    {prop.uiConfig?.component_type === 'input' && (
                      <input 
                        type="text" 
                        className={cn(
                          "w-full border rounded p-2",
                          hasError && "border-red-500"
                        )}
                        value={formData[prop.name] || ''}
                        onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                        placeholder={prop.uiConfig.description || ''}
                      />
                    )}
                    
                    {prop.uiConfig?.component_type === 'url-input' && (
                      <input 
                        type="url" 
                        className={cn(
                          "w-full border rounded p-2",
                          hasError && "border-red-500"
                        )}
                        value={formData[prop.name] || ''}
                        onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                        placeholder={prop.uiConfig.description || 'https://example.com'}
                      />
                    )}
                    
                    {prop.uiConfig?.component_type === 'email-input' && (
                      <input 
                        type="email" 
                        className={cn(
                          "w-full border rounded p-2",
                          hasError && "border-red-500"
                        )}
                        value={formData[prop.name] || ''}
                        onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                        placeholder={prop.uiConfig.description || 'user@example.com'}
                      />
                    )}
                    
                    {prop.uiConfig?.component_type === 'textarea' && (
                      <textarea 
                        className={cn(
                          "w-full border rounded p-2",
                          hasError && "border-red-500"
                        )}
                        rows={3}
                        value={formData[prop.name] || ''}
                        onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                        placeholder={prop.uiConfig.description || ''}
                      />
                    )}
                    
                    {prop.uiConfig?.component_type === 'checkbox' && (
                      <div className="flex items-center space-x-2">
                        <input 
                          type="checkbox" 
                          className={cn(
                            "rounded border",
                            hasError && "border-red-500"
                          )}
                          checked={formData[prop.name] || false}
                          onChange={(e) => handleFieldChange(prop.name, e.target.checked)}
                        />
                        <span className="text-sm text-gray-600">
                          {prop.uiConfig.description || 'Enable this option'}
                        </span>
                      </div>
                    )}
                    
                    {prop.uiConfig?.component_type === 'number-input' && (
                      <input 
                        type="number" 
                        className={cn(
                          "w-full border rounded p-2",
                          hasError && "border-red-500"
                        )}
                        value={formData[prop.name] || ''}
                        onChange={(e) => handleFieldChange(prop.name, e.target.value ? Number(e.target.value) : '')}
                        placeholder={prop.uiConfig.description || ''}
                      />
                    )}
                    
                    {prop.uiConfig?.component_type === 'tag-input' && (
                      <TagInput
                        value={formData[prop.name] || []}
                        onChange={(value) => handleFieldChange(prop.name, value)}
                      />
                    )}
                    
                    {prop.uiConfig?.component_type === 'nested-object' && (
                      <div className="border rounded p-4 bg-gray-50">
                        <CollapsibleProperties
                          schema_name="" // Not using schema name for nested objects
                          defaultOpen={true}
                          formData={formData[prop.name] || {}}
                          onFormDataChange={(nestedField, value) => {
                            const currentNestedData = formData[prop.name] || {};
                            handleFieldChange(prop.name, {
                              ...currentNestedData,
                              [nestedField]: value
                            });
                          }}
                          errors={
                            !isStringError && errorValue && typeof errorValue === 'object' && !Array.isArray(errorValue)
                              ? errorValue as Record<string, string>
                              : {}
                          }
                          excludedProperties={excludedProperties}
                          zodSchema={prop.zodType}
                        />
                      </div>
                    )}
                    
                    {/* Validation error message */}
                    {hasError && (
                      <p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                        <span className="text-red-500">⚠</span>
                        {isStringError ? errorValue : 'Invalid input'}
                      </p>
                    )}
                    
                    {/* Field description */}
                    {prop.uiConfig?.description && !hasError && (
                      <p className="text-xs text-gray-500 mt-1">{prop.uiConfig.description}</p>
                    )}
                    
                    {/* Show validation rules for better UX */}
                    {!hasError && prop.uiConfig?.validation && (
                      <div className="text-xs text-gray-400 mt-1">
                        {prop.uiConfig.validation.min_length && (
                          <span>Min length: {prop.uiConfig.validation.min_length} </span>
                        )}
                        {prop.uiConfig.validation.max_length && (
                          <span>Max length: {prop.uiConfig.validation.max_length} </span>
                        )}
                        {prop.uiConfig.validation.email && (
                          <span>Must be valid email </span>
                        )}
                        {prop.uiConfig.validation.url && (
                          <span>Must be valid URL </span>
                        )}
                        {prop.uiConfig.validation.pattern && (
                          <span>Must match pattern </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}; 