// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Draft Recovery Banner Component
 * 
 * Shows a banner at the top of the form when recoverable drafts are available,
 * similar to SAM's recovery interface.
 */

import React from 'react';
import { Alert, AlertDescription } from '@shared/components/ui/alert';
import { Button } from '@shared/components/ui/button';
import { ActionButtonGroup } from '@shared/components/ActionButtonGroup';
import { Clock, History, X } from 'lucide-react';

export interface DraftRecoveryBannerProps {
  isVisible: boolean;
  draftCount: number;
  onRecover: () => void;
  onDiscard: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const DraftRecoveryBanner: React.FC<DraftRecoveryBannerProps> = ({
  isVisible,
  draftCount,
  onRecover,
  onDiscard,
  onDismiss,
  className = '',
}) => {
  if (!isVisible) return null;

  const getDraftText = () => {
    if (draftCount === 1) {
      return 'Found unsaved changes from a previous session';
    }
    return `Found ${draftCount} saved drafts from previous sessions`;
  };

  return (
    <Alert className={`border-blue-200 bg-blue-50 ${className}`}>
      <Clock className="h-4 w-4 text-blue-600" />
      <div className="flex items-center justify-between w-full">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-blue-900">Recovery available</span>
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <AlertDescription className="text-blue-800 mt-1">
            {getDraftText()}
          </AlertDescription>
        </div>
        
        <ActionButtonGroup
          actions={[
            {
              label: 'Recover',
              onClick: onRecover,
              icon: History,
              variant: 'default',
              className: 'bg-blue-600 hover:bg-blue-700 text-white',
            },
            {
              label: 'Discard',
              onClick: onDiscard,
              variant: 'outline',
              className: 'border-blue-300 text-blue-700 hover:bg-blue-100',
            },
          ]}
          className="ml-4"
        />
      </div>
    </Alert>
  );
}; 