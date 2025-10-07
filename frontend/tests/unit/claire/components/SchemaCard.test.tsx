// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchemaCard } from '../../../../src/claire/components/SchemaCard';

// Mock the FileUploadField component
vi.mock('../../../../src/claire/components/FileUploadField', () => ({
  FileUploadField: ({ fieldId }: any) => React.createElement(
    'div',
    { 'data-testid': 'file-upload-field' },
    React.createElement('span', null, `File Upload Field: ${fieldId}`)
  )
}));

// Mock the UI config provider
vi.mock('../../../../src/shared/lib/ui-config-provider', () => ({
  useUIConfig: () => ({
    renderIcon: vi.fn().mockReturnValue(null),
    getIconSizeClass: vi.fn().mockReturnValue('h-4 w-4'),
    getCardVariantClass: vi.fn().mockReturnValue(''),
    shouldBeCollapsible: vi.fn().mockReturnValue(false),
    getDefaultExpanded: vi.fn().mockReturnValue(true)
  })
}));

// Mock the logger
vi.mock('../../../../src/shared/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    configure: vi.fn()
  }
}));

describe('SchemaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders file upload field when type is file', () => {
    const fileFieldSchema = {
      id: 'field_fileupload',
      type: 'file',
      name: 'File Upload',
      title: 'Upload a file',
      description: 'Upload a file for this experiment',
      file_config: {
        accept: '.pdf,.doc,.docx',
        multiple: false,
        maxSize: 10
      },
      ui_config: {
        component_type: 'file-upload'
      }
    };

    const onFormDataChange = vi.fn();

    render(
      <SchemaCard
        schema={fileFieldSchema}
        formData={{}}
        onFormDataChange={onFormDataChange}
      />
    );

    expect(screen.getByTestId('file-upload-field')).toBeInTheDocument();
    expect(screen.getByText('File Upload Field: field_fileupload')).toBeInTheDocument();
  });
}); 