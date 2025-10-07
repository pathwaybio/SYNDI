// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SOP } from '@shared/types/sop';
import { useSchemaLoader } from '@claire/hooks/useSchemaLoader';
import { SchemaAgnosticFormRenderer, ReviewSubmitPanel } from '../components';
import { DraftRecoveryBanner } from '@claire/components/DraftRecoveryBanner';
import { BackendDraftModal } from '@claire/components/BackendDraftModal';
import { ELNFormData } from '@claire/types/eln';
import { Button } from '@shared/components/ui/button';
import { ActionButtonGroup } from '@shared/components/ActionButtonGroup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Badge } from '@shared/components/ui/badge';
import { Alert, AlertDescription } from '@shared/components/ui/alert';
import { Loader2, ArrowLeft, Eye, Code, AlertCircle, ExternalLink, FileText, Save, History } from 'lucide-react';
import { logger } from '@shared/lib/logger';
import { useAuth } from '@shared/lib/auth';
import { configLoader } from '@shared/lib/config-loader';
import { generateDraftFilename, extractFilenameData } from '@claire/lib/filename-utils';
import { useBackendDraftStorage } from '@claire/hooks/useBackendDraftStorage';
// Simplified config type for CLAIRE autosave
interface ClaireAutosaveConfig {
  enabled: boolean;
  timerDelayMs: number;
  ui: {
    showStatus: boolean;
    toastOnSave: boolean;
    toastOnError: boolean;
  };
}

logger.configure('warn', true);

