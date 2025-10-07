// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { SOPTemplateSchema, SOPTemplateSchemaType } from '../../../build/SOPTemplateSchema';

// Re-export the main SOP schema type, renaming to avoid confusion with the SOPTemplateSchema type
export type SOP = SOPTemplateSchemaType;

// SOP metadata for listing
export interface SOPMetadata {
  id: string;
  name: string;
  title: string;
  version: string;
  author?: string;
  date_published?: string;
  description?: string;
  keywords: string[];
  filename?: string;
}

// SOP list response from API
export interface SOPListResponse {
  sops: SOPMetadata[];
  total: number;
}

// SOP load response from API
export interface SOPLoadResponse {
  sop: SOP;
  metadata: SOPMetadata;
}

// Schema loading states
export type SchemaLoadingState = 'idle' | 'loading' | 'success' | 'error';

// Schema loading error types
export interface SchemaLoadingError {
  type: 'validation' | 'network' | 'parse' | 'unknown';
  message: string;
  details?: any;
}

// Schema loader result
export interface SchemaLoaderResult {
  state: SchemaLoadingState;
  data?: SOP;
  error?: SchemaLoadingError;
  metadata?: SOPMetadata;
}

// File upload result
export interface FileUploadResult {
  file: File;
  content: string;
  type: 'yaml' | 'json';
}

// URL loading options
export interface URLLoadingOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

// Schema validation result
export interface SchemaValidationResult {
  isValid: boolean;
  errors: z.ZodError | null;
  warnings: string[];
}

// Form resolution types
export interface FormField {
  id: string;
  path: string[];
  field: any;
  parent?: FormField;
  children?: FormField[];
}

export interface FormResolution {
  fields: FormField[];
  tabs: any[];
  validation: SchemaValidationResult;
}

// Export the Zod schema for runtime validation
export { SOPTemplateSchema }; 