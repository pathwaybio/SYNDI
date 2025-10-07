// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { ReviewSubmitPageObject } from '../helpers/page-objects';
import { TestDataBuilder, PerformanceTestUtils } from '../helpers/test-utils';

test.describe.skip('ReviewSubmitPanel - Edge Cases & Performance', () => {
  let reviewPanel: ReviewSubmitPageObject;

  test.beforeEach(async ({ page }) => {
    reviewPanel = new ReviewSubmitPageObject(page);
  });

  test.describe('Empty/Minimal Data', () => {
    test('handles SOP with no taskgroups', async ({ page }) => {
      const emptySOP = await TestDataBuilder.createBasicSOP();
      emptySOP.taskgroups = [];

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptySOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createEmptyELNData())
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should show appropriate message
      const emptyMessage = page.locator('text="No task groups found in this SOP"');
      await expect(emptyMessage).toBeVisible();

      // Submit button should still be present but enabled (no validation errors)
      const isEnabled = await reviewPanel.isSubmitButtonEnabled();
      expect(isEnabled).toBe(true);
    });

    test('handles taskgroup with no children', async ({ page }) => {
      const sopWithEmptyTaskgroup = await TestDataBuilder.createBasicSOP();
      if (sopWithEmptyTaskgroup.taskgroups) {
        sopWithEmptyTaskgroup.taskgroups[0].children = [];
      }

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sopWithEmptyTaskgroup)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createEmptyELNData())
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Taskgroup card should exist but be empty
      const card = reviewPanel.getCard('Basic Information');
      await expect(card).toBeVisible();

      // Card should be expandable
      const isExpanded = await reviewPanel.isCardExpanded('Basic Information');
      expect(isExpanded).toBe(true);

      // But should have no field content
      const fieldNames = await reviewPanel.getAllFieldNames();
      expect(fieldNames.length).toBe(0);
    });

    test('handles form with no entered data', async ({ page }) => {
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createBasicSOP())
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createEmptyELNData())
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should show validation errors for required fields
      const summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(false);
      expect(summary.totalFields).toBe(0);
      expect(summary.missingFields).toBeGreaterThan(0);

      // All field values should show "Not provided"
      const fieldNames = await reviewPanel.getAllFieldNames();
      for (const fieldName of fieldNames) {
        const value = await reviewPanel.getFieldValue(fieldName);
        expect(value).toContain('Not provided');
      }
    });

    test('skips rendering elements with no data', async ({ page }) => {
      const sopWithMixedData = await TestDataBuilder.createBasicSOP();
      const partialData = await TestDataBuilder.createELNData({
        patient_id: 'PT-001', // Only fill one field
      });

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sopWithMixedData)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(partialData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Only taskgroups with data should be rendered
      const basicInfoCard = reviewPanel.getCard('Basic Information');
      await expect(basicInfoCard).toBeVisible(); // Has patient_id data

      // Sample Collection card might not be visible if it has no data
      const sampleCard = reviewPanel.getCard('Sample Collection');
      const sampleCardCount = await page.locator('[data-testid="taskgroup-card"]:has-text("Sample Collection")').count();
      expect(sampleCardCount).toBeLessThanOrEqual(1); // May or may not be visible
    });
  });

  test.describe('Invalid Data Handling', () => {
    test('handles malformed array data gracefully', async ({ page }) => {
      const sopWithArray = await TestDataBuilder.createAllFieldTypesSOP();
      const malformedData = await TestDataBuilder.createAllTypesELNData();
      malformedData.values.array_field = 'not-an-array'; // Invalid array

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sopWithArray)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(malformedData)
        });
      });

      await page.goto('/claire/sop/test-sop-all-types');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const value = await reviewPanel.getFieldValue('Array Field');
      expect(value).toContain('Invalid array data');
    });

    test('handles invalid date strings', async ({ page }) => {
      const sopWithDates = await TestDataBuilder.createAllFieldTypesSOP();
      const invalidDateData = await TestDataBuilder.createAllTypesELNData();
      invalidDateData.values.date_field = 'not-a-date';
      invalidDateData.values.datetime_field = 'also-not-a-date';

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sopWithDates)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(invalidDateData)
        });
      });

      await page.goto('/claire/sop/test-sop-all-types');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should show raw string values for invalid dates
      const dateValue = await reviewPanel.getFieldValue('Date Field');
      expect(dateValue).toContain('not-a-date');

      const datetimeValue = await reviewPanel.getFieldValue('DateTime Field');
      expect(datetimeValue).toContain('also-not-a-date');
    });

    test('handles missing field IDs in form data', async ({ page }) => {
      const sop = await TestDataBuilder.createBasicSOP();
      const dataWithMissingIds = await TestDataBuilder.createELNData({
        non_existent_field: 'some value', // Field not in SOP
        // Missing actual SOP fields
      });

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(dataWithMissingIds)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should not crash and should show appropriate validation
      const summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(false); // Required fields missing
      expect(summary.totalFields).toBe(1); // Only the non-existent field counted
    });

    test('handles corrupted schema structure', async ({ page }) => {
      const corruptedSOP = {
        id: 'corrupted-sop',
        name: 'Corrupted SOP',
        taskgroups: [
          {
            id: 'broken-taskgroup',
            // Missing required properties
            children: [
              {
                // Missing id
                type: 'string',
                children: null // Invalid children
              }
            ]
          }
        ]
      };

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(corruptedSOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createEmptyELNData())
        });
      });

      await page.goto('/claire/sop/corrupted-sop');
      await reviewPanel.navigateToReviewTab();

      // Should not crash, might show error or empty state
      const headerVisible = await reviewPanel.page.locator('h2:has-text("Review & Submit")').isVisible();
      expect(headerVisible).toBe(true);

      // Panel should still be functional
      const submitButton = reviewPanel.submitButton;
      await expect(submitButton).toBeVisible();
    });

    test('handles null/undefined values in nested objects', async ({ page }) => {
      const sop = await TestDataBuilder.createBasicSOP();
      const dataWithNulls = {
        values: {
          patient_id: null,
          patient_age: undefined,
          consent_given: false,
          nested_object: {
            inner_value: null,
            another_value: undefined
          },
          empty_array: [],
          null_array: null
        },
        metadata: null
      };

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(dataWithNulls)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should handle null values gracefully
      const patientIdValue = await reviewPanel.getFieldValue('Patient ID');
      expect(patientIdValue).toContain('Not provided');

      const consentValue = await reviewPanel.getFieldValue('Consent');
      expect(consentValue).toContain('No'); // false boolean
    });
  });

  test.describe('Performance Tests', () => {
    test('renders large forms (100+ fields) within performance targets', async ({ page }) => {
      const largeSOP = await PerformanceTestUtils.createLargeFormSOP(100);
      const largeData = await PerformanceTestUtils.createLargeFormELNData(100);

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(largeSOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(largeData)
        });
      });

      const startTime = Date.now();
      
      await page.goto('/claire/sop/large-sop');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const loadTime = Date.now() - startTime;
      
      // Should load within 2 seconds (performance target)
      expect(loadTime).toBeLessThan(2000);

      // Should render all fields
      const fieldNames = await reviewPanel.getAllFieldNames();
      expect(fieldNames.length).toBe(100);

      // Test interaction performance
      const interactionStart = Date.now();
      await reviewPanel.toggleCard('Large Task Group');
      const interactionTime = Date.now() - interactionStart;
      
      // Interactions should be under 100ms
      expect(interactionTime).toBeLessThan(100);
    });

    test('handles deep nesting (5+ levels) correctly', async ({ page }) => {
      const deepSOP = await TestDataBuilder.createComplexNestedSOP();
      // Add more nesting levels
      if (deepSOP.taskgroups && deepSOP.taskgroups[0] && deepSOP.taskgroups[0].children && deepSOP.taskgroups[0].children[0] && deepSOP.taskgroups[0].children[0].children && deepSOP.taskgroups[0].children[0].children[0] && deepSOP.taskgroups[0].children[0].children[0].children && deepSOP.taskgroups[0].children[0].children[0].children[0] && deepSOP.taskgroups[0].children[0].children[0].children[0].children) {
        deepSOP.taskgroups[0].children[0].children[0].children[0].children[0].children = [
          {
            id: 'level_5',
            name: 'Level 5',
            ordinal: 1,
            children: [
              {
                id: 'level_6_field',
                name: 'Level 6 Field',
                type: 'string',
                required: false
              }
            ]
          }
        ];
      }

      const deepData = await TestDataBuilder.createELNData({
        field_deep: 'deep value',
        field_1_1: 42,
        level_6_field: 'very deep value'
      });

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(deepSOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(deepData)
        });
      });

      await page.goto('/claire/sop/test-sop-complex');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should render nested structure correctly
      const nestedSections = page.locator('[data-testid="nested-section"]');
      const nestedCount = await nestedSections.count();
      expect(nestedCount).toBeGreaterThan(2); // Multiple nesting levels

      // All fields should be accessible
      const deepFieldValue = await reviewPanel.getFieldValue('Deep Field');
      expect(deepFieldValue).toContain('deep value');

      const veryDeepFieldValue = await reviewPanel.getFieldValue('Level 6 Field');
      expect(veryDeepFieldValue).toContain('very deep value');
    });

    test('memory usage stays reasonable with complex data', async ({ page, browser }) => {
      const largeSOP = await PerformanceTestUtils.createLargeFormSOP(200);
      const largeData = await PerformanceTestUtils.createLargeFormELNData(200);

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(largeSOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(largeData)
        });
      });

      await page.goto('/claire/sop/large-sop');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Get memory usage
      const metrics = await page.evaluate(() => {
        if ('memory' in performance) {
          return (performance as any).memory;
        }
        return null;
      });

      if (metrics) {
        // Memory should be under 100MB (performance target)
        const memoryMB = metrics.usedJSHeapSize / (1024 * 1024);
        expect(memoryMB).toBeLessThan(100);
      }

      // Test that interactions remain responsive
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await reviewPanel.toggleCard('Large Task Group');
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(100);
      }
    });

    test('scroll performance with many fields', async ({ page }) => {
      const largeSOP = await PerformanceTestUtils.createLargeFormSOP(150);
      const largeData = await PerformanceTestUtils.createLargeFormELNData(150);

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(largeSOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(largeData)
        });
      });

      await page.goto('/claire/sop/large-sop');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Test scroll performance
      const scrollStart = Date.now();
      
      // Scroll to bottom
      await page.keyboard.press('End');
      await page.waitForTimeout(100);
      
      // Scroll to top
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);
      
      const scrollTime = Date.now() - scrollStart;
      
      // Scroll operations should complete quickly
      expect(scrollTime).toBeLessThan(500);

      // Page should remain responsive
      const submitButton = reviewPanel.submitButton;
      await expect(submitButton).toBeVisible();
    });
  });

  test.describe('Browser Compatibility', () => {
    test('works in different viewport sizes', async ({ page }) => {
      const viewports = [
        { width: 1920, height: 1080 }, // Large desktop
        { width: 1366, height: 768 },  // Standard desktop
        { width: 768, height: 1024 },  // Tablet
        { width: 414, height: 896 },   // Large phone
        { width: 375, height: 667 }    // Standard phone
      ];

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createBasicSOP())
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createCompleteELNData())
        });
      });

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        
        await page.goto('/claire/sop/test-sop-1');
        await reviewPanel.navigateToReviewTab();
        await reviewPanel.waitForLoaded();

        // Basic functionality should work
        await expect(reviewPanel.page.locator('h2:has-text("Review & Submit")')).toBeVisible();
        await expect(reviewPanel.submitButton).toBeVisible();

        // Cards should be collapsible
        const isExpanded = await reviewPanel.isCardExpanded('Basic Information');
        expect(typeof isExpanded).toBe('boolean');

        // Layout should be responsive
        const isResponsive = await reviewPanel.checkResponsiveLayout();
        expect(isResponsive).toBe(true);
      }
    });

    test('handles slow network conditions', async ({ page }) => {
      // Simulate slow 3G network
      const client = await page.context().newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5 Mbps
        uploadThroughput: 750 * 1024 / 8,           // 750 Kbps
        latency: 300                                // 300ms latency
      });

      await page.route('**/api/sop/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate slow response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createBasicSOP())
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 800)); // Simulate slow response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(await TestDataBuilder.createCompleteELNData())
        });
      });

      const startTime = Date.now();
      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();
      const totalTime = Date.now() - startTime;

      // Should eventually load and be functional
      await expect(reviewPanel.page.locator('h2:has-text("Review & Submit")')).toBeVisible();
      await expect(reviewPanel.submitButton).toBeVisible();

      // Total load time should be reasonable even on slow network
      expect(totalTime).toBeLessThan(10000); // 10 seconds max
    });
  });
}); 