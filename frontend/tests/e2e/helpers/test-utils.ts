// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { Page } from '@playwright/test';
import { SOP } from '../../../src/shared/types/sop';
import { ELNFormData } from '../../../src/claire/types/eln';

// Import static fixtures directly (with JSON import assertions)
import basicSOP from '../../fixtures/sops/basic-sop.json' with { type: 'json' };
import minimalSOP from '../../fixtures/sops/minimal-sop.json' with { type: 'json' };
import allFieldTypesSOP from '../../fixtures/sops/all-field-types-sop.json' with { type: 'json' };
import complexNestedSOP from '../../fixtures/sops/complex-nested-sop.json' with { type: 'json' };

import completeELNData from '../../fixtures/eln-data/complete-form.json' with { type: 'json' };
import partialELNData from '../../fixtures/eln-data/partial-form.json' with { type: 'json' };
import emptyELNData from '../../fixtures/eln-data/empty-form.json' with { type: 'json' };
import complexELNData from '../../fixtures/eln-data/complex-form.json' with { type: 'json' };

/**
 * Test Data Builder using static fixtures
 */
export class TestDataBuilder {
  // Static fixture loading methods (preferred)
  static async loadBasicSOP(): Promise<SOP> {
    return basicSOP as SOP;
  }

  static async loadMinimalSOP(): Promise<SOP> {
    return minimalSOP as SOP;
  }

  static async loadAllFieldTypesSOP(): Promise<SOP> {
    return allFieldTypesSOP as SOP;
  }

  static async loadComplexNestedSOP(): Promise<SOP> {
    return complexNestedSOP as SOP;
  }

  static async loadCompleteELNData(): Promise<ELNFormData> {
    const rawData = completeELNData as any;
    return {
      values: rawData.values,
      errors: {},
      isValid: true,
      isSubmitting: false,
      touched: {}
    };
  }

  static async loadPartialELNData(): Promise<ELNFormData> {
    const rawData = partialELNData as any;
    return {
      values: rawData.values,
      errors: {},
      isValid: false,
      isSubmitting: false,
      touched: {}
    };
  }

  static async loadEmptyELNData(): Promise<ELNFormData> {
    const rawData = emptyELNData as any;
    return {
      values: rawData.values,
      errors: {},
      isValid: false,
      isSubmitting: false,
      touched: {}
    };
  }

  static async loadComplexELNData(): Promise<ELNFormData> {
    const rawData = complexELNData as any;
    return {
      values: rawData.values,
      errors: {},
      isValid: true,
      isSubmitting: false,
      touched: {}
    };
  }

  // Dynamic data creation methods (for complex test scenarios that need to modify SOPs)
  // These are based on static fixtures to avoid duplication
  static async createBasicSOP(): Promise<any> {
    const staticSOP = await this.loadBasicSOP();
    // Return a deep clone so tests can modify without affecting other tests
    return JSON.parse(JSON.stringify(staticSOP));
  }

  static async createMinimalSOP(): Promise<any> {
    const staticSOP = await this.loadMinimalSOP();
    // Return a deep clone so tests can modify without affecting other tests
    return JSON.parse(JSON.stringify(staticSOP));
  }

  static async createAllFieldTypesSOP(): Promise<any> {
    const staticSOP = await this.loadAllFieldTypesSOP();
    // Return a deep clone so tests can modify without affecting other tests
    return JSON.parse(JSON.stringify(staticSOP));
  }

  static async createComplexNestedSOP(): Promise<any> {
    const staticSOP = await this.loadComplexNestedSOP();
    // Return a deep clone so tests can modify without affecting other tests
    return JSON.parse(JSON.stringify(staticSOP));
  }

  static async createCompleteELNData(): Promise<ELNFormData> {
    const staticELN = await this.loadCompleteELNData();
    // Return a deep clone so tests can modify without affecting other tests
    return JSON.parse(JSON.stringify(staticELN));
  }

  static async createAllTypesELNData(): Promise<ELNFormData> {
    // Alias for complete ELN data
    return this.createCompleteELNData();
  }

  static async createEmptyELNData(): Promise<ELNFormData> {
    const staticELN = await this.loadEmptyELNData();
    // Return a deep clone so tests can modify without affecting other tests
    return JSON.parse(JSON.stringify(staticELN));
  }

  static async createPartialELNData(): Promise<ELNFormData> {
    const staticELN = await this.loadPartialELNData();
    // Return a deep clone so tests can modify without affecting other tests
    return JSON.parse(JSON.stringify(staticELN));
  }