// Simple draft save function - no complex hooks needed!
async function saveDraftToBackend(
  sopId: string, 
  formData: Record<string, any>,
  displayUsername: string,  // Only used for display/logging, backend determines real user
  authToken: string | null,
  sop?: SOP
): Promise<void> {
  const sessionId = `sop-${sopId}-${Date.now()}`;
  
  // Extract filename components for backend processing
  let filenameData: { filename_variables: string[]; field_ids: string[] } = { filename_variables: [], field_ids: [] };
  let title = `Draft - ${new Date().toLocaleString()}`;
  
  if (sop) {
    filenameData = extractFilenameData(sop, formData);
    title = generateDraftFilename(sop, formData, displayUsername); // For display only
    logger.debug('SOPViewPage', `Extracted filename data: variables=[${filenameData.filename_variables.join(',')}], fields=[${filenameData.field_ids.join(',')}]`);
  }
  
  const draftRequest = {
    sop_id: sopId,
    session_id: sessionId,
    data: formData,
    completion_percentage: calculateCompletionPercentage(formData),
    title: title,
    filename_variables: filenameData.filename_variables,
    field_ids: filenameData.field_ids
  };

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch('/api/v1/drafts/', {
    method: 'POST',
    headers,
    body: JSON.stringify(draftRequest)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save draft: ${error}`);
  }

  const result = await response.json();
  logger.info('SOPViewPage', `Draft saved successfully: ${result.draft_id} with ${filenameData.filename_variables.length} filename components`);
  return result;
}

// Simple completion percentage calculator
function calculateCompletionPercentage(formData: Record<string, any>): number {
  if (!formData || typeof formData !== 'object') return 0;
  const totalFields = Object.keys(formData).length;
  if (totalFields === 0) return 0;
  
  const filledFields = Object.values(formData).filter(value => {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }).length;
  
  return Math.round((filledFields / totalFields) * 100);
}

// Helper function to extract file attachments from form data
function extractFileAttachments(formData: Record<string, any>): Array<{fieldId: string, fileIds: string[], metadata?: any}> {
  const attachments: Array<{fieldId: string, fileIds: string[], metadata?: any}> = [];
  
  // Look for fields with file data structure
  Object.entries(formData).forEach(([fieldId, value]) => {
    if (value && typeof value === 'object' && 'fileIds' in value && Array.isArray(value.fileIds)) {
      attachments.push({
        fieldId,
        fileIds: value.fileIds,
        metadata: value.metadata
      });
    }
  });
  
  return attachments;
}

// Helper function to extract field definitions from SOP
function extractFieldDefinitions(sop: SOP): Array<Record<string, any>> {
  const fieldDefinitions: Array<Record<string, any>> = [];
  
  // Recursively traverse SOP structure to find all fields
  function traverse(element: any): void {
    if (element.type && element.id) {
      // This is a field - include LD-JSON compliance fields
      fieldDefinitions.push({
        id: element.id,
        name: element.name,
        title: element.title || element.name || '',  // Include title for LD-JSON
        description: element.description || '',       // Include description for LD-JSON
        '@type': element['@type'] || 'Field',        // Include @type for LD-JSON
        type: element.type,
        required: element.required,
        validation: element.validation,
        file_config: element.file_config,
        ui_config: element.ui_config
      });
    }
    
    // Traverse children
    if (element.children && Array.isArray(element.children)) {
      element.children.forEach(traverse);
    }
    
    // Traverse taskgroups
    if (element.taskgroups && Array.isArray(element.taskgroups)) {
      element.taskgroups.forEach(traverse);
    }
  }
  
  // Start traversal from taskgroups
  if (sop.taskgroups && Array.isArray(sop.taskgroups)) {
    sop.taskgroups.forEach(traverse);
  }
  
  return fieldDefinitions;
}

// Helper function to extract SOP metadata
function extractSOPMetadata(sop: SOP): Record<string, any> {
  return {
    sop_id: sop.id,
    name: sop.name,
    title: sop.title,
    version: sop.version,
    description: sop.description,
    '@type': sop['@type']
  };
}

// Helper function to extract filename variables using existing utility
function extractFilenameVariables(sop: SOP, formData: Record<string, any>): string[] {
  const filenameData = extractFilenameData(sop, formData);
  return filenameData.filename_variables;
}

const SOPViewPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sopId = searchParams.get('sop');
  const debug = searchParams.get('debug') === 'true';
  
  if (debug) {
    logger.configure('debug', true);
  }
  
  const { loadFromAPI, state, data: sop, error, metadata } = useSchemaLoader();
  const [activeTab, setActiveTab] = useState<'form' | 'review' | 'schema' | 'debug'>('form');
  const [elnData, setElnData] = useState<ELNFormData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [autosaveConfig, setAutosaveConfig] = useState<ClaireAutosaveConfig | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  
  const { user, getToken } = useAuth();
  // Note: Backend determines user identity, frontend should not hardcode usernames
  
  // Backend draft storage
  const draftStorage = useBackendDraftStorage();
  
  // Simple state tracking
  const formData = elnData?.values || {};
  const hasFormData = Object.keys(formData).length > 0;
  



  // Load SOP when sopId changes
  useEffect(() => {
    if (sopId) {
      loadFromAPI(sopId);
    }
  }, [sopId, loadFromAPI]);

  // Load drafts when SOP is loaded (only when sopId changes or banner is not dismissed)
  useEffect(() => {
    if (sopId && !bannerDismissed) {
      draftStorage.operations.loadDrafts(sopId).then(() => {
        // Show recovery banner if drafts are available
        if (draftStorage.state.drafts.length > 0) {
          setShowRecoveryBanner(true);
        }
      });
    }
  }, [sopId, bannerDismissed, draftStorage.operations]); // Operations now properly memoized

  // Load autosave configuration
  useEffect(() => {
    const loadAutosaveConfig = async () => {
      try {
        const config = await configLoader.getClaireAutosaveConfig();
        // Extract simplified config from complex config
        const simpleConfig: ClaireAutosaveConfig = {
          enabled: config.enabled,
          timerDelayMs: (config as any).timerDelayMs || config.debounce?.delay || 15000,
          ui: {
            showStatus: config.ui?.showStatus || true,
            toastOnSave: config.ui?.toastOnSave || false,
            toastOnError: config.ui?.toastOnError || true
          }
        };
        setAutosaveConfig(simpleConfig);
        logger.debug('SOPViewPage', `Loaded autosave config: enabled=${simpleConfig.enabled}, delay=${simpleConfig.timerDelayMs}ms`);
      } catch (error) {
        logger.error('SOPViewPage', `Failed to load autosave config: ${error}`);
                 // Fallback to default config
         setAutosaveConfig({
           enabled: true,
           timerDelayMs: 15000,
           ui: { showStatus: true, toastOnSave: false, toastOnError: true }
         });
      }
    };
    loadAutosaveConfig();
  }, []);

  // Autosave timer - saves after configured delay if there are unsaved changes
  useEffect(() => {
    if (!autosaveConfig?.enabled || !hasUnsavedChanges || !hasFormData || !sop || !sopId) {
      return;
    }

         const autosaveDelay = autosaveConfig.timerDelayMs || 15000; // Default 15 seconds
    
    logger.debug('SOPViewPage', `Autosave timer started: ${autosaveDelay}ms`);
    
    const timer = setTimeout(async () => {
      try {
        setIsSavingDraft(true);
        logger.info('SOPViewPage', 'Autosave triggered');
        
        await saveDraftToBackend(sopId, formData, 'user', getToken(), sop);
        setHasUnsavedChanges(false); // Mark as saved
        
        if (autosaveConfig.ui?.toastOnSave) {
          // Could add toast notification here if needed
          logger.info('SOPViewPage', 'Autosave completed');
        }
      } catch (error) {
        logger.error('SOPViewPage', `Autosave failed: ${error}`);
        if (autosaveConfig.ui?.toastOnError) {
          // Could add error toast here if needed
        }
      } finally {
        setIsSavingDraft(false);
      }
    }, autosaveDelay);

    // Cleanup timer on unmount or dependency change
    return () => {
      logger.debug('SOPViewPage', 'Autosave timer cleared');
      clearTimeout(timer);
    };
  }, [autosaveConfig, hasUnsavedChanges, hasFormData, sop, sopId, formData]);

  const handleBack = () => {
    window.history.back();
  };

  // Handle form save (draft) - called by form renderer when data changes
  const handleSave = async (data: ELNFormData) => {
    try {
      logger.debug('SOPViewPage', `Handling form save with ${Object.keys(data.values).length} fields`);
      setElnData(data);
      setHasUnsavedChanges(true); // Mark as having unsaved changes for autosave
      
      logger.debug('SOPViewPage', 'elnData updated, autosave timer will be reset');
    } catch (error) {
      logger.error('SOPViewPage', `Failed to handle form save: ${error}`);
    }
  };

  // Manual save handler for Save Draft button - SIMPLIFIED!
  const handleManualSave = async () => {
    if (!elnData || !sop || !sopId || !hasFormData) {
      logger.warn('SOPViewPage', 'Cannot save: missing data');
      return;
    }

    setIsSavingDraft(true);
    try {
      logger.info('SOPViewPage', 'Manual save triggered');
      await saveDraftToBackend(sopId, elnData.values, 'user', getToken(), sop);
      
      setHasUnsavedChanges(false); // Mark as saved
      
      // Show success feedback
      alert('Draft saved successfully!');
    } catch (error) {
      logger.error('SOPViewPage', `Manual save failed: ${error}`);
      alert(`Failed to save draft: ${error}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Draft recovery handlers
  const handleShowDraftModal = () => {
    setShowDraftModal(true);
  };

  const handleDraftRecover = () => {
    setShowDraftModal(true);
    setShowRecoveryBanner(false);
  };

  const handleDraftDiscard = async () => {
    if (!sopId) return;
    
    try {
      // Could implement bulk delete here if needed
      setShowRecoveryBanner(false);
      setBannerDismissed(true);
    } catch (error) {
      logger.error('SOPViewPage', `Failed to discard drafts: ${error}`);
    }
  };

  const handleDraftSelected = (draftData: ELNFormData) => {
    logger.info('SOPViewPage', 'Draft selected for recovery');
    setElnData(draftData);
    setShowRecoveryBanner(false);
    setShowDraftModal(false);
    // Clear unsaved changes since we just loaded a draft
    setHasUnsavedChanges(false);
  };

  const handleRecoveryBannerDismiss = () => {
    setShowRecoveryBanner(false);
    setBannerDismissed(true);
  };

  // Handle form submission
  const handleSubmit = async (data: ELNFormData) => {
    const token = getToken();
    setIsSubmitting(true);
    try {
      if (!sop || !sopId) {
        throw new Error('Missing SOP or SOP ID');
      }

      logger.debug('SOPViewPage', `Submitting ELN with ${Object.keys(data.values).length} fields`);
      setElnData(data);

      // 1. Extract file upload metadata from form data
      const fileAttachments = extractFileAttachments(data.values);
      logger.debug('SOPViewPage', `Found ${fileAttachments.length} file attachments`);

      // 2. Submit ELN first (creates the ELN in submissions storage)
      const elnRequest = {
        sop_id: sopId,
        status: 'final',
        form_data: data.values,
        field_definitions: extractFieldDefinitions(sop),
        sop_metadata: extractSOPMetadata(sop),
        filename_variables: extractFilenameVariables(sop, data.values)
      };

      logger.debug('SOPViewPage', 'Submitting ELN to backend...');
      const elnHeaders: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        elnHeaders['Authorization'] = `Bearer ${token}`;
      }

      const elnResponse = await fetch('/api/v1/elns/submit', {
        method: 'POST',
        headers: elnHeaders,
        body: JSON.stringify(elnRequest)
      });

      if (!elnResponse.ok) {
        const errorText = await elnResponse.text();
        throw new Error(`ELN submission failed: ${errorText}`);
      }

      const elnResult = await elnResponse.json();
      logger.info('SOPViewPage', `ELN submitted successfully: ${elnResult.eln_uuid}`);

      // 3. Attach files to the now-existing ELN (if any files were uploaded)
      if (fileAttachments.length > 0) {
        logger.debug('SOPViewPage', `Attaching ${fileAttachments.length} file attachments...`);
        
        for (const attachment of fileAttachments) {
          const attachRequest = {
            eln_uuid: elnResult.eln_uuid,
            field_id: attachment.fieldId,
            file_ids: attachment.fileIds,
            sop_id: sopId
          };

          const attachHeaders: HeadersInit = {
            'Content-Type': 'application/json',
          };
          
          if (token) {
            attachHeaders['Authorization'] = `Bearer ${token}`;
          }

          const attachResponse = await fetch('/api/v1/files/attach-to-eln', {
            method: 'POST',
            headers: attachHeaders,
            body: JSON.stringify(attachRequest)
          });

          if (!attachResponse.ok) {
            const errorText = await attachResponse.text();
            logger.error('SOPViewPage', `File attachment failed for field ${attachment.fieldId}: ${errorText}`);
            throw new Error(`Failed to attach files for field ${attachment.fieldId}: ${errorText}`);
          } else {
            const attachResult = await attachResponse.json();
            logger.info('SOPViewPage', `Files attached successfully for field ${attachment.fieldId}`);
          }
        }
      }

      // 4. Success handling
      alert(`ELN submitted successfully! UUID: ${elnResult.eln_uuid}`);
      window.history.back();
      
    } catch (error) {
      logger.error('SOPViewPage', `Failed to submit ELN: ${error}`);
      alert(`Failed to submit ELN: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle recovery data
  const handleRecovery = (data: ELNFormData) => {
    setElnData(data);
  };

  if (!sopId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No SOP ID provided. Please select an SOP from the list.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          <span className="text-muted-foreground">Loading SOP schema...</span>
        </div>
      </div>
    );
  }

  if (state === 'error' || error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load SOP: {error?.message || 'Unknown error'}
          </AlertDescription>
        </Alert>
        <Button onClick={handleBack} variant="outline" className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to SOP List
        </Button>
      </div>
    );
  }

  if (!sop) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            SOP not found or invalid.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Button onClick={handleBack} variant="outline" className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to SOP List
        </Button>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{sop.title}</h1>
            <p className="text-muted-foreground mb-2">{sop.name}</p>
            {sop.description && (
              <p className="text-muted-foreground">{sop.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">v{sop.version}</Badge>
            {debug && <Badge variant="outline">Debug Mode</Badge>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex justify-between items-center mb-6 border-b">
        <div className="flex space-x-1">
          <Button
            variant={activeTab === 'form' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('form')}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            <Eye className="w-4 h-4 mr-2" />
            Form View
          </Button>
          <Button
            variant={activeTab === 'review' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('review')}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            disabled={!hasFormData}
          >
            <FileText className="w-4 h-4 mr-2" />
            Review & Submit
          </Button>
          {debug && (
            <Button
              variant={activeTab === 'schema' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('schema')}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <Code className="w-4 h-4 mr-2" />
              SOP Schema
            </Button>
          )}
          {debug && (
            <Button
              variant={activeTab === 'debug' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('debug')}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <Code className="w-4 h-4 mr-2" />
              Debug
            </Button>
          )}
        </div>
        
        {/* Action buttons */}
        <ActionButtonGroup
          actions={[
            {
              label: 'Saved Versions',
              onClick: handleShowDraftModal,
              icon: History,
              variant: 'outline',
              disabled: false,
            },
            {
              label: isSavingDraft ? 'Saving...' : 
                     hasUnsavedChanges ? 'Save Draft (●)' : 'Save Draft',
              onClick: handleManualSave,
              icon: isSavingDraft ? Loader2 : Save,
              variant: hasUnsavedChanges ? 'default' : 'outline',
              disabled: isSavingDraft || !hasFormData,
              className: isSavingDraft ? 'animate-spin' : ''
            }
          ]}
          className="mb-1"
        />
      </div>

      {/* Draft Recovery Banner */}
      {sopId && (
        <DraftRecoveryBanner
          isVisible={showRecoveryBanner && draftStorage.state.drafts.length > 0}
          draftCount={draftStorage.state.drafts.length}
          onRecover={handleDraftRecover}
          onDiscard={handleDraftDiscard}
          onDismiss={handleRecoveryBannerDismiss}
          className="mb-4"
        />
      )}

      {/* Content */}
      <div className="space-y-6">
        {activeTab === 'form' && (
          <div>
            <SchemaAgnosticFormRenderer
              sop={sop}
              initialData={elnData || undefined}
              onSave={handleSave}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              isSaving={isSavingDraft}
            />
          </div>
        )}

        {activeTab === 'review' && elnData && (
          <div>
            <ReviewSubmitPanel
              sop={sop}
              elnData={elnData}
              onSubmit={() => handleSubmit(elnData)}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {activeTab === 'schema' && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle>SOP Schema</CardTitle>
                <CardDescription>
                  The complete schema definition for this SOP
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                  <code>{JSON.stringify(sop, null, 2)}</code>
                </pre>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'debug' && debug && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Debug Information</CardTitle>
                <CardDescription>
                  Debug information for development
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">SOP Metadata</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                      <code>{JSON.stringify(metadata, null, 2)}</code>
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">ELN Form Data</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                      <code>{JSON.stringify(elnData, null, 2)}</code>
                    </pre>
                    {hasFormData && (
                      <p className="text-xs text-green-600 mt-2">
                        ✓ Form has {Object.keys(formData).length} fields with data
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Schema State</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                      <code>{JSON.stringify({ state, error }, null, 2)}</code>
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Form State</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                      <code>{JSON.stringify({ 
                        isSubmitting, 
                        isSaving: isSavingDraft, 
                        hasElnData: !!elnData,
                        hasFormData,
                        hasUnsavedChanges,
                        autosaveEnabled: autosaveConfig?.enabled,
                                                 autosaveDelay: autosaveConfig?.timerDelayMs,
                        activeTab 
                      }, null, 2)}</code>
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Backend Draft Modal */}
      {sopId && (
        <BackendDraftModal
          isOpen={showDraftModal}
          onClose={() => setShowDraftModal(false)}
          sopId={sopId}
          onDraftSelected={handleDraftSelected}
        />
      )}
    </div>
  );
};

export default SOPViewPage; 