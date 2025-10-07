// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * ELN Data Types and Interfaces
 * TypeScript interfaces for ELN submission, retrieval, and management
 */

// Core ELN data structures
export interface ELNSubmissionRequest {
  /** SOP identifier */
  sop_id: string;
  /** ELN status (draft or final) */
  status: 'draft' | 'final';
  /** Form data submitted by user */
  form_data: Record<string, any>;
  /** SOP field definitions for filename generation */
  sop_fields: SOPField[];
}

export interface ELNSubmissionResponse {
  /** Unique ELN identifier (for final ELNs) */
  eln_uuid?: string;
  /** Draft identifier (for drafts) */
  draft_id?: string;
  /** Draft UUID (for drafts) */
  draft_uuid?: string;
  /** Generated filename */
  filename: string;
  /** SOP identifier */
  sop_id: string;
  /** User identifier */
  user_id: string;
  /** ELN status */
  status: 'draft' | 'final';
  /** Submission timestamp */
  timestamp: string;
  /** ELN size in bytes */
  size_bytes: number;
  /** ELN checksum (final only) */
  checksum?: string;
  /** Filename variables extracted from form data */
  variables?: string[];
}

export interface ELNMetadata {
  /** Unique ELN identifier (for final ELNs) */
  eln_uuid?: string;
  /** Draft identifier (for drafts) */
  draft_id?: string;
  /** Draft UUID (for drafts) */
  draft_uuid?: string;
  /** Generated filename */
  filename: string;
  /** SOP identifier */
  sop_id: string;
  /** User identifier */
  user_id: string;
  /** ELN status */
  status: 'draft' | 'final';
  /** Submission timestamp */
  timestamp: string;
  /** ELN size in bytes */
  size_bytes: number;
  /** ELN checksum (final only) */
  checksum?: string;
  /** Filename variables extracted from form data */
  variables: string[];
}

export interface ELNData {
  /** Unique ELN identifier (for final ELNs) */
  eln_uuid?: string;
  /** Draft identifier (for drafts) */
  draft_id?: string;
  /** Draft UUID (for drafts) */
  draft_uuid?: string;
  /** Generated filename */
  filename: string;
  /** SOP identifier */
  sop_id: string;
  /** User identifier */
  user_id: string;
  /** ELN status */
  status: 'draft' | 'final';
  /** Submission timestamp */
  timestamp: string;
  /** Form data submitted by user */
  form_data: Record<string, any>;
  /** SOP field definitions */
  sop_fields: SOPField[];
}

export interface ELNDataResponse {
  /** Complete ELN data */
  eln_data: ELNData;
  /** ELN metadata */
  metadata: ELNMetadata;
}

// Prerequisite queries
export interface PrerequisiteQueryRequest {
  /** SOP identifier to search within */
  sop_id: string;
  /** Field filters for matching ELNs */
  field_filters: Record<string, any>;
}

export interface PrerequisiteQueryResponse {
  /** List of matching ELNs with data and metadata */
  matching_elns: Array<{
    eln_data: ELNData;
    metadata: ELNMetadata;
  }>;
}

// API Filter types
export interface ELNListFilters {
  /** Filter by user ID */
  user_id?: string;
  /** Filter by status */
  status?: 'draft' | 'final';
  /** Maximum number of ELNs to return */
  limit?: number;
}

// Storage validation
export interface ImmutabilityValidationResponse {
  /** Whether the filename is available */
  is_valid: boolean;
  /** Human-readable message */
  message: string;
}

// SOP Field interfaces (for reference)
export interface SOPField {
  /** Field identifier */
  id: string;
  /** Field name */
  name: string;
  /** Field title */
  title: string;
  /** Field type */
  type: 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'array';
  /** Whether field is required */
  required?: boolean;
  /** Parent container IDs */
  parents?: string[];
  /** Child components - configuration objects not rendered as inputs */
  children?: Array<ELNFilenameComponent | ExportConfiguration>;
  /** Field annotation */
  annotation?: string;
  /** Validation rules */
  validation?: FieldValidation;
  /** UI configuration */
  ui_config?: UIConfiguration;
  /** Form data values */
  [key: string]: any;
}

/**
 * Configuration object for ELN filename generation
 * 
 * This interface represents configuration objects placed in `children` arrays
 * to avoid being rendered as form inputs. See agent_context.md section on
 * "Schema Design: Children vs Properties for Non-Renderable Elements"
 */
export interface ELNFilenameComponent {
  /** Whether this field is a component of the ELN filename */
  filename_component: boolean;
  /** Order of the component in the ELN filename */
  order: number;
  /** Parent field IDs */
  parent?: string[];
}

/**
 * Configuration object for field export settings
 * 
 * This interface represents configuration objects placed in `children` arrays
 * to avoid being rendered as form inputs. See agent_context.md section on
 * "Schema Design: Children vs Properties for Non-Renderable Elements"
 */
export interface ExportConfiguration {
  /** Whether export is enabled */
  enabled?: boolean;
  /** Export name */
  name?: string;
  /** Whether exported value is immutable */
  value_immutable?: boolean;
  /** Whether default value is immutable */
  default_immutable?: boolean;
  /** Parent field IDs */
  parent?: string[];
}

export interface FieldValidation {
  /** Minimum length for strings */
  min_length?: number;
  /** Maximum length for strings */
  max_length?: number;
  /** Minimum value for numbers */
  min?: number;
  /** Maximum value for numbers */
  max?: number;
  /** Regular expression pattern */
  pattern?: string;
  /** Custom validation rules */
  [key: string]: any;
}

