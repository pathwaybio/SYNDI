// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { ActionButtonGroup } from '@shared/components/ActionButtonGroup';
import { TestTube, Trash2, FileText, Download, Upload } from 'lucide-react';

interface SOPActionButtonsProps {
  onClearForm: () => void;
  onExportDraft: () => void;
  onExportFinal: () => void;
  onLoadFromJSON: () => void;
  className?: string;
}

export const SOPActionButtons: React.FC<SOPActionButtonsProps> = ({
  onClearForm,
  onExportDraft,
  onExportFinal,
  onLoadFromJSON,
  className = ''
}) => {
  const actions = [
    {
      label: 'Load from JSON',
      onClick: onLoadFromJSON,
      icon: Upload,
      variant: 'outline' as const
    },
    {
      label: 'Clear Form',
      onClick: onClearForm,
      icon: Trash2,
      variant: 'outline' as const
    },
    {
      label: 'Export Draft',
      onClick: onExportDraft,
      icon: FileText,
      variant: 'secondary' as const
    },
    {
      label: 'Export Final',
      onClick: onExportFinal,
      icon: Download,
      className: 'bg-blue-600 hover:bg-blue-700'
    }
  ];

  return (
    <ActionButtonGroup 
      actions={actions}
      className={className}
    />
  );
}; 