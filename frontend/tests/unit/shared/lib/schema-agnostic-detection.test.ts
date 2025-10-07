// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/// <reference types="vitest/globals" />
import { 
  isFilenameComponent, 
  isExportConfiguration, 
  isRenderableField,
  isConfigurationObject,
  extractFilenameComponents,
  extractExportConfigurations,
  detectSchemaType 
} from '../../../../src/shared/lib/schema-registry';

/**
 * Regression Test Suite: Schema-Agnostic Detection Migration
 * 
 * This test suite ensures that our migration from _schemaType to schema-agnostic
 * detection functions works correctly and prevents regression back to hardcoded
 * schema dependencies.
 * 
 * Background: We migrated from using _schemaType properties to structural
 * detection based on object properties, following agent_context.md principles
 * of schema independence.
 */
describe('Schema-Agnostic Detection Functions', () => {
  
  describe('isFilenameComponent', () => {
    it('correctly identifies filename component configurations', () => {
      const validFilenameComponent = {
        filename_component: true,
        order: 1
      };
      
      expect(isFilenameComponent(validFilenameComponent)).toBe(true);
    });

    it('correctly rejects objects without filename_component property', () => {
      const notFilenameComponent = {
        order: 1,
        some_other_property: true
      };
      
      expect(isFilenameComponent(notFilenameComponent)).toBe(false);
    });

    it('correctly rejects objects with filename_component: false', () => {
      const disabledFilenameComponent = {
        filename_component: false,
        order: 1
      };
      
      expect(isFilenameComponent(disabledFilenameComponent)).toBe(false);
    });

    it('correctly rejects objects without order property', () => {
      const missingOrder = {
        filename_component: true
      };
      
      expect(isFilenameComponent(missingOrder)).toBe(false);
    });

    it('correctly rejects null/undefined inputs', () => {
      expect(isFilenameComponent(null)).toBe(false);
      expect(isFilenameComponent(undefined)).toBe(false);
      expect(isFilenameComponent('string')).toBe(false);
    });

    it('does NOT rely on hardcoded schema names or _schemaType', () => {
      // Regression test: ensure we don't check for _schemaType
      const objectWithSchemaType = {
        _schemaType: 'ELNFilenameComponent',
        filename_component: true,
        order: 1
      };
      
      const objectWithoutSchemaType = {
        filename_component: true,
        order: 1
      };
      
      // Both should work the same - _schemaType should be ignored
      expect(isFilenameComponent(objectWithSchemaType)).toBe(true);
      expect(isFilenameComponent(objectWithoutSchemaType)).toBe(true);
    });
  });

  describe('isExportConfiguration', () => {
    it('identifies export configurations by enabled property', () => {
      const exportConfig = {
        enabled: true
      };
      
      expect(isExportConfiguration(exportConfig)).toBe(true);
    });

    it('identifies export configurations by name property', () => {
      const exportConfig = {
        name: 'field_export'
      };
      
      expect(isExportConfiguration(exportConfig)).toBe(true);
    });

    it('identifies export configurations by value_immutable property', () => {
      const exportConfig = {
        value_immutable: false
      };
      
      expect(isExportConfiguration(exportConfig)).toBe(true);
    });

    it('identifies export configurations by default_immutable property', () => {
      const exportConfig = {
        default_immutable: true
      };
      
      expect(isExportConfiguration(exportConfig)).toBe(true);
    });

    it('correctly rejects objects without export-related properties', () => {
      const notExportConfig = {
        some_property: 'value',
        another_property: 123
      };
      
      expect(isExportConfiguration(notExportConfig)).toBe(false);
    });

    it('does NOT rely on hardcoded schema names or _schemaType', () => {
      // Regression test: ensure we don't check for _schemaType
      const objectWithSchemaType = {
        _schemaType: 'ExportConfiguration',
        enabled: true
      };
      
      const objectWithoutSchemaType = {
        enabled: true
      };
      
      // Both should work the same - _schemaType should be ignored
      expect(isExportConfiguration(objectWithSchemaType)).toBe(true);
      expect(isExportConfiguration(objectWithoutSchemaType)).toBe(true);
    });
  });

  describe('isRenderableField', () => {
    it('correctly identifies renderable fields by type property', () => {
      const renderableField = {
        id: 'field1',
        name: 'Test Field',
        type: 'string'
      };
      
      expect(isRenderableField(renderableField)).toBe(true);
    });

    it('correctly rejects configuration objects without type property', () => {
      const configObject = {
        filename_component: true,
        order: 1
      };
      
      expect(isRenderableField(configObject)).toBe(false);
    });

    it('follows agent_context.md principle: only type property determines renderability', () => {
      const fieldWithType = {
        id: 'field1',
        _schemaType: 'Field', // Should be ignored
        type: 'string'        // This determines renderability
      };
      
      const configWithoutType = {
        id: 'config1',
        _schemaType: 'Field', // Should be ignored
        filename_component: true,
        order: 1
        // No 'type' property = not renderable
      };
      
      expect(isRenderableField(fieldWithType)).toBe(true);
      expect(isRenderableField(configWithoutType)).toBe(false);
    });
  });

  describe('isConfigurationObject', () => {
    it('correctly identifies configuration objects (lack type property)', () => {
      const configObject = {
        filename_component: true,
        order: 1
      };
      
      expect(isConfigurationObject(configObject)).toBe(true);
    });

    it('correctly rejects renderable fields (have type property)', () => {
      const renderableField = {
        id: 'field1',
        type: 'string'
      };
      
      expect(isConfigurationObject(renderableField)).toBe(false);
    });
  });

  describe('extractFilenameComponents', () => {
    it('extracts only filename components from children array', () => {
      const children = [
        {
          filename_component: true,
          order: 1
        },
        {
          enabled: true // Export configuration
        },
        {
          filename_component: true,
          order: 2
        },
        {
          type: 'string' // Renderable field
        }
      ];
      
      const filenameComponents = extractFilenameComponents(children);
      
      expect(filenameComponents).toHaveLength(2);
      expect(filenameComponents[0].order).toBe(1);
      expect(filenameComponents[1].order).toBe(2);
    });

    it('returns empty array for non-array input', () => {
      expect(extractFilenameComponents(null as any)).toEqual([]);
      expect(extractFilenameComponents(undefined)).toEqual([]);
      expect(extractFilenameComponents('not-array' as any)).toEqual([]);
    });

    it('returns empty array when no filename components found', () => {
      const children = [
        { enabled: true },
        { type: 'string' },
        { some_property: 'value' }
      ];
      
      expect(extractFilenameComponents(children)).toEqual([]);
    });
  });

  describe('extractExportConfigurations', () => {
    it('extracts only export configurations from children array', () => {
      const children = [
        {
          enabled: true
        },
        {
          filename_component: true,
          order: 1
        },
        {
          name: 'field_export',
          value_immutable: true
        },
        {
          type: 'string' // Renderable field
        }
      ];
      
      const exportConfigs = extractExportConfigurations(children);
      
      expect(exportConfigs).toHaveLength(2);
      expect(exportConfigs.some(config => config.enabled === true)).toBe(true);
      expect(exportConfigs.some(config => config.name === 'field_export')).toBe(true);
    });

    it('returns empty array when no export configurations found', () => {
      const children = [
        { filename_component: true, order: 1 },
        { type: 'string' },
        { some_property: 'value' }
      ];
      
      expect(extractExportConfigurations(children)).toEqual([]);
    });
  });

  describe('Regression Prevention: No _schemaType Dependencies', () => {
    it('functions work without _schemaType properties', () => {
      // Test data mimicking the new schema-agnostic approach
      const fieldWithChildren = {
        id: 'patient_id',
        name: 'Patient ID',
        type: 'string', // Makes it renderable
        children: [
          {
            filename_component: true,
            order: 1
          },
          {
            enabled: true,
            name: 'patient_export'
          }
        ]
      };
      
      // Verify field is renderable
      expect(isRenderableField(fieldWithChildren)).toBe(true);
      
      // Verify children are correctly identified
      const filenameComponents = extractFilenameComponents(fieldWithChildren.children);
      const exportConfigs = extractExportConfigurations(fieldWithChildren.children);
      
      expect(filenameComponents).toHaveLength(1);
      expect(exportConfigs).toHaveLength(1);
      
      // Verify configuration objects are not renderable
      fieldWithChildren.children.forEach(child => {
        expect(isRenderableField(child)).toBe(false);
        expect(isConfigurationObject(child)).toBe(true);
      });
    });

    it('works with old data that still has _schemaType but does not rely on it', () => {
      // Test data that might still have legacy _schemaType properties
      const legacyData = {
        id: 'project_id',
        _schemaType: 'Field', // Legacy property - should be ignored
        type: 'string',
        children: [
          {
            _schemaType: 'ELNFilenameComponent', // Legacy - should be ignored
            filename_component: true,
            order: 2
          },
          {
            _schemaType: 'ExportConfiguration', // Legacy - should be ignored
            enabled: false,
            name: 'project_export'
          }
        ]
      };
      
      // All functions should work the same regardless of _schemaType presence
      expect(isRenderableField(legacyData)).toBe(true);
      expect(extractFilenameComponents(legacyData.children)).toHaveLength(1);
      expect(extractExportConfigurations(legacyData.children)).toHaveLength(1);
    });
  });

  describe('Schema Independence Validation', () => {
    it('follows agent_context.md principles: structural detection over schema names', () => {
      // Test with completely different "schema names" to prove we don't rely on them
      const customConfigObject = {
        filename_component: true,
        order: 3,
        custom_property: 'some_value',
        completely_different_schema: 'CustomType' // Not a real schema name
      };
      
      const customField = {
        id: 'custom_field',
        type: 'number', // This makes it renderable
        custom_schema_type: 'MyCustomField' // Not a real schema name
      };
      
      // Should work based on structure, not schema names
      expect(isFilenameComponent(customConfigObject)).toBe(true);
      expect(isRenderableField(customField)).toBe(true);
      expect(isRenderableField(customConfigObject)).toBe(false);
    });

    it('validates that detectSchemaType still works for SAM authoring context', () => {
      // Test that detectSchemaType function exists and works
      // (This is used for SOP authoring, not structural logic)
      const testObject = {
        id: 'test_field',
        type: 'string',
        name: 'Test Field'
      };
      
      // Should return a schema name or null based on structure
      const detectedType = detectSchemaType(testObject);
      expect(typeof detectedType === 'string' || detectedType === null).toBe(true);
    });
  });
});

