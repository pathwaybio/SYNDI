// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { createContext, useContext, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';

// ===== TYPES =====
export interface UIConfig {
  default_expanded?: boolean;
  card_variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  collapsible?: boolean;
  icon?: string;
  component_type?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  placeholder?: string;
  label?: string;
  description?: string;
  layout?: {
    full_width?: boolean;
    grid_column_span?: number;
    className?: string;
    style?: Record<string, any>;
  };
  validation_ui?: {
    show_validation_state?: boolean;
    error_message_position?: 'below' | 'tooltip' | 'inline';
    required_indicator?: 'asterisk' | 'text' | 'none';
  };
  [key: string]: any; // Allow additional properties
}

export type IconSize = 'small' | 'medium' | 'large';

// ===== CONSTANTS =====
export const ICON_SIZES = {
  small: 'w-3 h-3',
  medium: 'w-4 h-4',
  large: 'w-5 h-5'
} as const;

export const CARD_VARIANTS = {
  default: '',
  outline: 'border-2',
  secondary: 'bg-secondary',
  destructive: 'border-destructive'
} as const;

// ===== CONTEXT =====
interface UIConfigContextValue {
  renderIcon: (iconName: string, size?: IconSize) => React.ReactNode;
  getCardVariantClass: (variant?: string) => string;
  shouldBeCollapsible: (uiConfig?: UIConfig) => boolean;
  getDefaultExpanded: (uiConfig?: UIConfig) => boolean;
  getIconSizeClass: (size: IconSize) => string;
}

const UIConfigContext = createContext<UIConfigContextValue | null>(null);

// ===== PROVIDER =====
interface UIConfigProviderProps {
  children: React.ReactNode;
}

export const UIConfigProvider: React.FC<UIConfigProviderProps> = ({ children }) => {
  const value = useMemo<UIConfigContextValue>(() => ({
    /**
     * Renders a Lucide icon component dynamically from kebab-case name
     */
    renderIcon: (iconName: string, size: IconSize = 'medium'): React.ReactNode => {
      if (!iconName) return null;
      
      const pascalCaseName = iconName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
        
      const IconComponent = (LucideIcons as any)[pascalCaseName];
      const className = ICON_SIZES[size];
      
      return IconComponent ? (
        <IconComponent className={className} />
      ) : (
        <LucideIcons.HelpCircle className={className} />
      );
    },

    /**
     * Converts card_variant to CSS class
     */
    getCardVariantClass: (variant?: string): string => {
      if (!variant) return CARD_VARIANTS.default;
      return CARD_VARIANTS[variant as keyof typeof CARD_VARIANTS] || CARD_VARIANTS.default;
    },

    /**
     * Determines if an element should be collapsible based on ui_config
     */
    shouldBeCollapsible: (uiConfig?: UIConfig): boolean => {
      return uiConfig?.collapsible !== false; // Default to true unless explicitly false
    },

    /**
     * Gets the default expanded state based on ui_config
     */
    getDefaultExpanded: (uiConfig?: UIConfig): boolean => {
      return uiConfig?.default_expanded !== false; // Default to true unless explicitly false
    },

    /**
     * Gets the CSS class for a given icon size
     */
    getIconSizeClass: (size: IconSize): string => {
      return ICON_SIZES[size];
    }
  }), []);

  return (
    <UIConfigContext.Provider value={value}>
      {children}
    </UIConfigContext.Provider>
  );
};

// ===== HOOK =====
export const useUIConfig = (): UIConfigContextValue => {
  const context = useContext(UIConfigContext);
  if (!context) {
    throw new Error('useUIConfig must be used within a UIConfigProvider');
  }
  return context;
};

// ===== UTILITY FUNCTIONS (for non-React usage) =====
/**
 * Standalone utility functions for use outside of React components
 * These mirror the provider functions but don't require React context
 */

export const renderIconStandalone = (iconName: string, size: IconSize = 'medium'): React.ReactNode => {
  if (!iconName) return null;
  
  const pascalCaseName = iconName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
    
  const IconComponent = (LucideIcons as any)[pascalCaseName];
  const className = ICON_SIZES[size];
  
  return IconComponent ? (
    <IconComponent className={className} />
  ) : (
    <LucideIcons.HelpCircle className={className} />
  );
};

export const getCardVariantClassStandalone = (variant?: string): string => {
  if (!variant) return CARD_VARIANTS.default;
  return CARD_VARIANTS[variant as keyof typeof CARD_VARIANTS] || CARD_VARIANTS.default;
};

export const shouldBeCollapsibleStandalone = (uiConfig?: UIConfig): boolean => {
  return uiConfig?.collapsible !== false;
};

export const getDefaultExpandedStandalone = (uiConfig?: UIConfig): boolean => {
  return uiConfig?.default_expanded !== false;
}; 