export interface UIConfiguration {
  /** Component type */
  component_type?: 'input' | 'textarea' | 'select' | 'checkbox' | 'radio-group' | 'date-picker' | 'file-upload' | 'number-input';
  /** Component variant */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  /** Component size */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Placeholder text */
  placeholder?: string;
  /** Field label */
  label?: string;
  /** Field description */
  description?: string;
  /** Options for select/combobox components */
  options?: Array<{
    value: string;
    label: string;
    disabled?: boolean;
    description?: string;
  }>;
  /** Additional UI configuration */
  [key: string]: any;
}

// Error types
export interface ELNError extends Error {
  /** Error type */
  type: 'storage' | 'validation' | 'immutability' | 'not_found' | 'network' | 'unknown';
  /** HTTP status code if applicable */
  status?: number;
  /** Additional error details */
  details?: any;
}

// API Response wrappers
export interface APIResponse<T> {
  /** Response data */
  data: T;
  /** Success status */
  success: boolean;
  /** Error message if any */
  error?: string;
  /** Additional metadata */
  meta?: {
    /** Total count for paginated responses */
    total?: number;
    /** Current page */
    page?: number;
    /** Items per page */
    limit?: number;
  };
}

// Utility types for working with ELNs
export type ELNStatus = 'draft' | 'final';

export type ELNSortField = 'timestamp' | 'filename' | 'user_id' | 'status' | 'size_bytes';

export type ELNSortOrder = 'asc' | 'desc';

export interface ELNListOptions extends ELNListFilters {
  /** Sort field */
  sort_by?: ELNSortField;
  /** Sort order */
  sort_order?: ELNSortOrder;
}

// Form data types for ELN submission
export interface ELNFormData {
  /** Form field values */
  values: Record<string, any>;
  /** Form validation state */
  errors: Record<string, string[]>;
  /** Whether form is valid */
  isValid: boolean;
  /** Whether form is submitting */
  isSubmitting: boolean;
  /** Whether form has been touched */
  touched: Record<string, boolean>;
}

// Storage configuration types
export interface ELNStorageConfig {
  /** Storage backend type */
  backend: 's3' | 'local';
  /** S3 bucket name (if using S3) */
  bucket_name?: string;
  /** Local storage path (if using local) */
  local_path?: string;
  /** Whether to enforce immutability */
  enforce_immutability: boolean;
  /** Maximum file size in bytes */
  max_file_size?: number;
}

// Filename generation types
export interface FilenameComponents {
  /** ELN status */
  status: ELNStatus;
  /** Normalized username */
  username: string;
  /** Extracted variables from form data */
  variables: string[];
  /** Timestamp in YYYYMMDD_HHMMSS format */
  timestamp: string;
  /** 8-character UUID */
  uuid: string;
}

export interface FilenameValidationResult {
  /** Whether filename format is valid */
  is_valid: boolean;
  /** Parsed filename components (if valid) */
  components?: FilenameComponents;
  /** Validation error message (if invalid) */
  error?: string;
}

// Event types for ELN operations
export interface ELNSubmissionEvent {
  /** Event type */
  type: 'eln_submitted';
  /** ELN metadata */
  eln: ELNMetadata;
  /** Timestamp of event */
  timestamp: string;
}

export interface ELNRetrievalEvent {
  /** Event type */
  type: 'eln_retrieved';
  /** Identifier used (draft_id or eln_uuid) */
  identifier: string;
  /** Retrieval method */
  method: 'by_filename' | 'by_identifier' | 'list' | 'query';
  /** Timestamp of event */
  timestamp: string;
}

export type ELNEvent = ELNSubmissionEvent | ELNRetrievalEvent;

// Hook return types for React components
export interface UseELNSubmission {
  /** Submit ELN function */
  submitELN: (request: ELNSubmissionRequest) => Promise<ELNSubmissionResponse>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: ELNError | null;
  /** Clear error function */
  clearError: () => void;
}

export interface UseELNData {
  /** Get ELN by filename */
  getELN: (sop_id: string, filename: string) => Promise<ELNData>;
  /** Get ELN by identifier (draft_id for drafts, eln_uuid for final ELNs) */
  getELNByIdentifier: (identifier: string, sop_id?: string) => Promise<ELNDataResponse>;
  /** List ELNs */
  listELNs: (sop_id: string, filters?: ELNListFilters) => Promise<ELNMetadata[]>;
  /** Query prerequisite ELNs */
  queryPrerequisites: (request: PrerequisiteQueryRequest) => Promise<PrerequisiteQueryResponse>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: ELNError | null;
  /** Clear error function */
  clearError: () => void;
}

export interface UseELNValidation {
  /** Validate filename immutability */
  validateImmutability: (sop_id: string, filename: string) => Promise<ImmutabilityValidationResponse>;
  /** Validate filename format */
  validateFilenameFormat: (filename: string) => FilenameValidationResult;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: ELNError | null;
}

/**
 * Note: Schema-agnostic helper functions are in 
 * frontend/src/sam/lib/schema-registry.ts to maintain proper
 * separation of concerns. This file contains only type definitions.
 * 
 * For detection utilities, import from:
 * import { isFilenameComponent, isExportConfiguration, isRenderableField } from '@shared/lib/schema-registry';
 */ 