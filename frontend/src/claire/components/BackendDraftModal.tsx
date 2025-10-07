// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Backend Draft Modal Component
 * 
 * Provides UI for browsing and restoring backend-saved drafts,
 * similar to SAM's "Saved Versions" modal but using CLAIRE's backend API.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { ScrollArea } from '@shared/components/ui/scroll-area';
import { Badge } from '@shared/components/ui/badge';
import { 
  History, 
  Search, 
  RefreshCw, 
  Clock, 
  FileText, 
  Download,
  Trash2,
  Loader2,
  X 
} from 'lucide-react';

import { useBackendDraftStorage, BackendDraft, BackendDraftWithData } from '../hooks/useBackendDraftStorage';
import { ELNFormData } from '@claire/types/eln';
import { logger } from '@shared/lib/logger';

export interface BackendDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  sopId: string;
  onDraftSelected: (draftData: ELNFormData) => void;
}

interface DraftItemProps {
  draft: BackendDraft;
  onLoad: () => void;
  onDelete: () => void;
  isLoading: boolean;
  isDeleting: boolean;
}

const DraftItem: React.FC<DraftItemProps> = ({
  draft,
  onLoad,
  onDelete,
  isLoading,
  isDeleting,
}) => {
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  };

  const getDisplayTitle = (): string => {
    if (draft.title && draft.title !== 'undefined') {
      return draft.title;
    }
    return 'Untitled';
  };

  const getDisplayId = (): string => {
    // Extract meaningful part from draft_id
    const parts = draft.draft_id.split('-');
    if (parts.length > 1) {
      // Return last part (UUID) or something meaningful
      return `ID: ${parts[parts.length - 1].substring(0, 8)}`;
    }
    return `ID: ${draft.draft_id.substring(0, 8)}`;
  };

  const getCompletionColor = (percentage: number): string => {
    if (percentage < 30) return 'bg-red-500';
    if (percentage < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getCompletionVariant = (percentage: number): "default" | "secondary" | "destructive" | "outline" => {
    if (percentage < 30) return 'destructive';
    if (percentage < 70) return 'secondary';
    return 'default';
  };

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium truncate">{getDisplayTitle()}</h4>
            <Badge variant="outline" className="text-xs">SOP</Badge>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatTimestamp(draft.timestamp)}</span>
            </div>
            <span>{formatFileSize(draft.size_bytes)}</span>
            <span>{getDisplayId()}</span>
          </div>

          {/* Completion progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className={`h-2 rounded-full ${getCompletionColor(draft.completion_percentage)}`}
              style={{ width: `${Math.min(100, Math.max(0, draft.completion_percentage))}%` }}
            />
          </div>
          
          <div className="text-xs text-muted-foreground">
            {draft.session_id}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting || isLoading}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
          
          <Button
            onClick={onLoad}
            disabled={isLoading || isDeleting}
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Load
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const BackendDraftModal: React.FC<BackendDraftModalProps> = ({
  isOpen,
  onClose,
  sopId,
  onDraftSelected,
}) => {
  const { state, operations } = useBackendDraftStorage();
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  // Load drafts when modal opens
  useEffect(() => {
    if (isOpen && sopId) {
      operations.loadDrafts(sopId);
    }
  }, [isOpen, sopId, operations]);

  // Filter and sort drafts - most recent first
  const filteredDrafts = state.drafts
    .filter(draft => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        (draft.title?.toLowerCase().includes(searchLower)) ||
        draft.draft_id.toLowerCase().includes(searchLower) ||
        draft.session_id.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      // Sort by timestamp, most recent first
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB.getTime() - dateA.getTime();
    });

  const handleDraftLoad = async (draft: BackendDraft) => {
    setLoadingDraftId(draft.draft_id);
    
    try {
      const draftWithData = await operations.loadDraftData(draft.draft_id, draft.sop_id);
      
      if (draftWithData) {
        logger.debug('BackendDraftModal', `Loaded draft data for ${draft.draft_id}`);
        //pretty print the draft data
        logger.debug('BackendDraftModal', `Draft data: ${JSON.stringify(draftWithData, null, 2)}`);
        
        // Convert to ELNFormData format
        const elnFormData: ELNFormData = {
          values: draftWithData.form_data,
          errors: {},
          isValid: true,
          isSubmitting: false,
          touched: {},
        };
        
        onDraftSelected(elnFormData);
        onClose();
      }
    } catch (error) {
      logger.error('BackendDraftModal', `Failed to load draft: ${error}`);
    } finally {
      setLoadingDraftId(null);
    }
  };

  const handleDraftDelete = async (draft: BackendDraft) => {
    setDeletingDraftId(draft.draft_id);
    
    try {
      await operations.deleteDraft(sopId, draft.draft_id);
    } finally {
      setDeletingDraftId(null);
    }
  };

  const handleRefresh = () => {
    operations.loadDrafts(sopId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              <DialogTitle>Saved Versions</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={state.isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${state.isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <DialogDescription>
            Browse and restore previously saved drafts from your server storage
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Drafts list */}
        <ScrollArea className="flex-1 max-h-96">
          <div className="space-y-3">
            {state.isLoading && state.drafts.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading drafts...</span>
              </div>
            ) : filteredDrafts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No drafts match your search' : 'No saved drafts found'}
              </div>
            ) : (
              filteredDrafts.map((draft) => (
                <DraftItem
                  key={draft.draft_id}
                  draft={draft}
                  onLoad={() => handleDraftLoad(draft)}
                  onDelete={() => handleDraftDelete(draft)}
                  isLoading={loadingDraftId === draft.draft_id}
                  isDeleting={deletingDraftId === draft.draft_id}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        {filteredDrafts.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {filteredDrafts.length} of {state.drafts.length} versions
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}; 