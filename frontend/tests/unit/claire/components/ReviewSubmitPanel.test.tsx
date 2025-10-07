// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewSubmitPanel } from '../../../../src/claire/components/ReviewSubmitPanel';

// Mock the logger
vi.mock('../../../../src/shared/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    configure: vi.fn()
  }
}));

// Mock the UI config provider
vi.mock('../../../../src/shared/lib/ui-config-provider', () => ({
  useUIConfig: () => ({
    getUIConfig: vi.fn().mockReturnValue({}),
    renderIcon: vi.fn().mockReturnValue(null),
    getIconSizeClass: vi.fn().mockReturnValue('h-4 w-4')
  })
}));

describe('ReviewSubmitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders file upload fields correctly', () => {
    const sop: any = {
      id: 'test-sop',
      name: 'Test SOP',
      title: 'Test SOP',
      version: '1.0.0',
      status: 'published',
      url: 'http://test.com',
      '@type': 'SoftwareApplication',
      '@context': 'https://schema.org',
      author: 'Test Author',
      description: 'Test Description',
      keywords: ['test'],
      requirements: 'Test Requirements',
      'date-published': '2024-01-01',
      license: 'MIT',
      'github_release': 'v1.0.0',
      taskgroups: [
        {
          id: 'taskgroup_1',
          name: 'Test Group',
          children: [
            {
              id: 'field_fileupload',
              name: 'File Upload',
              type: 'file',
              required: true
            }
          ]
        }
      ]
    };

    const elnData = {
      values: {
              field_fileupload: {
        files: [], // Files may not be present when loading from draft
        fileIds: ['id1', 'id2'],
        uploadedUrls: ['url1', 'url2'],
        metadata: {
          originalNames: ['test.pdf', 'test2.pdf'],
          sizes: [1024, 2048],
          types: ['application/pdf', 'application/pdf']
        }
      }
      },
      errors: {},
      isValid: true,
      isSubmitting: false,
      touched: {}
    };

    render(
      <ReviewSubmitPanel
        sop={sop}
        elnData={elnData}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.getByText('test.pdf')).toBeInTheDocument();
    expect(screen.getByText('test2.pdf')).toBeInTheDocument();
  });
}); 