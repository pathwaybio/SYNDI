// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  schemaRegistry, 
  createDefaultObject, 
  detectSchemaType,
  isFilenameComponent,
  isExportConfiguration,
  isRenderableField,
  extractFilenameComponents,
  extractExportConfigurations,
  isConfigurationObject
} from '../../../../src/shared/lib/schema-registry';

describe('schema-registry', () => {
  beforeEach(() => {
    // Reset any state if needed
  });

  describe('schemaRegistry', () => {
    it('should have registered schemas', () => {
      const schemaNames = schemaRegistry.getAllSchemaNames();
      expect(schemaNames.length).toBeGreaterThan(0);
      expect(schemaNames).toContain('SOPTemplateSchema');
    });

    it('should get property definitions for known schema', () => {
      const properties = schemaRegistry.getPropertyDefinitions('SOPTemplateSchema');
      expect(Array.isArray(properties)).toBe(true);
    });

    it('should return empty array for unknown schema', () => {
      const properties = schemaRegistry.getPropertyDefinitions('UnknownSchema');
      expect(properties).toEqual([]);
    });

    it('should validate field values', () => {
      const result = schemaRegistry.validateField(
        { parse: () => {} } as any,
        'test'
      );
      expect(result).toHaveProperty('isValid');
    });
  });

  describe('createDefaultObject', () => {
    it('should create object with id and @type', () => {
      const obj = createDefaultObject('TestSchema');
      expect(obj).toHaveProperty('id');
      expect(obj).toHaveProperty('@type', 'TestSchema');
      expect(obj.id).toMatch(/testschema_\d+/);
    });

    it('should add children array for schemas that support it', () => {
      const obj = createDefaultObject('TaskGroup');
      expect(obj).toHaveProperty('children');
      expect(Array.isArray(obj.children)).toBe(true);
    });
  });

  describe('detectSchemaType', () => {
    it('should detect schema type from @type property', () => {
      const obj = { '@type': 'TaskGroup', id: 'test' };
      const detected = detectSchemaType(obj);
      expect(detected).toBe('TaskGroup');
    });

    it('should return null for objects without @type', () => {
      const obj = { id: 'test', name: 'test' };
      const detected = detectSchemaType(obj);
      expect(detected).toBeNull();
    });

    it('should return null for non-objects', () => {
      expect(detectSchemaType(null)).toBeNull();
      expect(detectSchemaType(undefined)).toBeNull();
      expect(detectSchemaType('string')).toBeNull();
    });
  });

  describe('isFilenameComponent', () => {
    it('should detect valid filename component', () => {
      const obj = { filename_component: true, order: 1 };
      expect(isFilenameComponent(obj)).toBe(true);
    });

    it('should reject invalid filename component', () => {
      expect(isFilenameComponent({ filename_component: false, order: 1 })).toBe(false);
      expect(isFilenameComponent({ filename_component: true })).toBe(false);
      expect(isFilenameComponent({ order: 1 })).toBe(false);
      expect(isFilenameComponent(null)).toBe(false);
    });
  });

  describe('isExportConfiguration', () => {
    it('should detect valid export configuration', () => {
      expect(isExportConfiguration({ enabled: true })).toBe(true);
      expect(isExportConfiguration({ value_immutable: false })).toBe(true);
      expect(isExportConfiguration({ name: 'test' })).toBe(true);
    });

    it('should reject invalid export configuration', () => {
      expect(isExportConfiguration({})).toBe(false);
      expect(isExportConfiguration(null)).toBe(false);
      expect(isExportConfiguration({ enabled: 'not-boolean' })).toBe(false);
    });
  });

  describe('isRenderableField', () => {
    it('should detect renderable fields', () => {
      expect(isRenderableField({ type: 'string' })).toBe(true);
      expect(isRenderableField({ type: 'number' })).toBe(true);
    });

    it('should reject non-renderable objects', () => {
      expect(isRenderableField({})).toBe(false);
      expect(isRenderableField({ id: 'test' })).toBe(false);
      expect(isRenderableField(null)).toBe(false);
    });
  });

  describe('extractFilenameComponents', () => {
    it('should extract filename components from children array', () => {
      const children = [
        { filename_component: true, order: 1 },
        { type: 'string', name: 'field' },
        { filename_component: true, order: 2 }
      ];
      const components = extractFilenameComponents(children);
      expect(components).toHaveLength(2);
      expect(components[0].order).toBe(1);
      expect(components[1].order).toBe(2);
    });

    it('should return empty array for invalid input', () => {
      expect(extractFilenameComponents(undefined)).toEqual([]);
      expect(extractFilenameComponents([])).toEqual([]);
      expect(extractFilenameComponents([{ type: 'string' }])).toEqual([]);
    });
  });

  describe('extractExportConfigurations', () => {
    it('should extract export configurations from children array', () => {
      const children = [
        { enabled: true, value_immutable: true },
        { type: 'string', name: 'field' },
        { name: 'export', default_immutable: false }
      ];
      const configs = extractExportConfigurations(children);
      expect(configs).toHaveLength(3);
    });

    it('should return empty array for invalid input', () => {
      expect(extractExportConfigurations(undefined)).toEqual([]);
      expect(extractExportConfigurations([])).toEqual([]);
      expect(extractExportConfigurations([{ type: 'string' }])).toEqual([]);
    });
  });

  describe('isConfigurationObject', () => {
    it('should detect configuration objects', () => {
      expect(isConfigurationObject({ id: 'test' })).toBe(true);
      expect(isConfigurationObject({ filename_component: true })).toBe(true);
    });

    it('should reject renderable fields', () => {
      expect(isConfigurationObject({ type: 'string' })).toBe(false);
      expect(isConfigurationObject({ type: 'number' })).toBe(false);
    });

    it('should reject non-objects', () => {
      expect(isConfigurationObject(null)).toBe(false);
      expect(isConfigurationObject(undefined)).toBe(false);
      expect(isConfigurationObject('string')).toBe(false);
    });
  });
}); 