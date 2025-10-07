# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
SOP API Routes
RESTful endpoints for SOP listing, loading, and management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, List, Any, Optional
import logging
import os
import yaml
import json
from pathlib import Path

from rawscribe.utils.config_loader import ConfigLoader
from rawscribe.utils.auth import get_current_user_or_default
from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_base import StorageError, StorageNotFoundError
from rawscribe.utils.config_types import StorageConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sops", tags=["SOPs"])

# Pydantic models
class SOPMetadata(BaseModel):
    """Metadata for a SOP"""
    model_config = ConfigDict(populate_by_name=True)
    
    id: str
    name: str
    title: Optional[str] = None
    version: Optional[str] = None
    author: Optional[str] = None
    date_published: Optional[str] = Field(None, alias="date-published")
    description: Optional[str] = None
    keywords: List[str] = []
    filename: Optional[str] = None

class SOPListResponse(BaseModel):
    """Response for listing SOPs"""
    sops: List[SOPMetadata]
    total: int

class SOPLoadResponse(BaseModel):
    """Response for loading a single SOP"""
    sop: Dict[str, Any]
    metadata: SOPMetadata

# Dependency to get storage manager
async def get_storage_manager(request: Request) -> StorageManager:
    """Get storage manager from app state or create one"""
    if not hasattr(request.app.state, 'storage_manager'):
        # Create storage manager
        config_loader = ConfigLoader()
        storage_dict = config_loader.get_storage_config()
        
        # Ensure all bucket names are configured for deployed environments
        if 'FORMS_BUCKET' in os.environ:
            storage_dict['forms_bucket_name'] = os.environ['FORMS_BUCKET']
        if 'DRAFTS_BUCKET' in os.environ:
            storage_dict['draft_bucket_name'] = os.environ['DRAFTS_BUCKET']
        if 'ELN_BUCKET' in os.environ:
            storage_dict['eln_bucket_name'] = os.environ['ELN_BUCKET']
        
        # Convert to StorageConfig
        from rawscribe.utils.config_types import StorageConfig
        storage_config = StorageConfig(**storage_dict)
        
        storage_manager = StorageManager(storage_config)
        request.app.state.storage_manager = storage_manager
    
    return request.app.state.storage_manager

