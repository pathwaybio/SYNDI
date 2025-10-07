// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/components/ui/tabs';
import { Input } from '@shared/components/ui/input';
import { Checkbox } from '@shared/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/components/ui/collapsible';
import { Button } from '@shared/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { JSONSchema7 } from 'json-schema';
import { logger } from '@shared/lib/logger';
import { useUIConfig } from '@shared/lib/ui-config-provider';
import { FileUploadField } from '@claire/components/FileUploadField';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Configure logger
logger.configure('warn', true);

if (process.env.NODE_ENV === 'development' || window.location.search.includes('debug=true')) {
  logger.configure('debug', true);
}

// Convert field schema to JSON Schema for RJSF
const fieldToJSONSchema = (field: any): JSONSchema7 => {
  const schema: JSONSchema7 = {
    type: getJSONSchemaType(field.type),
    title: field.name || field.title, // Use name first, then title
    description: field.annotation
  };

  // Add validation constraints
  if (field.validation) {
    if (field.validation.min_length) schema.minLength = field.validation.min_length;
    if (field.validation.max_length) schema.maxLength = field.validation.max_length;
    if (field.validation.min_value) schema.minimum = field.validation.min_value;
    if (field.validation.max_value) schema.maximum = field.validation.max_value;
    if (field.validation.pattern) schema.pattern = field.validation.pattern;
    if (field.validation.email) schema.format = 'email';
    if (field.validation.url) schema.format = 'uri';
  }

  // Handle enum values
  if (field.enum_values) {
    schema.enum = field.enum_values;
  }

  // Handle date fields
  if (field.type === 'date') {
    schema.format = 'date';
  }
  
  // Handle datetime fields
  if (field.type === 'datetime') {
    schema.format = 'date-time';
  }

  return schema;
};

// Map SOP types to JSON Schema types
const getJSONSchemaType = (sopType: string): JSONSchema7['type'] => {
  const typeMap: Record<string, JSONSchema7['type']> = {
    'string': 'string',
    'number': 'number',
    'integer': 'integer', 
    'boolean': 'boolean',
    'date': 'string',
    'datetime': 'string',
    'enum': 'string',
    'array': 'array',
    'object': 'object'
  };
  return typeMap[sopType] || 'string';
};

// Get appropriate UI widget for RJSF
const getUIWidget = (sopType: string): string => {
  const widgetMap: Record<string, string> = {
    'string': 'text',
    'number': 'updown',
    'integer': 'updown',
    'boolean': 'checkbox',
    'date': 'date',
    'datetime': 'text', // Use text input for datetime to avoid widget compatibility issues
    'enum': 'select'
  };
  return widgetMap[sopType] || 'text';
};

interface SchemaCardProps {
  schema: any;
  sopId?: string;
  title?: string;
  description?: string;
  showRawJson?: boolean;
  formData?: any;
  onFormDataChange?: (fieldId: string, value: any) => void;
  level?: number; // Add level to track nesting depth
}

