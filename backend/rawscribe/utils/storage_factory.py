# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Storage Factory for CLAIRE
Provides factory pattern for creating storage backends and unified StorageManager interface
"""

import logging
from typing import Optional, Dict, List, Any, Tuple, Type

from .storage_base import StorageError
from .metadata import DraftMetadata, ELNMetadata, BaseMetadata
from .config_types import StorageConfig

logger = logging.getLogger(__name__)

class StorageManager:
    """Storage manager with unified backend"""
    
    def __init__(self, config: StorageConfig):
        self.config = config
        
        # Single unified backend that handles all document types
        self.backend = self._create_backend(config)
    
    def _create_backend(self, config: StorageConfig):
        """Factory method for unified storage backend"""
        backend_type = config.type  # Required field - will raise AttributeError if missing
        if backend_type == 's3':
            from .storage_s3 import S3JSONStorage
            # document_type doesn't matter since get_document takes it as parameter
            return S3JSONStorage(config, document_type="drafts")  # Default to drafts
        elif backend_type == 'local':
            from .storage_local import LocalJSONStorage
            # document_type doesn't matter since get_document takes it as parameter
            return LocalJSONStorage(config, document_type="drafts")  # Default to drafts
        else:
            raise ValueError(f"Unsupported storage backend type: {backend_type}")
    

    async def list_documents(
        self,
        document_type: str,
        sop_id: str,
        metadata_class: Type[BaseMetadata],
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        filename_variables: Optional[List[str]] = None
    ) -> List[BaseMetadata]:
        """Unified method to list documents - delegates to appropriate backend"""
        if document_type == "drafts":
            return await self.backend.list_documents(
                document_type=document_type,
                sop_id=sop_id,
                metadata_class=metadata_class,
                user_id=user_id,
                status=status,
                limit=limit,
                filename_variables=filename_variables
            )
        elif document_type == "submissions":
            return await self.backend.list_documents(
                document_type=document_type,
                sop_id=sop_id,
                metadata_class=metadata_class,
                user_id=user_id,
                status=status,
                limit=limit,
                filename_variables=filename_variables
            )
        else:
            raise ValueError(f"Unknown document type: {document_type}")

    async def get_document(self, document_type: str, sop_id: str, file_basename: str) -> Optional[Dict[str, Any]]:
        """Get document by type - unified interface"""
        # Now we just use the single backend for everything
        return await self.backend.get_document(document_type, sop_id, file_basename)
    
    async def save_document(
        self,
        document_type: str,
        sop_id: str,
        user_id: str,
        filename_variables: List[str],
        data: Dict[str, Any],
        # Optional parameters with defaults
        status: Optional[str] = None,
        session_id: Optional[str] = None,
        field_ids: Optional[List[str]] = None,
        field_definitions: Optional[List[Dict[str, Any]]] = None,
        sop_metadata: Optional[Dict[str, Any]] = None,
        completion_percentage: float = 0.0,
        title: Optional[str] = None,
        # For backward compatibility with DraftMetadata
        metadata: Optional[DraftMetadata] = None
    ) -> Tuple[str, BaseMetadata]:
        """
        Save document using unified interface
        
        For drafts: returns (draft_id, metadata)
        For submissions: returns (eln_uuid, metadata)
        """
        # Determine status based on document type if not provided
        if status is None:
            if document_type == 'drafts':
                status = 'draft'
            elif document_type == 'submissions':
                status = 'final'
            elif document_type == 'sops':
                status = None
            else:
                raise ValueError(f"Unknown document type: {document_type}")

        try:
            if document_type != 'sops':
                # Extract metadata fields if DraftMetadata provided (backward compatibility)
                # xxx Is this really backward compatibility? If yes, can we remove it?
                if metadata:
                    completion_percentage = metadata.completion_percentage
                    title = metadata.title if metadata.title else None
                metadata_class = DraftMetadata if document_type == 'drafts' else ELNMetadata
            else:
                metadata = None
                metadata_class = None

        except Exception as e:
            logger.error(f"Failed to determine metadata class: {e}")
            raise
        
        # For submissions, get the most recent draft UUID and ID
        draft_uuid = None
        draft_id = None
        if document_type == 'submissions':
            try:
                drafts = await self.list_documents(
                    document_type="drafts",
                    sop_id=sop_id,
                    metadata_class=DraftMetadata,
                    user_id=user_id
                )
                if drafts:
                    most_recent_draft = drafts[0]  # list_documents returns newest first
                    draft_uuid = most_recent_draft.draft_uuid
                    draft_id = most_recent_draft.draft_id
                    logger.info(f"Found most recent draft UUID: {draft_uuid}, ID: {draft_id} for user {user_id}, SOP {sop_id}")
                else:
                    logger.info(f"No drafts found for user {user_id}, SOP {sop_id}")
            except Exception as e:
                logger.warning(f"Failed to get current draft UUID for user {user_id}, SOP {sop_id}: {e}")
        
        # Call backend save_document
        return await self.backend.save_document(
            document_type=document_type,
            sop_id=sop_id,
            user_id=user_id,
            status=status,
            filename_variables=filename_variables,
            data=data,
            metadata_class=metadata_class,
            session_id=session_id,
            field_ids=field_ids,
            field_definitions=field_definitions,
            sop_metadata=sop_metadata,
            draft_uuid=draft_uuid,
            draft_id=draft_id,
            completion_percentage=completion_percentage,
            title=title
        )



    async def delete_draft(self, sop_id: str, draft_id: str) -> bool:
        """Delete draft"""
        return await self.backend.delete_draft(sop_id, draft_id)

    async def cleanup_old_drafts(
        self,
        sop_id: str,
        retention_days: int = 30
    ) -> int:
        """Clean up old drafts"""
        return await self.backend.cleanup_old_drafts(sop_id, retention_days)


    async def get_eln_by_uuid(self, eln_uuid: str) -> Tuple[Dict[str, Any], ELNMetadata]:
        """Get ELN by UUID - search across all SOPs for the UUID - EXPENSIVE"""
        return await self.backend.get_eln_by_uuid(eln_uuid)

    async def query_prerequisite_elns(
        self,
        sop_id: str,
        field_filters: Dict[str, Any]
    ) -> List[Tuple[Dict[str, Any], ELNMetadata]]:
        """Query prerequisite ELNs"""
        return await self.backend.query_prerequisite_elns(sop_id, field_filters)

    async def validate_eln_immutability(self, sop_id: str, filename: str) -> bool:
        """Validate ELN immutability"""
        return await self.backend.validate_eln_immutability(sop_id, filename)
    
    # File operations
    async def store_temp_file(
        self,
        file_id: str,
        file,  # UploadFile
        user_id: str,
        field_id: str,
        sop_id: str
    ) -> str:
        """Store file in temporary location"""
        return await self.backend.store_temp_file(file_id, file, user_id, field_id, sop_id)

    async def attach_files_to_eln(
        self,
        eln_uuid: str,
        field_id: str,
        file_ids: List[str],
        user_id: str,
        sop_id: str
    ) -> List[str]:
        """Move files from temp storage to final ELN location"""
        return await self.backend.attach_files_to_eln(eln_uuid, field_id, file_ids, user_id, sop_id)

    # Validation methods for comprehensive error handling
    async def validate_attach_files_request(
        self,
        eln_uuid: str,
        field_id: str,
        file_ids: List[str],
        user_id: str,
        sop_id: str
    ) -> Dict[str, Any]:
        """
        Comprehensive validation for attach_files_to_eln request.
        Returns validation results with detailed error information.
        """
        from .storage_base import ValidationError, FieldValidationError, FileAccessError, StorageNotFoundError
        
        validation_result = {
            "valid": True,
            "errors": [],
            "details": {}
        }
        
        try:
            # 1. Validate SOP exists in both locations
            sop_valid = await self.backend.validate_sop_exists(sop_id)
            if not sop_valid:
                validation_result["valid"] = False
                validation_result["errors"].append("sop_not_found")
                validation_result["details"]["sop_id"] = f"SOP '{sop_id}' not found in required locations"
                return validation_result
            
            # 2. Validate ELN exists
            eln_valid = await self.backend.validate_eln_exists(sop_id, eln_uuid)
            if not eln_valid:
                validation_result["valid"] = False
                validation_result["errors"].append("eln_not_found")
                validation_result["details"]["eln_uuid"] = f"ELN '{eln_uuid}' not found in SOP '{sop_id}'"
                return validation_result
            
            # 3. Load ELN for field validation
            try:
                eln_data = await self.backend.load_eln_for_validation(sop_id, eln_uuid)
                validation_result["details"]["eln_loaded"] = True
            except StorageNotFoundError as e:
                validation_result["valid"] = False
                validation_result["errors"].append("eln_load_failed")
                validation_result["details"]["eln_load_error"] = str(e)
                return validation_result
            except Exception as e:
                validation_result["valid"] = False
                validation_result["errors"].append("eln_corrupted")
                validation_result["details"]["eln_load_error"] = f"ELN document corrupted: {str(e)}"
                return validation_result
            
            # 4. Validate field exists in ELN
            field_valid = await self.backend.validate_field_exists_in_eln(eln_data, field_id)
            if not field_valid:
                validation_result["valid"] = False
                validation_result["errors"].append("field_not_found")
                validation_result["details"]["field_id"] = f"Field '{field_id}' not found in ELN or does not support attachments"
                return validation_result
            
            # 5. Validate temp files exist and belong to user/field
            missing_files = await self.backend.validate_temp_files_exist(sop_id, file_ids, user_id, field_id)
            if missing_files:
                validation_result["valid"] = False
                validation_result["errors"].append("files_not_found")
                validation_result["details"]["missing_files"] = missing_files
                validation_result["details"]["missing_count"] = len(missing_files)
                return validation_result
            
            # All validations passed
            validation_result["details"]["validated_files"] = len(file_ids)
            validation_result["details"]["eln_data_available"] = True
            
        except Exception as e:
            validation_result["valid"] = False
            validation_result["errors"].append("validation_error")
            validation_result["details"]["unexpected_error"] = str(e)
        
        return validation_result

# Factory functions for backward compatibility and easy instantiation
def create_storage_manager(config: StorageConfig) -> StorageManager:
    """Factory function to create a StorageManager"""
    return StorageManager(config) 