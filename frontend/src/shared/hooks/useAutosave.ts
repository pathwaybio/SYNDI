// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * React hook for autosave functionality with React Query integration
 * 
 * Provides debounced saves, recovery prompts, manual save controls,
 * and integrates with the existing schema-driven form system.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { UseFormReturn } from 'react-hook-form';
import { AutosaveStorage, AutosaveStorageFactory, AutosaveData } from '@shared/lib/autosave-storage';
import { useToast } from '@shared/hooks/useToast';
import { AutosaveConfig, configLoader } from '@shared/lib/config-loader';
import { logger } from '@shared/lib/logger';

// Configure logger
logger.configure('warn', true);

if (process.env.NODE_ENV === 'development' || window.location.search.includes('debug=true')) {
  logger.configure('debug', true);
}

export interface AutosaveOptions {
  type: string;
  identifier: string;
  enabled?: boolean;
  debounceMs?: number;
  maxWait?: number;
  onSave?: (data: any) => void;
  onLoad?: (data: any) => void;
  onError?: (error: Error) => void;
  onRecovery?: (data: any) => boolean; // Return true to accept recovery
}

export interface AutosaveState {
  status: 'idle' | 'saving' | 'saved' | 'error' | 'recovery';
  lastSaved?: number;
  error?: string;
  hasUnsavedChanges: boolean;
  canRecover: boolean;
  isEnabled: boolean;
  stats?: {
    totalSaves: number;
    totalSize: number;
    lastSaveSize: number;
  };
}

export interface AutosaveActions {
  manualSave: () => Promise<void>;
  acceptRecovery: () => Promise<void>;
  rejectRecovery: () => Promise<void>;
  clearAutosave: () => Promise<void>;
  toggleEnabled: () => void;
  forceSync: () => Promise<void>;
  getAllSavedItems: () => Promise<Array<{
    key: string;
    id: string;
    title: string;
    timestamp: number;
    size: number;
    type: string;
  }>>;
  loadSavedItem: (key: string) => Promise<void>;
}

export interface AutosaveReturn {
  state: AutosaveState;
  actions: AutosaveActions;
}

/**
 * Core autosave hook with React Query integration
 */
