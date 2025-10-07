// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFileInput, FILE_ACCEPT_PATTERNS } from '../../../../src/shared/lib/file-input';

describe('file-input', () => {
  let mockInput: HTMLInputElement;
  let mockClick: ReturnType<typeof vi.fn>;
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock DOM elements
    mockClick = vi.fn();
    mockOnChange = vi.fn();
    
    mockInput = {
      type: '',
      accept: '',
      multiple: false,
      onchange: null,
      click: mockClick,
      files: null
    } as any;

    // Mock document.createElement
    vi.spyOn(document, 'createElement').mockReturnValue(mockInput);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createFileInput', () => {
    it('should create file input with correct properties', () => {
      const onFileSelected = vi.fn();
      
      createFileInput('.json', onFileSelected, false);
      
      expect(document.createElement).toHaveBeenCalledWith('input');
      expect(mockInput.type).toBe('file');
      expect(mockInput.accept).toBe('.json');
      expect(mockInput.multiple).toBe(false);
      expect(mockClick).toHaveBeenCalled();
    });

    it('should handle single file selection', () => {
      const onFileSelected = vi.fn();
      const mockFile = new File(['test'], 'test.json', { type: 'application/json' });
      
      createFileInput('.json', onFileSelected, false);
      
      // Simulate file selection
      const mockEvent = {
        target: {
          files: [mockFile]
        }
      } as any;
      
      mockInput.onchange!(mockEvent);
      
      expect(onFileSelected).toHaveBeenCalledWith(mockFile);
    });

    it('should handle multiple file selection', () => {
      const onFileSelected = vi.fn();
      const mockFiles = [
        new File(['test1'], 'test1.json', { type: 'application/json' }),
        new File(['test2'], 'test2.json', { type: 'application/json' })
      ];
      
      createFileInput('.json', onFileSelected, true);
      
      // Simulate multiple file selection
      const mockEvent = {
        target: {
          files: mockFiles
        }
      } as any;
      
      mockInput.onchange!(mockEvent);
      
      expect(onFileSelected).toHaveBeenCalledTimes(2);
      expect(onFileSelected).toHaveBeenCalledWith(mockFiles[0], 0, mockFiles);
      expect(onFileSelected).toHaveBeenCalledWith(mockFiles[1], 1, mockFiles);
    });

    it('should handle no file selection', () => {
      const onFileSelected = vi.fn();
      
      createFileInput('.json', onFileSelected, false);
      
      // Simulate no file selection
      const mockEvent = {
        target: {
          files: null
        }
      } as any;
      
      mockInput.onchange!(mockEvent);
      
      expect(onFileSelected).not.toHaveBeenCalled();
    });

    it('should handle empty file list', () => {
      const onFileSelected = vi.fn();
      
      createFileInput('.json', onFileSelected, false);
      
      // Simulate empty file list
      const mockEvent = {
        target: {
          files: []
        }
      } as any;
      
      mockInput.onchange!(mockEvent);
      
      expect(onFileSelected).not.toHaveBeenCalled();
    });
  });

  describe('FILE_ACCEPT_PATTERNS', () => {
    it('should have expected patterns', () => {
      expect(FILE_ACCEPT_PATTERNS.SOP_FILES).toBe('.json,.yaml,.yml');
      expect(FILE_ACCEPT_PATTERNS.JSON_ONLY).toBe('.json');
      expect(FILE_ACCEPT_PATTERNS.YAML_ONLY).toBe('.yaml,.yml');
      expect(FILE_ACCEPT_PATTERNS.TEXT_FILES).toBe('.txt,.json,.yaml,.yml');
    });

    it('should be readonly constants', () => {
      expect(Object.isFrozen(FILE_ACCEPT_PATTERNS)).toBe(true);
    });
  });
}); 