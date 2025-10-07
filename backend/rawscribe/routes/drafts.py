# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Draft API Routes for CLAIRE
Handles draft storage operations with authentication and user scoping
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, status, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict
import logging
from datetime import datetime, timezone

from rawscribe.utils.auth import get_current_user_or_default, get_auth_validator, User, AuthValidator
from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_base import StorageError, StorageNotFoundError
from rawscribe.utils.metadata import DraftMetadata
from rawscribe.utils.config_loader import ConfigLoader
from rawscribe.utils.rbac_enforcement import require_draft_permission, filter_viewable_data

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/drafts", tags=["drafts"])

# Pydantic models for API
class DraftCreateRequest(BaseModel):
    """Request model for creating/updating drafts"""
    sop_id: str = Field(..., description="SOP identifier")
    session_id: str = Field(..., description="User session identifier")
    data: Dict[str, Any] = Field(..., description="Form data to save")
    completion_percentage: Optional[float] = Field(0.0, description="Completion percentage (0-100)")
    title: Optional[str] = Field(None, description="Optional title for the draft")
    filename_variables: List[str] = Field(default_factory=list, description="Extracted filename variables from form data")
    field_ids: List[str] = Field(default_factory=list, description="Field IDs corresponding to filename variables")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sop_id": "test-sop-1",
                "session_id": "session-123",
                "data": {"field1": "value1", "field2": "value2"},
                "completion_percentage": 75.0,
                "title": "My Draft",
                "filename_variables": ["P1", "PT1"],
                "field_ids": ["ProjectId", "PatientId"]
            }
        }
    )

class DraftResponse(BaseModel):
    """Response model for draft operations"""
    draft_id: str
    sop_id: str
    session_id: str
    timestamp: datetime
    completion_percentage: float
    title: Optional[str] = None
    size_bytes: int

class DraftDataResponse(BaseModel):
    """Response model for draft data"""
    draft_id: str
    form_data: Dict[str, Any]
    metadata: DraftResponse

class DraftsListResponse(BaseModel):
    """Response model for listing drafts"""
    drafts: List[DraftResponse]
    total_count: int

class DeleteResponse(BaseModel):
    """Response model for delete operations"""
    success: bool
    message: str

class CleanupResponse(BaseModel):
    """Response model for cleanup operations"""
    deleted_count: int
    message: str

# Dependency to get storage manager
async def get_storage_manager(request: Request) -> StorageManager:
    """Get storage manager from app state"""
    if not hasattr(request.app.state, 'storage_manager'):
        # Create a mock config loader for development
        from rawscribe.utils.config_types import StorageConfig
        import os
        
        # Load config from the proper source
        config_loader = ConfigLoader()
        loaded_config = config_loader.load_config()
        storage_dict = loaded_config['lambda']['storage']
        
        # Ensure all bucket names are configured for deployed environments
        if 'FORMS_BUCKET' in os.environ:
            storage_dict['forms_bucket_name'] = os.environ['FORMS_BUCKET']
        if 'DRAFTS_BUCKET' in os.environ:
            storage_dict['draft_bucket_name'] = os.environ['DRAFTS_BUCKET']
        if 'ELN_BUCKET' in os.environ:
            storage_dict['eln_bucket_name'] = os.environ['ELN_BUCKET']
        
        # Convert dict to StorageConfig object
        from rawscribe.utils.config_types import StorageConfig
        storage_config = StorageConfig(**storage_dict)
        
        storage_manager = StorageManager(storage_config)
        request.app.state.storage_manager = storage_manager
    
    return request.app.state.storage_manager