export function useAutosave<T extends Record<string, any>>(
  form: UseFormReturn<T>,
  options: AutosaveOptions
): AutosaveReturn {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [config, setConfig] = useState<AutosaveConfig | null>(null);
  const [storage, setStorage] = useState<AutosaveStorage | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [canRecover, setCanRecover] = useState(false);
  const [stats, setStats] = useState<AutosaveState['stats']>();
  const [recoveryData, setRecoveryData] = useState<any>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  
  // Refs for tracking
  const lastSavedData = useRef<string>(''); // Store as string for efficient comparison
  const saveCount = useRef(0);
  const isInitialized = useRef(false);
  
  // Get current form data
  const currentData = form.watch();
  
  // Debounced data for autosave
  const [debouncedData] = useDebounce(
    currentData,
    (() => {
      const delay = config?.debounce?.delay ?? options.debounceMs;
      if (delay === undefined) {
        console.warn('⚠️ useAutosave: debounce.delay not configured, using fallback: 5000ms');
        return 5000;
      }
      return delay;
    })(),
    { 
      maxWait: (() => {
        const maxWait = config?.debounce?.maxWait ?? options.maxWait;
        if (maxWait === undefined) {
          console.warn('⚠️ useAutosave: debounce.maxWait not configured, using fallback: 30000ms');
          return 30000;
        }
        return maxWait;
      })()
    }
  );
  
  // Generate storage key
  const storageKey = `${options.type}:${options.identifier}`;
  
  // Initialize configuration and storage
  useEffect(() => {
    let mounted = true;
    
    const initializeAutosave = async () => {
      try {
        const autosaveConfig = await configLoader.getAutosaveConfig();
        
        if (!mounted) return;
        
        setConfig(autosaveConfig);
        setIsEnabled(autosaveConfig.enabled && (options.enabled ?? true));
        
        // Create storage instance
        const storageInstance = AutosaveStorageFactory.create(
          autosaveConfig.storage.type,
          autosaveConfig.storage.keyPrefix,
          autosaveConfig.storage.maxItems,
          autosaveConfig.storage.ttl
        );
        
        setStorage(storageInstance);
        
        // Check for existing autosave data
        const existingData = await storageInstance.load(storageKey);
        if (existingData) {
          setCanRecover(true);
          setRecoveryData(existingData.data);
          
          // Show recovery prompt if configured
          if (autosaveConfig.ui.toastOnSave) {
            toast({
              title: 'Recovery Available',
              description: `Found autosaved data from ${new Date(existingData.timestamp).toLocaleString()}`,
              duration: 10000,
            });
          }
        }
        
        isInitialized.current = true;
      } catch (error) {
        console.error('Failed to initialize autosave:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    };
    
    initializeAutosave();
    
    return () => {
      mounted = false;
    };
  }, [options.type, options.identifier, storageKey, options.enabled, options.onError, toast]);
  
  // Create autosave mutation
  const autosaveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!storage) {
        throw new Error('Storage not initialized');
      }
      
      const autosaveData: AutosaveData = {
        id: options.identifier,
        type: options.type,
        data,
        timestamp: Date.now(),
        metadata: {
          title: data.title || data.name || 'Untitled',
          version: data.version || '1.0',
          userAgent: navigator.userAgent,
        },
      };
      
      await storage.save(storageKey, autosaveData);
      return autosaveData;
    },
    onSuccess: (savedData) => {
      lastSavedData.current = JSON.stringify(savedData.data);
      saveCount.current += 1;
      setHasUnsavedChanges(false);
      
      // Update stats
      setStats(prev => ({
        totalSaves: saveCount.current,
        totalSize: prev?.totalSize || 0,
        lastSaveSize: new Blob([JSON.stringify(savedData)]).size,
      }));
      
      if (options.onSave) {
        options.onSave(savedData.data);
      }
      
      if (config?.ui.toastOnSave) {
        toast({
          title: 'Draft saved',
          description: `Saved at ${new Date().toLocaleString()}`,
          duration: 2000,
        });
      }
      
      logger.info('useAutosave', `[${options.type}:${options.identifier}] Autosave COMPLETED at ${new Date().toISOString()}`);
    },
    onError: (error) => {
      console.error('Autosave failed:', error);
      
      if (config?.ui.toastOnError) {
        toast({
          title: 'Autosave failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
          duration: 5000,
        });
      }
      
      if (options.onError) {
        options.onError(error as Error);
      }
    },
    retry: (failureCount, error) => {
      const maxRetries = config?.retry?.maxRetries;
      if (maxRetries === undefined) {
        console.warn('⚠️ useAutosave: retry.maxRetries not configured, using fallback: 3');
        return failureCount < 3;
      }
      return failureCount < maxRetries;
    },
    retryDelay: (attemptIndex) => {
      const initialDelay = config?.retry?.initialDelay;
      const multiplier = config?.retry?.backoffMultiplier;
      
      if (initialDelay === undefined) {
        console.warn('⚠️ useAutosave: retry.initialDelay not configured, using fallback: 1000ms');
      }
      if (multiplier === undefined) {
        console.warn('⚠️ useAutosave: retry.backoffMultiplier not configured, using fallback: 2');
      }
      
      return (initialDelay ?? 1000) * Math.pow((multiplier ?? 2), attemptIndex);
    },
  });
  
  // Load recovery data query
  const recoveryQuery = useQuery({
    queryKey: ['autosave-recovery', storageKey],
    queryFn: async () => {
      if (!storage) return null;
      return await storage.load(storageKey);
    },
    enabled: !!storage && canRecover,
    staleTime: 0,
    cacheTime: 0,
  });
  
  // Watch for form changes and track unsaved changes
  useEffect(() => {
    if (!isInitialized.current) return;
    
    const currentDataString = JSON.stringify(currentData);
    const hasChanges = currentDataString !== lastSavedData.current;
    setHasUnsavedChanges(hasChanges);
  }, [currentData]);
  
  // Perform autosave when debounced data changes
  useEffect(() => {
    if (!isInitialized.current || !isEnabled || !config?.enabled || isRecovering) return;
    
    // Skip if data is empty/invalid
    if (!debouncedData || Object.keys(debouncedData).length === 0) {
      return;
    }
    
    // Skip if no changes (this is the key optimization)
    const currentDataString = JSON.stringify(debouncedData);
    if (currentDataString === lastSavedData.current) {
      return;
    }
    
    // Trigger autosave
    autosaveMutation.mutate(debouncedData);
  }, [debouncedData, isEnabled, config?.enabled, autosaveMutation, isRecovering]);
  
  // Actions
  const actions: AutosaveActions = {
    manualSave: useCallback(async () => {
      // Manual save should work regardless of autosave configuration
      return new Promise<void>((resolve, reject) => {
        autosaveMutation.mutate(currentData, {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        });
      });
    }, [autosaveMutation, currentData]),
    
    acceptRecovery: useCallback(async () => {
      if (!recoveryData) return;
      
      try {
        setIsRecovering(true);
        
        // Reset form with recovery data
        form.reset(recoveryData);
        
        // Update tracking
        lastSavedData.current = recoveryData;
        setCanRecover(false);
        setRecoveryData(null);
        
        if (options.onLoad) {
          options.onLoad(recoveryData);
        }
        
        toast({
          title: 'Data recovered',
          description: 'Your previous work has been restored',
          duration: 3000,
        });
        
        // Clear the recovery data from storage
        if (storage) {
          await storage.delete(storageKey);
        }
        
        // Allow autosave to resume after a brief delay
        setTimeout(() => {
          setIsRecovering(false);
        }, 1000);
      } catch (error) {
        setIsRecovering(false);
        console.error('Failed to accept recovery:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    }, [recoveryData, form, options, toast, storage, storageKey]),
    
    rejectRecovery: useCallback(async () => {
      try {
        setCanRecover(false);
        setRecoveryData(null);
        
        // Clear the recovery data from storage
        if (storage) {
          await storage.delete(storageKey);
        }
        
        toast({
          title: 'Recovery rejected',
          description: 'Previous autosave data has been discarded',
          duration: 2000,
        });
      } catch (error) {
        console.error('Failed to reject recovery:', error);
      }
    }, [storage, storageKey, toast]),
    
    clearAutosave: useCallback(async () => {
      try {
        if (storage) {
          await storage.delete(storageKey);
        }
        
        lastSavedData.current = '';
        setHasUnsavedChanges(false);
        setCanRecover(false);
        setRecoveryData(null);
        
        toast({
          title: 'Autosave cleared',
          description: 'All saved draft data has been removed',
          duration: 2000,
        });
      } catch (error) {
        console.error('Failed to clear autosave:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    }, [storage, storageKey, toast, options]),
    
    toggleEnabled: useCallback(() => {
      setIsEnabled(prev => !prev);
    }, []),
    
    forceSync: useCallback(async () => {
      if (!storage) return;
      
      try {
        const savedData = await storage.load(storageKey);
        if (savedData) {
          form.reset(savedData.data);
          lastSavedData.current = savedData.data;
          setHasUnsavedChanges(false);
          
          toast({
            title: 'Synced with storage',
            description: 'Form data has been synchronized',
            duration: 2000,
          });
        }
      } catch (error) {
        console.error('Failed to sync:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    }, [storage, storageKey, form, toast, options]),

    // Get all saved SOPs for browsing
    getAllSavedItems: useCallback(async () => {
      if (!storage) return [];
      
      try {
        const keys = await storage.list();
        const items = [];
        
        for (const key of keys) {
          if (key.startsWith(options.type + ':')) {
            const data = await storage.load(key);
            if (data) {
              items.push({
                key,
                id: data.id,
                title: data.metadata?.title || data.data?.title || data.data?.name || 'Untitled',
                timestamp: data.timestamp,
                size: JSON.stringify(data).length,
                type: data.type
              });
            }
          }
        }
        
        // Sort by timestamp, newest first
        return items.sort((a, b) => b.timestamp - a.timestamp);
      } catch (error) {
        console.error('Failed to get saved items:', error);
        return [];
      }
    }, [storage, options.type]),

    // Load a specific saved item by key
    loadSavedItem: useCallback(async (key: string) => {
      if (!storage) return;
      
      try {
        setIsRecovering(true);
        
        const savedData = await storage.load(key);
        if (savedData) {
          form.reset(savedData.data);
          lastSavedData.current = savedData.data;
          setHasUnsavedChanges(false);
          
          toast({
            title: 'Version loaded',
            description: `Loaded "${savedData.metadata?.title || 'Untitled'}" from ${new Date(savedData.timestamp).toLocaleString()}`,
            duration: 3000,
          });
        }
        
        setTimeout(() => {
          setIsRecovering(false);
        }, 1000);
      } catch (error) {
        setIsRecovering(false);
        console.error('Failed to load saved item:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    }, [storage, form, toast, options]),
  };
  
  // Build state
  const state: AutosaveState = {
    status: canRecover ? 'recovery' : 
           autosaveMutation.isLoading ? 'saving' : 
           autosaveMutation.isError ? 'error' : 
           autosaveMutation.isSuccess ? 'saved' : 'idle',
    lastSaved: autosaveMutation.isSuccess ? Date.now() : undefined,
    error: autosaveMutation.error instanceof Error ? autosaveMutation.error.message : undefined,
    hasUnsavedChanges,
    canRecover,
    isEnabled: isEnabled && (config?.enabled ?? true),
    stats,
  };
  
  return { state, actions };
}

/**
 * Simplified autosave hook for basic use cases
 */
export function useSimpleAutosave<T extends Record<string, any>>(
  form: UseFormReturn<T>,
  type: 'sop' | 'eln' | 'form',
  identifier: string
): AutosaveReturn {
  return useAutosave(form, { type, identifier });
} 