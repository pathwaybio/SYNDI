# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Base Storage Classes for CLAIRE
Contains shared base classes, exceptions, and metadata structures
"""

import json
import logging
import sys
from typing import Dict, List, Optional, Any, Tuple, Type
from datetime import datetime, timezone
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor

from .filename_generator import FilenameGenerator, FilenameGenerationError
from .document_utils import extract_uuid_from_filename, serialize_document, deserialize_document, safe_timestamp_key, process_temp_filename
from .eln_filename_utils import parse_eln_filename
from .file_validation import parse_temp_filename_and_unescape
from . import document_utils
from .metadata import BaseMetadata, DraftMetadata, ELNMetadata




logger = logging.getLogger(__name__)

# Exception classes
class StorageError(Exception):
    """Base storage exception"""
    pass

class StorageNotFoundError(StorageError):
    """Storage item not found"""
    pass

class StoragePermissionError(StorageError):
    """Storage permission denied"""
    pass

class ImmutableStorageError(StorageError):
    """Immutable storage violation"""
    pass

class ValidationError(StorageError):
    """Validation error"""
    pass

class FileAccessError(StorageError):
    """File access error"""
    pass

class FieldValidationError(ValidationError):
    """Field validation error"""
    pass

# Metadata classes have been moved to metadata.py

# Base classes
class BaseJSONStorage(ABC):
    """Base class for JSON document storage with common operations"""
    
    def __init__(self, config, document_type: str = "documents"):
        self.config = config
        self.document_type = document_type
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.filename_generator = FilenameGenerator()
    
    # xxx NO - is_testing isn't how you get test bucket names, it comes from the config-loader
    def _get_bucket_name(self, key: str = None) -> str:
        """Get bucket name based on key prefix or document type"""
        import os
        
        # Check if we're running in test mode - provide defaults for backward compatibility
        is_testing = os.environ.get('TESTING') == 'true' or 'pytest' in sys.modules
        
        # Determine document type from key prefix if provided, otherwise use self.document_type
        if key:
            if key.startswith("drafts/"):
                doc_type = "drafts"
            elif key.startswith("submissions/"):
                doc_type = "submissions"
            elif key.startswith("sops/"):
                doc_type = "sops"
            else:
                # catastrophic failure
                raise StorageError(f"Unsupported key prefix: {key}")
        else:
            doc_type = self.document_type
        
        if doc_type == "drafts":
            bucket_name = getattr(self.config, 'draft_bucket_name', None)
            if bucket_name is None:
                if is_testing:
                    return 'eln-drafts'  # Test default
                raise StorageError(f"draft_bucket_name must be configured for document_type='drafts'")
            return bucket_name
        elif doc_type == "submissions":
            bucket_name = getattr(self.config, 'eln_bucket_name', None)
            if bucket_name is None:
                if is_testing:
                    return 'eln'  # Test default
                raise StorageError(f"eln_bucket_name must be configured for document_type='submissions'")
            return bucket_name
        elif doc_type == "sops":
            bucket_name = getattr(self.config, 'forms_bucket_name', None)
            if bucket_name is None:
                if is_testing:
                    return 'forms'  # Test default
                raise StorageError(f"forms_bucket_name must be configured for document_type='sops'")
            return bucket_name
        else:
            raise StorageError(f"Unsupported document_type: {doc_type}")
            
    # xxx NO - document_type can only be 'drafts', 'submissions'(eln?), 'sops' otherwise catastrophic failure    
    def _get_document_key(self, sop_id: str, filename: str = None, document_type: str = None, **kwargs) -> str:
        """Generate storage key based on document type"""
        doc_type = document_type or self.document_type
        if doc_type == "drafts":
            return f"drafts/{sop_id}/{filename}"
        elif doc_type == "submissions":
            return f"submissions/{sop_id}/{filename}"
        elif doc_type == "sops":
            return f"sops/{sop_id}.json"
        else:
            return f"{doc_type}/{sop_id}/{filename or 'document.json'}"
    
    async def _validate_storage_constraints(self, key: str, data: dict) -> bool:
        """Validate storage constraints based on document type"""
        if self.document_type == "submissions":
            # ELNs are immutable - check if key already exists
            return not await self._document_exists(key)
        else:
            # Drafts and SOPs are mutable
            return True
    
    def _serialize_data(self, data: dict) -> str:
        """Serialize data to JSON string"""
        return serialize_document(data)
    
    def _deserialize_data(self, json_str: str) -> dict:
        """Deserialize JSON string to data"""
        return deserialize_document(json_str)
    
    async def _store_document(self, key: str, data: dict, metadata: dict = None) -> None:
        """Store document with common logic"""
        # Validate storage constraints
        if not await self._validate_storage_constraints(key, data):
            raise ImmutableStorageError(f"Storage constraint violation for key: {key}")
        
        # Serialize data
        json_content = self._serialize_data(data)
        
        # Store document (implementation-specific)
        await self._perform_storage(key, json_content, metadata or {})
    
    async def _retrieve_document(self, key: str) -> dict:
        """Retrieve document with common logic"""
        try:
            json_content = await self._perform_retrieval(key)
            return self._deserialize_data(json_content)
        except Exception as e:
            if self._is_not_found_error(e):
                raise StorageNotFoundError(f"Document not found: {key}")
            raise StorageError(f"Failed to retrieve document: {e}")
    
    async def _list_documents(self, prefix: str, filters: dict = None) -> List[dict]:
        """List documents with common logic"""
        try:
            return await self._perform_listing(prefix, filters or {})
        except Exception as e:
            raise StorageError(f"Failed to list documents: {e}")
    
    async def _delete_document(self, key: str) -> bool:
        """Delete document with common logic"""
        try:
            return await self._perform_deletion(key)
        except Exception as e:
            if self._is_not_found_error(e):
                return False
            raise StorageError(f"Failed to delete document: {e}")
    
    async def _document_exists(self, key: str) -> bool:
        """Check if document exists"""
        try:
            await self._perform_head_check(key)
            return True
        except Exception as e:
            if self._is_not_found_error(e):
                return False
            raise StorageError(f"Failed to check document existence: {e}")
    
    # Abstract methods for implementation-specific operations
    @abstractmethod
    async def _perform_storage(self, key: str, content: str, metadata: dict) -> None:
        """Implementation-specific storage"""
        pass
    
    @abstractmethod
    async def _perform_retrieval(self, key: str) -> str:
        """Implementation-specific retrieval"""
        pass
    
    @abstractmethod
    async def _perform_listing(self, prefix: str, filters: dict) -> List[dict]:
        """Implementation-specific listing"""
        pass
    
    @abstractmethod
    async def _perform_deletion(self, key: str) -> bool:
        """Implementation-specific deletion"""
        pass
    
    @abstractmethod
    async def _perform_head_check(self, key: str) -> None:
        """Implementation-specific existence check"""
        pass
    
    @abstractmethod
    async def _copy_file(self, source_key: str, dest_key: str) -> None:
        """Copy file from source key to destination key"""
        pass
    
    @abstractmethod
    async def _list_files(self, prefix: str) -> List[str]:
        """List actual files (not JSON documents) matching prefix"""
        pass
    
    @abstractmethod
    async def _list_files_in_bucket(self, prefix: str, bucket_name_property: str) -> List[str]:
        """List actual files in a different bucket based on bucket_name_property"""
        pass
    
    @abstractmethod
    def _is_not_found_error(self, error: Exception) -> bool:
        """Check if error indicates item not found"""
        pass 



    # Validation methods (abstract - to be implemented by subclasses)
    @abstractmethod
    async def validate_sop_exists(self, sop_id: str) -> bool:
        """Validate that SOP exists in both drafts and submissions locations"""
        pass

    @abstractmethod
    async def validate_eln_exists(self, sop_id: str, eln_uuid: str) -> bool:
        """Validate that ELN exists under submissions/<sop_id>/"""
        pass

    @abstractmethod
    async def validate_temp_files_exist(self, sop_id: str, file_ids: List[str], user_id: str, field_id: str) -> List[str]:
        """Validate temp files exist and return missing file IDs"""
        pass

    @abstractmethod
    async def load_eln_for_validation(self, sop_id: str, eln_uuid: str) -> Dict[str, Any]:
        """Load ELN document for field validation"""
        pass

    async def list_documents(
        self,
        document_type: str,  # "drafts" or "submissions"
        sop_id: str,
        metadata_class: Type[BaseMetadata],
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        filename_variables: Optional[List[str]] = None
    ) -> List[BaseMetadata]:
        """Unified method to list documents with consistent filtering and sorting"""
        # Determine prefix based on document type
        if document_type == "drafts" and sop_id == "":
            # Special case: search across all SOP directories for drafts
            prefix = "drafts/"
        else:
            prefix = f"{document_type}/{sop_id}/"
        
        documents = await self._list_documents(prefix)
        logger.debug(f"Found {len(documents)} documents in storage for prefix {prefix}")
        
        items = []
        for doc_info in documents:
            try:
                logger.debug(f"Processing document: {doc_info['key']}")
                document = await self._retrieve_document(doc_info['key'])
                
                # Apply common filters
                if user_id and document.get('user_id') != user_id:
                    logger.debug(f"Skipping {doc_info['key']} - user_id mismatch: {document.get('user_id')} != {user_id}")
                    continue
                if status and document.get('status') != status:
                    logger.debug(f"Skipping {doc_info['key']} - status mismatch: {document.get('status')} != {status}")
                    continue
                
                # Apply filename variable filter (if provided)
                if filename_variables:
                    filename = document.get('filename', '')
                    try:
                        parsed = parse_eln_filename(filename)
                        doc_variables = parsed.get('variables', [])
                        # Check if all provided variables match
                        matches = all(
                            i < len(doc_variables) and doc_variables[i] == var
                            for i, var in enumerate(filename_variables)
                        )
                        if not matches:
                            continue
                    except Exception:
                        continue
                
                # Create metadata using from_dict for consistency
                logger.debug(f"Creating metadata for {doc_info['key']}")
                metadata = metadata_class.from_dict(document)
                items.append(metadata)
                logger.debug(f"Successfully added metadata for {doc_info['key']}")
                
            except Exception as e:
                logger.warning(f"Failed to load {document_type} metadata from {doc_info['key']}: {e}")
                continue
        
        # Sort by timestamp (newest first) - handle timezone-aware and naive datetimes
        items.sort(key=safe_timestamp_key, reverse=True)
        
        # Apply limit
        if limit:
            items = items[:limit]
        
        return items

    async def get_document(self, document_type: str, sop_id: str, file_basename: str) -> Optional[Dict[str, Any]]:
        """Get document by type, SOP ID, and file_basename"""
        try:
            if document_type == "sops":
                key = self._get_document_key(sop_id, document_type=document_type)
            else:
                filename = f"{file_basename}.json"
                key = self._get_document_key(sop_id, filename, document_type)
            return await self._retrieve_document(key)
        except StorageNotFoundError:
            return None
        except Exception as e:
            raise StorageError(f"Failed to get document: {e}")

    async def save_document(
        self,
        document_type: str,  # "drafts" or "submissions"
        sop_id: str,
        user_id: str,
        status: str,
        filename_variables: List[str],
        data: Dict[str, Any],
        metadata_class: Type[BaseMetadata],
        session_id: Optional[str] = None,
        field_ids: Optional[List[str]] = None,
        field_definitions: Optional[List[Dict[str, Any]]] = None,
        sop_metadata: Optional[Dict[str, Any]] = None,
        draft_uuid: Optional[str] = None,
        draft_id: Optional[str] = None,
        completion_percentage: float = 0.0,
        title: Optional[str] = None
    ) -> Tuple[str, BaseMetadata]:
        """Unified method to save documents - drafts are just unfinalized ELNs"""
        try:
            # Generate common identifiers
            filename, document_uuid = document_utils.generate_filename_and_uuid(
                status=status, user_id=user_id, filename_variables=filename_variables, field_ids=field_ids
            )
            timestamp = document_utils.generate_timestamp()

            # Drafts are just ELNs in an unfinalized state - use unified document preparation
            is_draft = document_type == "drafts"
            
            # Prepare document using unified function
            document = document_utils.prepare_document(
                document_uuid=document_uuid,
                filename=filename,
                sop_id=sop_id,
                user_id=user_id,
                status=status,
                timestamp=timestamp,
                data=data,
                is_draft=is_draft,
                session_id=session_id,
                sop_metadata=sop_metadata,
                field_definitions=field_definitions,
                checksum=document_utils.calculate_checksum(data) if not is_draft else None,
                draft_uuid=draft_uuid,
                draft_id=draft_id
            )
            
            # Add draft-specific fields that aren't in the base document structure
            if is_draft:
                document.update({
                    'completion_percentage': completion_percentage,
                    'title': title,
                    'size_bytes': document_utils.calculate_document_size(data)
                })
                return_id = document['draft_id']
            else:
                return_id = document_uuid

            # Create metadata - set up parameters based on document type
            create_params = {'sop_id': sop_id, 'user_id': user_id}
            
            if is_draft:
                create_params.update({
                    'data': data, 'draft_id': draft_id, 'session_id': session_id or 'default',
                    'completion_percentage': completion_percentage, 'title': title, 'draft_uuid': document_uuid
                })
            else:
                create_params.update({
                    'eln_document': document, 'checksum': document.get('checksum', ''),
                    'variables': filename_variables, 'timestamp': timestamp, 
                    'eln_uuid': document_uuid, 'filename': filename, 'status': status
                })
            
            metadata = metadata_class.create(**create_params)

            # Store document
            key = self._get_document_key(sop_id, filename, document_type)
            storage_metadata = {
                f'{document_type}-uuid': document_uuid, 'user-id': user_id,
                'status': status, 'timestamp': timestamp.isoformat()
            }
            if not is_draft:
                storage_metadata['checksum'] = document.get('checksum', '')
            
            await self._store_document(key, document, storage_metadata)
            
            logger.info(f"{document_type.title()} saved: {filename}")
            return return_id, metadata

        except Exception as e:
            logger.error(f"Failed to save {document_type}: {e}")
            raise


    async def get_eln_by_uuid(self, eln_uuid: str) -> Tuple[Dict[str, Any], ELNMetadata]:
        """Get specific ELN by UUID - common logic
        - search across all SOPs for the UUID - EXPENSIVE
        - return the document and metadata
        - raise StorageNotFoundError if not found
        """
        # Search across all SOPs for the UUID
        prefix = "submissions/"
        documents = await self._list_documents(prefix)
        
        for doc_info in documents:
            try:
                document = await self._retrieve_document(doc_info['key'])
                if document.get('eln_uuid') == eln_uuid:
                    # Use factory method to create metadata
                    metadata = ELNMetadata.from_dict(document)
                    return document, metadata
            except Exception as e:
                logger.warning(f"Failed to check document {doc_info['key']}: {e}")
                continue
        
        raise StorageNotFoundError(f"ELN not found with UUID: {eln_uuid}")

    async def query_prerequisite_elns(
        self,
        sop_id: str,
        field_filters: Dict[str, Any]
    ) -> List[Tuple[Dict[str, Any], ELNMetadata]]:
        """Query ELNs for prerequisite field imports - common logic"""
        elns = await self.list_documents(
            document_type="submissions",
            sop_id=sop_id,
            metadata_class=ELNMetadata
        )
        matching_elns = []
        
        for eln_metadata in elns:
            file_basename = eln_metadata.filename.replace('.json', '') if eln_metadata.filename.endswith('.json') else eln_metadata.filename
            document = await self.get_document("submissions", sop_id, file_basename)
            form_data = document.get('form_data', {})
            
            # Check if this ELN matches the field filters
            matches = True
            for field_id, expected_value in field_filters.items():
                actual_value = form_data.get(field_id)
                if actual_value != expected_value:
                    matches = False
                    break
            
            if matches:
                matching_elns.append((document, eln_metadata))
        
        return matching_elns

    async def validate_eln_immutability(self, sop_id: str, filename: str) -> bool:
        """Validate that ELN doesn't already exist (immutability check) - common logic"""
        key = self._get_document_key(sop_id, filename, "submissions")
        return not await self._document_exists(key)


    async def delete_draft(self, sop_id: str, draft_id: str) -> bool:
        """Delete draft document - base implementation"""
        filename = f"{draft_id}.json"
        key = self._get_document_key(sop_id, filename, "drafts")
        return await self._delete_document(key)

    async def cleanup_old_drafts(self, sop_id: str, retention_days: int = 30) -> int:
        """Clean up old drafts - base implementation using document listing"""
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
            
            # List all drafts for this SOP
            documents = await self._list_documents(f"drafts/{sop_id}/")
            
            deleted_count = 0
            for doc_info in documents:
                try:
                    # Get the document to check its timestamp
                    document = await self._retrieve_document(doc_info['key'])
                    doc_timestamp = datetime.fromisoformat(document.get('timestamp', datetime.now(timezone.utc).isoformat()))
                    
                    if doc_timestamp < cutoff_date:
                        if await self._delete_document(doc_info['key']):
                            deleted_count += 1
                            logger.debug(f"Deleted old draft: {doc_info['key']}")
                except Exception as e:
                    logger.warning(f"Failed to process document {doc_info['key']}: {e}")
                    continue
            
            return deleted_count
        except Exception as e:
            logger.error(f"Error cleaning up old drafts: {e}")
            return 0

    async def store_temp_file(self, file_id: str, file, user_id: str, field_id: str, sop_id: str) -> str:
        """Store temporary file - must be implemented by subclasses for actual file storage"""
        raise NotImplementedError("Subclasses must implement store_temp_file for actual file content storage")

    async def validate_field_exists_in_eln(self, eln_data: Dict[str, Any], field_id: str) -> bool:
        """Check if a field exists in the ELN's form_data or field_definitions"""
        form_data = eln_data.get('form_data', {})
        field_definitions = eln_data.get('field_definitions', [])
        
        # Note: field_id may be escaped, but form_data uses original field IDs
        from .file_validation import unescape_field_id
        
        # Try the field_id as-is first in form_data
        if field_id in form_data:
            return True
            
        # Try unescaping the field_id for form_data check
        unescaped_field_id = None
        try:
            unescaped_field_id = unescape_field_id(field_id)
            if unescaped_field_id in form_data:
                return True
        except:
            pass
            
        # For file fields, they might not have data in form_data but should be in field_definitions
        # Check if the field is defined as a file type in field_definitions
        for field_def in field_definitions:
            field_def_id = field_def.get('id')
            if field_def_id == field_id or (unescaped_field_id and field_def_id == unescaped_field_id):
                # If it's a file field, it's valid even if no data is in form_data yet
                if field_def.get('type') == 'file':
                    return True
                    
        return False

    async def attach_files_to_eln(self, eln_uuid: str, field_id: str, file_ids: List[str], user_id: str, sop_id: str) -> List[str]:
        """Attach files to ELN - base implementation using storage-agnostic methods"""
        final_urls = []
        file_info_list = []  # Track file info for ELN update
        
        # Need to unescape field_id for ELN update
        from .file_validation import unescape_field_id
        unescaped_field_id = unescape_field_id(field_id)
        
        for idx, file_id in enumerate(file_ids):
            try:
                # Find the temp file using storage-agnostic file listing
                # NOTE: temp files are stored in drafts bucket, not submissions bucket
                temp_key_prefix = f"drafts/{sop_id}/attachments/{user_id}-{field_id}-{file_id}-"
                
                # Get the bucket name for the specified document type
                bucket_name_property = 'draft_bucket_name'  

                # Use storage-agnostic method to list actual files (search in drafts bucket)
                logger.info(f"Searching for temp file with prefix: {temp_key_prefix}")
                file_keys = await self._list_files_in_bucket(temp_key_prefix, bucket_name_property)
                
                if not file_keys:
                    error_msg = f"Temp file not found for file_id: {file_id}, prefix: {temp_key_prefix}, bucket_property: {bucket_name_property}"
                    logger.error(error_msg)
                    logger.error(f"Expected pattern: {user_id}-{field_id}-{file_id}-<filename>")
                    raise StorageNotFoundError(f"Failed to find uploaded file {file_id}. The file may have expired or been uploaded by a different user. {error_msg}")
                
                logger.info(f"Found {len(file_keys)} matching file(s): {file_keys}")
                
                # Take the first match
                temp_key = file_keys[0]
                
                # Process filename using common logic
                temp_filename = temp_key.split('/')[-1]
                final_filename = process_temp_filename(temp_filename)
                
                # Extract original filename by removing the known prefix
                # We know the pattern: {user_id}-{field_id}-{file_id}-{original_filename}
                # We have all these components, so we can remove them to get original filename
                prefix_to_remove = f"{user_id}-{field_id}-{file_id}-"
                if temp_filename.startswith(prefix_to_remove):
                    original_name = temp_filename[len(prefix_to_remove):]
                else:
                    # Fallback if pattern doesn't match
                    original_name = temp_filename
                
                # Create final key
                final_key = f"submissions/{sop_id}/attachments/{final_filename}"
                
                # Use storage-agnostic copy operation
                await self._copy_file(temp_key, final_key)
                
                # Delete from temp location using storage-agnostic method
                await self._delete_document(temp_key)
                
                final_urls.append(final_key)
                file_info_list.append({
                    'finalPath': final_key,
                    'originalName': original_name,
                    'fileId': file_id
                })
                logger.info(f"Moved file from {temp_key} to {final_key}")
                
            except Exception as e:
                logger.error(f"Failed to attach file {file_id}: {e}")
                raise StorageError(f"Failed to attach file {file_id}: {str(e)}")
        
        # Check if any files were successfully processed
        if not final_urls and file_ids:
            raise StorageError(f"No files could be attached. All {len(file_ids)} file(s) failed to process.")
        
        # Update the ELN document with final file paths
        if final_urls:
            try:
                # Load the ELN document
                eln_files = await self._list_documents(f"submissions/{sop_id}/")
                eln_filename = None
                for file_info in eln_files:
                    if eln_uuid in file_info.get('key', ''):
                        eln_filename = file_info['key'].split('/')[-1]
                        break
                
                if eln_filename:
                    # Load the ELN document
                    eln_doc = await self.get_document("submissions", sop_id, eln_filename.replace('.json', ''))
                    
                    if eln_doc and 'form_data' in eln_doc:
                        # Update the file field with final paths
                        if unescaped_field_id in eln_doc['form_data']:
                            file_field_data = eln_doc['form_data'][unescaped_field_id]
                            
                            # Replace the files array with our new structure
                            file_field_data['files'] = file_info_list
                            
                            # Remove the now-obsolete uploadedUrls since we have finalPath
                            if 'uploadedUrls' in file_field_data:
                                del file_field_data['uploadedUrls']
                            
                            # Save the updated ELN document
                            await self._store_document(
                                f"submissions/{sop_id}/{eln_filename}",
                                eln_doc,
                                {}
                            )
                            logger.info(f"Updated ELN {eln_uuid} with final file paths")
                
            except Exception as e:
                logger.error(f"Failed to update ELN with final file paths: {e}")
                # This is critical - if we can't update the ELN, the files are orphaned
                raise StorageError(f"Files were moved but failed to update ELN document: {str(e)}")
        
        return final_urls 