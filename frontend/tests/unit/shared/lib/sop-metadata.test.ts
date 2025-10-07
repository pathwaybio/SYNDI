// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { extractSOPMetadata, getSOPDisplayTitle } from '../../../../src/shared/lib/sop-metadata';

describe('sop-metadata', () => {
  describe('extractSOPMetadata', () => {
    it('should extract metadata from complete SOP data', () => {
      const data = {
        id: 'test-sop',
        name: 'Test SOP',
        title: 'Test SOP Title',
        version: '2.0.0',
        author: 'Test Author',
        'date-published': '2024-01-01',
        description: 'Test description',
        keywords: ['test', 'sop']
      };
      
      const metadata = extractSOPMetadata(data, 'test-sop.yaml');
      
      expect(metadata).toEqual({
        id: 'test-sop',
        name: 'Test SOP',
        title: 'Test SOP Title',
        version: '2.0.0',
        author: 'Test Author',
        date_published: '2024-01-01',
        description: 'Test description',
        keywords: ['test', 'sop'],
        filename: 'test-sop.yaml'
      });
    });

    it('should handle missing optional fields', () => {
      const data = {
        id: 'test-sop'
      };
      
      const metadata = extractSOPMetadata(data, 'test-sop.yaml');
      
      expect(metadata).toEqual({
        id: 'test-sop',
        name: 'test-sop',
        title: 'test-sop',
        version: '1.0.0',
        author: undefined,
        date_published: undefined,
        description: undefined,
        keywords: [],
        filename: 'test-sop.yaml'
      });
    });

    it('should extract id from filename when not provided', () => {
      const data = {};
      const metadata = extractSOPMetadata(data, 'my-sop.yaml');
      
      expect(metadata.id).toBe('my-sop');
    });

    it('should handle filename without extension', () => {
      const data = {};
      const metadata = extractSOPMetadata(data, 'my-sop');
      
      expect(metadata.id).toBe('my-sop');
    });

    it('should use fallback id when no filename provided', () => {
      const data = {};
      const metadata = extractSOPMetadata(data);
      
      expect(metadata.id).toBe('unknown');
    });

    it('should handle non-array keywords', () => {
      const data = {
        keywords: 'single-keyword'
      };
      
      const metadata = extractSOPMetadata(data);
      
      expect(metadata.keywords).toEqual([]);
    });

    it('should handle date-published with different formats', () => {
      const data1 = { 'date-published': '2024-01-01' };
      const data2 = { date_published: '2024-01-02' };
      
      const metadata1 = extractSOPMetadata(data1);
      const metadata2 = extractSOPMetadata(data2);
      
      expect(metadata1.date_published).toBe('2024-01-01');
      expect(metadata2.date_published).toBe('2024-01-02');
    });
  });

  describe('getSOPDisplayTitle', () => {
    it('should return title when available', () => {
      const data = { title: 'My SOP Title' };
      const title = getSOPDisplayTitle(data);
      expect(title).toBe('My SOP Title');
    });

    it('should fall back to name when title not available', () => {
      const data = { name: 'My SOP Name' };
      const title = getSOPDisplayTitle(data);
      expect(title).toBe('My SOP Name');
    });

    it('should use custom fallback when neither title nor name available', () => {
      const data = {};
      const title = getSOPDisplayTitle(data, 'Custom Fallback');
      expect(title).toBe('Custom Fallback');
    });

    it('should use default fallback when no custom fallback provided', () => {
      const data = {};
      const title = getSOPDisplayTitle(data);
      expect(title).toBe('Untitled SOP');
    });

    it('should prioritize title over name', () => {
      const data = { title: 'Title', name: 'Name' };
      const title = getSOPDisplayTitle(data);
      expect(title).toBe('Title');
    });
  });
}); 