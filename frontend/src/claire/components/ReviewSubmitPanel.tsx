// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useMemo } from 'react';
import { ELNFormData } from '@claire/types/eln';
import { SOP } from '@shared/types/sop';
import { SchemaElement } from '@sam/types';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Alert, AlertDescription } from '@shared/components/ui/alert';
import { Badge } from '@shared/components/ui/badge';
import { Loader2, CheckCircle, AlertCircle, Send, ChevronDown, ChevronRight, Info, FileText } from 'lucide-react';
import { logger } from '@shared/lib/logger';
import { useUIConfig } from '@shared/lib/ui-config-provider';

// ===== TYPE EXTENSIONS =====
interface FieldElement extends SchemaElement {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'enum' | 'array' | 'file';
}

interface ContainerElement extends SchemaElement {
  children: SchemaElement[];
}

interface ValidationSummary {
  allFields: FieldElement[];
  requiredFields: FieldElement[];
  missingRequiredFields: FieldElement[];
  validationErrors: number;
  isFormValid: boolean;
  totalFields: number;
}

interface ReviewSubmitPanelProps {
  sop: SOP;
  elnData: ELNFormData;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

// ===== CONSTANTS =====
const FIELD_TYPES = ['string', 'number', 'integer', 'boolean', 'date', 'datetime', 'enum', 'array', 'file'] as const;

const CSS_CLASSES = {
  fieldRow: 'grid grid-cols-1 sm:grid-cols-[2fr_3fr] gap-x-4 gap-y-1 py-1 px-4 border-b border-muted/50 last:border-b-0',
  zebra: {
    even: 'bg-muted',
    odd: 'bg-background'
  }
} as const;



/**
 * Gets display text with fallback hierarchy: name → title → description → id
 */
const getDisplayText = (element: SchemaElement): string => {
  return element.name || element.title || element.description || element.id || 'Unnamed';
};

/**
 * Gets tooltip text: description → title → null
 */
const getTooltipText = (element: SchemaElement): string | null => {
  return element.description || element.title || null;
};

/**
 * Type guard to check if element is a field
 */
const isField = (element: SchemaElement): element is FieldElement => {
  return Boolean(element.type && FIELD_TYPES.includes(element.type as typeof FIELD_TYPES[number]));
};

/**
 * Type guard to check if element is a container
 */
const isContainer = (element: SchemaElement): element is ContainerElement => {
  return Boolean(element.children && Array.isArray(element.children) && element.children.length > 0);
};

/**
 * Recursively collects all container IDs for expansion state
 */
const collectContainerIds = (elements: SchemaElement[]): string[] => {
  const ids: string[] = [];
  
  for (const element of elements) {
    if (isContainer(element)) {
      ids.push(element.id);
      ids.push(...collectContainerIds(element.children));
    }
  }
  
  return ids;
};

/**
 * Recursively collects all fields from a schema element
 */
const collectFields = (element: SchemaElement): FieldElement[] => {
  const fields: FieldElement[] = [];
  
  if (isField(element)) {
    fields.push(element);
  } else if (isContainer(element)) {
    for (const child of element.children) {
      fields.push(...collectFields(child));
    }
  }
  
  return fields;
};

/**
 * Renders field value with appropriate formatting based on type
 */
const renderFieldValue = (field: FieldElement, value: unknown): React.ReactNode => {
  const { getIconSizeClass } = useUIConfig();
  if (value === undefined || value === null || value === '') {
      return <span className="text-muted-foreground italic">Not provided</span>;
    }
    
    switch (field.type) {
      case 'boolean':
        return value ? (
          <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className={`${getIconSizeClass('small')} mr-1`} />
            Yes
          </Badge>
        ) : (
          <Badge variant="outline">No</Badge>
        );
        
      case 'array':
        if (Array.isArray(value)) {
          return (
            <div className="space-y-1">
              {value.map((item, index) => (
                <div key={index} className="bg-muted px-2 py-1 rounded text-sm">
                  {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                </div>
              ))}
            </div>
          );
        }
        return <span className="text-muted-foreground">Invalid array data</span>;
        
      case 'date':
      try {
        return <span>{new Date(String(value)).toLocaleDateString()}</span>;
      } catch {
        return <span className="font-mono text-sm">{String(value)}</span>;
      }
        
      case 'datetime':
      try {
        return <span>{new Date(String(value)).toLocaleString()}</span>;
      } catch {
        return <span className="font-mono text-sm">{String(value)}</span>;
      }
      
    case 'enum':
      return (
        <Badge variant="secondary" className="font-mono">
          {String(value)}
        </Badge>
      );
        
    case 'file':
      if (value && typeof value === 'object' && 'metadata' in value) {
        const fileValue = value as any;
        if (fileValue.metadata?.originalNames && fileValue.metadata.originalNames.length > 0) {
          return (
            <div className="space-y-1">
              {fileValue.metadata.originalNames.map((name: string, index: number) => {
                const size = fileValue.metadata?.sizes?.[index] || 0;
                return (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    <span>{name}</span>
                    <span className="text-muted-foreground">
                      ({(size / 1024 / 1024).toFixed(3)} MB)
                    </span>
                  </div>
                );
              })}
            </div>
          );
        }
      }
      return <span className="text-muted-foreground italic">No files uploaded</span>;
        
    default:
      return <span className="font-mono text-sm">{String(value)}</span>;
    }
  };
  
// ===== COMPONENT =====
/**
 * ReviewSubmitPanel - Displays form data for review and submission
 * 
 * Shows all user-entered data in a read-only format organized by schema structure.
 * Provides validation status and submission controls.
 */
export const ReviewSubmitPanel: React.FC<ReviewSubmitPanelProps> = ({
  sop,
  elnData,
  onSubmit,
  isSubmitting = false
}) => {
  const { renderIcon, getIconSizeClass } = useUIConfig();
  
  // ===== STATE =====
  const initialExpandedState = useMemo(() => {
    const initialState: Record<string, boolean> = {};
    const allIds = collectContainerIds((sop.taskgroups || []) as SchemaElement[]);
    
    for (const id of allIds) {
      initialState[id] = true;
    }
    
    return initialState;
  }, [sop.taskgroups]);

  const [expandedContainers, setExpandedContainers] = useState<Record<string, boolean>>(initialExpandedState);

  // ===== COMPUTED VALUES =====
  const validationSummary = useMemo((): ValidationSummary => {
    const allFields = sop.taskgroups ? 
      sop.taskgroups.flatMap(taskgroup => collectFields(taskgroup as SchemaElement)) : 
      [];
    
    const requiredFields = allFields.filter(field => field.required);
    
    const missingRequiredFields = requiredFields.filter(field => {
      const value = elnData.values[field.id];
      return value === undefined || value === null || value === '';
    });
    
    const validationErrors = missingRequiredFields.length;
    const isFormValid = validationErrors === 0;
    const totalFields = Object.keys(elnData.values).length;
    
    return {
      allFields,
      requiredFields,
      missingRequiredFields,
      validationErrors,
      isFormValid,
      totalFields
    };
  }, [sop.taskgroups, elnData.values]);

  // ===== EVENT HANDLERS =====
  const toggleExpansion = (containerId: string): void => {
    setExpandedContainers(prev => ({
      ...prev,
      [containerId]: !prev[containerId]
    }));
  };

  // ===== RENDER FUNCTIONS =====
  const renderField = (field: FieldElement, index: number): React.ReactNode => {
    const value = elnData.values[field.id];
    const hasValue = value !== undefined && value !== null && value !== '';
    
    logger.debug('ReviewSubmitPanel', `Rendering field ${field.id}:`, value);
    
    return (
      <div 
        {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'field-row' } : {})}
        key={field.id} 
        className={`${CSS_CLASSES.fieldRow} ${index % 2 === 0 ? CSS_CLASSES.zebra.even : CSS_CLASSES.zebra.odd}`}
      >
        {/* Field Name Column */}
        <div className="flex items-start gap-1">
          <div 
            {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'field-name' } : {})}
            className="font-medium text-sm flex items-center gap-1 flex-wrap"
          >
            {getDisplayText(field)}
            {field.required && <span className="text-red-500">*</span>}
            {getTooltipText(field) && (
              <span 
                className="cursor-help" 
                title={getTooltipText(field)!}
              >
                <Info 
                  {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'info-icon' } : {})}
                  className={`${getIconSizeClass('small')} text-muted-foreground hover:text-foreground`} 
                />
              </span>
            )}
          </div>
        </div>
        
        {/* Field Value Column */}
        <div className="flex flex-col items-start sm:items-end text-left sm:text-right">
          <div 
            {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'field-value' } : {})}
            className="w-full"
          >
            {renderFieldValue(field, value)}
          </div>
          {field.required && !hasValue && (
            <div className="text-xs text-red-500 mt-1">Required</div>
          )}
        </div>
      </div>
    );
  };

  const renderCard = (element: ContainerElement): React.ReactNode => {
    const isExpanded = expandedContainers[element.id];
    const tooltipText = getTooltipText(element);

    return (
      <Card 
        {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'taskgroup-card' } : {})}
        key={element.id} 
        className="mb-3"
      >
        <CardHeader 
          {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'card-header' } : {})}
          className="pb-3"
        >
          <div 
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => toggleExpansion(element.id)}
          >
            <CardTitle className="flex items-center gap-2">
              {element.ui_config?.icon && renderIcon(element.ui_config.icon, 'large')}
              {getDisplayText(element)}
              {tooltipText && (
                <span className="cursor-help" title={tooltipText}>
                  <Info 
                    {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'info-icon' } : {})}
                    className={`${getIconSizeClass('small')} text-muted-foreground hover:text-foreground`} 
                  />
                </span>
              )}
            </CardTitle>
            <Button 
              {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'card-toggle' } : {})}
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 hover:bg-muted/50"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpansion(element.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown 
                  {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'chevron-down' } : {})}
                  className={getIconSizeClass('medium')} 
                />
              ) : (
                <ChevronRight 
                  {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'chevron-right' } : {})}
                  className={getIconSizeClass('medium')} 
                />
          )}
            </Button>
          </div>
        </CardHeader>
        
        {isExpanded && (
          <CardContent 
            {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'card-content' } : {})}
            className="pt-0"
          >
            <div>
              {element.children.map((child, childIndex) => 
                isField(child) ? renderField(child, childIndex) : renderSchemaElement(child, 1)
              )}
          </div>
        </CardContent>
        )}
      </Card>
    );
  };
  
  const renderNestedSection = (element: ContainerElement, level: number): React.ReactNode => {
    const tooltipText = getTooltipText(element);
    
    return (
      <div key={element.id} className="border-l-2 border-muted pl-4 mb-3">
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          {element.ui_config?.icon && renderIcon(element.ui_config.icon, 'medium')}
          {getDisplayText(element)}
          {/* Only show ordinal for level 2+ (not taskgroups or immediate children/tabs) */}
          {element.ordinal && level > 1 && (
            <span className="text-xs text-muted-foreground">
              ({element.ordinal})
            </span>
          )}
          {tooltipText && (
            <span className="cursor-help" title={tooltipText}>
              <Info className={`${getIconSizeClass('small')} text-muted-foreground hover:text-foreground`} />
            </span>
          )}
        </h4>
        <div>
          {element.children.map((child, childIndex) => 
            isField(child) ? renderField(child, childIndex) : renderSchemaElement(child, level + 1)
          )}
        </div>
      </div>
    );
  };
  
  const renderSchemaElement = (element: SchemaElement, level: number = 0): React.ReactNode => {
    // Skip elements without data
    const fields = collectFields(element);
    if (fields.length === 0) return null;

    const hasData = fields.some(field => {
      const value = elnData.values[field.id];
      return value !== undefined && value !== null && value !== '';
    });

    if (!hasData) return null;

    // Render based on element type and level
    if (isField(element)) {
      return renderField(element, 0);
    }

    if (isContainer(element)) {
      return level === 0 ? renderCard(element) : renderNestedSection(element, level);
    }

    return null;
  };

    // ===== RENDER =====
  logger.debug('ReviewSubmitPanel', `Form validation: ${validationSummary.validationErrors} errors, ${validationSummary.totalFields} total fields, valid=${validationSummary.isFormValid}`);
  
  // Test attributes for e2e testing (NODE_ENV=test)
  const testAttrs = process.env.NODE_ENV === 'test' ? {
    'data-testid': 'review-submit-panel'
  } : {};
  
  return (
    <div {...testAttrs} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Review & Submit</h2>
          <p className="text-muted-foreground">
            Review your data before final submission
          </p>
        </div>
        <div className="flex items-center gap-2">
          {validationSummary.isFormValid ? (
            <Badge 
              {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'ready-badge' } : {})}
              variant="default" 
              className="bg-green-100 text-green-800"
            >
              <CheckCircle className={`${getIconSizeClass('small')} mr-1`} />
              Ready to Submit
            </Badge>
          ) : (
            <Badge 
              {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'missing-fields-badge' } : {})}
              variant="destructive"
            >
              <AlertCircle className={`${getIconSizeClass('small')} mr-1`} />
              {validationSummary.validationErrors} Missing Required Field{validationSummary.validationErrors !== 1 ? 's' : ''}
            </Badge>
          )}
          <Badge 
            {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'total-fields-badge' } : {})}
            variant="outline"
          >
            {validationSummary.totalFields} Field{validationSummary.totalFields !== 1 ? 's' : ''} Completed
          </Badge>
        </div>
      </div>
      
      {/* Validation Summary */}
      {!validationSummary.isFormValid && (
        <Alert variant="destructive">
          <AlertCircle className={getIconSizeClass('medium')} />
          <AlertDescription>
            Please complete the required fields before submitting. Missing fields: {validationSummary.missingRequiredFields.map(f => getDisplayText(f)).join(', ')}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Form Data Review */}
      <div className="space-y-4">
        {sop.taskgroups && sop.taskgroups.length > 0 ? (
          sop.taskgroups.map(taskgroup => renderSchemaElement(taskgroup as SchemaElement, 0))
        ) : (
          <Alert>
            <AlertDescription>
              No task groups found in this SOP.
            </AlertDescription>
          </Alert>
        )}
      </div>
      
      {/* Summary for debugging */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        Form Data Summary: {validationSummary.totalFields} fields | Required: {validationSummary.requiredFields.length} | Missing: {validationSummary.validationErrors}
      </div>
      
      {/* Submission Controls */}
      <div className="flex justify-end gap-2 pt-6 border-t">
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          disabled={isSubmitting}
        >
          Back to Form
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !validationSummary.isFormValid}
        >
          {isSubmitting ? (
            <Loader2 
              {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'loading-icon' } : {})}
              className={`${getIconSizeClass('medium')} mr-2 animate-spin`} 
            />
          ) : (
            <Send 
              {...(process.env.NODE_ENV === 'test' ? { 'data-testid': 'send-icon' } : {})}
              className={`${getIconSizeClass('medium')} mr-2`} 
            />
          )}
          Submit ELN
        </Button>
      </div>
    </div>
  );
}; 