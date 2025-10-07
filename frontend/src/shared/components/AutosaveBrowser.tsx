// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Autosave version browser component
 * 
 * Allows users to browse, preview, and load previously saved versions
 * from localStorage with timestamp and metadata display.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@shared/components/ui/button';
import { Badge } from '@shared/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@shared/components/ui/dialog';
import { 
  History, 
  Clock, 
  FileText, 
  Download,
  Trash2,
  RefreshCw,
  Search
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { AutosaveActions } from '@shared/hooks/useAutosave';

interface SavedItem {
  key: string;
  id: string;
  title: string;
  timestamp: number;
  size: number;
  type: string;
}

interface AutosaveBrowserProps {
  actions: AutosaveActions;
  className?: string;
  triggerVariant?: 'button' | 'icon';
}

/**
 * Main autosave browser component with dialog interface
 */
export function AutosaveBrowser({
  actions,
  className,
  triggerVariant = 'button'
}: AutosaveBrowserProps) {
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Load saved items when dialog opens
  const loadSavedItems = async () => {
    setIsLoading(true);
    try {
      const items = await actions.getAllSavedItems();
      setSavedItems(items);
    } catch (error) {
      console.error('Failed to load saved items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load items when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadSavedItems();
    }
  }, [isOpen]);

  // Filter items based on search term
  const filteredItems = savedItems.filter(item =>
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Handle loading an item
  const handleLoadItem = async (item: SavedItem) => {
    try {
      await actions.loadSavedItem(item.key);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to load item:', error);
    }
  };

  // Trigger button
  const trigger = triggerVariant === 'icon' ? (
    <Button variant="ghost" size="sm" className={cn("h-8 w-8 p-0", className)}>
      <History className="h-4 w-4" />
    </Button>
  ) : (
    <Button variant="outline" size="sm" className={className}>
      <History className="h-4 w-4 mr-2" />
      Browse Versions
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Saved Versions
          </DialogTitle>
          <DialogDescription>
            Browse and restore previously saved drafts from your local storage
          </DialogDescription>
        </DialogHeader>
        
        {/* Search and refresh controls */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
            />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadSavedItems}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading saved versions...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No saved versions found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Try adjusting your search terms' : 'Your autosaved work will appear here'}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate">{item.title}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {item.type.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(item.timestamp)}
                    </div>
                    <div>{formatSize(item.size)}</div>
                    <div className="truncate">ID: {item.id}</div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLoadItem(item)}
                    className="h-8"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Load
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Footer stats */}
        {savedItems.length > 0 && (
          <div className="border-t pt-3 text-sm text-muted-foreground">
            {filteredItems.length} of {savedItems.length} versions
            {searchTerm && filteredItems.length !== savedItems.length && (
              <span> (filtered)</span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact version browser for toolbar integration
 */
export function AutosaveBrowserCompact({
  actions,
  className
}: Pick<AutosaveBrowserProps, 'actions' | 'className'>) {
  return (
    <AutosaveBrowser
      actions={actions}
      triggerVariant="icon"
      className={className}
    />
  );
} 