@router.post("/", response_model=DraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    draft_request: DraftCreateRequest,
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Create a new draft
    
    Creates a new draft for the authenticated user with the provided data.
    """
    try:
        # Check draft creation permission using functional approach
        require_draft_permission(current_user, "create")
        # Create metadata using factory method
        metadata = DraftMetadata.create(
            sop_id=draft_request.sop_id,
            user_id=current_user.id,
            data=draft_request.data,
            # Draft-specific parameters
            draft_id="",
            session_id=draft_request.session_id,
            completion_percentage=draft_request.completion_percentage or 0.0,
            title=draft_request.title
        )

        # Prepare filename variables for proper filename generation
        filename_variables = draft_request.filename_variables or []
        field_ids = draft_request.field_ids or []
        
        # Log filename components for debugging
        logger.info(f"Creating draft with filename components: variables={filename_variables}, field_ids={field_ids}")
        
        # Save draft with proper filename variables
        draft_id, metadata = await storage.save_document(
            document_type="drafts",
            sop_id=draft_request.sop_id,
            user_id=current_user.id,
            status='draft',
            filename_variables=filename_variables,
            data=draft_request.data,
            session_id=draft_request.session_id,
            field_ids=field_ids,
            completion_percentage=draft_request.completion_percentage or 0.0,
            title=draft_request.title
        )

        logger.info(f"Draft created: {draft_id} for user {current_user.id}")

        return DraftResponse(
            draft_id=draft_id,
            sop_id=draft_request.sop_id,
            session_id=draft_request.session_id,
            timestamp=metadata.timestamp,
            completion_percentage=metadata.completion_percentage,
            title=metadata.title,
            size_bytes=metadata.size_bytes
        )

    except StorageError as e:
        logger.error(f"Storage error creating draft: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save draft: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error creating draft: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get("/{draft_id}", response_model=DraftDataResponse)
async def get_draft(
    draft_id: str,
    sop_id: str = Query(..., description="SOP ID that contains this draft"),
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager),
    auth_validator: AuthValidator = Depends(get_auth_validator)
):
    """
    Get draft data by ID
    
    Retrieves the full draft data for the specified draft ID.
    Requires sop_id as a query parameter for efficient lookup.
    Only the owner can access their drafts.
    """
    try:
        auth_required = auth_validator.auth_config.get('required', True)
        
        # Load draft document directly - much more efficient!
        draft_document = await storage.get_document("drafts", sop_id, draft_id)
        logger.debug(f"*** Draft document: {draft_document}")

        # Auth check: verify user can access this draft (when auth is enabled)
        if auth_required:
            document_user_id = draft_document.get('user_id')
            if document_user_id != current_user.id:
                logger.warning(f"Access denied: user {current_user.id} tried to access draft owned by {document_user_id}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: you can only access your own drafts"
                )
        
        # Extract data and metadata from the loaded document
        form_data = draft_document.get('form_data', {})
        logger.debug(f"***Form data: {form_data}")
        
        # Build metadata from document fields
        from datetime import datetime
        metadata = DraftResponse(
            draft_id=draft_document.get('draft_id', draft_id),
            sop_id=draft_document.get('sop_id', sop_id),
            session_id=draft_document.get('session_id', ''),
            timestamp=datetime.fromisoformat(draft_document.get('timestamp', datetime.now(timezone.utc).isoformat())),
            completion_percentage=draft_document.get('completion_percentage', 0.0),
            title=draft_document.get('title', f'Draft {draft_id}'),
            size_bytes=draft_document.get('size_bytes', len(str(draft_document).encode()))
        )

        return DraftDataResponse(
            draft_id=draft_id,
            form_data=form_data,
            metadata=metadata
        )

    except StorageNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found"
        )
    except StorageError as e:
        logger.error(f"Storage error loading draft {draft_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load draft"
        )
    except Exception as e:
        logger.error(f"Unexpected error loading draft {draft_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get("/", response_model=DraftsListResponse)
async def list_drafts(
    sop_id: Optional[str] = None,
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager),
    auth_validator: AuthValidator = Depends(get_auth_validator)
):
    """
    List drafts for the current user
    
    Returns a list of all drafts owned by the authenticated user.
    Optionally filter by SOP ID.
    """
    try:
        # When auth is disabled, be permissive about draft ownership for LIST operations
        auth_required = auth_validator.auth_config.get('required', True)
        user_filter = None if not auth_required else current_user.id
        
        logger.info(f"Listing drafts for user {current_user.id}, sop_id filter: {sop_id}, auth_required: {auth_required}, user_filter: {user_filter}")
        
        # Get drafts from storage - if no sop_id provided, we need to handle this differently
        if sop_id:
            # List drafts for specific SOP
            drafts = await storage.list_documents(
                document_type="drafts",
                sop_id=sop_id,
                metadata_class=DraftMetadata,
                user_id=user_filter
            )
        else:
            # List drafts for all SOPs - we need to implement this
            logger.warning("Listing drafts without sop_id filter not yet implemented")
            # For now, return empty list if no sop_id specified
            drafts = []

        # Convert to response format
        draft_responses = [
            DraftResponse(
                draft_id=draft.draft_id,
                sop_id=draft.sop_id,
                session_id=draft.session_id,
                timestamp=draft.timestamp,
                completion_percentage=draft.completion_percentage,
                title=draft.title,
                size_bytes=draft.size_bytes
            )
            for draft in drafts
        ]

        return DraftsListResponse(
            drafts=draft_responses,
            total_count=len(draft_responses)
        )

    except StorageError as e:
        logger.error(f"Storage error listing drafts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list drafts"
        )
    except Exception as e:
        logger.error(f"Unexpected error listing drafts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

#
# routes after here work only on mutable documents (drafts)
#
@router.delete("/{draft_id}", response_model=DeleteResponse)
async def delete_draft(
    draft_id: str,
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager),
    auth_validator: AuthValidator = Depends(get_auth_validator)
):
    """
    Delete a draft
    
    Permanently deletes the specified draft.
    Only the owner can delete their drafts.
    """
    try:
        # First get draft metadata to find the SOP ID
        # When auth is disabled, be permissive about draft ownership for delete operations
        auth_required = auth_validator.auth_config.get('required', True)
        user_filter = None if not auth_required else current_user.id
        
        logger.debug(f"Delete draft: auth_required={auth_required}, user_filter={user_filter}")
        
        drafts = await storage.list_documents(
            document_type="drafts",
            sop_id="",  # List all drafts for now
            metadata_class=DraftMetadata,
            user_id=user_filter  # Filter by user only when auth is enabled
        )
        metadata = None
        for draft in drafts:
            if draft.draft_id == draft_id:
                metadata = draft
                break

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Draft not found"
            )

        # Delete draft using correct signature: sop_id and draft_id
        success = await storage.delete_draft(
            sop_id=metadata.sop_id,
            draft_id=draft_id
        )

        if success:
            logger.info(f"Draft deleted: {draft_id} by user {current_user.id}")
            return DeleteResponse(
                success=True,
                message=f"Draft {draft_id} deleted successfully"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Draft not found"
            )

    except StorageError as e:
        logger.error(f"Storage error deleting draft {draft_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete draft"
        )
    except Exception as e:
        logger.error(f"Unexpected error deleting draft {draft_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/cleanup", response_model=CleanupResponse)
async def cleanup_old_drafts(
    retention_days: int = 30,
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Clean up old drafts
    
    Deletes drafts older than the specified number of days.
    Only affects the current user's drafts.
    """
    try:
        # Validate retention_days
        if retention_days < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Retention days must be at least 1"
            )

        # Clean up old drafts
        deleted_count = await storage.cleanup_old_drafts(
            user_id=current_user.id,
            retention_days=retention_days
        )

        logger.info(f"Cleaned up {deleted_count} drafts for user {current_user.id}")

        return CleanupResponse(
            deleted_count=deleted_count,
            message=f"Cleaned up {deleted_count} old drafts (older than {retention_days} days)"
        )

    except StorageError as e:
        logger.error(f"Storage error during cleanup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cleanup drafts"
        )
    except Exception as e:
        logger.error(f"Unexpected error during cleanup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.put("/{draft_id}", response_model=DraftResponse)
async def update_draft(
    draft_id: str,
    draft_request: DraftCreateRequest,
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Update an existing draft
    
    Updates the data for an existing draft. This creates a new version
    with the same session_id but a new timestamp.
    """
    try:
        # Check if draft exists
        try:
            await storage.get_document("drafts", draft_request.sop_id, draft_id)
        except StorageNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Draft not found"
            )

        # Create metadata for update using factory method
        metadata = DraftMetadata.create(
            sop_id=draft_request.sop_id,
            user_id=current_user.id,
            data=draft_request.data,
            # Draft-specific parameters
            draft_id=draft_id,
            session_id=draft_request.session_id,
            completion_percentage=draft_request.completion_percentage or 0.0,
            title=draft_request.title
        )

        # Save updated draft (this will overwrite the existing one)
        updated_draft_id, updated_metadata = await storage.save_document(
            document_type="drafts",
            sop_id=draft_request.sop_id,
            user_id=current_user.id,
            status='draft',
            filename_variables=draft_request.filename_variables or [],
            data=draft_request.data,
            session_id=draft_request.session_id,
            field_ids=draft_request.field_ids or [],
            completion_percentage=draft_request.completion_percentage or 0.0,
            title=draft_request.title
        )

        logger.info(f"Draft updated: {draft_id} by user {current_user.id}")

        return DraftResponse(
            draft_id=updated_draft_id,
            sop_id=draft_request.sop_id,
            session_id=draft_request.session_id,
            timestamp=updated_metadata.timestamp,
            completion_percentage=updated_metadata.completion_percentage,
            title=updated_metadata.title,
            size_bytes=updated_metadata.size_bytes
        )

    except StorageError as e:
        logger.error(f"Storage error updating draft {draft_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update draft"
        )
    except Exception as e:
        logger.error(f"Unexpected error updating draft {draft_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 