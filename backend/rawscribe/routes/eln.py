# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
ELN API Routes
RESTful endpoints for final ELN submission, retrieval, and management
Handles only final ELNs (status=final) - drafts are handled by drafts.py
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional, Tuple
import logging
from datetime import datetime

from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_base import StorageError, StorageNotFoundError, ImmutableStorageError
from rawscribe.utils.metadata import ELNMetadata, DraftMetadata
from rawscribe.utils.config_loader import ConfigLoader
from rawscribe.utils.auth import get_current_user, get_current_user_or_default, User
from rawscribe.utils.eln_access_control import eln_access_control
from rawscribe.utils.rbac_enforcement import require_submit_permission, require_view_permission, filter_viewable_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/elns", tags=["ELN"])

# Pydantic models for request/response
class ELNSubmissionRequest(BaseModel):
    """Request model for final ELN submission"""
    sop_id: str = Field(..., description="SOP identifier")
    form_data: Dict[str, Any] = Field(..., description="Form data submitted by user")
    field_definitions: List[Dict[str, Any]] = Field(..., description="Field definitions with schema")
    sop_metadata: Dict[str, Any] = Field(..., description="SOP metadata including version")
    filename_variables: List[str] = Field(..., description="Pre-extracted filename variables in order")
    field_ids: Optional[List[str]] = Field(default_factory=list, description="Field IDs for fallback when variables are empty")

class UnifiedELNResponse(BaseModel):
    """Unified response model for ELN operations"""
    eln_uuid: Optional[str] = Field(None, description="Unique ELN identifier (for final ELNs)")
    draft_id: Optional[str] = Field(None, description="Draft identifier (for drafts) - filename minus .json")
    draft_uuid: Optional[str] = Field(None, description="Draft UUID (for drafts)")
    filename: str = Field(..., description="Generated filename")
    sop_id: str = Field(..., description="SOP identifier")
    user_id: str = Field(..., description="User identifier")
    status: str = Field(..., description="ELN status (draft or final)")
    timestamp: datetime = Field(..., description="Submission timestamp")
    size_bytes: int = Field(..., description="ELN size in bytes")
    checksum: Optional[str] = Field(None, description="ELN checksum (final only)")
    variables: List[str] = Field(default_factory=list, description="Filename variables")

    @classmethod
    def from_eln_metadata(cls, metadata: ELNMetadata, filename: str) -> 'UnifiedELNResponse':
        """Create UnifiedELNResponse from ELNMetadata"""
        return cls(
            eln_uuid=metadata.eln_uuid,
            filename=filename,
            sop_id=metadata.sop_id,
            user_id=metadata.user_id,
            status=metadata.status,
            timestamp=metadata.timestamp,
            size_bytes=metadata.size_bytes,
            checksum=metadata.checksum,
            variables=metadata.variables
        )

class ELNListResponse(BaseModel):
    """Response model for ELN list operations"""
    elns: List[UnifiedELNResponse]
    total: int
    page: int
    page_size: int

# Dependency injection
async def get_storage_manager() -> StorageManager:
    config_loader = ConfigLoader()
    storage_config_dict = config_loader.get_storage_config()
    
    # Ensure all bucket names are configured for deployed environments
    import os
    if 'FORMS_BUCKET' in os.environ:
        storage_config_dict['forms_bucket_name'] = os.environ['FORMS_BUCKET']
    if 'DRAFTS_BUCKET' in os.environ:
        storage_config_dict['draft_bucket_name'] = os.environ['DRAFTS_BUCKET']
    if 'ELN_BUCKET' in os.environ:
        storage_config_dict['eln_bucket_name'] = os.environ['ELN_BUCKET']
    
    # Convert dictionary to StorageConfig object
    from rawscribe.utils.config_types import StorageConfig
    storage_config = StorageConfig(**storage_config_dict)
    
    manager = StorageManager(storage_config)
    return manager

