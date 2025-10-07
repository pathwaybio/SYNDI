// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Autosave status component following VS Code patterns
 * 
 * Provides visual status indicators, manual save controls, and recovery prompts
 * with smooth animations and intuitive user experience.
 */

import React from 'react';
import { Button } from '@shared/components/ui/button';
import { Badge } from '@shared/components/ui/badge';
import { 
  CheckCircle, 
  Circle, 
  AlertCircle, 
  Save, 
  Loader2, 
  Clock, 
  RefreshCw,
  X,
  HelpCircle
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { AutosaveState, AutosaveActions } from '@shared/hooks/useAutosave';

interface AutosaveStatusProps {
  state: AutosaveState;
  onManualSave?: () => void;
  onAcceptRecovery?: () => void;
  onRejectRecovery?: () => void;
  onToggleEnabled?: () => void;
  className?: string;
  variant?: 'compact' | 'full';
}

/**
 * Status indicator component with VS Code-style visual feedback
 */
export function AutosaveStatus({
  state,
  onManualSave,
  onAcceptRecovery,
  onRejectRecovery,
  onToggleEnabled,
  className,
  variant = 'compact'
}: AutosaveStatusProps) {
  // Recovery prompt (shown when canRecover is true)
  if (state.canRecover && state.status === 'recovery') {
    return (
      <div className={cn(
        "flex items-center gap-2 p-3 rounded-lg border-2 border-blue-200 bg-blue-50",
        className
      )}>
        <HelpCircle className="h-4 w-4 text-blue-600" />
        <div className="flex-1 text-sm">
          <span className="font-medium text-blue-900">Recovery available</span>
          <p className="text-blue-700">Found unsaved changes from a previous session</p>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline"
            onClick={onAcceptRecovery}
            className="text-blue-700 border-blue-300 hover:bg-blue-100"
          >
            Recover
          </Button>
          <Button 
            size="sm" 
            variant="ghost"
            onClick={onRejectRecovery}
            className="text-blue-600 hover:bg-blue-100"
          >
            Discard
          </Button>
        </div>
      </div>
    );
  }

  // Status icon and color based on current state
  const getStatusIcon = () => {
    switch (state.status) {
      case 'saving':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'saved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'idle':
        return state.hasUnsavedChanges ? 
          <Circle className="h-4 w-4 text-yellow-500 fill-yellow-500" /> : 
          <CheckCircle className="h-4 w-4 text-gray-400" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (state.status) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      case 'error':
        return 'Save failed';
      case 'idle':
        return state.hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved';
      default:
        return 'Ready';
    }
  };

  const getStatusColor = () => {
    switch (state.status) {
      case 'saving':
        return 'text-blue-600';
      case 'saved':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'idle':
        return state.hasUnsavedChanges ? 'text-yellow-600' : 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  const formatLastSaved = () => {
    if (!state.lastSaved) return null;
    
    const now = Date.now();
    const diff = now - state.lastSaved;
    
    if (diff < 60000) {
      return 'Just saved';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    } else {
      return new Date(state.lastSaved).toLocaleTimeString();
    }
  };

  if (variant === 'compact') {
    return (
      <div className={cn(
        "flex items-center gap-2 text-sm",
        className
      )}>
        {getStatusIcon()}
        <span className={cn("font-medium", getStatusColor())}>
          {getStatusText()}
        </span>
        
        {state.lastSaved && (
          <span className="text-gray-400 text-xs">
            {formatLastSaved()}
          </span>
        )}
        
        {state.hasUnsavedChanges && onManualSave && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={onManualSave}
            disabled={state.status === 'saving'}
            className="h-6 px-2 text-xs"
          >
            <Save className="h-3 w-3 mr-1" />
            Save
          </Button>
        )}
      </div>
    );
  }

  // Full variant with more details
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border bg-card",
      className
    )}>
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        
        <div className="flex flex-col">
          <span className={cn("font-medium text-sm", getStatusColor())}>
            {getStatusText()}
          </span>
          
          {state.lastSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatLastSaved()}
            </span>
          )}
          
          {state.error && (
            <span className="text-xs text-red-600 mt-1">
              {state.error}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Stats badge */}
        {state.stats && (
          <Badge variant="secondary" className="text-xs">
            {state.stats.totalSaves} saves
          </Badge>
        )}
        
        {/* Enabled/disabled toggle */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleEnabled}
          className={cn(
            "h-6 px-2 text-xs",
            state.isEnabled ? "text-green-600" : "text-gray-400"
          )}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          {state.isEnabled ? 'Auto' : 'Manual'}
        </Button>
        
        {/* Manual save button */}
        {onManualSave && (
          <Button 
            size="sm" 
            variant={state.hasUnsavedChanges ? "default" : "outline"}
            onClick={onManualSave}
            disabled={state.status === 'saving'}
            className="h-6 px-2 text-xs"
          >
            {state.status === 'saving' ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Minimal status indicator for tight spaces
 */
export function AutosaveStatusMinimal({
  state,
  onManualSave,
  className
}: Pick<AutosaveStatusProps, 'state' | 'onManualSave' | 'className'>) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {state.status === 'saving' && (
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      )}
      {state.status === 'saved' && (
        <CheckCircle className="h-3 w-3 text-green-500" />
      )}
      {state.status === 'error' && (
        <AlertCircle className="h-3 w-3 text-red-500" />
      )}
      {state.hasUnsavedChanges && state.status === 'idle' && (
        <Circle className="h-3 w-3 text-yellow-500 fill-yellow-500" />
      )}
      
      {state.hasUnsavedChanges && onManualSave && (
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={onManualSave}
          disabled={state.status === 'saving'}
          className="h-5 w-5 p-0"
        >
          <Save className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

/**
 * Floating status indicator for overlay positioning
 */
export function AutosaveStatusFloating({
  state,
  actions,
  position = 'bottom-right',
  className
}: {
  state: AutosaveState;
  actions: AutosaveActions;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  className?: string;
}) {
  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  return (
    <div className={cn(
      "fixed z-50 transition-all duration-300 ease-in-out",
      positionClasses[position],
      className
    )}>
      <AutosaveStatus
        state={state}
        onManualSave={actions.manualSave}
        onAcceptRecovery={actions.acceptRecovery}
        onRejectRecovery={actions.rejectRecovery}
        onToggleEnabled={actions.toggleEnabled}
        variant="compact"
        className="bg-background shadow-lg border rounded-lg px-3 py-2"
      />
    </div>
  );
}

/**
 * Status bar component for integration into toolbars
 */
export function AutosaveStatusBar({
  state,
  actions,
  showStats = false,
  className
}: {
  state: AutosaveState;
  actions: AutosaveActions;
  showStats?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-4 px-4 py-2 border-t bg-muted/30",
      className
    )}>
      <AutosaveStatusMinimal
        state={state}
        onManualSave={actions.manualSave}
      />
      
      {showStats && state.stats && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{state.stats.totalSaves} saves</span>
          <span>•</span>
          <span>{Math.round(state.stats.totalSize / 1024)}KB</span>
        </div>
      )}
      
      {state.canRecover && (
        <Button 
          size="sm" 
          variant="outline"
          onClick={actions.acceptRecovery}
          className="h-6 px-2 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Recover
        </Button>
      )}
      
      <div className="flex-1" />
      
      <Button
        size="sm"
        variant="ghost"
        onClick={actions.toggleEnabled}
        className="h-6 px-2 text-xs"
      >
        {state.isEnabled ? 'Auto-save: ON' : 'Auto-save: OFF'}
      </Button>
    </div>
  );
} 