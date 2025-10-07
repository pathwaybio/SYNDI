// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent } from '@shared/components/ui/card';
import { Progress } from '@shared/components/ui/progress';
import { Alert, AlertDescription } from '@shared/components/ui/alert';
import { Upload, X, FileText, Image, File } from 'lucide-react';
import { useAuth } from '@shared/lib/auth';
import { logger } from '@shared/lib/logger';

interface FileUploadFieldProps {
  fieldId: string;
  sopId?: string;
  value?: FileUploadValue;
  onChange: (value: FileUploadValue) => void;
  config: {
    accept?: string;
    multiple?: boolean;
    maxSize?: number;
    maxFiles?: number;
  };
  uiConfig?: any;
  disabled?: boolean;
}

interface FileUploadValue {
  files: File[];
  fileIds?: string[];
  uploadedUrls?: string[];
  metadata?: {
    originalNames: string[];
    sizes: number[];
    types: string[];
  };
}

// Backend error response types
interface FileValidationError {
  error: 'FILE_VALIDATION_FAILED';
  error_code: string;
  message: string;
  details: Record<string, any>;
  user_message: string;
}

interface ApiErrorResponse {
  detail: FileValidationError | string;
}

export const FileUploadField: React.FC<FileUploadFieldProps> = ({
  fieldId,
  sopId,
  value,
  onChange,
  config,
  uiConfig,
  disabled = false
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();


  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      // Validate files
      if (config.maxSize) {
        const oversizedFiles = acceptedFiles.filter(f => f.size > config.maxSize! * 1024 * 1024);
        if (oversizedFiles.length > 0) {
          throw new Error(`Files exceed maximum size: ${oversizedFiles.map(f => f.name).join(', ')}`);
        }
      }

      // Check total file count when multiple files are allowed
      const existingFileCount = value?.fileIds?.length || 0;
      const totalFileCount = existingFileCount + acceptedFiles.length;
      
      if (config.maxFiles && totalFileCount > config.maxFiles) {
        throw new Error(`Maximum ${config.maxFiles} files allowed. You already have ${existingFileCount} file(s).`);
      }

      // Upload files to backend
      const uploadResult = await uploadFiles(acceptedFiles, fieldId, sopId, (progress) => {
        setProgress(progress);
      }, getToken());

      // When multiple files are allowed, append to existing files
      let newValue: FileUploadValue;
      
      if (config.multiple && value?.fileIds?.length) {
        // Append to existing files
        newValue = {
          files: [...(value.files || []), ...acceptedFiles],
          fileIds: [...(value.fileIds || []), ...uploadResult.fileIds],
          uploadedUrls: [...(value.uploadedUrls || []), ...uploadResult.uploadedUrls],
          metadata: {
            originalNames: [...(value.metadata?.originalNames || []), ...acceptedFiles.map(f => f.name)],
            sizes: [...(value.metadata?.sizes || []), ...acceptedFiles.map(f => f.size)],
            types: [...(value.metadata?.types || []), ...acceptedFiles.map(f => f.type)]
          }
        };
      } else {
        // Replace files (single file mode or first upload)
        newValue = {
          files: acceptedFiles,
          fileIds: uploadResult.fileIds,
          uploadedUrls: uploadResult.uploadedUrls,
          metadata: {
            originalNames: acceptedFiles.map(f => f.name),
            sizes: acceptedFiles.map(f => f.size),
            types: acceptedFiles.map(f => f.type)
          }
        };
      }

      onChange(newValue);
      logger.debug('FileUploadField', `Files uploaded successfully: ${fieldId}, fileCount: ${newValue.fileIds?.length || 0}`);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      logger.error('FileUploadField', `File upload failed: ${fieldId}, error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [fieldId, config, onChange, value, getToken, sopId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: config.accept ? parseAcceptString(config.accept) : undefined,
    multiple: config.multiple || false,
    disabled: disabled || uploading,
    maxFiles: config.maxFiles || 1
  });

  const removeFile = (index: number) => {
    if (!value) return;
    
    const newFiles = value.files ? value.files.filter((_, i) => i !== index) : [];
    const newFileIds = value.fileIds?.filter((_, i) => i !== index);
    const newUrls = value.uploadedUrls?.filter((_, i) => i !== index);
    const newMetadata = value.metadata ? {
      originalNames: value.metadata.originalNames.filter((_, i) => i !== index),
      sizes: value.metadata.sizes.filter((_, i) => i !== index),
      types: value.metadata.types.filter((_, i) => i !== index)
    } : undefined;

    onChange({
      files: newFiles,
      fileIds: newFileIds,
      uploadedUrls: newUrls,
      metadata: newMetadata
    });
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <Card className={`border-2 border-dashed ${isDragActive ? 'border-primary' : 'border-muted-foreground/25'}`}>
        <CardContent className="p-6">
          <div {...getRootProps()} className="text-center cursor-pointer">
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {isDragActive ? 'Drop files here' : 'Drag & drop files here, or click to select'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {config.accept && `Accepted: ${config.accept}`}
              {config.maxSize && ` • Max size: ${config.maxSize}MB`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* File List */}
      {value?.metadata?.originalNames && value.metadata.originalNames.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Uploaded Files</h4>
          {value.metadata.originalNames.map((name, index) => {
            const size = value.metadata?.sizes?.[index] || 0;
            const type = value.metadata?.types?.[index] || '';
            return (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <FileIcon type={type} />
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(size / 1024 / 1024).toFixed(3)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Helper functions
function FileIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) {
    return <Image className="h-5 w-5 text-blue-500" />;
  }
  return <FileText className="h-5 w-5 text-gray-500" />;
}

function parseAcceptString(accept: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  accept.split(',').forEach(item => {
    const trimmed = item.trim();
    if (trimmed.includes('/')) {
      const [type, subtype] = trimmed.split('/');
      if (!result[type]) result[type] = [];
      result[type].push(subtype);
    }
  });
  return result;
}

async function uploadFiles(
  files: File[], 
  fieldId: string, 
  sopId?: string,
  onProgress?: (progress: number) => void,
  authToken?: string | null
): Promise<{ fileIds: string[], uploadedUrls: string[] }> {
  const formData = new FormData();
  formData.append('field_id', fieldId);
  
  // Use a default sop_id if not provided
  formData.append('sop_id', sopId || 'Test4');
  
  files.forEach((file) => {
    formData.append('files', file);
  });

  const headers: HeadersInit = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch('/api/v1/files/upload', {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    // Try to parse structured error response
    try {
      const errorData: ApiErrorResponse = await response.json();
      
      // Check if it's a structured error response
      if (errorData.detail && typeof errorData.detail === 'object' && 'error_code' in errorData.detail) {
        const structuredError = errorData.detail as FileValidationError;
        // Use the user-friendly message from structured error
        const errorMessage = structuredError.user_message || structuredError.message;
        throw new Error(errorMessage);
      } else if (errorData.detail) {
        // Old format or simple string error
        throw new Error(String(errorData.detail));
      } else {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
    } catch (parseError) {
      // If JSON parsing fails, fall back to status text
      if (parseError instanceof Error && parseError.message.includes('Upload failed')) {
        throw parseError;
      }
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  const result = await response.json();
  return {
    fileIds: result.file_ids || [],
    uploadedUrls: result.uploaded_urls || []
  };
} 