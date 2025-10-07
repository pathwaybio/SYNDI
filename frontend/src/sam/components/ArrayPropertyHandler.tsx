// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Plus } from 'lucide-react';
import { CollapsableSchema } from './CollapsableSchema';
import { schemaRegistry, createDefaultObject, detectSchemaType } from '@shared/lib/schema-registry';
import { logger } from '@shared/lib/logger';
import { z } from 'zod';
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

interface ArrayPropertyHandlerProps {
  propertyName: string;
  parentSchemaName: string;
  formData: any[];
  onFormDataChange: (newArray: any[]) => void;
  errors?: Record<string, string>;
  title?: string;
}

export const ArrayPropertyHandler: React.FC<ArrayPropertyHandlerProps> = ({
  propertyName,
  parentSchemaName,
  formData = [],
  onFormDataChange,
  errors = {},
  title
}) => {
  // Set up drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end event
  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = formData.findIndex((item) => item.id === active.id);
      const newIndex = formData.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newArray = arrayMove(formData, oldIndex, newIndex);
        onFormDataChange(newArray);
      }
    }
  };
  // Discover the array item type from the schema registry
  const parentProperties = schemaRegistry.getPropertyDefinitions(parentSchemaName);
  const arrayProperty = parentProperties.find(prop => prop.name === propertyName);
  
  if (!arrayProperty) {
    return (
      <Card className="mb-4">
        <CardContent className="text-center py-6 text-red-500">
          Property '{propertyName}' not found in schema '{parentSchemaName}'
        </CardContent>
      </Card>
    );
  }

  // Extract the item schema from the array property
  const getArrayItemSchema = () => {
    let arraySchema = arrayProperty.zodType;
    
    // Unwrap optional/default wrappers
    while (arraySchema instanceof z.ZodOptional || 
           arraySchema instanceof z.ZodDefault) {
      if (arraySchema instanceof z.ZodDefault) {
        arraySchema = arraySchema._def.innerType;
      } else {
        arraySchema = arraySchema.unwrap();
      }
    }
    
    if (arraySchema instanceof z.ZodArray) {
      return arraySchema.element;
    }
    
    return null;
  };

  // Find the schema name for the array items using schema registry relationships
  const getArrayItemSchemaName = () => {
    // Use the schema registry's relationship discovery
    const relationships = schemaRegistry.getRelationships(parentSchemaName);
    const containsRelationship = relationships.find(rel => 
      rel.type === 'contains' && rel.propertyName === propertyName
    );
    
    if (containsRelationship) {
      return containsRelationship.targetSchema;
    }
    
    return null;
  };

  const arrayItemSchemaName = getArrayItemSchemaName();
  
  if (!arrayItemSchemaName) {
    return (
      <Card className="mb-4">
        <CardContent className="text-center py-6 text-muted-foreground">
          Could not determine schema type for array '{propertyName}'
        </CardContent>
      </Card>
    );
  }

  // Create a new item using the simplified schema registry function
  const createNewItem = () => {
    return createDefaultObject(arrayItemSchemaName);
  };

  const handleAddItem = () => {
    const newItem = createNewItem();
    onFormDataChange([...formData, newItem]);
  };

  const handleUpdateItem = (index: number, updatedItem: any) => {
    const newArray = [...formData];
    newArray[index] = updatedItem;
    onFormDataChange(newArray);
  };

  const handleRemoveItem = (index: number) => {
    const newArray = formData.filter((_, i) => i !== index);
    onFormDataChange(newArray);
  };

  // Handle adding child to a specific item in the array
  const handleAddChildToItem = (index: number, childType: string) => {
    const newArray = [...formData];
    const parentItem = newArray[index];
    
    // Create new child object using schema registry
    const newChild = createDefaultObject(childType);
    
    // Note: parent relationships should be managed by the user, not auto-added
    // If the schema supports parents, user can add manually
    
    // Add to parent's children array
    if (!parentItem.children) {
      parentItem.children = [];
    }
    parentItem.children.push(newChild);
    
    // Update the array
    onFormDataChange(newArray);
  };

  // Render top-level items only - children handled by CollapsableSchema recursively
  const renderTopLevelItem = (item: any, itemIndex: number) => {
    // For array properties, we should prefer the expected schema type from the relationship
    // Only fall back to detection if the expected type doesn't match
    const detectedType = detectSchemaType(item);
    
    // Use the array's expected item schema if detection fails or gives unexpected result
    let schemaName = arrayItemSchemaName;
    
    // Only use detected type if it makes sense
    if (detectedType && detectedType !== schemaName) {
      // Get parent relationships to validate the detected type
      const parentRelationships = schemaRegistry.getRelationships(parentSchemaName);
      const isValidChildType = parentRelationships.some(rel => 
        rel.propertyName === propertyName && rel.targetSchema === detectedType
      );
      
      if (isValidChildType) {
        schemaName = detectedType;
      } else if (detectedType !== arrayItemSchemaName) {
        logger.warn('ArrayPropertyHandler', `Detected type ${detectedType} is not valid for ${propertyName}, using ${arrayItemSchemaName}`);
      }
    }
    
    // Debug logging
    if (propertyName === 'taskgroups') {
      logger.debug('ArrayPropertyHandler', `Rendering taskgroup item ${itemIndex}`, undefined, {
        detectedType,
        arrayItemSchemaName,
        finalSchemaName: schemaName,
        itemKeys: Object.keys(item),
        hasUIConfig: !!item.ui_config
      });
    }
    
    return (
      <div key={`${propertyName}-item-${itemIndex}`} className="mb-4">
        <CollapsableSchema
          schemaName={schemaName}
          formData={item}
          onFormDataChange={(fieldName, value) => {
            const updatedItem = { ...item, [fieldName]: value };
            handleUpdateItem(itemIndex, updatedItem);
          }}
          onAddChild={(childType) => {
            handleAddChildToItem(itemIndex, childType);
          }}
          onRemove={() => handleRemoveItem(itemIndex)}
          defaultOpen={false}
          errors={errors[`${itemIndex}`] ? { [itemIndex]: errors[`${itemIndex}`] } : {}}
          id={item.id}
          isDraggable={true}
          depth={0}
          parentSchemaName={parentSchemaName}
        />
      </div>
    );
  };

  // Generate display title
  const displayTitle = title || arrayProperty.uiConfig?.title || propertyName;
  
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{displayTitle}</span>
            <Badge variant="outline">{formData.length} items</Badge>
            <Badge variant="secondary">{arrayItemSchemaName}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddItem}>
            <Plus className="h-4 w-4 mr-1" />
            Add {arrayItemSchemaName}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {formData.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={formData.map(item => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {formData.map((item: any, index: number) => 
                renderTopLevelItem(item, index)
              )}
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            No {displayTitle.toLowerCase()} defined. Click "Add {arrayItemSchemaName}" to create one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 