@router.get("/list", response_model=SOPListResponse)
async def list_sops(
    current_user = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    List all available SOPs with metadata
    
    Returns list of SOPs with basic metadata for display
    """
    try:
        sops = []
        
        # Check if we're in S3 mode (deployed) or local mode
        if storage.config.type == 's3':
            # S3 mode - use boto3 directly since StorageManager doesn't have a list_sops method
            import boto3
            from botocore.exceptions import ClientError
            
            s3 = boto3.client('s3')
            bucket = storage.config.forms_bucket_name or os.environ.get('FORMS_BUCKET')
            
            if not bucket:
                logger.error("No forms bucket configured for S3 storage")
                return SOPListResponse(sops=[], total=0)
            
            prefix = 'forms/sops/'
            logger.info(f"Listing SOPs from S3: s3://{bucket}/{prefix}")
            
            try:
                response = s3.list_objects_v2(
                    Bucket=bucket,
                    Prefix=prefix
                )
                
                if 'Contents' not in response:
                    logger.warning(f"No SOPs found in s3://{bucket}/{prefix}")
                    return SOPListResponse(sops=[], total=0)
                
                for obj in response['Contents']:
                    key = obj['Key']
                    
                    # Skip directories and non-YAML/JSON files
                    if key.endswith('/') or not (key.endswith('.yaml') or key.endswith('.yml') or key.endswith('.json')):
                        continue
                    
                    try:
                        # Download and parse the file
                        file_obj = s3.get_object(Bucket=bucket, Key=key)
                        content = file_obj['Body'].read().decode('utf-8')
                        
                        # Parse based on file type
                        filename = key.split('/')[-1]
                        if filename.endswith('.json'):
                            sop_data = json.loads(content)
                        else:  # YAML
                            sop_data = yaml.safe_load(content)
                        
                        # Extract metadata
                        metadata = SOPMetadata(
                            id=sop_data.get('id', Path(filename).stem),
                            name=sop_data.get('name', sop_data.get('title', Path(filename).stem)),
                            title=sop_data.get('title', sop_data.get('name', Path(filename).stem)),
                            version=sop_data.get('version', '1.0.0'),
                            author=sop_data.get('author'),
                            date_published=sop_data.get('date-published'),
                            description=sop_data.get('description'),
                            keywords=sop_data.get('keywords', []),
                            filename=filename
                        )
                        sops.append(metadata)
                        logger.info(f"Loaded SOP from S3: {metadata.name}")
                        
                    except Exception as e:
                        logger.error(f"Error loading SOP from S3 {key}: {e}")
                        continue
                        
            except ClientError as e:
                logger.error(f"S3 error listing SOPs: {e}")
                return SOPListResponse(sops=[], total=0)
        
        else:
            # Local filesystem mode - use storage config to get the correct path
            from rawscribe.utils.storage_local import _find_project_root
            project_root = _find_project_root()
            sops_path = project_root / storage.config.local_path / 'forms' / 'sops'
            logger.debug(f"Listing SOPs from filesystem: {sops_path}")
            
            if not sops_path.exists():
                logger.warning(f"SOPs directory does not exist: {sops_path}")
                return SOPListResponse(sops=[], total=0)
            
            # Scan for YAML and JSON files
            for file_path in sops_path.glob("*.yaml"):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        sop_data = yaml.safe_load(f)
                    
                    # Extract metadata
                    metadata = SOPMetadata(
                        id=sop_data.get('id', file_path.stem),
                        name=sop_data.get('name', sop_data.get('title', file_path.stem)),
                        title=sop_data.get('title', sop_data.get('name', file_path.stem)),
                        version=sop_data.get('version', '1.0.0'),
                        author=sop_data.get('author'),
                        date_published=sop_data.get('date-published'),
                        description=sop_data.get('description'),
                        keywords=sop_data.get('keywords', []),
                        filename=file_path.name
                    )
                    sops.append(metadata)
                    
                except Exception as e:
                    logger.error(f"Error loading SOP metadata from {file_path}: {e}")
                    continue
            
            for file_path in sops_path.glob("*.json"):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        sop_data = json.load(f)
                    
                    # Extract metadata
                    metadata = SOPMetadata(
                        id=sop_data.get('id', file_path.stem),
                        name=sop_data.get('name', sop_data.get('title', file_path.stem)),
                        title=sop_data.get('title', sop_data.get('name', file_path.stem)),
                        version=sop_data.get('version', '1.0.0'),
                        author=sop_data.get('author'),
                        date_published=sop_data.get('date-published'),
                        description=sop_data.get('description'),
                        keywords=sop_data.get('keywords', []),
                        filename=file_path.name
                    )
                    sops.append(metadata)
                    
                except Exception as e:
                    logger.error(f"Error loading SOP metadata from {file_path}: {e}")
                    continue
        
        return SOPListResponse(sops=sops, total=len(sops))
        
    except Exception as e:
        logger.error(f"Error listing SOPs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list SOPs: {str(e)}")

@router.get("/{sop_id}", response_model=SOPLoadResponse)
async def load_sop(
    sop_id: str,
    current_user = Depends(get_current_user_or_default),
    storage: StorageManager = Depends(get_storage_manager)
):
    """
    Load a specific SOP by ID
    
    - **sop_id**: SOP identifier (filename without extension)
    
    Returns complete SOP schema and metadata
    """
    try:
        # Check if we're in S3 mode (deployed) or local mode
        if storage.config.type == 's3':
            # S3 mode
            import boto3
            from botocore.exceptions import ClientError
            
            s3 = boto3.client('s3')
            bucket = storage.config.forms_bucket_name or os.environ.get('FORMS_BUCKET')
            
            if not bucket:
                raise HTTPException(status_code=500, detail="No forms bucket configured")
            
            prefix = 'forms/sops/'
            logger.info(f"Loading SOP from S3: {sop_id}")
            
            # Try different file extensions
            sop_data = None
            filename = None
            for ext in ['.yaml', '.yml', '.json']:
                key = f"{prefix}sop{sop_id}{ext}"
                
                try:
                    file_obj = s3.get_object(Bucket=bucket, Key=key)
                    content = file_obj['Body'].read().decode('utf-8')
                    
                    # Parse based on file type
                    if ext == '.json':
                        sop_data = json.loads(content)
                    else:  # YAML
                        sop_data = yaml.safe_load(content)
                    
                    filename = f"sop{sop_id}{ext}"
                    logger.info(f"Found SOP in S3: {key}")
                    break
                    
                except ClientError as e:
                    if e.response['Error']['Code'] == 'NoSuchKey':
                        continue
                    raise
            
            if not sop_data:
                raise HTTPException(status_code=404, detail=f"SOP not found: {sop_id}")
        
        else:
            # Filesystem mode - use storage config to get the correct path
            from rawscribe.utils.storage_local import _find_project_root
            project_root = _find_project_root()
            sops_path = project_root / storage.config.local_path / 'forms' / 'sops'
            logger.debug(f"Loading SOP from filesystem: {sops_path}")
            
            # Try to find the SOP file
            sop_file = None
            for ext in ['.yaml', '.yml', '.json']:
                potential_file = sops_path / f"sop{sop_id}{ext}"
                if potential_file.exists():
                    sop_file = potential_file
                    break
            
            if not sop_file:
                raise HTTPException(status_code=404, detail=f"SOP not found: {sop_id}")
            
            # Load SOP data
            with open(sop_file, 'r', encoding='utf-8') as f:
                if sop_file.suffix in ['.yaml', '.yml']:
                    sop_data = yaml.safe_load(f)
                else:
                    sop_data = json.load(f)
            
            filename = sop_file.name
        
        # Extract metadata
        metadata = SOPMetadata(
            id=sop_data.get('id', sop_id),
            name=sop_data.get('name', sop_data.get('title', sop_id)),
            title=sop_data.get('title', sop_data.get('name', sop_id)),
            version=sop_data.get('version', '1.0.0'),
            author=sop_data.get('author'),
            date_published=sop_data.get('date-published'),
            description=sop_data.get('description'),
            keywords=sop_data.get('keywords', []),
            filename=filename
        )
        
        return SOPLoadResponse(sop=sop_data, metadata=metadata)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading SOP {sop_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load SOP: {str(e)}")