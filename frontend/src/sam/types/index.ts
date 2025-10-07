// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

// SAM (SOP Authoring) Types
// 
// IMPORTANT: This file follows schema-agnostic principles
// - Never embed assumptions about field names or patterns
// - Use only explicit schema declarations (format, type, ui_config, validation)
// - Discover structure from actual schemas at runtime

// Minimal assumptions allowed (from agent context):
// - Schema elements with children have an 'id' (required)
// - name, title, description fields are optional (can be used for rendering, falling back in turn)
// - Use explicit schema declarations only

export interface SchemaElement {
  id: string;                    // Required for all schema elements
  ui_config?: any;               // Optional UI configuration
  name?: string;                 // Optional display name
  title?: string;                // Optional display title  
  description?: string;          // Optional description
  type?: string;                 // Optional type for rendering as RJSF inputs (from agent_context.md)
  required?: boolean;            // Optional required flag - whether or not the field is required in the sop form
  validation?: any;              // Optional validation rules
  children?: SchemaElement[];    // Optional nested elements
  parent?: string[];             // Optional parent references
  ordinal?: number;              // Optional ordinal value for rendering  

  // Allow any other properties to be discovered from schema
  [key: string]: any;
}

// Re-export SOP type from shared types for convenience
export type { SOP } from '@shared/types/sop';
