// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFile, getFileExtension, isValidFileType } from '../../../../src/shared/lib/file-parser';

describe('file-parser', () => {
  beforeEach(() => {
    // Mock File.text() method
    global.File = vi.fn().mockImplementation((content, filename, options) => ({
      name: filename,
      text: vi.fn().mockResolvedValue(content)
    })) as any;
  });
  describe('parseFile', () => {
    it('should parse JSON file correctly', async () => {
      const jsonContent = '{"test": "value", "number": 42}';
      const file = new File([jsonContent], 'test.json', { type: 'application/json' });

      const result = await parseFile(file);

      expect(result.content).toEqual({ test: 'value', number: 42 });
      expect(result.type).toBe('json');
      expect(result.filename).toBe('test.json');
    });

    it('should parse YAML file correctly', async () => {
      const yamlContent = 'test: value\nnumber: 42';
      const file = new File([yamlContent], 'test.yaml', { type: 'application/x-yaml' });

      const result = await parseFile(file);

      expect(result.content).toEqual({ test: 'value', number: 42 });
      expect(result.type).toBe('yaml');
      expect(result.filename).toBe('test.yaml');
    });

    it('should fall back to YAML when JSON parsing fails', async () => {
      const invalidJsonContent = '{"test": "value", "number": 42,}'; // Invalid JSON
      const file = new File([invalidJsonContent], 'test.yaml', { type: 'application/x-yaml' });

      const result = await parseFile(file);

      expect(result.type).toBe('yaml');
      expect(result.filename).toBe('test.yaml');
    });

    it('should throw error when both JSON and YAML parsing fail', async () => {
      const invalidContent = 'invalid content';
      const file = new File([invalidContent], 'test.txt', { type: 'text/plain' });

      await expect(parseFile(file)).rejects.toThrow('Invalid file format. Expected JSON object or YAML document.');
    });

    it('should throw error for non-object content', async () => {
      const stringContent = 'just a string';
      const file = new File([stringContent], 'test.json', { type: 'application/json' });

      await expect(parseFile(file)).rejects.toThrow('Invalid file format. Expected JSON object or YAML document.');
    });

    it('should throw error for null content', async () => {
      const nullContent = 'null';
      const file = new File([nullContent], 'test.json', { type: 'application/json' });

      await expect(parseFile(file)).rejects.toThrow('Invalid file format. Expected JSON object or YAML document.');
    });

    it('should handle empty object', async () => {
      const emptyObjectContent = '{}';
      const file = new File([emptyObjectContent], 'test.json', { type: 'application/json' });

      const result = await parseFile(file);

      expect(result.content).toEqual({});
      expect(result.type).toBe('json');
    });

    it('should handle complex nested objects', async () => {
      const complexJson = JSON.stringify({
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        simple: 'string'
      });
      const file = new File([complexJson], 'complex.json', { type: 'application/json' });

      const result = await parseFile(file);

      expect(result.content).toHaveProperty('nested.array');
      expect(result.content.nested.array).toEqual([1, 2, 3]);
      expect(result.content.nested.object.key).toBe('value');
      expect(result.content.simple).toBe('string');
    });
  });

  describe('getFileExtension', () => {
    it('should extract file extension correctly', () => {
      expect(getFileExtension('test.json')).toBe('json');
      expect(getFileExtension('test.yaml')).toBe('yaml');
      expect(getFileExtension('test.yml')).toBe('yml');
      expect(getFileExtension('test.txt')).toBe('txt');
    });

    it('should handle filenames with multiple dots', () => {
      expect(getFileExtension('test.backup.json')).toBe('json');
      expect(getFileExtension('test.v1.2.yaml')).toBe('yaml');
    });

    it('should handle filenames without extension', () => {
      expect(getFileExtension('testfile')).toBe('');
      expect(getFileExtension('test.')).toBe('');
    });

    it('should handle filenames starting with dot', () => {
      expect(getFileExtension('.hidden')).toBe('hidden');
    });

    it('should return lowercase extension', () => {
      expect(getFileExtension('test.JSON')).toBe('json');
      expect(getFileExtension('test.YAML')).toBe('yaml');
    });

    it('should handle empty filename', () => {
      expect(getFileExtension('')).toBe('');
    });
  });

  describe('isValidFileType', () => {
    it('should accept valid file types', () => {
      expect(isValidFileType('test.json')).toBe(true);
      expect(isValidFileType('test.yaml')).toBe(true);
      expect(isValidFileType('test.yml')).toBe(true);
    });

    it('should reject invalid file types', () => {
      expect(isValidFileType('test.txt')).toBe(false);
      expect(isValidFileType('test.pdf')).toBe(false);
      expect(isValidFileType('test.xml')).toBe(false);
    });

    it('should handle case insensitive extensions', () => {
      expect(isValidFileType('test.JSON')).toBe(true);
      expect(isValidFileType('test.YAML')).toBe(true);
      expect(isValidFileType('test.YML')).toBe(true);
    });

    it('should handle filenames without extension', () => {
      expect(isValidFileType('testfile')).toBe(false);
    });

    it('should handle empty filename', () => {
      expect(isValidFileType('')).toBe(false);
    });
  });
}); 