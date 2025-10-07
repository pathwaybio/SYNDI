// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared file input utilities
 * Used by both SAM and CLAIRE for consistent file selection
 */

/**
 * Create and trigger a file input element
 */
export function createFileInput(
  accept: string,
  onFileSelected: (file: File) => void,
  multiple: boolean = false
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  
  input.onchange = (event) => {
    const files = (event.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      if (multiple) {
        Array.from(files).forEach(onFileSelected);
      } else {
        onFileSelected(files[0]);
      }
    }
  };
  
  // Trigger the file dialog
  input.click();
}

/**
 * Common file accept patterns
 */
export const FILE_ACCEPT_PATTERNS = Object.freeze({
  SOP_FILES: '.json,.yaml,.yml',
  JSON_ONLY: '.json',
  YAML_ONLY: '.yaml,.yml',
  TEXT_FILES: '.txt,.json,.yaml,.yml'
}); 