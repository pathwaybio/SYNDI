// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { ReviewSubmitPageObject } from '../helpers/page-objects';

test.describe('ReviewSubmitPanel - Data Display', () => {
  let reviewPanel: ReviewSubmitPageObject;

  test.beforeEach(async ({ page }) => {
    reviewPanel = new ReviewSubmitPageObject(page);
    
    // Navigate to the simple test component page
    await page.goto('/tests/e2e/test-component.html');
    await reviewPanel.waitForLoaded();
  });

  test.describe('Basic Component Rendering', () => {
    test('renders the main panel with test attributes', async () => {
      const panel = reviewPanel.panel;
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('data-testid', 'review-submit-panel');
    });

    test('displays header information correctly', async () => {
      await expect(reviewPanel.page.locator('h2')).toHaveText('Review & Submit');
      await expect(reviewPanel.page.locator('p').first()).toContainText('Review your data before final submission');
    });

    test('shows validation badges', async () => {
      const readyBadge = reviewPanel.page.locator('[data-testid="ready-badge"]');
      const totalBadge = reviewPanel.page.locator('[data-testid="total-fields-badge"]');
      
      await expect(readyBadge).toBeVisible();
      await expect(readyBadge).toContainText('Ready to Submit');
      await expect(totalBadge).toBeVisible();
      await expect(totalBadge).toContainText('5 Fields Completed');
    });
  });

  test.describe('Field Type Rendering', () => {
    test('renders string fields correctly', async () => {
      const value = await reviewPanel.getFieldValue('Patient ID');
      expect(value).toBe('PT-001');
    });

    test('renders number fields with proper formatting', async () => {
      const value = await reviewPanel.getFieldValue('Patient Age');
      expect(value).toBe('35');
    });

    test('renders boolean fields as badges with icons', async () => {
      const fieldRow = reviewPanel.getFieldRow('Consent Given');
      const badge = fieldRow.locator('.badge-success');
      
      await expect(badge).toBeVisible();
      await expect(badge).toContainText('Yes');
    });

    test('renders date fields correctly', async () => {
      const value = await reviewPanel.getFieldValue('Collection Date');
      expect(value).toBe('1/15/2025');
    });

    test('renders enum fields as badges', async () => {
      const fieldRow = reviewPanel.getFieldRow('Sample Type');
      const badge = fieldRow.locator('.badge-outline');
      
      await expect(badge).toBeVisible();
      await expect(badge).toContainText('blood');
    });
  });

  test.describe('Schema Structure', () => {
    test('displays collapsible cards for taskgroups', async () => {
      const cards = reviewPanel.page.locator('[data-testid="taskgroup-card"]');
      await expect(cards).toHaveCount(2);
      
      // Check card titles
      const firstCard = cards.first();
      await expect(firstCard.locator('h3')).toContainText('Basic Information');
      
      const secondCard = cards.last();
      await expect(secondCard.locator('h3')).toContainText('Sample Collection');
    });

    test('shows required field indicators', async () => {
      const requiredFields = reviewPanel.page.locator('.required');
      await expect(requiredFields).toHaveCount(4); // Patient ID, Age, Consent, Collection Date
      
      for (const field of await requiredFields.all()) {
        await expect(field).toHaveText('*');
      }
    });

    test('displays field rows with proper structure', async () => {
      const fieldRows = reviewPanel.page.locator('[data-testid="field-row"]');
      await expect(fieldRows).toHaveCount(5);
      
      // Check each row has name and value
      for (const row of await fieldRows.all()) {
        await expect(row.locator('[data-testid="field-name"]')).toBeVisible();
        await expect(row.locator('[data-testid="field-value"]')).toBeVisible();
      }
    });
  });

  test.describe('Card Interaction', () => {
    test('cards start expanded by default', async () => {
      const cardContents = reviewPanel.page.locator('[data-testid="card-content"]');
      
      for (const content of await cardContents.all()) {
        await expect(content).toBeVisible();
      }
    });

    test('can toggle card visibility', async () => {
      const firstCard = reviewPanel.page.locator('[data-testid="taskgroup-card"]').first();
      const toggle = firstCard.locator('[data-testid="card-toggle"]');
      const content = firstCard.locator('[data-testid="card-content"]');
      
      // Initially expanded
      await expect(content).toBeVisible();
      await expect(toggle).toHaveText('▼');
      
      // Click to collapse
      await toggle.click();
      await expect(content).toBeHidden();
      await expect(toggle).toHaveText('▶');
      
      // Click to expand again
      await toggle.click();
      await expect(content).toBeVisible();
      await expect(toggle).toHaveText('▼');
    });

    test('can toggle by clicking card header', async () => {
      const firstCard = reviewPanel.page.locator('[data-testid="taskgroup-card"]').first();
      const header = firstCard.locator('[data-testid="card-header"]');
      const content = firstCard.locator('[data-testid="card-content"]');
      
      // Initially expanded
      await expect(content).toBeVisible();
      
      // Click header to collapse
      await header.click();
      await expect(content).toBeHidden();
      
      // Click header to expand
      await header.click();
      await expect(content).toBeVisible();
    });
  });

  test.describe('Submit Controls', () => {
    test('displays submit button with icon', async () => {
      const submitBtn = reviewPanel.page.locator('.submit-btn');
      const icon = submitBtn.locator('[data-testid="send-icon"]');
      
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toContainText('Submit ELN');
      await expect(icon).toBeVisible();
    });

    test('displays back button', async () => {
      const backBtn = reviewPanel.page.locator('button').filter({ hasText: 'Back to Form' });
      await expect(backBtn).toBeVisible();
    });
  });
}); 