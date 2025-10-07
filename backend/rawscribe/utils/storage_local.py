# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Local Storage Backend Implementations for CLAIRE
Contains local filesystem storage implementations
"""

import os
import json
import logging
import shutil
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone, timedelta
from pathlib import Path
import yaml  # Add yaml import

from .storage_base import BaseJSONStorage, StorageError, StorageNotFoundError, ImmutableStorageError, safe_timestamp_key
from .metadata import DraftMetadata, ELNMetadata
from .file_validation import parse_temp_filename_and_unescape
from .config_types import StorageConfig
from .filename_generator import FilenameGenerationError
from .eln_filename_utils import parse_eln_filename
from . import document_utils

logger = logging.getLogger(__name__)

def _find_project_root() -> Path:
    """Find the project root directory (contains .local/s3/ and Makefile)"""
    current = Path.cwd().resolve()
    
    # Walk up the directory tree looking for project root markers
    # We look for Makefile AND .local/s3/ to ensure we're at the true project root
    for parent in [current] + list(current.parents):
        has_makefile = (parent / 'Makefile').exists()
        has_local_s3 = (parent / '.local' / 's3').exists()
        
        if has_makefile and has_local_s3:
            return parent
    
    # Fallback: just look for .local/s3/
    for parent in [current] + list(current.parents):
        if (parent / '.local' / 's3').exists():
            logger.warning(f"Found .local/s3/ without Makefile at: {parent}")
            return parent
    
    # If still not found, use current directory
    logger.warning(f"Could not find project root, using current directory: {current}")
    return current

class LocalJSONStorage(BaseJSONStorage):
    """Local filesystem JSON document storage"""
    
    def __init__(self, config: StorageConfig, document_type: str = "documents"):
        super().__init__(config, document_type)
        # If local_path is relative, resolve it relative to project root
        # This ensures it works whether running from backend/ or build_mock/
        if config.local_path and not Path(config.local_path).is_absolute():
            project_root = _find_project_root()
            self.base_path = (project_root / config.local_path).resolve()
        else:
            # Absolute path or None - use as-is
            self.base_path = Path(config.local_path or './.local/s3').resolve()
        
        self.base_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Local storage initialized: {self.base_path}, document_type: {document_type}")
    
    async def _perform_storage(self, key: str, content: str, metadata: dict) -> None:
        """Store document locally with bucket simulation"""
        bucket_path = self.base_path / self._get_bucket_name(key)
        file_path = bucket_path / key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, 'w') as f:
            f.write(content)
    
    async def _perform_retrieval(self, key: str) -> str:
        """Retrieve document from local storage"""
        bucket_path = self.base_path / self._get_bucket_name(key)
        file_path = bucket_path / key
        with open(file_path, 'r') as f:
            return f.read()
    
    async def _perform_listing(self, prefix: str, filters: dict) -> List[dict]:
        """List documents in local storage"""
        bucket_path = self.base_path / self._get_bucket_name(prefix)
        prefix_path = bucket_path / prefix
        results = []
        
        logger.debug(f"Listing documents with prefix: {prefix}, bucket_path: ({bucket_path})")
        if prefix_path.exists():
            for file_path in prefix_path.rglob('*.json'):
                stat = file_path.stat()
                relative_path = file_path.relative_to(bucket_path)
                results.append({
                    'key': str(relative_path),
                    'size': stat.st_size,
                    'last_modified': datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                    'etag': None
                })
        
        return results
    
    async def _perform_deletion(self, key: str) -> bool:
        """Delete document from local storage"""
        # Determine bucket based on key content for cross-bucket operations
        bucket_name = self._get_bucket_name(key)
            
        bucket_path = self.base_path / bucket_name
        file_path = bucket_path / key
        if file_path.exists():
            file_path.unlink()
            return True
        return False
    
    async def _perform_head_check(self, key: str) -> None:
        """Check if document exists locally"""
        bucket_path = self.base_path / self._get_bucket_name(key)
        file_path = bucket_path / key
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {key}")
    
    def _is_not_found_error(self, error: Exception) -> bool:
        """Check if error indicates file not found"""
        return isinstance(error, (FileNotFoundError, OSError))

    # Validation method implementations
    async def validate_sop_exists(self, sop_id: str) -> bool:
        """Validate that SOP exists in the forms directory"""
        # SOPs are stored in the forms directory, not in drafts/submissions directories
        # The drafts/submissions directories are created when users save drafts or submit ELNs
        
        # Check for SOP file in forms directory
        # SOPs can be in different formats: .yaml, .yml, or .json
        forms_path = self.base_path / 'forms' / 'sops'
        
        if not forms_path.exists():
            logger.warning(f"Forms directory does not exist: {forms_path}")
            return False
        
        # Try multiple naming conventions:
        # 1. Exact match: {sop_id}.yaml
        # 2. With 'sop' prefix: sop{sop_id}.yaml  
        # 3. Case-insensitive match
        
        # First try exact match and common variations
        for name_variation in [sop_id, f'sop{sop_id}']:
            for ext in ['.yaml', '.yml', '.json']:
                sop_file = forms_path / f'{name_variation}{ext}'
                if sop_file.exists():
                    logger.info(f"Found SOP file: {sop_file}")
                    return True
        
        # If exact matches fail, do case-insensitive search
        sop_id_lower = sop_id.lower()
        for file_path in forms_path.iterdir():
            if not file_path.is_file():
                continue
            
            # Check if it's a valid SOP file
            if not (file_path.suffix in ['.yaml', '.yml', '.json']):
                continue
            
            # Extract filename without extension
            filename = file_path.stem
            
            # Check if this matches our SOP ID (case-insensitive)
            # Handle both "Test4" matching "sopTest4" and "Test4" matching "test4"
            if (filename.lower() == sop_id_lower or 
                filename.lower() == f'sop{sop_id_lower}' or
                filename.lower().endswith(sop_id_lower)):
                logger.info(f"Found SOP file (case-insensitive match): {file_path}")
                return True
        
        logger.warning(f"SOP '{sop_id}' not found in forms directory: {forms_path}")
        return False

    async def validate_eln_exists(self, sop_id: str, eln_uuid: str) -> bool:
        """Validate that ELN exists under submissions/<sop_id>/"""
        submissions_path = self.base_path / 'eln' / 'submissions' / sop_id
        if not submissions_path.exists():
            return False
        
        # Look for ELN file with the UUID in the filename
        for file_path in submissions_path.iterdir():
            if file_path.is_file() and eln_uuid in file_path.name:
                return True
        return False

    async def validate_temp_files_exist(self, sop_id: str, file_ids: List[str], user_id: str, field_id: str) -> List[str]:
        """Validate temp files exist and return missing file IDs"""
        missing_files = []
        # Files are stored in the attachments subdirectory
        temp_dir = self.base_path / 'eln-drafts' / 'drafts' / sop_id / 'attachments'
        
        if not temp_dir.exists():
            return file_ids  # All missing if directory doesn't exist
        
        for file_id in file_ids:
            # Look for temp files with this file_id in the filename
            found = False
            for file_path in temp_dir.iterdir():
                if file_path.is_file() and file_id in file_path.name:
                    # Verify the file belongs to the correct user and field
                    if user_id in file_path.name and field_id in file_path.name:
                        found = True
                        break
            
            if not found:
                missing_files.append(file_id)
        
        return missing_files

    async def load_eln_for_validation(self, sop_id: str, eln_uuid: str) -> Dict[str, Any]:
        """Load ELN document for field validation"""
        submissions_path = self.base_path / 'eln' / 'submissions' / sop_id
        
        if not submissions_path.exists():
            raise StorageNotFoundError(f"SOP submissions directory not found: {sop_id}")
        
        # Find ELN file with the UUID
        for file_path in submissions_path.iterdir():
            if file_path.is_file() and eln_uuid in file_path.name:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        return json.load(f)
                except (json.JSONDecodeError, IOError) as e:
                    raise StorageError(f"Failed to load ELN document: {e}")
        
        raise StorageNotFoundError(f"ELN not found: {eln_uuid} in SOP {sop_id}")

    # xxx NO NO NO do NOT fallback to a hard-coded bucket name: this is a catastrophic failure and security risk if you do that
    async def _copy_file(self, source_key: str, dest_key: str) -> None:
        """Copy file from source to destination"""
        # Determine buckets based on key content:
        # - If source key starts with "drafts/", it's from the drafts bucket
        # - If dest key starts with "submissions/", it's to the submissions bucket
        source_bucket = self._get_bucket_name(source_key)
        dest_bucket = self._get_bucket_name(dest_key)
        
        source_path = self.base_path / source_bucket / source_key
        dest_path = self.base_path / dest_bucket / dest_key
        
        # Ensure destination directory exists
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Copy file
        import shutil
        shutil.copy2(str(source_path), str(dest_path))

    async def _list_files(self, prefix: str) -> List[str]:
        """List actual files (not JSON documents) matching prefix"""
        bucket_path = self.base_path / self._get_bucket_name(prefix)
        
        # Handle the path parts
        prefix_parts = prefix.split('/')
        search_dir = bucket_path
        for part in prefix_parts[:-1]:  # All but the last part
            search_dir = search_dir / part
        
        filename_prefix = prefix_parts[-1] if prefix_parts else ""
        
        if not search_dir.exists():
            return []
        
        matching_files = []
        for file_path in search_dir.iterdir():
            if file_path.is_file() and file_path.name.startswith(filename_prefix):
                # Return the full key relative to bucket
                relative_path = file_path.relative_to(bucket_path)
                matching_files.append(str(relative_path))
        
        return matching_files

    async def _list_files_in_bucket(self, prefix: str, bucket_name_property: str) -> List[str]:
        """List actual files in a different bucket based on bucket_name_property"""
        # Get the bucket name for the specified document type
        bucket_name = getattr(self.config, bucket_name_property, None)
        if bucket_name is None:
            raise StorageError(f"{bucket_name_property} must be configured in storage config")
            
        bucket_path = self.base_path / bucket_name
        
        # Handle the path parts
        prefix_parts = prefix.split('/')
        search_dir = bucket_path
        for part in prefix_parts[:-1]:  # All but the last part
            search_dir = search_dir / part
        
        filename_prefix = prefix_parts[-1] if prefix_parts else ""
        
        if not search_dir.exists():
            return []
        
        matching_files = []
        for file_path in search_dir.iterdir():
            if file_path.is_file() and file_path.name.startswith(filename_prefix):
                # Return the full key relative to bucket
                relative_path = file_path.relative_to(bucket_path)
                matching_files.append(str(relative_path))
        
        return matching_files

    async def store_temp_file(self, file_id: str, file, user_id: str, field_id: str, sop_id: str) -> str:
        """Store temporary file for drafts"""
        bucket_path = self.base_path / self._get_bucket_name("drafts/")
        attachments_dir = bucket_path / "drafts" / sop_id / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # Create temp filename with escaped field_id (following 5.1 format)
        temp_filename = f"{user_id}-{field_id}-{file_id}-{file.filename}"
        file_path = attachments_dir / temp_filename
        
        # Save file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Return relative path for URL construction
        relative_path = f"drafts/{sop_id}/attachments/{temp_filename}"
        logger.info(f"Stored temp file: {relative_path}")
        return relative_path





