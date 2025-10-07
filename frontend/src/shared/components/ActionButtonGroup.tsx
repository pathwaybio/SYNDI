// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Button } from '@shared/components/ui/button';
import { LucideIcon } from 'lucide-react';

interface ActionButton {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost' | 'link';
  className?: string;
  disabled?: boolean;
}

interface ActionButtonGroupProps {
  actions: ActionButton[];
  className?: string;
  justify?: 'start' | 'center' | 'end';
}

export const ActionButtonGroup: React.FC<ActionButtonGroupProps> = ({ 
  actions, 
  className = '', 
  justify = 'end' 
}) => {
  const justifyClass = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end'
  }[justify];

  return (
    <div className={`flex ${justifyClass} gap-2 ${className}`}>
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <Button
            key={index}
            variant={action.variant || 'default'}
            onClick={action.onClick}
            className={action.className}
            disabled={action.disabled}
          >
            {Icon && <Icon className="h-4 w-4 mr-2" />}
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}; 