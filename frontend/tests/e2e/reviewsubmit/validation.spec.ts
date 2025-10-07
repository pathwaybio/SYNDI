// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { ReviewSubmitPageObject } from '../helpers/page-objects';
import { TestDataBuilder, ValidationScenarios } from '../helpers/test-utils';

test.describe.skip('ReviewSubmitPanel - Validation', () => {
  let reviewPanel: ReviewSubmitPageObject;

  test.beforeEach(async ({ page }) => {
    reviewPanel = new ReviewSubmitPageObject(page);
  });

  test.describe('Validation Summary', () => {
    test('shows "Ready to Submit" when all required fields completed', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicValidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(true);
      expect(summary.isValid).toBe(true);
      expect(summary.missingFields).toBe(0);
      expect(summary.totalFields).toBe(scenario.expectedValidation.totalFields);

      // Should show ready badge
      const readyBadge = page.locator('text="Ready to Submit"');
      await expect(readyBadge).toBeVisible();

      // Should have green styling
      await expect(readyBadge).toHaveClass(/bg-green/);
    });

    test('shows missing required fields count and names', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicInvalidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(false);
      expect(summary.isValid).toBe(false);
      expect(summary.missingFields).toBe(scenario.expectedValidation.missingRequiredFields.length);
      expect(summary.totalFields).toBe(scenario.expectedValidation.totalFields);

      // Should show missing fields badge
      const missingBadge = page.locator('[data-testid="missing-fields-badge"]');
      await expect(missingBadge).toBeVisible();
      await expect(missingBadge).toContainText(`${scenario.expectedValidation.missingRequiredFields.length} Missing Required Field`);

      // Should have destructive styling
      await expect(missingBadge).toHaveClass(/variant-destructive/);
    });

    test('displays correct total fields count', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicValidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const totalBadge = page.locator('[data-testid="total-fields-badge"]');
      await expect(totalBadge).toBeVisible();
      await expect(totalBadge).toContainText(`${scenario.expectedValidation.totalFields} Field`);
      
      // Should have outline styling
      await expect(totalBadge).toHaveClass(/variant-outline/);
    });

    test('validation summary updates when data changes', async ({ page }) => {
      // Start with invalid data
      const invalidScenario = await ValidationScenarios.getBasicInvalidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(invalidScenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(invalidScenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should show invalid state
      let summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(false);

      // Update to valid data
      const validScenario = await ValidationScenarios.getBasicValidScenario();
      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(validScenario.elnData)
        });
      });

      // Navigate away and back to trigger data reload
      await page.click('text="Form View"');
      await page.click('text="Review & Submit"');
      await reviewPanel.waitForLoaded();

      // Should now show valid state
      summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(true);
    });

    test('handles plural vs singular field count correctly', async ({ page }) => {
      // Test with single field
      const singleFieldSOP = await TestDataBuilder.createMinimalSOP();
      const singleFieldData = await TestDataBuilder.createELNData({ single_field: 'test' });

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(singleFieldSOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(singleFieldData)
        });
      });

      await page.goto('/claire/sop/test-sop-minimal');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const totalBadge = page.locator('[data-testid="total-fields-badge"]');
      await expect(totalBadge).toContainText('1 Field'); // Singular

      // Test with missing field showing singular
      const emptyData = await TestDataBuilder.createEmptyELNData();
      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyData)
        });
      });

      await page.reload();
      await reviewPanel.waitForLoaded();

      const missingBadge = page.locator('[data-testid="missing-fields-badge"]');
      await expect(missingBadge).toContainText('1 Missing Required Field'); // Singular
    });
  });

  test.describe('Required Field Handling', () => {
    test('marks required fields with red asterisk', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicValidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Check required fields have asterisk
      const requiredFields = ['Patient ID', 'Age', 'Consent'];
      for (const fieldName of requiredFields) {
        const isRequired = await reviewPanel.isFieldRequired(fieldName);
        expect(isRequired).toBe(true);
      }

      // Check non-required fields don't have asterisk
      const optionalFields = ['Type of Sample', 'Collection Notes'];
      for (const fieldName of optionalFields) {
        const isRequired = await reviewPanel.isFieldRequired(fieldName);
        expect(isRequired).toBe(false);
      }
    });

    test('shows "Required" message for empty required fields', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicInvalidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Check missing required fields show error
      const missingFields = scenario.expectedValidation.missingRequiredFields;
      for (const fieldId of missingFields) {
        // Map field ID to display name
        const fieldName = fieldId === 'patient_age' ? 'Age' : 
                          fieldId === 'consent_given' ? 'Consent' : fieldId;
        const hasError = await reviewPanel.hasRequiredFieldError(fieldName);
        expect(hasError).toBe(true);
      }

      // Check filled required field doesn't show error
      const hasError = await reviewPanel.hasRequiredFieldError('Patient ID');
      expect(hasError).toBe(false);
    });

    test('lists missing required fields in alert', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicInvalidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const missingFields = await reviewPanel.getMissingRequiredFields();
      expect(missingFields.length).toBeGreaterThan(0);
      
      // Should include the missing fields (mapped to display names)
      expect(missingFields).toContain('Age');
      expect(missingFields).toContain('Consent');
    });

    test('hides validation alert when form is valid', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicValidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should not show validation alert when valid
      const alert = reviewPanel.validationAlert;
      await expect(alert).not.toBeVisible();
    });
  });

  test.describe('Submit Button State', () => {
    test('submit button enabled when form valid', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicValidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const isEnabled = await reviewPanel.isSubmitButtonEnabled();
      expect(isEnabled).toBe(true);

      // Button should have proper styling
      const submitButton = reviewPanel.submitButton;
      await expect(submitButton).not.toHaveAttribute('disabled');
      await expect(submitButton).toHaveClass(/bg-primary|bg-blue/);
    });

    test('submit button disabled when required fields missing', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicInvalidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const isEnabled = await reviewPanel.isSubmitButtonEnabled();
      expect(isEnabled).toBe(false);

      // Button should be disabled
      const submitButton = reviewPanel.submitButton;
      await expect(submitButton).toHaveAttribute('disabled');
    });

    test('submit button shows loading state during submission', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicValidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      // Mock slow submission
      await page.route('**/api/eln/submit', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Click submit
      await reviewPanel.clickSubmit();

      // Should show loading state
      const isLoading = await reviewPanel.isSubmitButtonLoading();
      expect(isLoading).toBe(true);

      // Button should contain loading text
      const submitButton = reviewPanel.submitButton;
      await expect(submitButton).toContainText('Submit');
      
      // Should have loading icon
      const loadingIcon = submitButton.locator('[data-testid="loading-icon"]');
      await expect(loadingIcon).toBeVisible();
      
      // Button should be disabled during loading
      await expect(submitButton).toHaveAttribute('disabled');
    });

    test('back button always enabled', async ({ page }) => {
      // Test with invalid form
      const invalidScenario = await ValidationScenarios.getBasicInvalidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(invalidScenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(invalidScenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Back button should be enabled even when form is invalid
      const backButton = reviewPanel.backButton;
      await expect(backButton).toBeEnabled();
      await expect(backButton).not.toHaveAttribute('disabled');

      // Test during submission loading
      await page.route('**/api/eln/submit', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({ status: 200, body: '{}' });
      });

      // Make form valid and submit
      const validScenario = await ValidationScenarios.getBasicValidScenario();
      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(validScenario.elnData)
        });
      });

      await page.reload();
      await reviewPanel.waitForLoaded();
      await reviewPanel.clickSubmit();

      // Back button should remain enabled during submission
      await expect(backButton).toBeEnabled();
    });

    test('submit button shows correct icon states', async ({ page }) => {
      const scenario = await ValidationScenarios.getBasicValidScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Initially should show send icon
      const submitButton = reviewPanel.submitButton;
      const sendIcon = submitButton.locator('[data-testid="send-icon"]');
      await expect(sendIcon).toBeVisible();

      // Mock submission to test loading icon
      await page.route('**/api/eln/submit', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({ status: 200, body: '{}' });
      });

      await reviewPanel.clickSubmit();

      // Should show loading icon during submission
      const loadingIcon = submitButton.locator('[data-testid="loading-icon"]');
      await expect(loadingIcon).toBeVisible();
      await expect(sendIcon).not.toBeVisible();
    });
  });

  test.describe('Edge Cases', () => {
    test('handles form with no required fields', async ({ page }) => {
      const sop = await TestDataBuilder.createAllFieldTypesSOP();
      // Remove required flags from all fields
      if (sop.taskgroups && sop.taskgroups[0] && sop.taskgroups[0].children) {
        const processChildren = (children: any[]) => {
          children.forEach(child => {
            if (child.type) {
              child.required = false;
            }
            if (child.children) {
              processChildren(child.children);
            }
          });
        };
        processChildren(sop.taskgroups[0].children);
      }

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
          body: JSON.stringify(await TestDataBuilder.createEmptyELNData())
        });
      });

      await page.goto('/claire/sop/test-sop-all-types');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Should be valid even with empty data
      const summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(true);
      expect(summary.missingFields).toBe(0);

      // Submit button should be enabled
      const isEnabled = await reviewPanel.isSubmitButtonEnabled();
      expect(isEnabled).toBe(true);
    });

    test('handles empty form scenario', async ({ page }) => {
      const scenario = await ValidationScenarios.getEmptyFormScenario();
      
      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.sop)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(scenario.elnData)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      const summary = await reviewPanel.getValidationSummary();
      expect(summary.isValid).toBe(scenario.expectedValidation.isValid);
      expect(summary.missingFields).toBe(scenario.expectedValidation.missingRequiredFields.length);
      expect(summary.totalFields).toBe(scenario.expectedValidation.totalFields);

      // Should show all required fields as missing
      const missingFields = await reviewPanel.getMissingRequiredFields();
      expect(missingFields.length).toBe(scenario.expectedValidation.missingRequiredFields.length);
    });

    test('handles SOP with complex validation rules', async ({ page }) => {
      // Create SOP with various validation constraints
      const complexSOP = await TestDataBuilder.createBasicSOP();
      if (complexSOP.taskgroups && complexSOP.taskgroups[0] && complexSOP.taskgroups[0].children && complexSOP.taskgroups[0].children[0] && complexSOP.taskgroups[0].children[0].children) {
        // Add field with complex validation
        complexSOP.taskgroups[0].children[0].children.push({
          id: 'complex_field',
          name: 'Complex Field',
          title: 'Field with Complex Validation',
          description: 'Field with min/max length constraints',
          type: 'string',
          required: true,
          validation: {
            min_length: 5,
            max_length: 20,
            pattern: '^[A-Z][a-zA-Z0-9]*$'
          }
        });
      }

      const dataWithInvalidField = await TestDataBuilder.createCompleteELNData();
      dataWithInvalidField.values.complex_field = 'abc'; // Too short

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(complexSOP)
        });
      });

      await page.route('**/api/eln/draft/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(dataWithInvalidField)
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      await reviewPanel.waitForLoaded();

      // Field should still appear (validation is structural, not content-based for review panel)
      const fieldValue = await reviewPanel.getFieldValue('Complex Field');
      expect(fieldValue).toContain('abc');

      // Form should be considered complete from required field perspective
      const summary = await reviewPanel.getValidationSummary();
      expect(summary.totalFields).toBeGreaterThan(6);
    });
  });
}); 