export const SchemaCard: React.FC<SchemaCardProps> = ({
  schema,
  sopId,
  title,
  description,
  showRawJson = true,
  formData = {},
  onFormDataChange,
  level = 0 // Default to level 0
}) => {
  const { renderIcon, getCardVariantClass, shouldBeCollapsible, getDefaultExpanded } = useUIConfig();
  const [isExpanded, setIsExpanded] = useState(getDefaultExpanded(schema.ui_config));
  const hasChildren = schema.children && Array.isArray(schema.children) && schema.children.length > 0;

  // If it's a renderable field, render it directly
  if (schema.type && ['string', 'number', 'integer', 'boolean', 'date', 'datetime', 'enum', 'file'].includes(schema.type)) {
    // For file type, render custom file upload component
    if (schema.type === 'file') {
      return (
        <div className="space-y-3 p-3 border rounded-lg bg-gray-50/50">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block" title={schema.id}>
              {schema.title || schema.name}
              {schema.required && <span className="text-red-500 ml-1">*</span>}
              {schema.ordinal && (
                <span className="text-xs text-muted-foreground ml-2">({schema.ordinal})</span>
              )}
            </label>
            {schema.description && (
              <p className="text-xs text-gray-500">{schema.description}</p>
            )}
            {schema.annotation && (
              <p className="text-xs text-gray-500">{schema.annotation}</p>
            )}
          </div>
          <div className="mt-2">
            <FileUploadField
              fieldId={schema.id}
              sopId={sopId}
              value={formData[schema.id]}
              onChange={(value) => onFormDataChange?.(schema.id, value)}
              config={schema.file_config || {}}
              uiConfig={schema.ui_config}
              disabled={false}
            />
          </div>
        </div>
      );
    }

    // For datetime type, render custom datetime picker
    if (schema.type === 'datetime') {
      const handleDateTimeChange = (date: Date | null) => {
        if (date) {
          // Format date as YYYY-MM-DD HH:MM for consistency with backend
          const formatted = date.toISOString().slice(0, 16).replace('T', ' ');
          onFormDataChange?.(schema.id, formatted);
        } else {
          onFormDataChange?.(schema.id, '');
        }
      };

      const parseDateTime = (value: string): Date | null => {
        if (!value) return null;
        // Handle both ISO format and our custom format
        const isoFormat = value.includes('T') ? value : value.replace(' ', 'T');
        const date = new Date(isoFormat);
        return isNaN(date.getTime()) ? null : date;
      };

      return (
        <div className="space-y-3 p-3 border rounded-lg bg-gray-50/50">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block" title={schema.id}>
              {schema.title || schema.name}
              {schema.required && <span className="text-red-500 ml-1">*</span>}
              {schema.ordinal && (
                <span className="text-xs text-muted-foreground ml-2">({schema.ordinal})</span>
              )}
            </label>
            {schema.title && schema.title !== schema.name && (
              <p className="text-xs text-gray-600">{schema.title}</p>
            )}
            {schema.description && (
              <p className="text-xs text-gray-500">{schema.description}</p>
            )}
          </div>
          <div className="mt-2">
            <DatePicker
              selected={parseDateTime(formData[schema.id] || '')}
              onChange={handleDateTimeChange}
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              dateFormat="MMMM d, yyyy h:mm aa"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholderText="Select date and time"
            />
          </div>
        </div>
      );
    }
    
    const fieldSchema = fieldToJSONSchema(schema);
    const rjsfSchema: JSONSchema7 = {
      type: 'object',
      properties: { [schema.id]: fieldSchema },
      required: schema.required ? [schema.id] : []
    };
    const uiSchema = {
      [schema.id]: {
        'ui:widget': getUIWidget(schema.type),
        'ui:placeholder': schema.type === 'datetime' 
          ? 'YYYY-MM-DD HH:MM' 
          : schema.annotation || `Enter ${schema.title || schema.name}`,
        'ui:options': { label: false }
      }
    };
    
    return (
      <div className="space-y-3 p-3 border rounded-lg bg-gray-50/50">
        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block" title={schema.id}>
            {schema.title || schema.name}
            {schema.required && <span className="text-red-500 ml-1">*</span>}
            {schema.ordinal && (
              <span className="text-xs text-muted-foreground ml-2">({schema.ordinal})</span>
            )}
          </label>
          {schema.description && (
            <p className="text-xs text-gray-500">{schema.description}</p>
          )}
          {schema.annotation && (
            <p className="text-xs text-gray-500">{schema.annotation}</p>
          )}
        </div>
        <div className="mt-2">
          <Form
            schema={rjsfSchema}
            uiSchema={uiSchema}
            formData={{ [schema.id]: formData[schema.id] || '' }}
            validator={validator}
            showErrorList={false}
            onChange={(data) => {
              const fieldValue = data.formData[schema.id];
              onFormDataChange?.(schema.id, fieldValue);
              logger.debug('SchemaCard', `Field changed: ${schema.id} ${fieldValue}`);
            }}
          >
            <div></div>
          </Form>
        </div>
      </div>
    );
  }


  if (!hasChildren) {
    // No children and not a field - just show the content as JSON
    const cardVariantClass = getCardVariantClass(schema.ui_config?.card_variant);
    return (
      <Card className={cardVariantClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {schema.ui_config?.icon && renderIcon(schema.ui_config.icon, 'large')}
            {schema.title || schema.name}
          </CardTitle>
          {(description || schema.description) && (
            <CardDescription>{description || schema.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {showRawJson && (
            <pre className="text-xs bg-muted p-3 rounded overflow-auto">
              {JSON.stringify(schema, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    );
  }

  // Has children - render recursively
  const isCollapsible = shouldBeCollapsible(schema.ui_config);
  
  const renderContent = () => {
    // Top-level renders children as tabs
    if (level === 0) {
      return (
        <Tabs defaultValue={schema.children[0]?.id || "0"} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${schema.children.length}, 1fr)` }}>
            {schema.children.map((child: any, index: number) => (
              <TabsTrigger key={child.id || index} value={child.id || index.toString()}>
                {child.name || child.title || `Child ${index + 1}`}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {schema.children.map((child: any, index: number) => (
            <TabsContent key={child.id || index} value={child.id || index.toString()}>
              {/* Recursively render child with incremented level */}
              <SchemaCard
                schema={child}
                sopId={sopId}
                showRawJson={showRawJson}
                formData={formData}
                onFormDataChange={onFormDataChange}
                level={level + 1}
              />
            </TabsContent>
          ))}
        </Tabs>
      );
    } 
    
    // Nested levels render children as a vertical list of cards/fields
    return (
      <div className="space-y-4 pt-4">
        {schema.children.map((child: any, index: number) => (
          <SchemaCard
            key={child.id || index}
            schema={child}
            sopId={sopId}
            showRawJson={showRawJson}
            formData={formData}
            onFormDataChange={onFormDataChange}
            level={level + 1}
          />
        ))}
      </div>
    );
  };

  const cardVariantClass = getCardVariantClass(schema.ui_config?.card_variant);
  return (
    <Card className={cardVariantClass}>
      {isCollapsible ? (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center gap-2">
                {schema.ui_config?.icon && renderIcon(schema.ui_config.icon, 'large')}
                {schema.title || schema.name}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CardTitle>
              {(description || schema.description) && (
                <CardDescription>{description || schema.description}</CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {renderContent()}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {schema.ui_config?.icon && renderIcon(schema.ui_config.icon, 'large')}
              {schema.title || schema.name}
            </CardTitle>
            {(description || schema.description) && (
              <CardDescription>{description || schema.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {renderContent()}
          </CardContent>
        </>
      )}
    </Card>
  );
}; 