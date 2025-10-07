// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SOPMetadata } from '../../shared/types/sop';
import { useSOPList } from '../hooks/useSOPList';
import { useSchemaLoader } from '../hooks/useSchemaLoader';
import { SOPCard } from '../components/SOPCard';
import { Button } from '../../shared/components/ui/button';
import { Input } from '../../shared/components/ui/input';
import { Alert, AlertDescription } from '../../shared/components/ui/alert';
import { Loader2, Search, RefreshCw, AlertCircle, Hash } from 'lucide-react';
import { logger } from '@shared/lib/logger';

logger.configure('warn', true);

const SOPListPage: React.FC = () => {
  const navigate = useNavigate();
  const { sops, loading, error, refresh, filterByKeyword } = useSOPList();
  const { loadFromAPI, state: schemaState, error: schemaError } = useSchemaLoader();
  const [searchTerm, setSearchTerm] = useState('');
  const [idSearchTerm, setIdSearchTerm] = useState('');
  const [selectedSOP, setSelectedSOP] = useState<SOPMetadata | null>(null);

  // Filter SOPs by both keyword and ID search
  const filteredSOPs = useMemo(() => {
    let filtered = sops;

    // Apply keyword filter
    if (searchTerm.trim()) {
      filtered = filterByKeyword(searchTerm);
    }

    // Apply ID filter
    if (idSearchTerm.trim()) {
      const lowerIdSearch = idSearchTerm.toLowerCase();
      filtered = filtered.filter(sop => 
        sop.id.toLowerCase().includes(lowerIdSearch)
      );
    }

    return filtered;
  }, [sops, searchTerm, idSearchTerm, filterByKeyword]);

  const handleSOPSelect = async (sop: SOPMetadata) => {
    setSelectedSOP(sop);
    try {
      // Navigate to SOP view page
      const url = `/claire/sop?sop=${encodeURIComponent(sop.id)}`;
      logger.debug('SOPListPage', `Navigating to SOP id: ${sop.id}`);
      navigate(url);
    } catch (error) {
      console.error('Failed to navigate to SOP:', error);
    }
  };

  const handleRefresh = () => {
    refresh();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">SOP List</h1>
        <p className="text-muted-foreground">
          Select a Standard Operating Procedure (SOP) to view its schema
        </p>
      </div>

      {/* Search and Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search SOPs by title, description, or keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="relative flex-1">
            <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by SOP ID (e.g., Test1, Defunct1)..."
              value={idSearchTerm}
              onChange={(e) => setIdSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            className="sm:w-auto"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
        
        {/* Clear filters button */}
        {(searchTerm || idSearchTerm) && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setIdSearchTerm('');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load SOPs: {error}
          </AlertDescription>
        </Alert>
      )}

      {schemaError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load SOP schema: {schemaError.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          <span className="text-muted-foreground">Loading SOPs...</span>
        </div>
      )}

      {/* SOP Grid */}
      {!loading && (
        <>
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              {filteredSOPs.length} of {sops.length} SOPs
              {(searchTerm || idSearchTerm) && (
                <>
                  {' '}matching{' '}
                  {searchTerm && `"${searchTerm}"`}
                  {searchTerm && idSearchTerm && ' and '}
                  {idSearchTerm && `ID "${idSearchTerm}"`}
                </>
              )}
            </p>
          </div>

          {filteredSOPs.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No SOPs Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || idSearchTerm
                  ? `No SOPs match your search criteria`
                  : 'No SOPs are currently available'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSOPs.map((sop) => (
                <SOPCard
                  key={sop.id}
                  sop={sop}
                  onSelect={handleSOPSelect}
                  selected={selectedSOP?.id === sop.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SOPListPage; 