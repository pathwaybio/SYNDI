// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportData, generateTimestampedFilename } from '../../../../src/shared/lib/file-export';

describe('file-export', () => {
  let mockLink: HTMLAnchorElement;
  let mockClick: ReturnType<typeof vi.fn>;
  let mockAppendChild: ReturnType<typeof vi.fn>;
  let mockRemoveChild: ReturnType<typeof vi.fn>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock DOM elements and methods
    mockClick = vi.fn();
    mockAppendChild = vi.fn();
    mockRemoveChild = vi.fn();
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();

    mockLink = {
      href: '',
      download: '',
      click: mockClick
    } as any;

    // Mock document methods
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
    vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
    vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);
    
    // Mock URL methods
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    // Mock Blob
    global.Blob = vi.fn().mockImplementation((content, options) => ({
      content,
      options
    })) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportData', () => {
    it('should export JSON data correctly', async () => {
      const data = { test: 'value', number: 42 };
      const options = { format: 'json' as const, filename: 'test.json' };

      await exportData(data, options);

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.download).toBe('test.json');
      expect(mockClick).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
      expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should export YAML data correctly', async () => {
      const data = { test: 'value', number: 42 };
      const options = { format: 'yaml' as const, filename: 'test.yaml' };

      // Mock js-yaml import
      const mockYaml = {
        dump: vi.fn().mockReturnValue('test: value\nnumber: 42\n')
      };
      vi.doMock('js-yaml', () => mockYaml);

      await exportData(data, options);

      expect(mockLink.download).toBe('test.yaml');
      expect(mockClick).toHaveBeenCalled();
    });

    it('should add metadata when provided', async () => {
      const data = { test: 'value' };
      const options = {
        format: 'json' as const,
        metadata: { author: 'test', version: '1.0' }
      };

      await exportData(data, options);

      // Check that Blob was called with a single JSON string containing metadata
      const blobCall = (global.Blob as any).mock.calls[0];
      const content = blobCall[0][0];
      
      expect(blobCall[1]).toEqual({ type: 'application/json' });
      expect(content).toContain('"author": "test"');
      expect(content).toContain('"version": "1.0"');
      expect(content).toContain('"exported_at"');
      expect(content).toContain('"test": "value"');
    });

    it('should use default filename when not provided', async () => {
      const data = { test: 'value' };
      const options = { format: 'json' as const };

      await exportData(data, options);

      expect(mockLink.download).toBe('export.json');
    });

    it('should handle draft exports', async () => {
      const data = { test: 'value' };
      const options = { format: 'yaml' as const, isDraft: true };

      // Mock js-yaml import
      const mockYaml = {
        dump: vi.fn().mockReturnValue('test: value\n')
      };
      vi.doMock('js-yaml', () => mockYaml);

      await exportData(data, options);

      // Verify yaml.dump was called with skipInvalid: true
      expect(mockYaml.dump).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          skipInvalid: true
        })
      );
    });
  });

  describe('generateTimestampedFilename', () => {
    it('should generate filename with timestamp', () => {
      const filename = generateTimestampedFilename('test', 'json');
      
      expect(filename).toMatch(/^test-final-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/);
    });

    it('should include draft status when specified', () => {
      const filename = generateTimestampedFilename('test', 'yaml', true);
      
      expect(filename).toMatch(/^test-draft-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.yaml$/);
    });

    it('should handle different extensions', () => {
      const jsonFilename = generateTimestampedFilename('data', 'json');
      const yamlFilename = generateTimestampedFilename('data', 'yaml');
      
      expect(jsonFilename).toMatch(/\.json$/);
      expect(yamlFilename).toMatch(/\.yaml$/);
    });

    it('should use different prefixes', () => {
      const filename1 = generateTimestampedFilename('sop', 'json');
      const filename2 = generateTimestampedFilename('eln', 'json');
      
      expect(filename1).toMatch(/^sop-/);
      expect(filename2).toMatch(/^eln-/);
    });
  });
}); 