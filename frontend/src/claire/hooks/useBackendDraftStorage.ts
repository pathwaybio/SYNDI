// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * React Hook for Backend Draft Storage Operations
 * 
 * Provides state management and operations for server-side draft storage,
 * integrating with the CLAIRE backend API.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@shared/lib/auth';
import { useToast } from '@shared/hooks/useToast';
import { logger } from '@shared/lib/logger';

// Backend draft interfaces (matching API response)
export interface BackendDraft {
  draft_id: string;
  sop_id: string;
  session_id: string;
  timestamp: string;
  completion_percentage: number;
  title?: string;
  size_bytes: number;
}

export interface BackendDraftWithData extends BackendDraft {
  form_data: Record<string, any>;
}

export interface BackendDraftStorageState {
  drafts: BackendDraft[];
  isLoading: boolean;
  error: string | null;
  lastOperation: string | null;
}

export interface BackendDraftStorageOperations {
  loadDrafts: (sopId: string) => Promise<void>;
  loadDraftData: (draftId: string, sopId: string) => Promise<BackendDraftWithData | null>;
  deleteDraft: (sopId: string, draftId: string) => Promise<boolean>;
  clearError: () => void;
}

export interface UseBackendDraftStorageReturn {
  state: BackendDraftStorageState;
  operations: BackendDraftStorageOperations;
}

export function useBackendDraftStorage(): UseBackendDraftStorageReturn {
  const [state, setState] = useState<BackendDraftStorageState>({
    drafts: [],
    isLoading: false,
    error: null,
    lastOperation: null,
  });
  
  const { toast } = useToast();
  const { getToken } = useAuth();

  // Helper to get auth headers
  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }, [getToken]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, [getAuthHeaders]);

  const loadDrafts = useCallback(async (sopId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null, lastOperation: 'loadDrafts' }));
    
    try {
      logger.debug('useBackendDraftStorage', `Loading drafts for SOP: ${sopId}`);
      
      const response = await fetch(`/api/v1/drafts/?sop_id=${encodeURIComponent(sopId)}`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load drafts: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      logger.debug('useBackendDraftStorage', `Loaded ${data.drafts.length} drafts`);
      
      setState(prev => ({
        ...prev,
        drafts: data.drafts || [],
        isLoading: false,
        error: null,
      }));
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error loading drafts';
      logger.error('useBackendDraftStorage', `Failed to load drafts: ${errorMessage}`);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        drafts: [],
      }));
      
      toast({
        title: 'Error Loading Drafts',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadDraftData = useCallback(async (draftId: string, sopId: string): Promise<BackendDraftWithData | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null, lastOperation: 'loadDraftData' }));
    
    try {
      logger.debug('useBackendDraftStorage', `Loading draft data: ${draftId} from SOP: ${sopId}`);
      
      const response = await fetch(`/api/v1/drafts/${encodeURIComponent(draftId)}?sop_id=${encodeURIComponent(sopId)}`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Draft not found');
        }
        throw new Error(`Failed to load draft: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      logger.debug('useBackendDraftStorage', `Loaded draft data for: ${draftId}`);
      logger.debug('useBackendDraftStorage', `Form data: ${data.form_data}`);
      
      setState(prev => ({ ...prev, isLoading: false, error: null }));
      
      return {
        draft_id: data.draft_id,
        sop_id: data.metadata.sop_id,
        session_id: data.metadata.session_id,
        timestamp: data.metadata.timestamp,
        completion_percentage: data.metadata.completion_percentage,
        title: data.metadata.title,
        size_bytes: data.metadata.size_bytes,
        form_data: data.form_data,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error loading draft';
      logger.error('useBackendDraftStorage', `Failed to load draft data: ${errorMessage}`);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      
      toast({
        title: 'Error Loading Draft',
        description: errorMessage,
        variant: 'destructive',
      });
      
      return null;
    }
  }, [toast]);

  const deleteDraft = useCallback(async (sopId: string, draftId: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null, lastOperation: 'deleteDraft' }));
    
    try {
      logger.debug('useBackendDraftStorage', `Deleting draft: ${draftId}`);
      
      const response = await fetch(`/api/v1/drafts/${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Draft not found');
        }
        throw new Error(`Failed to delete draft: ${response.status} ${response.statusText}`);
      }
      
      logger.debug('useBackendDraftStorage', `Deleted draft: ${draftId}`);
      
      // Refresh drafts list
      await loadDrafts(sopId);
      
      toast({
        title: 'Draft Deleted',
        description: 'Draft has been successfully deleted.',
      });
      
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error deleting draft';
      logger.error('useBackendDraftStorage', `Failed to delete draft: ${errorMessage}`);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      
      toast({
        title: 'Error Deleting Draft',
        description: errorMessage,
        variant: 'destructive',
      });
      
      return false;
    }
  }, [loadDrafts, toast]);

  // Memoize operations to prevent unnecessary re-renders
  const operations = useMemo(() => ({
    loadDrafts,
    loadDraftData,
    deleteDraft,
    clearError,
  }), [loadDrafts, loadDraftData, deleteDraft, clearError]);

  return {
    state,
    operations,
  };
} 