@router.post("/submit", response_model=UnifiedELNResponse)
async def submit_eln(
    request: ELNSubmissionRequest,
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Submit final ELN
    
    - **sop_id**: SOP identifier
    - **form_data**: Form data submitted by user
    - **field_definitions**: Field definitions with schema
    - **sop_metadata**: SOP metadata including version
    - **filename_variables**: Pre-extracted filename variables
    
    Returns generated filename and metadata
    """
    try:
        # Check submit permission using functional approach
        require_submit_permission(current_user, request.sop_id)
        
        user_id = current_user.username
        
        # Handle final ELN submission
        _, metadata = await storage.save_document(
            document_type="submissions",
            sop_id=request.sop_id,
            user_id=user_id,
            status="final",
            filename_variables=request.filename_variables,
            data=request.form_data,
            field_definitions=request.field_definitions,
            sop_metadata=request.sop_metadata
        )
        
        # Use factory method to create response from metadata
        return UnifiedELNResponse.from_eln_metadata(metadata, metadata.filename)
        
    except ImmutableStorageError as e:
        logger.error(f"Immutable storage violation: {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except StorageError as e:
        logger.error(f"Storage error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/list", response_model=ELNListResponse)
async def list_elns(
    sop_id: str = Query(..., description="SOP identifier"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    filename_variables: Optional[str] = Query(None, description="Filter by filename variables (comma-separated)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    List final ELNs only
    
    - **sop_id**: SOP identifier (required)
    - **user_id**: Filter by user (optional)
    - **filename_variables**: Filter by variables like project,patient (optional)
    - **page**: Page number for pagination
    - **page_size**: Items per page
    
    Returns paginated list of ELNs filtered by user permissions
    """
    logger.debug(f"list_elns: current_user={current_user}")
    logger.debug(f"list_elns: sop_id={sop_id}")

    try:
        # Get SOP template to check ELN access configuration
        sop = await storage.get_document("sops", sop_id, "")
        logger.debug(f"list_elns: sop={sop}")
    except StorageNotFoundError:
        logger.error(f"No SOP found for sop_id: {sop_id}")
        raise HTTPException(status_code=404, detail="SOP not found")

    try:        
        # Parse filename variables if provided
        parsed_variables = None
        if filename_variables:
            parsed_variables = [v.strip() for v in filename_variables.split(',')]
        
        # ELN list endpoint should ONLY list final ELNs (not drafts)
        # Drafts have their own separate endpoint at /api/v1/drafts/
        logger.debug("Fetching ELNs...")
        try:
            final_elns = await storage.list_documents(
                document_type="submissions",
                sop_id=sop_id,
                metadata_class=ELNMetadata,
                user_id=user_id,
                status="final"
            )
            logger.debug(f"Found {len(final_elns)} final ELNs")
            
            all_elns = []
            for i, eln in enumerate(final_elns):
                logger.debug(f"Processing ELN {i}: {eln.filename}")
                try:
                    # Apply filename variable filter if provided
                    if parsed_variables:
                        if not all(i < len(eln.variables) and eln.variables[i] == var 
                                  for i, var in enumerate(parsed_variables)):
                            continue
                    
                    unified_eln = UnifiedELNResponse.from_eln_metadata(eln, eln.filename)
                    all_elns.append(unified_eln)
                    logger.debug(f"Successfully added ELN {i} to response")
                except Exception as e:
                    logger.error(f"Error processing ELN {i} ({eln.filename}): {e}")
                    raise

        except StorageNotFoundError:
            logger.error(f"No final ELNs found for sop_id: {sop_id}")
            raise HTTPException(status_code=404, detail="No final ELNs found")

        except Exception as e:
            logger.error(f"Error fetching final ELNs: {e}")
            raise
        
        # xxx TODO: check if the user has access to the ELN
        # Filter ELNs based on user access permissions
        accessible_elns = all_elns
        # accessible_elns = eln_access_control.filter_accessible_elns(
        #     user=current_user,
        #     elns=all_elns,
        #     sop=sop
        # )
        
        # No need to sort - storage backend already sorts by timestamp (newest first)
        
        # Apply pagination
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_elns = accessible_elns[start_idx:end_idx]
        
        return ELNListResponse(
            elns=paginated_elns,
            total=len(accessible_elns),
            page=page,
            page_size=page_size
        )
        
    except HTTPException:
        # Re-raise HTTPExceptions (like 404 SOP not found) without modification
        raise
    except StorageError as e:
        logger.error(f"Storage error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        import traceback
        error_details = f"Unexpected error: {str(e)}\nTraceback: {traceback.format_exc()}"
        logger.error(error_details)
        raise HTTPException(status_code=500, detail=f"Debug: {str(e)}")

@router.get("/{identifier}", response_model=Dict[str, Any])
async def get_eln(
    identifier: str,
    sop_id: Optional[str] = Query(None, description="SOP ID hint for faster lookup"),
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Get specific final ELN by UUID or filename(?)
    
    - **identifier**: Draft ID (full file basename) or ELN UUID (8-char)
    - **sop_id**: SOP ID hint for faster lookup (optional)
    
    Returns complete ELN data
    """
    # If sop_id not provided, DO NOT search all SOPs (expensive operation)
    if not sop_id:
        logger.debug(f"SOP ID not provided, not searching all SOPs, too expensive")
        raise HTTPException(
            status_code=400, 
            detail="SOP ID required for efficient lookup. Use /list endpoint to find SOP ID first."
        )
    
    try:
        current_user_id = current_user.username
        # xxx TODO: check if the user has access to the ELN
        
        # Try to get as final ELN by UUID
        try:
            # try to get as a final ELN with the ELN filename as the identifier
            eln_data = await storage.get_document("submissions", sop_id, identifier)
            if eln_data is not None:
                return {
                    "type": "final",
                    "data": eln_data,
                    "metadata": eln_data.get("metadata", {})
                }
        except StorageNotFoundError:
            pass

        # If we get here, the ELN was not found
        logger.debug(f"ELN not found: {identifier}")
        raise HTTPException(status_code=404, detail=f"ELN not found: {identifier}")
        
    except StorageError as e:
        logger.error(f"Storage error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/prerequisites/{sop_id}")
async def get_prerequisite_elns(
    sop_id: str,
    field_filters: str = Query(..., description="Field filters as JSON string"),
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Query prerequisite ELNs for field imports
    
    - **sop_id**: SOP identifier
    - **field_filters**: JSON string of field filters
    
    Returns matching ELNs for import
    """
    try:
        import json
        filters = json.loads(field_filters)
        
        matching_elns = await storage.query_prerequisite_elns(sop_id, filters)
        
        results = []
        for eln_data, metadata in matching_elns:
            results.append({
                "eln_uuid": metadata.eln_uuid,
                "filename": metadata.filename,
                "user_id": metadata.user_id,
                "timestamp": metadata.timestamp.isoformat(),
                "form_data": eln_data.get("form_data", {}),
                "variables": metadata.variables
            })
        
        return {"prerequisites": results}
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in field_filters")
    except StorageError as e:
        logger.error(f"Storage error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") 
