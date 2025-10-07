// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for ReviewSubmitPanel
 * Provides a clean interface for interacting with the ReviewSubmitPanel component in tests
 */
export class ReviewSubmitPageObject {
  readonly page: Page;
  readonly panel: Locator;
  readonly submitButton: Locator;
  readonly backButton: Locator;
  readonly validationSummary: Locator;
  readonly validationAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.locator('[data-testid="review-submit-panel"]');
    this.submitButton = page.locator('button:has-text("Submit ELN")');
    this.backButton = page.locator('button:has-text("Back to Form")');
    this.validationSummary = page.locator('[data-testid="validation-summary"]');
    this.validationAlert = page.locator('[role="alert"]');
  }

  /**
   * Wait for the ReviewSubmitPanel to be fully loaded
   */
  async waitForLoaded(): Promise<void> {
    await this.panel.waitFor({ state: 'visible' });
    await this.page.waitForTimeout(100);
  }

  /**
   * Navigate to the review tab (assumes we're on the SOP page)
   */
  async navigateToReviewTab(): Promise<void> {
    // For test component page, no navigation needed
    return Promise.resolve();
  }

  /**
   * Get a card by its title
   */
  getCard(title: string): Locator {
    return this.page.locator(`[data-testid="taskgroup-card"]:has-text("${title}")`);
  }

  /**
   * Expand or collapse a card
   */
  async toggleCard(title: string): Promise<void> {
    const card = this.getCard(title);
    await card.locator('[data-testid="card-toggle"]').click();
  }

  /**
   * Check if a card is expanded
   */
  async isCardExpanded(title: string): Promise<boolean> {
    const card = this.getCard(title);
    const chevron = card.locator('[data-testid="card-toggle"] svg');
    const classList = await chevron.getAttribute('class');
    return !classList?.includes('rotate'); // Assuming ChevronDown has no rotation, ChevronRight has rotation
  }

  /**
   * Get field row by field name
   */
  getFieldRow(fieldName: string): Locator {
    return this.page.locator(`[data-testid="field-row"]:has-text("${fieldName}")`);
  }

  /**
   * Get field value by field name
   */
  async getFieldValue(fieldName: string): Promise<string> {
    const row = this.getFieldRow(fieldName);
    const valueElement = row.locator('[data-testid="field-value"]');
    const text = await valueElement.textContent() || '';
    return text.trim();
  }

  /**
   * Check if field is marked as required
   */
  async isFieldRequired(fieldName: string): Promise<boolean> {
    const row = this.getFieldRow(fieldName);
    const requiredMark = row.locator('span:text("*")');
    return await requiredMark.count() > 0;
  }

  /**
   * Check if field shows "Required" validation error
   */
  async hasRequiredFieldError(fieldName: string): Promise<boolean> {
    const row = this.getFieldRow(fieldName);
    const errorText = row.locator('text="Required"');
    return await errorText.count() > 0;
  }

  /**
   * Get tooltip text for a field
   */
  async getFieldTooltip(fieldName: string): Promise<string | null> {
    const row = this.getFieldRow(fieldName);
    const infoIcon = row.locator('[data-testid="info-icon"]');
    
    if (await infoIcon.count() === 0) return null;
    
    // Hover to show tooltip and get title attribute
    await infoIcon.hover();
    return await infoIcon.getAttribute('title');
  }

  /**
   * Get validation summary info
   */
  async getValidationSummary(): Promise<{
    isValid: boolean;
    missingFields: number;
    totalFields: number;
  }> {
    const readyBadge = this.page.locator('[data-testid="ready-badge"]');
    const missingBadge = this.page.locator('[data-testid="missing-fields-badge"]');
    const totalBadge = this.page.locator('[data-testid="total-fields-badge"]');
    
    const isValid = await readyBadge.count() > 0;
    
    let missingFields = 0;
    if (await missingBadge.count() > 0) {
      const missingText = await missingBadge.textContent() || '';
      const match = missingText.match(/(\d+)\s+Missing/);
      missingFields = match ? parseInt(match[1]) : 0;
    }
    
    let totalFields = 0;
    if (await totalBadge.count() > 0) {
      const totalText = await totalBadge.textContent() || '';
      const match = totalText.match(/(\d+)\s+Field/);
      totalFields = match ? parseInt(match[1]) : 0;
    }
    
    return { isValid, missingFields, totalFields };
  }

  /**
   * Get list of missing required fields
   */
  async getMissingRequiredFields(): Promise<string[]> {
    const alert = this.validationAlert;
    if (await alert.count() === 0) return [];
    
    const alertText = await alert.textContent() || '';
    const match = alertText.match(/Missing fields: (.+)/);
    if (!match) return [];
    
    return match[1].split(', ').map(field => field.trim());
  }

  /**
   * Check if submit button is enabled
   */
  async isSubmitButtonEnabled(): Promise<boolean> {
    return !(await this.submitButton.isDisabled());
  }

  /**
   * Check if submit button shows loading state
   */
  async isSubmitButtonLoading(): Promise<boolean> {
    const loadingIcon = this.submitButton.locator('[data-testid="loading-icon"]');
    return await loadingIcon.count() > 0;
  }

  /**
   * Click submit button
   */
  async clickSubmit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Click back button
   */
  async clickBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Get all field names currently displayed
   */
  async getAllFieldNames(): Promise<string[]> {
    const fieldNames = this.page.locator('[data-testid="field-name"]');
    const count = await fieldNames.count();
    const names: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const text = await fieldNames.nth(i).textContent() || '';
      // Remove asterisk if present
      names.push(text.replace('*', '').trim());
    }
    
    return names;
  }

  /**
   * Check zebra striping pattern
   */
  async checkZebraStriping(): Promise<boolean> {
    const rows = this.page.locator('[data-testid="field-row"]');
    const count = await rows.count();
    
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const classList = await row.getAttribute('class') || '';
      
      if (i % 2 === 0) {
        // Even rows should have even background
        if (!classList.includes('bg-muted')) return false;
      } else {
        // Odd rows should have odd background  
        if (!classList.includes('bg-background')) return false;
      }
    }
    
    return true;
  }

  /**
   * Get field type badges for a field
   */
  async getFieldTypeBadges(fieldName: string): Promise<string[]> {
    const row = this.getFieldRow(fieldName);
    const badges = row.locator('.badge, [data-testid="field-badge"]');
    const count = await badges.count();
    const badgeTexts: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const text = await badges.nth(i).textContent() || '';
      badgeTexts.push(text.trim());
    }
    
    return badgeTexts;
  }

  /**
   * Check responsive layout behavior
   */
  async checkResponsiveLayout(): Promise<{
    desktop: boolean;
    mobile: boolean;
  }> {
    // Test desktop layout
    await this.page.setViewportSize({ width: 1024, height: 768 });
    const desktopGrid = this.page.locator('.grid-cols-\\[2fr_3fr\\]');
    const desktop = await desktopGrid.count() > 0;
    
    // Test mobile layout  
    await this.page.setViewportSize({ width: 375, height: 667 });
    const mobileGrid = this.page.locator('.grid-cols-1');
    const mobile = await mobileGrid.count() > 0;
    
    return { desktop, mobile };
  }

  /**
   * Get displayed ordinals
   */
  async getDisplayedOrdinals(): Promise<Array<{ element: string; ordinal: string }>> {
    const ordinals = this.page.locator('[data-testid="ordinal"]');
    const count = await ordinals.count();
    const results: Array<{ element: string; ordinal: string }> = [];
    
    for (let i = 0; i < count; i++) {
      const ordinal = ordinals.nth(i);
      const ordinalText = await ordinal.textContent() || '';
      const parent = ordinal.locator('..');
      const elementText = await parent.textContent() || '';
      
      results.push({
        element: elementText.trim(),
        ordinal: ordinalText.trim()
      });
    }
    
    return results;
  }

  /**
   * Count UI icons
   */
  async countIcons(): Promise<number> {
    const icons = this.page.locator('[data-testid="ui-icon"], .lucide');
    return await icons.count();
  }
} 