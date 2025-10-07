// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Client-side Draft Storage Service for CLAIRE
 * 
 * Provides S3-based draft storage with localStorage fallback
 * for protecting experimental data during form completion.
 */

import { configLoader } from '@shared/lib/config-loader';

export interface ELNDraft {
  draft_id: string;
  sop_id: string;
  session_id: string;
  form_data: Record<string, any>;
  timestamp: string;
  completion_percentage: number;
  title?: string;
  size_bytes: number;
}

export interface DraftMetadata {
  draft_id: string;
  sop_id: string;
  session_id: string;
  timestamp: string;
  completion_percentage: number;
  title?: string;
  size_bytes: number;
}

export interface DraftStorageStats {
  total_drafts: number;
  total_size_bytes: number;
  oldest_draft?: string;
  newest_draft?: string;
}

export class DraftStorageError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DraftStorageError';
  }
}

export class DraftNotFoundError extends DraftStorageError {
  constructor(draft_id: string) {
    super(`Draft not found: ${draft_id}`);
    this.name = 'DraftNotFoundError';
  }
}

/**
 * Draft Storage Service
 * 
 * Handles saving, loading, and managing drafts with S3 backend
 * and localStorage fallback for offline/error scenarios.
 */
export class DraftStorageService {
  private baseUrl: string;
  private authToken: string | null = null;
  private storageKey = 'claire-drafts';

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || 'http://localhost:8000/api/v1';
  }

  /**
   * Set authentication token for API calls
   */
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  /**
   * Get authorization headers for API calls
   */
  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Save draft to backend with localStorage fallback
   */
  async saveDraft(
    sopId: string,
    sessionId: string,
    data: Record<string, any>,
    completionPercentage: number = 0,
    title?: string
  ): Promise<string> {
    const draftData = {
      sop_id: sopId,
      session_id: sessionId,
      data,
      completion_percentage: completionPercentage,
      title,
    };

    try {
      // Try API first
      const response = await fetch(`${this.baseUrl}/drafts/`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(draftData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('Draft saved to backend:', result.draft_id);
      
      // Also save to localStorage as backup
      try {
        await this.saveToLocalStorage(result.draft_id, {
          ...result,
          form_data: data,
        });
      } catch (localError) {
        console.warn('Failed to save backup to localStorage:', localError);
      }

      return result.draft_id;

    } catch (error) {
      console.warn('Backend save failed, falling back to localStorage:', error);
      
      // Fallback to localStorage
      const fallbackDraftId = `local-${sessionId}-${Date.now()}`;
      const draft: ELNDraft = {
        draft_id: fallbackDraftId,
        sop_id: sopId,
        session_id: sessionId,
        form_data: data,
        timestamp: new Date().toISOString(),
        completion_percentage: completionPercentage,
        title,
        size_bytes: JSON.stringify(data).length,
      };

      await this.saveToLocalStorage(fallbackDraftId, draft);
      return fallbackDraftId;
    }
  }

  /**
   * Load draft from backend with localStorage fallback
   */
  async loadDraft(draftId: string): Promise<ELNDraft> {
    try {
      // Try API first
      const response = await fetch(`${this.baseUrl}/drafts/${draftId}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          draft_id: result.draft_id,
          sop_id: result.metadata.sop_id,
          session_id: result.metadata.session_id,
          form_data: result.form_data,
          timestamp: result.metadata.timestamp,
          completion_percentage: result.metadata.completion_percentage,
          title: result.metadata.title,
          size_bytes: result.metadata.size_bytes,
        };
      }

      // If not found in backend, try localStorage
      const localDraft = await this.loadFromLocalStorage(draftId);
      if (localDraft) {
        return localDraft;
      }

      throw new DraftNotFoundError(draftId);

    } catch (error) {
      if (error instanceof DraftNotFoundError) {
        throw error;
      }

      console.warn('Backend load failed, trying localStorage:', error);
      
      // Fallback to localStorage
      const localDraft = await this.loadFromLocalStorage(draftId);
      if (localDraft) {
        return localDraft;
      }

      throw new DraftStorageError(`Failed to load draft ${draftId}`, error as Error);
    }
  }

  /**
   * List all drafts for the current user
   */
  async listDrafts(sopId?: string): Promise<DraftMetadata[]> {
    const backendDrafts: DraftMetadata[] = [];
    const localDrafts: DraftMetadata[] = [];

    try {
      // Try to get drafts from backend
      const url = sopId 
        ? `${this.baseUrl}/drafts/?sop_id=${encodeURIComponent(sopId)}`
        : `${this.baseUrl}/drafts/`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        backendDrafts.push(...result.drafts);
      } else {
        console.warn('Failed to list drafts from backend');
      }
    } catch (error) {
      console.warn('Backend list failed:', error);
    }

    try {
      // Also get drafts from localStorage
      const local = await this.listFromLocalStorage(sopId);
      localDrafts.push(...local);
    } catch (error) {
      console.warn('Failed to list local drafts:', error);
    }

    // Merge and deduplicate (prefer backend versions)
    const draftMap = new Map<string, DraftMetadata>();
    
    // Add local drafts first
    localDrafts.forEach(draft => {
      draftMap.set(draft.draft_id, draft);
    });

    // Override with backend drafts (they're more authoritative)
    backendDrafts.forEach(draft => {
      draftMap.set(draft.draft_id, draft);
    });

    return Array.from(draftMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId: string): Promise<boolean> {
    let backendSuccess = false;
    let localSuccess = false;

    try {
      // Try to delete from backend
      const response = await fetch(`${this.baseUrl}/drafts/${draftId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      backendSuccess = response.ok;
      if (!backendSuccess) {
        console.warn('Failed to delete draft from backend');
      }
    } catch (error) {
      console.warn('Backend delete failed:', error);
    }

    try {
      // Also delete from localStorage
      localSuccess = await this.deleteFromLocalStorage(draftId);
    } catch (error) {
      console.warn('Failed to delete from localStorage:', error);
    }

    return backendSuccess || localSuccess;
  }

  /**
   * Clean up old drafts
   */
  async cleanupOldDrafts(retentionDays: number = 30): Promise<number> {
    let deletedCount = 0;

    try {
      // Try to cleanup backend drafts
      const response = await fetch(`${this.baseUrl}/drafts/cleanup`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ retention_days: retentionDays }),
      });

      if (response.ok) {
        const result = await response.json();
        deletedCount += result.deleted_count;
      }
    } catch (error) {
      console.warn('Backend cleanup failed:', error);
    }

    try {
      // Also cleanup localStorage
      const localDeleted = await this.cleanupLocalStorage(retentionDays);
      deletedCount += localDeleted;
    } catch (error) {
      console.warn('Local cleanup failed:', error);
    }

    return deletedCount;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<DraftStorageStats> {
    const drafts = await this.listDrafts();
    const totalSize = drafts.reduce((sum, draft) => sum + draft.size_bytes, 0);
    
    return {
      total_drafts: drafts.length,
      total_size_bytes: totalSize,
      oldest_draft: drafts.length > 0 ? drafts[drafts.length - 1].timestamp : undefined,
      newest_draft: drafts.length > 0 ? drafts[0].timestamp : undefined,
    };
  }

  // Private localStorage methods
  private async saveToLocalStorage(draftId: string, draft: ELNDraft): Promise<void> {
    try {
      const drafts = this.getLocalDrafts();
      drafts[draftId] = draft;
      localStorage.setItem(this.storageKey, JSON.stringify(drafts));
    } catch (error) {
      throw new DraftStorageError('Failed to save to localStorage', error as Error);
    }
  }

  private async loadFromLocalStorage(draftId: string): Promise<ELNDraft | null> {
    try {
      const drafts = this.getLocalDrafts();
      return drafts[draftId] || null;
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
      return null;
    }
  }

  private async listFromLocalStorage(sopId?: string): Promise<DraftMetadata[]> {
    try {
      const drafts = this.getLocalDrafts();
      return Object.values(drafts)
        .filter(draft => !sopId || draft.sop_id === sopId)
        .map(draft => ({
          draft_id: draft.draft_id,
          sop_id: draft.sop_id,
          session_id: draft.session_id,
          timestamp: draft.timestamp,
          completion_percentage: draft.completion_percentage,
          title: draft.title,
          size_bytes: draft.size_bytes,
        }));
    } catch (error) {
      console.warn('Failed to list from localStorage:', error);
      return [];
    }
  }

  private async deleteFromLocalStorage(draftId: string): Promise<boolean> {
    try {
      const drafts = this.getLocalDrafts();
      if (drafts[draftId]) {
        delete drafts[draftId];
        localStorage.setItem(this.storageKey, JSON.stringify(drafts));
        return true;
      }
      return false;
    } catch (error) {
      console.warn('Failed to delete from localStorage:', error);
      return false;
    }
  }

  private async cleanupLocalStorage(retentionDays: number): Promise<number> {
    try {
      const drafts = this.getLocalDrafts();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let deletedCount = 0;
      Object.keys(drafts).forEach(draftId => {
        const draft = drafts[draftId];
        if (new Date(draft.timestamp) < cutoffDate) {
          delete drafts[draftId];
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        localStorage.setItem(this.storageKey, JSON.stringify(drafts));
      }

      return deletedCount;
    } catch (error) {
      console.warn('Failed to cleanup localStorage:', error);
      return 0;
    }
  }

  private getLocalDrafts(): Record<string, ELNDraft> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn('Failed to parse localStorage drafts:', error);
      return {};
    }
  }
}

// Singleton instance
export const draftStorage = new DraftStorageService(); 