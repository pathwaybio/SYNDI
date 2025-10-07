// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Filename component extraction utilities for ELN drafts
 * 
 * Extracts filename components from schema and form data
 * following the schema-agnostic approach. Returns arrays for backend processing.
 */

import { SOP } from '@shared/types/sop';
import { logger } from '@shared/lib/logger';

export interface FilenameComponent {
  order: number;
  value: string;
  fieldId: string;
}

export interface FilenameData {
  filename_variables: string[];  // Ordered component values (may include empty strings)
  field_ids: string[];          // Corresponding field IDs for fallback
}

/**
 * Recursively find all filename components in a schema
 * Uses schema-agnostic approach: only looks for filename_component: true + order property
 */
function findFilenameComponents(
  schema: any, 
  formData: Record<string, any>
): FilenameComponent[] {
  const components: FilenameComponent[] = [];
  
  logger.debug('filename-utils', 'findFilenameComponents called');
  logger.debug('filename-utils', `Schema type: ${typeof schema}, has taskgroups: ${!!schema.taskgroups}`);

  // Recursive traversal function
  function traverse(element: any): void {
    logger.debug('filename-utils', `Traversing element: ${element.id || 'no-id'}, type: ${element.type || 'no-type'}`);
    
    // Check if this element has children with filename_component info
    if (element.children && Array.isArray(element.children)) {
      logger.debug('filename-utils', `Element ${element.id} has ${element.children.length} children`);
      
      for (const child of element.children) {
        if (child.filename_component === true && typeof child.order === 'number') {
          // This element contributes to filename - get its form value
          const value = formData[element.id] || ''; // Use element.id (parent), not child.id
          logger.debug('filename-utils', `Found filename component: ${element.id}, order: ${child.order}, value: "${value}"`);
          
          components.push({
            order: child.order,
            value: String(value), // Convert to string, even if empty
            fieldId: element.id   // Use parent element's ID
          });
          break; // Only need one filename_component child per element
        }
      }
      
      // Continue recursive traversal of children
      for (const child of element.children) {
        traverse(child);
      }
    }
  }

  // Start traversal from taskgroups (top-level containers)
  if (schema.taskgroups && Array.isArray(schema.taskgroups)) {
    logger.debug('filename-utils', `Starting traversal of ${schema.taskgroups.length} taskgroups`);
    for (const taskgroup of schema.taskgroups) {
      logger.debug('filename-utils', `Processing taskgroup: ${taskgroup.id || 'no-id'}`);
      traverse(taskgroup);
    }
  } else {
    logger.debug('filename-utils', 'No taskgroups found in schema');
  }

  return components;
}

/**
 * Extract filename variables and field IDs from SOP template and form data
 * Returns arrays for backend processing - backend builds the actual filename
 */
export function extractFilenameData(
  sop: SOP,
  formData: Record<string, any>
): FilenameData {
  logger.debug('filename-utils', `Starting filename extraction with ${Object.keys(formData).length} form fields`);
  logger.debug('filename-utils', `Form data keys: [${Object.keys(formData).join(', ')}]`);
  logger.debug('filename-utils', `SOP has ${sop.taskgroups?.length || 0} taskgroups`);
  
  // Extract filename components from schema
  const components = findFilenameComponents(sop, formData);
  
  logger.debug('filename-utils', `Found ${components.length} filename components`);
  components.forEach(comp => {
    logger.debug('filename-utils', `Component: ${comp.fieldId}, order: ${comp.order}, value: "${comp.value}"`);
  });
  
  // Sort by order (ascending)
  components.sort((a, b) => a.order - b.order);
  
  // Build parallel arrays for backend
  const filename_variables: string[] = [];
  const field_ids: string[] = [];
  
  for (const component of components) {
    filename_variables.push(component.value); // May be empty string
    field_ids.push(component.fieldId);
  }
  
  logger.debug('filename-utils', `Final arrays: variables=[${filename_variables.join(',')}], fields=[${field_ids.join(',')}]`);
  
  return {
    filename_variables,
    field_ids
  };
}

/**
 * Legacy function for backward compatibility
 * Now uses extractFilenameData and returns a simple title
 */
export function generateDraftFilename(
  sop: SOP,
  formData: Record<string, any>,
  username: string
): string {
  const { filename_variables } = extractFilenameData(sop, formData);
  
  // Simple title for display purposes
  const hasComponents = filename_variables.some(v => v.length > 0);
  if (hasComponents) {
    const nonEmptyComponents = filename_variables.filter(v => v.length > 0);
    return `Draft - ${username} - ${nonEmptyComponents.join('-')} - ${new Date().toLocaleString()}`;
  }
  
  return `Draft - ${username} - ${new Date().toLocaleString()}`;
}

/**
 * Generate the full draft path including SOP ID (legacy)
 */
export function generateDraftPath(
  sopId: string,
  filename: string
): string {
  return `drafts/${sopId}/${filename}`;
} 