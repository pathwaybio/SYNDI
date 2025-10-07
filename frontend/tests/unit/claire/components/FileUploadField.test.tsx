// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FileUploadField } from '../../../../src/claire/components/FileUploadField';
import { AuthProvider } from '../../../../src/shared/lib/auth';

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

// Mock the config loader
vi.mock('../../../../src/shared/lib/config-loader', () => ({
  configLoader: {
    loadConfig: vi.fn().mockResolvedValue({
      webapp: {
        auth: {
          required: false,
          provider: 'mock'
        }
      }
    })
  }
}));

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    {children}
  </AuthProvider>
);

const renderWithAuth = (component: React.ReactElement) => {
  return render(component, { wrapper: TestWrapper });
};

describe('FileUploadField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    fieldId: 'test_field',
    sopId: 'Test4',
    onChange: vi.fn(),
    config: {
      accept: '.pdf,.doc,.docx',
      multiple: false,
      maxSize: 10,
      maxFiles: 1
    },
    disabled: false
  };

  it('renders dropzone with correct text', () => {
    renderWithAuth(<FileUploadField {...defaultProps} />);
    
    expect(screen.getByText('Drag & drop files here, or click to select')).toBeInTheDocument();
    expect(screen.getByText('Accepted: .pdf,.doc,.docx • Max size: 10MB')).toBeInTheDocument();
  });

  it('displays uploaded files using metadata', () => {
    const value = {
      files: [], // Files may not be present when loading from draft
      fileIds: ['id1', 'id2'],
      uploadedUrls: ['url1', 'url2'],
      metadata: {
        originalNames: ['test.pdf', 'test2.pdf'],
        sizes: [1024, 2048],
        types: ['application/pdf', 'application/pdf']
      }
    };

    renderWithAuth(<FileUploadField {...defaultProps} value={value} />);
    
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
    expect(screen.getByText('test2.pdf')).toBeInTheDocument();
    expect(screen.getByText('Uploaded Files')).toBeInTheDocument();
  });

  it('handles multiple file uploads when config.multiple is true', async () => {
    const onChange = vi.fn();
    const multipleConfig = { ...defaultProps.config, multiple: true, maxFiles: 3 };
    
    // Initial state with one file
    const initialValue = {
      files: [],
      fileIds: ['id1'],
      uploadedUrls: ['url1'],
      metadata: {
        originalNames: ['existing.pdf'],
        sizes: [1024],
        types: ['application/pdf']
      }
    };
    
    // Mock successful upload response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ 
        file_ids: ['id2', 'id3'],  // Note: underscore, not camelCase
        uploaded_urls: ['url2', 'url3']
      })
    });
    
    renderWithAuth(
      <FileUploadField 
        {...defaultProps} 
        config={multipleConfig}
        value={initialValue}
        onChange={onChange}
        sopId="TestSOP"
      />
    );
    
    // Simulate dropping 2 new files
    const dropzone = screen.getByText(/drag & drop files here/i).parentElement!;
    const newFiles = [
      new File(['content2'], 'new1.pdf', { type: 'application/pdf' }),
      new File(['content3'], 'new2.pdf', { type: 'application/pdf' })
    ];
    
    // Fire drop event
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: newFiles,
        types: ['Files']
      }
    });
    
    // Wait for upload to complete
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    
    // Verify the onChange was called with appended files
    const callArg = onChange.mock.calls[0][0];
    expect(callArg.fileIds).toHaveLength(3);
    expect(callArg.fileIds).toEqual(['id1', 'id2', 'id3']);
    expect(callArg.metadata.originalNames).toEqual(['existing.pdf', 'new1.pdf', 'new2.pdf']);
  });

  it('respects maxFiles limit when multiple uploads are allowed', async () => {
    const onChange = vi.fn();
    const multipleConfig = { ...defaultProps.config, multiple: true, maxFiles: 2 };
    
    // Initial state with one file already uploaded
    const initialValue = {
      files: [],
      fileIds: ['id1'],
      uploadedUrls: ['url1'],
      metadata: {
        originalNames: ['existing.pdf'],
        sizes: [1024],
        types: ['application/pdf']
      }
    };
    
    renderWithAuth(
      <FileUploadField 
        {...defaultProps} 
        config={multipleConfig}
        value={initialValue}
        onChange={onChange}
      />
    );
    
    // Try to drop 2 more files (would exceed limit of 2)
    const dropzone = screen.getByText(/drag & drop files here/i).parentElement!;
    const newFiles = [
      new File(['content2'], 'new1.pdf', { type: 'application/pdf' }),
      new File(['content3'], 'new2.pdf', { type: 'application/pdf' })
    ];
    
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: newFiles,
        types: ['Files']
      }
    });
    
    // Should show error instead of uploading
    await waitFor(() => {
      expect(screen.getByText(/Maximum 2 files allowed/i)).toBeInTheDocument();
    });
    
    expect(onChange).not.toHaveBeenCalled();
  });

  it('displays file sizes with correct precision', () => {
    const value = {
      files: [],
      fileIds: ['id1'],
      uploadedUrls: ['url1'],
      metadata: {
        originalNames: ['small.png'],
        sizes: [4543], // Should display as 0.005 MB
        types: ['image/png']
      }
    };

    renderWithAuth(<FileUploadField {...defaultProps} value={value} />);
    
    // Check that file size is displayed with 3 decimal places
    expect(screen.getByText('0.004 MB')).toBeInTheDocument();
  });
}); 