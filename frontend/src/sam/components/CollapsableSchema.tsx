// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Plus, ChevronRight, ChevronDown, X, GripVertical } from 'lucide-react';
import { CollapsibleProperties } from './CollapsibleProperties';
import { schemaRegistry, createDefaultObject, detectSchemaType } from '@shared/lib/schema-registry';
import { toast } from '@shared/hooks/useToast';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface CollapsableSchemaProps {
  schemaName: string;
  formData?: Record<string, any>;
  onFormDataChange?: (fieldName: string, value: any) => void;
  onAddChild?: (childType: string) => void;
  onRemove?: () => void;
  defaultOpen?: boolean;
  errors?: Record<string, string>;
  // Drag and drop props
  id?: string;
  isDraggable?: boolean;
  // Visual hierarchy props
  depth?: number;
  parentSchemaName?: string;
}

export const CollapsableSchema: React.FC<CollapsableSchemaProps> = ({
  schemaName,
  formData = {},
  onFormDataChange,
  onAddChild,
  onRemove,
  defaultOpen = false,
  errors = {},
  id,
  isDraggable = false,
  depth = 0,
  parentSchemaName
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultOpen);
  
  // Set up drag and drop sensors for children reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Set up sortable functionality if draggable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: id || formData.id || 'fallback-id',
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  // Get schema information from registry
  const properties = schemaRegistry.getPropertyDefinitions(schemaName);
  const addableChildren = schemaRegistry.getAddableChildren(schemaName);
  const relationships = schemaRegistry.getRelationships(schemaName);

  // Check if this is a recursive schema (child same as parent)
  const isRecursiveSchema = parentSchemaName === schemaName;

  // Sort children so self-referencing schema comes first
  const sortedChildren = [...addableChildren].sort((a, b) => {
    if (a === schemaName) return -1; // Self-reference goes to the left
    if (b === schemaName) return 1;
    return a.localeCompare(b); // Alphabetical for others
  });

  // Handle drag end event for children reordering
  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over?.id && formData.children) {
      const oldIndex = formData.children.findIndex((item: any) => item.id === active.id);
      const newIndex = formData.children.findIndex((item: any) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newChildren = arrayMove(formData.children, oldIndex, newIndex);
        onFormDataChange?.('children', newChildren);
      }
    }
  };

  const handleAddChild = (childType: string) => {
    if (onAddChild) {
      onAddChild(childType);
    }
  };

  // Handle adding child - delegate to parent component
  const handleAddChildDirect = (childType: string) => {
    if (onAddChild) {
      onAddChild(childType);
    } else if (onFormDataChange) {
      // Fallback: add to current object's children array
      const newChild = createDefaultObject(childType);
      // Note: parent relationships should be managed by the user, not auto-added
      
      const currentChildren = formData.children || [];
      const updatedChildren = [...currentChildren, newChild];
      
      onFormDataChange('children', updatedChildren);
      
      toast({
        title: "Child Added",
        description: `New ${childType} has been added.`,
      });
    }
  };

  // Generate visual styling based on depth and recursion
  const getVisualStyling = () => {
    const baseIndent = depth * 16; // 16px per level
    let borderColor = 'border-l-purple-500'; // Default color
    
    if (isRecursiveSchema) {
      // Different colors for recursive nesting levels
      const colors = [
        'border-l-blue-500',
        'border-l-blue-400', 
        'border-l-blue-300',
        'border-l-blue-200'
      ];
      borderColor = colors[depth % colors.length];
    }
    
    return {
      marginLeft: `${baseIndent}px`,
      borderColor: borderColor,
      paddingLeft: depth > 0 ? '12px' : '0px'
    };
  };

  // Generate a meaningful display title using available data
  const getDisplayTitle = () => {
    // Priority order for display: title, name, id
    if (formData.title) return `${schemaName}: ${formData.title}`;
    if (formData.name) return `${schemaName}: ${formData.name}`;
    if (formData.id) return `${schemaName}: ${formData.id}`;
    return schemaName;
  };

  // Check if the item has meaningful content (not just default values)
  const hasContent = () => {
    if (!formData || Object.keys(formData).length === 0) return false;
    
    try {
      // Get the default object for this schema to compare against
      const defaultObject = createDefaultObject(schemaName);
      
      for (const [key, value] of Object.entries(formData)) {
        // Skip ID field as it's always present and auto-generated
        if (key === 'id') continue;
        
        // Get the corresponding default value for this field
        const defaultValue = defaultObject[key];
        
        // Check if current value differs from default
        if (value !== defaultValue) {
          // Handle arrays - check if they have content beyond empty default
          if (Array.isArray(value)) {
            if (value.length > 0) return true;
          }
          // Handle objects - check if they have meaningful nested content
          else if (typeof value === 'object' && value !== null) {
            const hasNestedContent = Object.values(value).some(nestedVal => 
              nestedVal !== null && nestedVal !== undefined && nestedVal !== '' && 
              (!Array.isArray(nestedVal) || nestedVal.length > 0)
            );
            if (hasNestedContent) return true;
          }
          // Handle primitives - any non-default value indicates content
          else if (typeof value === 'string' && value.length > 0) {
            return true;
          }
          else if (typeof value === 'boolean' || typeof value === 'number') {
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      // If we can't get defaults, fall back to checking for any non-empty values
      console.warn(`Could not get default object for schema ${schemaName}:`, error);
      return Object.values(formData).some(value => {
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.length > 0;
        if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
        return value !== null && value !== undefined && value !== false && value !== 0;
      });
    }
  };

  // Handle remove with confirmation if needed
  const handleRemoveWithConfirmation = () => {
    if (hasContent()) {
      // Use browser confirmation for items with content
      const confirmed = window.confirm(
        `This ${schemaName} contains data. Are you sure you want to delete it?`
      );
      if (confirmed) {
        onRemove?.();
        toast({
          title: "Item Deleted",
          description: `${schemaName} has been removed.`,
        });
      }
    } else {
      // Remove immediately if no meaningful content
      onRemove?.();
      toast({
        title: "Item Deleted",
        description: `Empty ${schemaName} has been removed.`,
      });
    }
  };

  const visualStyling = getVisualStyling();

  return (
    <div style={{ marginLeft: visualStyling.marginLeft, paddingLeft: visualStyling.paddingLeft }}>
      <Card ref={setNodeRef} style={style} className={`mb-4 border-l-4 ${visualStyling.borderColor}`}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isDraggable && (
                <div
                  {...attributes}
                  {...listeners}
                  className="cursor-grab hover:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  title="Drag to reorder"
                >
                  <GripVertical className="h-4 w-4" />
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-0 h-auto"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              <span className="font-medium">{getDisplayTitle()}</span>
              <Badge variant="outline">
                {isRecursiveSchema ? 'Nested' : 'Schema'}
              </Badge>
              {isRecursiveSchema && (
                <Badge variant="secondary" className="text-xs">
                  Level {depth + 1}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {properties.length} properties
              </span>
            </div>
            {onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveWithConfirmation}
                className="p-1 h-auto text-red-500 hover:text-red-700 hover:bg-red-50"
                title="Remove this item"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        
        {isExpanded && (
          <CardContent>
            <div className="space-y-4">
              {/* Properties Section */}
              <CollapsibleProperties 
                title="Properties"
                schema_name={schemaName}
                defaultOpen={true}
                formData={formData}
                onFormDataChange={onFormDataChange}
                errors={errors}
                excludedProperties={['children', 'parents']}
                />

              {/* Render children recursively with drag and drop */}
              {formData.children && formData.children.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground">Children:</h4>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={formData.children.map((item: any) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {formData.children.map((child: any, index: number) => {
                        // Try to detect schema type, with intelligent fallbacks
                        let childSchemaName = detectSchemaType(child);
                        
                        // If detection fails, use context from parent's addable children
                        if (!childSchemaName && addableChildren.length > 0) {
                          // If there's only one possible child type, use it
                          if (addableChildren.length === 1) {
                            childSchemaName = addableChildren[0];
                          } else {
                            // Try to match based on properties the child actually has
                            for (const possibleType of addableChildren) {
                              const typeProperties = schemaRegistry.getPropertyDefinitions(possibleType);
                              const hasMatchingProperties = typeProperties.some(prop => 
                                child.hasOwnProperty(prop.name)
                              );
                              if (hasMatchingProperties) {
                                childSchemaName = possibleType;
                                break;
                              }
                            }
                          }
                        }
                        
                        // Final fallback
                        if (!childSchemaName) {
                          childSchemaName = addableChildren[0] || 'Unknown';
                        }
                        return (
                          <CollapsableSchema
                            key={child.id || index}
                            schemaName={childSchemaName}
                            formData={child}
                            onFormDataChange={(fieldName, value) => {
                              // Update this specific child
                              const updatedChildren = [...(formData.children || [])];
                              updatedChildren[index] = { ...child, [fieldName]: value };
                              onFormDataChange?.('children', updatedChildren);
                            }}
                            onAddChild={(childType) => {
                              // Add child to this child (recursive)
                              const newGrandChild = createDefaultObject(childType);
                              // Note: parent relationships should be managed by the user, not auto-added
                              
                              const updatedChildren = [...(formData.children || [])];
                              if (!updatedChildren[index].children) {
                                updatedChildren[index].children = [];
                              }
                              updatedChildren[index].children.push(newGrandChild);
                              onFormDataChange?.('children', updatedChildren);
                            }}
                            onRemove={() => {
                              // Remove this child
                              const updatedChildren = (formData.children || []).filter((_: any, i: number) => i !== index);
                              onFormDataChange?.('children', updatedChildren);
                            }}
                            defaultOpen={false}
                            depth={depth + 1}
                            parentSchemaName={schemaName}
                            id={child.id}
                            isDraggable={true}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {/* Addable Children Section */}
              {sortedChildren.length > 0 && (
                <div className="mt-4 p-3 bg-muted/30 rounded">
                  <h4 className="text-sm font-medium mb-2">Available Child Types:</h4>
                  <div className="flex gap-2">
                    {sortedChildren.map((child, index) => (
                      <Button 
                        key={index} 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 justify-start"
                        onClick={() => {
                          // Try onAddChild first (for parent-managed children)
                          if (onAddChild) {
                            handleAddChild(child);
                          } else {
                            // Fallback to direct child addition
                            handleAddChildDirect(child);
                          }
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {child}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}; 