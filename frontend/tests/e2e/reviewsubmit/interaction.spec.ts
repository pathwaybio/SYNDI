// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { ReviewSubmitPageObject } from '../helpers/page-objects';
import { TestDataBuilder } from '../helpers/test-utils';

test.describe.skip('ReviewSubmitPanel - UI Interactions', () => {
  let reviewPanel: ReviewSubmitPageObject;

  test.beforeEach(async ({ page }) => {
    reviewPanel = new ReviewSubmitPageObject(page);
    
    // Mock the SOP and ELN data loading
    await page.route('**/api/sop/*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TestDataBuilder.createBasicSOP())
      });
    });

    await page.route('**/api/eln/draft/*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TestDataBuilder.createCompleteELNData())
      });
    });

    // Navigate to the page and review tab
    await page.goto('/claire/sop/test-sop-1');
    await reviewPanel.navigateToReviewTab();
    await reviewPanel.waitForLoaded();
  });

  test.describe('Collapsible Cards', () => {
    test('cards are expanded by default', async () => {
      const basicInfoExpanded = await reviewPanel.isCardExpanded('Basic Information');
      const sampleCollectionExpanded = await reviewPanel.isCardExpanded('Sample Collection');
      
      expect(basicInfoExpanded).toBe(true);
      expect(sampleCollectionExpanded).toBe(true);
    });

    test('clicking card header toggles expansion', async () => {
      const cardTitle = 'Basic Information';
      
      // Initially expanded
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(true);
      
      // Click header to collapse
      const card = reviewPanel.getCard(cardTitle);
      const header = card.locator('[data-testid="card-header"]');
      await header.click();
      
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(false);
      
      // Click header again to expand
      await header.click();
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(true);
    });

    test('clicking chevron button toggles expansion', async () => {
      const cardTitle = 'Basic Information';
      
      // Initially expanded
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(true);
      
      // Click chevron to collapse
      await reviewPanel.toggleCard(cardTitle);
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(false);
      
      // Click chevron again to expand
      await reviewPanel.toggleCard(cardTitle);
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(true);
    });

    test('expansion state persists during session', async ({ page }) => {
      const cardTitle = 'Basic Information';
      
      // Collapse the card
      await reviewPanel.toggleCard(cardTitle);
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(false);
      
      // Navigate away and back (simulate tab switching)
      await page.click('text="Form View"');
      await page.click('text="Review & Submit"');
      await reviewPanel.waitForLoaded();
      
      // State should persist
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(false);
    });

    test('multiple cards can be expanded/collapsed independently', async () => {
      const card1 = 'Basic Information';
      const card2 = 'Sample Collection';
      
      // Both initially expanded
      expect(await reviewPanel.isCardExpanded(card1)).toBe(true);
      expect(await reviewPanel.isCardExpanded(card2)).toBe(true);
      
      // Collapse first card only
      await reviewPanel.toggleCard(card1);
      expect(await reviewPanel.isCardExpanded(card1)).toBe(false);
      expect(await reviewPanel.isCardExpanded(card2)).toBe(true);
      
      // Collapse second card
      await reviewPanel.toggleCard(card2);
      expect(await reviewPanel.isCardExpanded(card1)).toBe(false);
      expect(await reviewPanel.isCardExpanded(card2)).toBe(false);
      
      // Expand first card, second stays collapsed
      await reviewPanel.toggleCard(card1);
      expect(await reviewPanel.isCardExpanded(card1)).toBe(true);
      expect(await reviewPanel.isCardExpanded(card2)).toBe(false);
    });

    test('collapsed cards hide content but show header', async ({ page }) => {
      const cardTitle = 'Basic Information';
      const card = reviewPanel.getCard(cardTitle);
      
      // Initially expanded - content should be visible
      const cardContent = card.locator('[data-testid="card-content"]');
      await expect(cardContent).toBeVisible();
      
      // Collapse the card
      await reviewPanel.toggleCard(cardTitle);
      
      // Header should still be visible
      const cardHeader = card.locator('[data-testid="card-header"]');
      await expect(cardHeader).toBeVisible();
      
      // Content should be hidden
      await expect(cardContent).not.toBeVisible();
    });

    test('chevron icon changes direction when toggling', async ({ page }) => {
      const card = reviewPanel.getCard('Basic Information');
      const chevronButton = card.locator('[data-testid="card-toggle"]');
      
      // Initially expanded - should show ChevronDown
      const expandedChevron = chevronButton.locator('[data-testid="chevron-down"]');
      await expect(expandedChevron).toBeVisible();
      
      // Collapse - should show ChevronRight
      await chevronButton.click();
      const collapsedChevron = chevronButton.locator('[data-testid="chevron-right"]');
      await expect(collapsedChevron).toBeVisible();
      await expect(expandedChevron).not.toBeVisible();
    });
  });

  test.describe('Tooltips', () => {
    test('info icons show tooltips on hover', async ({ page }) => {
      const fieldRow = reviewPanel.getFieldRow('Patient ID');
      const infoIcon = fieldRow.locator('[data-testid="info-icon"]');
      
      // Hover over the info icon
      await infoIcon.hover();
      
      // Tooltip should appear
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('Unique identifier for the patient');
    });

    test('tooltips display correct content (description/title)', async ({ page }) => {
      // Test field with description
      const tooltip1 = await reviewPanel.getFieldTooltip('Patient ID');
      expect(tooltip1).toContain('Unique identifier for the patient');
      
      // Test field with title fallback
      const mockSOP = await TestDataBuilder.createBasicSOP();
      if (mockSOP.taskgroups && mockSOP.taskgroups[0] && mockSOP.taskgroups[0].children && mockSOP.taskgroups[0].children[0] && mockSOP.taskgroups[0].children[0].children) {
        mockSOP.taskgroups[0].children[0].children.push({
          id: 'title_only_field',
          name: 'Title Only Field',
          title: 'Field with title only',
          type: 'string'
        });
      }

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockSOP)
        });
      });

      await page.reload();
      await reviewPanel.waitForLoaded();

      const tooltip2 = await reviewPanel.getFieldTooltip('Title Only Field');
      expect(tooltip2).toContain('Field with title only');
    });

    test('tooltips hide when not hovering', async ({ page }) => {
      const fieldRow = reviewPanel.getFieldRow('Patient ID');
      const infoIcon = fieldRow.locator('[data-testid="info-icon"]');
      
      // Initially no tooltip
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).not.toBeVisible();
      
      // Hover to show tooltip
      await infoIcon.hover();
      await expect(tooltip).toBeVisible();
      
      // Move away to hide tooltip
      await page.locator('h2').hover(); // Hover over a different element
      await expect(tooltip).not.toBeVisible();
    });

    test('no tooltip shown when no description/title available', async ({ page }) => {
      const mockSOP = await TestDataBuilder.createBasicSOP();
      if (mockSOP.taskgroups && mockSOP.taskgroups[0] && mockSOP.taskgroups[0].children && mockSOP.taskgroups[0].children[0] && mockSOP.taskgroups[0].children[0].children) {
        mockSOP.taskgroups[0].children[0].children.push({
          id: 'no_tooltip_field',
          name: 'No Tooltip Field',
          type: 'string'
        });
      }

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockSOP)
        });
      });

      await page.reload();
      await reviewPanel.waitForLoaded();

      const fieldRow = reviewPanel.getFieldRow('No Tooltip Field');
      const infoIcon = fieldRow.locator('[data-testid="info-icon"]');
      
      // Should not have info icon when no tooltip content
      await expect(infoIcon).not.toBeVisible();
    });

    test('tooltips work for card headers', async ({ page }) => {
      const card = reviewPanel.getCard('Basic Information');
      const infoIcon = card.locator('[data-testid="card-info-icon"]');
      
      await infoIcon.hover();
      
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('Basic Information Collection');
    });
  });

  test.describe('Responsive Layout', () => {
    test('grid layout adapts to screen size', async ({ page }) => {
      // Test desktop layout
      await page.setViewportSize({ width: 1200, height: 800 });
      
      const isResponsive = await reviewPanel.checkResponsiveLayout();
      expect(isResponsive).toBe(true);
      
      const fieldRow = reviewPanel.getFieldRow('Patient ID');
      
      // Should have 2-column grid on desktop
      const gridCols = await fieldRow.evaluate(el => 
        window.getComputedStyle(el).getPropertyValue('grid-template-columns')
      );
      expect(gridCols).toContain('2fr 3fr');
    });

    test('layout collapses to single column on mobile', async ({ page }) => {
      // Test mobile layout
      await page.setViewportSize({ width: 375, height: 667 });
      
      const fieldRow = reviewPanel.getFieldRow('Patient ID');
      
      // Should have 1-column grid on mobile
      const gridCols = await fieldRow.evaluate(el => 
        window.getComputedStyle(el).getPropertyValue('grid-template-columns')
      );
      expect(gridCols).not.toContain('2fr 3fr');
    });

    test('zebra striping alternates correctly', async () => {
      const isStripingCorrect = await reviewPanel.checkZebraStriping();
      expect(isStripingCorrect).toBe(true);
    });

    test('field values align properly in grid', async ({ page }) => {
      const fieldRows = page.locator('[data-testid="field-row"]');
      const firstRow = fieldRows.first();
      
      // Check grid structure
      const nameColumn = firstRow.locator('[data-testid="field-name"]');
      const valueColumn = firstRow.locator('[data-testid="field-value"]');
      
      await expect(nameColumn).toBeVisible();
      await expect(valueColumn).toBeVisible();
      
      // Name should be left-aligned, value should be right-aligned on desktop
      await page.setViewportSize({ width: 1200, height: 800 });
      
      const nameAlignment = await nameColumn.evaluate(el => 
        window.getComputedStyle(el).getPropertyValue('text-align')
      );
      const valueAlignment = await valueColumn.evaluate(el => 
        window.getComputedStyle(el).getPropertyValue('text-align')
      );
      
      expect(nameAlignment).toBe('left');
      expect(valueAlignment).toBe('right');
    });

    test('cards maintain proper spacing at different screen sizes', async ({ page }) => {
      const screenSizes = [
        { width: 1200, height: 800 }, // Desktop
        { width: 768, height: 1024 }, // Tablet
        { width: 375, height: 667 }   // Mobile
      ];

      for (const size of screenSizes) {
        await page.setViewportSize(size);
        
        const cards = page.locator('[data-testid="taskgroup-card"]');
        const cardCount = await cards.count();
        
        if (cardCount > 1) {
          // Check spacing between cards
          const firstCard = cards.first();
          const secondCard = cards.nth(1);
          
          const firstCardBottom = await firstCard.evaluate(el => el.getBoundingClientRect().bottom);
          const secondCardTop = await secondCard.evaluate(el => el.getBoundingClientRect().top);
          
          const spacing = secondCardTop - firstCardBottom;
          expect(spacing).toBeGreaterThan(0); // Should have spacing between cards
        }
      }
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('cards can be toggled with keyboard', async ({ page }) => {
      const cardTitle = 'Basic Information';
      const card = reviewPanel.getCard(cardTitle);
      const toggleButton = card.locator('[data-testid="card-toggle"]');
      
      // Focus the toggle button
      await toggleButton.focus();
      
      // Press Enter to toggle
      await page.keyboard.press('Enter');
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(false);
      
      // Press Enter again to toggle back
      await page.keyboard.press('Enter');
      expect(await reviewPanel.isCardExpanded(cardTitle)).toBe(true);
    });

    test('submit button can be reached with Tab navigation', async ({ page }) => {
      // Start from the top of the page
      await page.keyboard.press('Tab');
      
      // Tab through elements until reaching submit button
      let attempts = 0;
      const maxAttempts = 20;
      
      while (attempts < maxAttempts) {
        const focusedElement = await page.evaluate(() => document.activeElement?.textContent);
        if (focusedElement?.includes('Submit ELN')) {
          break;
        }
        await page.keyboard.press('Tab');
        attempts++;
      }
      
      expect(attempts).toBeLessThan(maxAttempts);
    });

    test('info icons can be focused and activated with keyboard', async ({ page }) => {
      const fieldRow = reviewPanel.getFieldRow('Patient ID');
      const infoIcon = fieldRow.locator('[data-testid="info-icon"]');
      
      // Tab to the info icon
      await infoIcon.focus();
      
      // Should show tooltip on focus
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();
    });
  });

  test.describe('Loading States', () => {
    test('shows loading state when data is being fetched', async ({ page }) => {
      // Mock slow API response
      await page.route('**/api/eln/draft/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(TestDataBuilder.createCompleteELNData())
        });
      });

      await page.goto('/claire/sop/test-sop-1');
      await reviewPanel.navigateToReviewTab();
      
      // Should show loading state initially
      const loadingIndicator = page.locator('[data-testid="loading-indicator"]');
      await expect(loadingIndicator).toBeVisible();
      
      // Should hide loading state after data loads
      await reviewPanel.waitForLoaded();
      await expect(loadingIndicator).not.toBeVisible();
    });

    test('handles empty taskgroups gracefully', async ({ page }) => {
      const emptySOP = await TestDataBuilder.createBasicSOP();
      emptySOP.taskgroups = [];

      await page.route('**/api/sop/*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptySOP)
        });
      });

      await page.reload();
      await reviewPanel.waitForLoaded();

      // Should show appropriate message
      const emptyMessage = page.locator('[data-testid="empty-taskgroups-message"]');
      await expect(emptyMessage).toBeVisible();
      await expect(emptyMessage).toContainText('No task groups found');
    });
  });
}); 