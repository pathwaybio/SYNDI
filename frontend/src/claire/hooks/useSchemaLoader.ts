// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import {
  SOP,
  SOPMetadata,
  SchemaLoaderResult,
  SchemaLoadingState,
  SchemaLoadingError,
  URLLoadingOptions,
  SchemaValidationResult,
  SOPTemplateSchema,
  FileUploadResult
} from '@shared/types/sop';
import { logger } from '@shared/lib/logger';
import { parseFile } from '@shared/lib/file-parser';
import { extractSOPMetadata } from '@shared/lib/sop-metadata';
import { useAuth } from '@shared/lib/auth';

export const useSchemaLoader = () => {
  const [state, setState] = useState<SchemaLoadingState>('idle');
  const [data, setData] = useState<SOP | undefined>();
  const [error, setError] = useState<SchemaLoadingError | undefined>();
  const [metadata, setMetadata] = useState<SOPMetadata | undefined>();
  const { getToken } = useAuth();

  // Clear state
  const clearState = useCallback(() => {
    setState('idle');
    setData(undefined);
    setError(undefined);
    setMetadata(undefined);
  }, []);

  // Load schema from file
  const loadFromFile = useCallback(async (file: File): Promise<SOP | null> => {
    setState('loading');
    setError(undefined);
    
    try {
      const { content } = await parseFile(file);
      
      const validated = await validateSchema(content);
      if (validated) {
        // Create metadata from file
        const fileMetadata = extractSOPMetadata(content, file.name);
        
        setMetadata(fileMetadata);
        setState('success');
        return validated;
      }
      return null;
    } catch (err) {
      const error: SchemaLoadingError = {
        type: 'parse',
        message: err instanceof Error ? err.message : 'Failed to parse file',
        details: err
      };
      setError(error);
      setState('error');
      return null;
    }
  }, []);

  // Load schema from URL
  const loadFromURL = useCallback(async (url: string, options?: URLLoadingOptions): Promise<SOP | null> => {
    setState('loading');
    setError(undefined);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 10000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/yaml, application/json, text/yaml, text/plain'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      let parsed: any;
      
      // Try to parse as YAML first, then JSON
      try {
        parsed = JSON.parse(content);
      } catch {
        const yaml = await import('js-yaml');
        parsed = yaml.load(content);
      }

      const validated = await validateSchema(parsed);
      if (validated) {
        setState('success');
        return validated;
      }
      return null;
    } catch (err) {
      const error: SchemaLoadingError = {
        type: 'network',
        message: err instanceof Error ? err.message : 'Failed to load from URL',
        details: err
      };
      setError(error);
      setState('error');
      return null;
    }
  }, []);

  // Load schema from API
  const loadFromAPI = useCallback(async (sopId: string): Promise<SOP | null> => {
    setState('loading');
    setError(undefined);
    
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/v1/sops/${sopId}`, { headers });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.sop) {
        throw new Error('Invalid API response: missing sop data');
      }

      const validated = await validateSchema(result.sop);
      if (validated) {
        if (result.metadata) {
          setMetadata(result.metadata);
        }
        setState('success');
        return validated;
      }
      return null;
    } catch (err) {
      const error: SchemaLoadingError = {
        type: 'network',
        message: err instanceof Error ? err.message : 'Failed to load from API',
        details: err
      };
      setError(error);
      setState('error');
      return null;
    }
  }, [getToken]);



  // Validate schema against Zod schema
  const validateSchema = useCallback(async (data: any): Promise<SOP | null> => {
    try {
      const validated = SOPTemplateSchema.parse(data);
      setData(validated);
      return validated;
    } catch (err) {
      const error: SchemaLoadingError = {
        type: 'validation',
        message: err instanceof Error ? err.message : 'Schema validation failed',
        details: err
      };
      setError(error);
      setState('error');
      return null;
    }
  }, []);

  // Get validation result
  const getValidationResult = useCallback((data: any): SchemaValidationResult => {
    try {
      SOPTemplateSchema.parse(data);
      return {
        isValid: true,
        errors: null,
        warnings: []
      };
    } catch (err) {
      return {
        isValid: false,
        errors: err as any,
        warnings: []
      };
    }
  }, []);

  return {
    state,
    data,
    error,
    metadata,
    loadFromFile,
    loadFromURL,
    loadFromAPI,
    validateSchema,
    getValidationResult,
    clearState
  };
}; 