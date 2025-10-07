# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
File Upload API Routes for CLAIRE
Handles file uploads for ELN attachments
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import logging
import os
from datetime import datetime, timezone

from rawscribe.utils.auth import get_current_user_or_default, User
from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_base import StorageError
from rawscribe.utils.config_loader import ConfigLoader
from rawscribe.utils.filename_generator import FilenameGenerator
from rawscribe.utils.file_validation import file_validator, FileValidationError, escape_field_id, unescape_field_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])

class FileUploadResponse(BaseModel):
    uploaded_urls: List[str]
    file_ids: List[str]
    metadata: dict

class AttachFilesRequest(BaseModel):
    eln_uuid: str
    field_id: str
    file_ids: List[str]
    sop_id: str

class AttachFilesResponse(BaseModel):
    success: bool
    final_urls: List[str]

# Dependency to get storage manager
async def get_storage_manager(request: Request) -> StorageManager:
    """Get storage manager from app state"""
    if not hasattr(request.app.state, 'storage_manager'):
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

@router.post("/upload", response_model=FileUploadResponse)
async def upload_files(
    field_id: str = Form(...),
    sop_id: str = Form(...),
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Upload files for ELN attachment with comprehensive security validation
    
    Files are validated for type, size, and content security before being stored 
    in a temporary location. They will be moved to the final ELN location when 
    the ELN is submitted.
    """
    try:
        user_id = current_user.username if current_user else "unknown"
        
        # Validate all files first (fail fast)
        try:
            validated_files = await file_validator.validate_upload_batch(files)
        except FileValidationError as e:
            logger.warning(f"File validation failed for user {user_id}: {e.message}")
            # Return structured error response for frontend
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": "FILE_VALIDATION_FAILED",
                    "error_code": e.error_code,
                    "message": e.message,
                    "details": e.details,
                    "user_message": e.message  # User-friendly message for display
                }
            )
        
        uploaded_urls = []
        file_ids = []
        validated_metadata = []
        
        # Escape field_id to handle hyphens in filename
        escaped_field_id = escape_field_id(field_id)
        
        metadata = {
                            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "field_id": field_id,  # Store original field_id in metadata
            "escaped_field_id": escaped_field_id,  # Store escaped version too
            "sop_id": sop_id,
            "file_count": len(files),
            "validation_passed": True
        }

        # Create filename generator for consistent UUID generation
        filename_generator = FilenameGenerator()
        
        for file, detected_mime, sanitized_filename in validated_files:
            # Generate unique file ID using the same logic as ELN filenames
            file_id = filename_generator.generate_temp_file_id()
            file_ids.append(file_id)
            
            # Get file size efficiently without reading the entire file again
            # The file.size attribute is available from the UploadFile object
            file_size = file.size if hasattr(file, 'size') and file.size is not None else 0
            
            # CRITICAL: Reset file pointer to beginning after validation reads
            # Without this, we may read from middle of file or get corrupted data
            await file.seek(0)
            
            # Store file in temporary location using escaped field_id
            file_url = await storage.store_temp_file(
                file_id=file_id,
                file=file,
                user_id=user_id,
                field_id=escaped_field_id,  # Use escaped field_id for filename
                sop_id=sop_id
            )
            
            uploaded_urls.append(file_url)
            
            # Store validation metadata for each file
            validated_metadata.append({
                "file_id": file_id,
                "original_filename": file.filename,
                "sanitized_filename": sanitized_filename,
                "detected_mime": detected_mime,
                "file_size": file_size
            })
            
            logger.info(f"File uploaded and validated: {sanitized_filename} (MIME: {detected_mime}) -> {file_id} by user {user_id} for SOP {sop_id}")

        # Add file-specific metadata
        metadata["files"] = validated_metadata

        return FileUploadResponse(
            uploaded_urls=uploaded_urls,
            file_ids=file_ids,
            metadata=metadata
        )

    except HTTPException:
        # Re-raise HTTP exceptions (validation errors)
        raise
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/attach-to-eln", response_model=AttachFilesResponse)
async def attach_files_to_eln(
    request: AttachFilesRequest,
    current_user: User = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Move uploaded files from temporary storage to final ELN location
    
    This is called AFTER the ELN has been submitted and recorded to permanent storage
    in order to permanently attach the files.
    The field_id needs to be escaped to match the filename format used during upload.
    Includes comprehensive validation of SOP, ELN, fields, and file access.
    """
    try:
        user_id = current_user.username if current_user else "unknown"
        
        # Input sanitization
        if not request.eln_uuid or not request.sop_id or not request.field_id:
            raise HTTPException(
                status_code=400, 
                detail="Missing required fields: eln_uuid, sop_id, and field_id are required"
            )
        
        if not request.file_ids or len(request.file_ids) == 0:
            raise HTTPException(
                status_code=400,
                detail="At least one file_id is required"
            )
        
        # Escape field_id to match the filename format used during upload
        escaped_field_id = escape_field_id(request.field_id)
        
        logger.info(f"Validating attach files request: ELN={request.eln_uuid}, SOP={request.sop_id}, Field={request.field_id}, Files={len(request.file_ids)}")
        
        # Comprehensive validation
        validation_result = await storage.validate_attach_files_request(
            eln_uuid=request.eln_uuid,
            field_id=escaped_field_id,  # Use escaped field_id for validation
            file_ids=request.file_ids,
            user_id=user_id,
            sop_id=request.sop_id
        )
        
        if not validation_result["valid"]:
            errors = validation_result["errors"]
            details = validation_result["details"]
            
            # Map validation errors to appropriate HTTP responses
            if "sop_not_found" in errors:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "sop_not_found",
                        "message": f"SOP '{request.sop_id}' not found",
                        "details": "SOP must exist in both drafts and submissions locations"
                    }
                )
            
            if "eln_not_found" in errors:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "eln_not_found", 
                        "message": f"ELN '{request.eln_uuid}' not found in SOP '{request.sop_id}'",
                        "details": details.get("eln_uuid", "ELN not found in submissions directory")
                    }
                )
            
            if "eln_load_failed" in errors or "eln_corrupted" in errors:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "error": "eln_corrupted",
                        "message": "ELN document is corrupted or unreadable",
                        "details": details.get("eln_load_error", "Failed to load ELN document")
                    }
                )
            
            if "field_not_found" in errors:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "invalid_field",
                        "message": f"Field '{request.field_id}' is not valid for this ELN",
                        "details": details.get("field_id", "Field not found or does not support file attachments")
                    }
                )
            
            if "files_not_found" in errors:
                missing_files = details.get("missing_files", [])
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "files_not_found",
                        "message": f"{len(missing_files)} file(s) not found or inaccessible",
                        "details": {
                            "missing_files": missing_files,
                            "help": f"Ensure files were uploaded for field '{request.field_id}' by user '{user_id}'"
                        }
                    }
                )
            
            # Generic validation error
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "validation_failed",
                    "message": "Request validation failed",
                    "details": details.get("unexpected_error", "Unknown validation error")
                }
            )
        
        # Validation passed - proceed with file attachment
        logger.info(f"Validation passed, attaching {len(request.file_ids)} files to ELN {request.eln_uuid}")
        
        # Move files from temp storage to ELN storage
        # Use escaped field_id for finding temp files, but original field_id for final ELN storage
        final_urls = await storage.attach_files_to_eln(
            eln_uuid=request.eln_uuid,
            field_id=escaped_field_id,  # Use escaped for finding temp files
            file_ids=request.file_ids,
            user_id=user_id,
            sop_id=request.sop_id
        )
        
        logger.info(f"Files successfully attached to ELN {request.eln_uuid}: {len(request.file_ids)} files (field_id: {request.field_id} -> escaped: {escaped_field_id})")
        
        return AttachFilesResponse(success=True, final_urls=final_urls)

    except HTTPException:
        # Re-raise HTTP exceptions (our structured errors)
        raise
    except Exception as e:
        # Catch any unexpected errors
        logger.error(f"Unexpected error in file attachment: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail={
                "error": "internal_error",
                "message": "An unexpected error occurred during file attachment",
                "details": "Please check server logs for more information"
            }
        ) 