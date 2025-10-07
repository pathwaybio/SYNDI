// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import { SOPMetadata, SOPListResponse } from '../../shared/types/sop';
import { useAuth } from '../../shared/lib/auth';

/**
 * React hook for listing available SOPs
 * Manages loading state and error handling for SOP listing
 */
export function useSOPList() {
  const [sops, setSops] = useState<SOPMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const { getToken } = useAuth();

  /**
   * Fetch SOPs from the API
   */
  const fetchSOPs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/v1/sops/list', { headers });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch SOPs: ${response.status} ${response.statusText}`);
      }

      const data: SOPListResponse = await response.json();
      setSops(data.sops);
      setTotal(data.total);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching SOPs:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  /**
   * Refresh the SOP list
   */
  const refresh = useCallback(() => {
    fetchSOPs();
  }, [fetchSOPs]);

  /**
   * Get a specific SOP by ID
   */
  const getSOPById = useCallback((id: string): SOPMetadata | undefined => {
    return sops.find(sop => sop.id === id);
  }, [sops]);

  /**
   * Filter SOPs by keyword
   */
  const filterByKeyword = useCallback((keyword: string): SOPMetadata[] => {
    if (!keyword.trim()) return sops;
    
    const lowerKeyword = keyword.toLowerCase();
    return sops.filter(sop => 
      sop.title.toLowerCase().includes(lowerKeyword) ||
      sop.name.toLowerCase().includes(lowerKeyword) ||
      sop.description?.toLowerCase().includes(lowerKeyword) ||
      sop.keywords.some(k => k.toLowerCase().includes(lowerKeyword))
    );
  }, [sops]);

  /**
   * Filter SOPs by author
   */
  const filterByAuthor = useCallback((author: string): SOPMetadata[] => {
    if (!author.trim()) return sops;
    
    const lowerAuthor = author.toLowerCase();
    return sops.filter(sop => 
      sop.author?.toLowerCase().includes(lowerAuthor)
    );
  }, [sops]);

  // Load SOPs on mount
  useEffect(() => {
    fetchSOPs();
  }, [fetchSOPs]);

  return {
    // State
    sops,
    loading,
    error,
    total,
    
    // Actions
    fetchSOPs,
    refresh,
    getSOPById,
    filterByKeyword,
    filterByAuthor,
    
    // Computed
    hasSOPs: sops.length > 0,
    isEmpty: sops.length === 0
  };
} 