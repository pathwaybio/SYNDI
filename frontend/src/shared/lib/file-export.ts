// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared file export utilities for downloading data as JSON or YAML
 * Used by both SAM and CLAIRE for consistent file exports
 */

export interface ExportOptions {
  format: 'json' | 'yaml';
  filename?: string;
  isDraft?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Export data as a downloadable file
 */
export async function exportData(data: any, options: ExportOptions): Promise<void> {
  let content: string;
  let mimeType: string;

  // Add metadata if provided
  if (options.metadata) {
    data = {
      ...data,
      metadata: {
        ...data.metadata,
        ...options.metadata,
        exported_at: new Date().toISOString()
      }
    };
  }

  if (options.format === 'json') {
    content = JSON.stringify(data, null, 2);
    mimeType = 'application/json';
  } else {
    const yaml = await import('js-yaml');
    content = yaml.dump(data, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      skipInvalid: options.isDraft || false
    });
    mimeType = 'application/x-yaml';
  }

  // Create and download the file
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename || `export.${options.format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a timestamped filename
 */
export function generateTimestampedFilename(
  prefix: string,
  extension: string,
  isDraft?: boolean
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const status = isDraft ? 'draft' : 'final';
  return `${prefix}-${status}-${timestamp}.${extension}`;
} 