  static async createInvalidELNData(): Promise<ELNFormData> {
    const baseELN = await this.createCompleteELNData();
    // Create invalid data by using wrong field types
    baseELN.values = {
      "string_field": 12345, // Invalid: number instead of string
      "number_field": "not_a_number", // Invalid: string instead of number
      "boolean_field": "maybe", // Invalid: string instead of boolean
      "date_field": "not-a-date", // Invalid: malformed date
      "required_field": null // Invalid: null for required field
    };
    return baseELN;
  }

  // Utility for creating dynamic ELN data for specific test cases
  static async createELNData(fieldValues: Record<string, any> = {}): Promise<ELNFormData> {
    const baseELN = await this.createCompleteELNData();
    // Merge provided fieldValues with the base ELN data
    return {
      ...baseELN,
      values: {
        ...baseELN.values,
        ...fieldValues
      }
    };
  }
}

/**
 * Test scenarios for validation testing
 */
export interface TestScenario {
  name: string;
  sop: SOP;
  elnData: ELNFormData;
  expectedValidation: {
    isValid: boolean;
    missingRequiredFields: string[];
    totalFields: number;
  };
}

export class ValidationScenarios {
  static async getBasicValidScenario(): Promise<TestScenario> {
    return {
      name: 'Basic Valid Form',
      sop: await TestDataBuilder.loadBasicSOP(),
      elnData: await TestDataBuilder.loadCompleteELNData(),
      expectedValidation: {
        isValid: true,
        missingRequiredFields: [],
        totalFields: 14
      }
    };
  }

  static async getBasicInvalidScenario(): Promise<TestScenario> {
    return {
      name: 'Basic Invalid Form',
      sop: await TestDataBuilder.loadBasicSOP(),
      elnData: await TestDataBuilder.loadPartialELNData(),
      expectedValidation: {
        isValid: false,
        missingRequiredFields: ['patient_age', 'consent_given'],
        totalFields: 6
      }
    };
  }

  static async getEmptyFormScenario(): Promise<TestScenario> {
    return {
      name: 'Empty Form',
      sop: await TestDataBuilder.loadBasicSOP(),
      elnData: await TestDataBuilder.loadEmptyELNData(),
      expectedValidation: {
        isValid: false,
        missingRequiredFields: ['patient_id', 'patient_age', 'consent_given', 'collection_date'],
        totalFields: 0
      }
    };
  }

  static async getAllFieldTypesScenario(): Promise<TestScenario> {
    return {
      name: 'All Field Types',
      sop: await TestDataBuilder.loadAllFieldTypesSOP(),
      elnData: await TestDataBuilder.loadCompleteELNData(),
      expectedValidation: {
        isValid: true,
        missingRequiredFields: [],
        totalFields: 14
      }
    };
  }

  static async getMinimalScenario(): Promise<TestScenario> {
    return {
      name: 'Minimal SOP',
      sop: await TestDataBuilder.loadMinimalSOP(),
      elnData: await TestDataBuilder.loadCompleteELNData(),
      expectedValidation: {
        isValid: true,
        missingRequiredFields: [],
        totalFields: 14
      }
    };
  }
}

/**
 * Performance test utilities
 */
export class PerformanceTestUtils {
  static async createLargeFormSOP(fieldCount: number = 100): Promise<SOP> {
    const fields = Array.from({ length: fieldCount }, (_, i) => ({
      id: `field_${i}`,
      name: `Field ${i}`,
      title: `Test Field Number ${i}`,
      description: `Description for field ${i}`,
      type: (i % 2 === 0 ? 'string' : 'number') as any,
      required: i % 5 === 0
    }));

    return {
      id: 'large-sop',
      name: 'Large SOP',
      title: 'Performance Test SOP',
      version: '1.0',
      taskgroups: [
        {
          id: 'large_taskgroup',
          name: 'Large Task Group',
          children: [
            {
              id: 'large_task',
              name: 'Large Task',
              children: fields
            }
          ]
        }
      ]
    } as any;
  }

  static async createLargeFormELNData(fieldCount: number = 100): Promise<ELNFormData> {
    const values: Record<string, any> = {};
    for (let i = 0; i < fieldCount; i++) {
      values[`field_${i}`] = i % 2 === 0 ? `Value ${i}` : i * 10;
    }
    return TestDataBuilder.createELNData(values);
  }
} 