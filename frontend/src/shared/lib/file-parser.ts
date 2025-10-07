// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared file parsing utilities for JSON and YAML files
 * Used by both SAM and CLAIRE for consistent file handling
 */

export interface ParsedFile {
  content: any;
  type: 'json' | 'yaml';
  filename: string;
}

/**
 * Parse a file as JSON or YAML
 * Tries JSON first, then falls back to YAML
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const content = await file.text();
  let parsed: any;
  let type: 'json' | 'yaml';

  // Try JSON first, then YAML
  try {
    parsed = JSON.parse(content);
    type = 'json';
  } catch (jsonError) {
    try {
      const yaml = await import('js-yaml');
      parsed = yaml.load(content);
      type = 'yaml';
    } catch (yamlError) {
      throw new Error(
        `Unable to parse file as JSON or YAML. ` +
        `JSON error: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}. ` +
        `YAML error: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`
      );
    }
  }

  // Validate that we got an object
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid file format. Expected JSON object or YAML document.');
  }

  return { content: parsed, type, filename: file.name };
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

/**
 * Check if a file has a valid extension for loading
 */
export function isValidFileType(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ['json', 'yaml', 'yml'].includes(ext);
} 