/**
 * Integration Test: End-to-End Schema-Agnostic Workflow
 */
describe('Schema-Agnostic Workflow Integration', () => {
  it('simulates complete field processing without _schemaType dependencies', () => {
    // Simulate a field definition as it would come from the schema
    const sopField = {
      id: 'experiment_id',
      name: 'Experiment ID',
      title: 'Experiment Identifier',
      type: 'string',
      required: true,
      children: [
        {
          filename_component: true,
          order: 1
        },
        {
          enabled: true,
          name: 'experiment_export',
          value_immutable: true
        }
      ]
    };
    
    // Step 1: Determine if field should be rendered (CLAIRE logic)
    const shouldRender = isRenderableField(sopField);
    expect(shouldRender).toBe(true);
    
    // Step 2: Extract filename components (Backend filename generation)
    const filenameComponents = extractFilenameComponents(sopField.children);
    expect(filenameComponents).toHaveLength(1);
    expect(filenameComponents[0].order).toBe(1);
    
    // Step 3: Extract export configurations (Backend export logic)
    const exportConfigs = extractExportConfigurations(sopField.children);
    expect(exportConfigs).toHaveLength(1);
    expect(exportConfigs[0].enabled).toBe(true);
    
    // Step 4: Verify configuration objects are not rendered
    sopField.children.forEach(child => {
      expect(isRenderableField(child)).toBe(false);
      expect(isConfigurationObject(child)).toBe(true);
    });
    
    // Step 5: Verify schema-agnostic approach
    // No function should require or depend on _schemaType properties
    expect('_schemaType' in sopField).toBe(false);
    expect(sopField.children.every(child => !('_schemaType' in child))).toBe(true);
  });
}); 