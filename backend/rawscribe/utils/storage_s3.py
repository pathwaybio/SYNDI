# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
S3 Storage Backend Implementations for CLAIRE
Contains S3-specific storage implementations
"""

import json
import logging
import os
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone, timedelta
from pathlib import Path
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import asyncio

from .storage_base import BaseJSONStorage, StorageError, StorageNotFoundError, ImmutableStorageError, safe_timestamp_key
from .metadata import DraftMetadata, ELNMetadata
from .file_validation import parse_temp_filename_and_unescape
from .config_types import StorageConfig
from .filename_generator import FilenameGenerationError
from .eln_filename_utils import parse_eln_filename
from . import document_utils

logger = logging.getLogger(__name__)

class S3JSONStorage(BaseJSONStorage):
    """S3-based JSON document storage"""
    
    def __init__(self, config: StorageConfig, document_type: str = "documents"):
        super().__init__(config, document_type)
        self.region = config.region
        
        # Initialize S3 client
        try:
            self.s3_client = boto3.client(
                's3',
                region_name=self.region,
                aws_access_key_id=config.access_key_id,
                aws_secret_access_key=config.secret_access_key
            )
            # Test connection (skip in test mode)
            import sys
            is_testing = 'pytest' in sys.modules or os.environ.get('TESTING') == 'true'
            if not is_testing:
                self.s3_client.head_bucket(Bucket=self._get_bucket_name())
            logger.info(f"S3 storage initialized: {self._get_bucket_name()}")
        except (ClientError, NoCredentialsError) as e:
            logger.error(f"S3 initialization failed: {e}")
            raise StorageError(f"S3 initialization failed: {e}")
    
    async def _perform_storage(self, key: str, content: str, metadata: dict) -> None:
        """Store document in S3"""
        def _upload():
            return self.s3_client.put_object(
                Bucket=self._get_bucket_name(key),
                Key=key,
                Body=content,
                ContentType='application/json',
                Metadata=metadata
            )
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, _upload)
    
    async def _perform_retrieval(self, key: str) -> str:
        """Retrieve document from S3"""
        def _download():
            response = self.s3_client.get_object(
                Bucket=self._get_bucket_name(key),
                Key=key
            )
            return response['Body'].read().decode('utf-8')
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _download)
    
    async def _perform_listing(self, prefix: str, filters: dict) -> List[dict]:
        """List documents in S3"""
        def _list_objects():
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(
                Bucket=self._get_bucket_name(),
                Prefix=prefix
            )
            logger.debug(f"Listing documents with prefix: {prefix}, Bucket: {self._get_bucket_name()}")
            
            results = []
            for page in pages:
                for obj in page.get('Contents', []):
                    if obj['Key'].endswith('.json'):
                        results.append({
                            'key': obj['Key'],
                            'size': obj['Size'],
                            'last_modified': obj['LastModified'],
                            'etag': obj['ETag']
                        })
            return results
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _list_objects)
    
    async def _perform_deletion(self, key: str) -> bool:
        """Delete document from S3"""
        # Determine bucket based on key content for cross-bucket operations
        if key.startswith("drafts/"):
            bucket_name = getattr(self.config, 'draft_bucket_name', None)
            if bucket_name is None:
                raise StorageError("draft_bucket_name must be configured for drafts operations")
        elif key.startswith("submissions/"):
            bucket_name = getattr(self.config, 'eln_bucket_name', None)
            if bucket_name is None:
                raise StorageError("eln_bucket_name must be configured for submissions operations")
        else:
            bucket_name = self._get_bucket_name()
            
        def _delete():
            self.s3_client.delete_object(
                Bucket=bucket_name,
                Key=key
            )
            return True
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _delete)
    
    async def _perform_head_check(self, key: str) -> None:
        """Check if document exists in S3"""
        def _head():
            return self.s3_client.head_object(
                Bucket=self._get_bucket_name(),
                Key=key
            )
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, _head)
    
    def _is_not_found_error(self, error: Exception) -> bool:
        """Check if error indicates S3 object not found"""
        return (isinstance(error, ClientError) and 
                error.response['Error']['Code'] in ['NoSuchKey', '404'])

    # Validation method implementations
    async def validate_sop_exists(self, sop_id: str) -> bool:
        """Validate that SOP exists in the forms bucket"""
        # SOPs are stored in the forms bucket, not in drafts/submissions directories
        # The drafts/submissions directories are created when users save drafts or submit ELNs
        
        try:
            # Get forms bucket name
            forms_bucket = self.config.forms_bucket_name or os.environ.get('FORMS_BUCKET')
            if not forms_bucket:
                logger.error("Forms bucket not configured")
                return False
            
            # Check for SOP file in forms bucket
            # SOPs can be in different formats: .yaml, .yml, or .json
            # Try multiple naming conventions:
            # 1. Exact match: {sop_id}.yaml
            # 2. With 'sop' prefix: sop{sop_id}.yaml  
            # 3. Case-insensitive match in directory listing
            
            # First try exact match
            for prefix in [f'forms/sops/{sop_id}', f'forms/sops/sop{sop_id}']:
                response = self.s3_client.list_objects_v2(
                    Bucket=forms_bucket,
                    Prefix=prefix,
                    MaxKeys=10
                )
                
                if 'Contents' in response:
                    for obj in response['Contents']:
                        key = obj['Key']
                        # Check if it's a valid SOP file (not a directory)
                        if (key.endswith('.yaml') or key.endswith('.yml') or key.endswith('.json')):
                            logger.info(f"Found SOP file: s3://{forms_bucket}/{key}")
                            return True
            
            # If exact matches fail, do a broader search for case-insensitive match
            # List all SOPs and look for case-insensitive match
            response = self.s3_client.list_objects_v2(
                Bucket=forms_bucket,
                Prefix='forms/sops/',
                MaxKeys=1000  # Reasonable limit for SOP files
            )
            
            if 'Contents' in response:
                sop_id_lower = sop_id.lower()
                for obj in response['Contents']:
                    key = obj['Key']
                    if not (key.endswith('.yaml') or key.endswith('.yml') or key.endswith('.json')):
                        continue
                    
                    # Extract filename without extension
                    filename = key.split('/')[-1].rsplit('.', 1)[0]
                    
                    # Check if this matches our SOP ID (case-insensitive)
                    # Handle both "Test4" matching "sopTest4" and "Test4" matching "test4"
                    if (filename.lower() == sop_id_lower or 
                        filename.lower() == f'sop{sop_id_lower}' or
                        filename.lower().endswith(sop_id_lower)):
                        logger.info(f"Found SOP file (case-insensitive match): s3://{forms_bucket}/{key}")
                        return True
            
            logger.warning(f"SOP '{sop_id}' not found in forms bucket: s3://{forms_bucket}/forms/sops/")
            return False
            
        except ClientError as e:
            logger.error(f"S3 validation error for SOP {sop_id}: {e}")
            raise StorageError(f"S3 validation failed: {e}")

    async def validate_eln_exists(self, sop_id: str, eln_uuid: str) -> bool:
        """Validate that ELN exists under submissions/<sop_id>/"""
        submissions_prefix = f'submissions/{sop_id}/'
        
        # Use the ELN bucket for submissions
        eln_bucket = getattr(self.config, 'eln_bucket_name', None)
        if eln_bucket is None:
            raise StorageError("eln_bucket_name must be configured for ELN validation")
        
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=eln_bucket,
                Prefix=submissions_prefix
            )
            
            # Look for objects with the UUID in the key
            for obj in response.get('Contents', []):
                if eln_uuid in obj['Key']:
                    return True
            return False
            
        except ClientError as e:
            logger.error(f"S3 ELN validation error for {eln_uuid} in SOP {sop_id}: {e}")
            raise StorageError(f"S3 ELN validation failed: {e}")

    async def validate_temp_files_exist(self, sop_id: str, file_ids: List[str], user_id: str, field_id: str) -> List[str]:
        """Validate temp files exist and return missing file IDs"""
        missing_files = []
        temp_prefix = f'drafts/{sop_id}/attachments/'
        
        # Use the drafts bucket for temp files
        draft_bucket = getattr(self.config, 'draft_bucket_name', None)
        if draft_bucket is None:
            raise StorageError("draft_bucket_name must be configured for temp file validation")
        
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=draft_bucket,
                Prefix=temp_prefix
            )
            
            # Get all temp file keys
            temp_files = [obj['Key'] for obj in response.get('Contents', [])]
            
            for file_id in file_ids:
                # Look for temp files with this file_id, user_id, and field_id
                found = False
                for key in temp_files:
                    if (file_id in key and user_id in key and field_id in key):
                        found = True
                        break
                
                if not found:
                    missing_files.append(file_id)
            
            return missing_files
            
        except ClientError as e:
            logger.error(f"S3 temp file validation error for SOP {sop_id}: {e}")
            raise StorageError(f"S3 temp file validation failed: {e}")

    async def load_eln_for_validation(self, sop_id: str, eln_uuid: str) -> Dict[str, Any]:
        """Load ELN document for field validation"""
        submissions_prefix = f'submissions/{sop_id}/'
        
        # Use the ELN bucket for submissions
        eln_bucket = getattr(self.config, 'eln_bucket_name', None)
        if eln_bucket is None:
            raise StorageError("eln_bucket_name must be configured for ELN validation")
        
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=eln_bucket,
                Prefix=submissions_prefix
            )
            
            # Find ELN file with the UUID
            eln_key = None
            for obj in response.get('Contents', []):
                if eln_uuid in obj['Key']:
                    eln_key = obj['Key']
                    break
            
            if not eln_key:
                raise StorageNotFoundError(f"ELN not found: {eln_uuid} in SOP {sop_id}")
            
            # Load the ELN document
            response = self.s3_client.get_object(
                Bucket=eln_bucket,
                Key=eln_key
            )
            
            content = response['Body'].read().decode('utf-8')
            return json.loads(content)
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                raise StorageNotFoundError(f"ELN not found: {eln_uuid} in SOP {sop_id}")
            logger.error(f"S3 ELN load error for {eln_uuid} in SOP {sop_id}: {e}")
            raise StorageError(f"S3 ELN load failed: {e}")
        except json.JSONDecodeError as e:
            raise StorageError(f"Failed to parse ELN document: {e}")

    async def _copy_file(self, source_key: str, dest_key: str) -> None:
        """Copy file from source to destination in S3"""
        # Determine buckets based on key content:
        # - If source key starts with "drafts/", it's from the drafts bucket
        # - If dest key starts with "submissions/", it's to the submissions bucket
        if source_key.startswith("drafts/"):
            source_bucket = getattr(self.config, 'draft_bucket_name', None)
            if source_bucket is None:
                raise StorageError("draft_bucket_name must be configured for drafts operations")
        else:
            source_bucket = self._get_bucket_name()
            
        if dest_key.startswith("submissions/"):
            dest_bucket = getattr(self.config, 'eln_bucket_name', None)
            if dest_bucket is None:
                raise StorageError("eln_bucket_name must be configured for submissions operations")
        else:
            dest_bucket = self._get_bucket_name()
        
        def _copy():
            copy_source = {'Bucket': source_bucket, 'Key': source_key}
            self.s3_client.copy_object(
                CopySource=copy_source,
                Bucket=dest_bucket,
                Key=dest_key
            )
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, _copy)

    async def _list_files(self, prefix: str) -> List[str]:
        """List actual files (not JSON documents) matching prefix"""
        def _list():
            response = self.s3_client.list_objects_v2(
                Bucket=self._get_bucket_name(prefix),
                Prefix=prefix
            )
            return [obj['Key'] for obj in response.get('Contents', [])]
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _list)

    async def _list_files_in_bucket(self, prefix: str, bucket_name_property: str) -> List[str]:
        """List actual files in a different bucket based on bucket_name_property"""
        bucket_name = getattr(self.config, bucket_name_property, None)
        if bucket_name is None:
            raise StorageError(f"{bucket_name_property} must be configured in storage config")
            
        def _list():
            response = self.s3_client.list_objects_v2(
                Bucket=bucket_name,
                Prefix=prefix
            )
            return [obj['Key'] for obj in response.get('Contents', [])]
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _list)

    async def store_temp_file(self, file_id: str, file, user_id: str, field_id: str, sop_id: str) -> str:
        """Store temporary file for drafts"""
        # Use the drafts bucket since we're storing in drafts/
        bucket_name = getattr(self.config, 'draft_bucket_name', None)
        if bucket_name is None:
            raise StorageError("draft_bucket_name must be configured for drafts operations")
        key = f"drafts/{sop_id}/attachments/{user_id}-{field_id}-{file_id}-{file.filename}"
        
        # Read file content using FastAPI's UploadFile.read() to ensure clean binary data
        # This properly handles multipart form data boundaries
        file_content = await file.read()
        
        # CRITICAL: Ensure we have bytes, not a string
        # If somehow file_content is a string, this would cause UTF-8 encoding corruption
        if not isinstance(file_content, bytes):
            raise StorageError(f"File content must be bytes, got {type(file_content)}")
        
        # Get content type
        content_type = getattr(file, 'content_type', None) or 'application/octet-stream'
        
        # Log for debugging
        logger.debug(f"Uploading file to S3: {len(file_content)} bytes, type: {content_type}")
        
        def _upload():
            # Upload binary data to S3 with explicit binary handling
            self.s3_client.put_object(
                Bucket=bucket_name,
                Key=key,
                Body=file_content,  # Must be bytes
                ContentType=content_type,
                # Do NOT set ContentEncoding - let S3 handle it as binary
            )
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, _upload)
        
        logger.info(f"Stored temp file in S3: bucket: {bucket_name}, key: {key}, size: {len(file_content)} bytes")
        return key




 