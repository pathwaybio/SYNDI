// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { SOPCreator } from '../components/SOPCreator';
import { CollapsibleProperties } from '../components/CollapsibleProperties';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Download, FileText } from 'lucide-react';
import { schemaRegistry } from '@shared/lib/schema-registry';

/**
 * SOP Creator page for building SOP templates
 * 
 * This page provides a dynamic form builder for creating SOP templates:
 * - Uses the schema registry to automatically generate forms
 * - Supports nested relationships and hierarchical data structures
 * - Provides real-time validation and preview capabilities
 * - Exports form data as YAML for template storage
 */
export const SOPCreatorPage: React.FC = () => {
  // Main schema to build the form around
  const MAIN_SCHEMA = 'SOPTemplateSchema';
  // Special purpose UI Configuration schema
  const UI_CONFIG = 'UIConfiguration';
  
  // Form data state for the main schema properties
  const [mainSchemaFormData, setMainSchemaFormData] = useState<Record<string, any>>({});

  // Handle form data changes for the main schema
  const handleMainSchemaChange = (fieldName: string, value: any) => {
    setMainSchemaFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">SOP Editor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create a new SOP template using the dynamic schema-driven form builder.
            All fields and relationships are automatically discovered from the schema registry.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Documentation
        </Button>
      </div>
      
      <Card>
        <CardContent>
          <SOPCreator mainSchema={MAIN_SCHEMA} uiConfig={UI_CONFIG} />
        </CardContent>
      </Card>

      
    </div>
  );
}; 