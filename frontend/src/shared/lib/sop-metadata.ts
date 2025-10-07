// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared utilities for extracting SOP metadata
 * Used by both SAM and CLAIRE for consistent metadata handling
 */

import { SOPMetadata } from '../types/sop';

/**
 * Extract SOP metadata from parsed SOP data
 */
export function extractSOPMetadata(data: any, filename?: string): SOPMetadata {
  const filenameWithoutExt = filename?.replace(/\.(yaml|yml|json)$/, '') || 'unknown';
  return {
    id: data.id || filenameWithoutExt,
    name: data.name || data.title || filenameWithoutExt,
    title: data.title || data.name || filenameWithoutExt,
    version: data.version || '1.0.0',
    author: data.author,
    date_published: data['date-published'] || data.date_published,
    description: data.description,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    filename: filename
  };
}

/**
 * Get a display title for an SOP
 */
export function getSOPDisplayTitle(data: any, fallback: string = 'Untitled SOP'): string {
  return data.title || data.name || fallback;
} 