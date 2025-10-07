// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { JSONSchema7 } from 'json-schema';
import { SOP } from '@shared/types/sop';
import { Button } from '@shared/components/ui/button';
import { Alert, AlertDescription } from '@shared/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Loader2, Save, Send } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
import { logger } from '@shared/lib/logger';
import { SchemaCard } from './SchemaCard';

interface ELNFormData {
  values: any;
  errors: any;
  isValid: boolean;
  isSubmitting: boolean;
  touched: any;
}

interface SchemaAgnosticFormRendererProps {
  sop: SOP;
  initialData?: ELNFormData;
  onSave?: (data: ELNFormData) => void;
  onSubmit?: (data: ELNFormData) => void;
  isSubmitting?: boolean;
  isSaving?: boolean;
}

export const SchemaAgnosticFormRenderer: React.FC<SchemaAgnosticFormRendererProps> = ({
  sop,
  initialData,
  onSave,
  onSubmit,
  isSubmitting = false,
  isSaving = false
}) => {
  const [formData, setFormData] = useState(() => initialData?.values || {});

  // Initialize form data from initialData when it changes (for tab navigation)
  useEffect(() => {
    if (initialData?.values) {
      setFormData(initialData.values);
      logger.debug('SchemaAgnosticFormRenderer', 'Restored form data from initialData', initialData.values);
    }
  }, [initialData]);

  // Handle individual field changes - REMOVED AUTOMATIC SAVE TO PREVENT LOOP
  const handleFieldChange = (fieldId: string, value: any) => {
    const newFormData = { ...formData, [fieldId]: value };
    setFormData(newFormData);
    
    // TEMPORARILY DISABLED: Only update parent state without triggering autosave
    // We'll handle saves manually through the Save Draft button only
    if (onSave) {
      const elnData: ELNFormData = {
        values: newFormData,
        errors: {},
        isValid: true,
        isSubmitting: false,
        touched: {}
      };
      onSave(elnData);
    }
    
    logger.debug('SchemaAgnosticFormRenderer', `Field changed: ${fieldId}`, value);
  };

  if (!sop.taskgroups || sop.taskgroups.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No taskgroups found in this SOP.
        </AlertDescription>
      </Alert>
    );
  }

      return (
      <div className="space-y-6">

      {/* Render each taskgroup using SchemaCard */}
      {sop.taskgroups.map((taskgroup: any) => (
        <SchemaCard
          key={taskgroup.id}
          schema={taskgroup}
          sopId={sop.id}
          showRawJson={true}
          formData={formData}
          onFormDataChange={handleFieldChange}
        />
      ))}

      {/* Submit button removed - only allow submission through Review & Submit tab */}
    </div>
  );
}; 