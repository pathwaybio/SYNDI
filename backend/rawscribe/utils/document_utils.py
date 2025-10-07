# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Document utilities for ELN Storage
Functional utilities for document preparation and filename handling
"""

import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from .eln_filename_utils import parse_eln_filename
from .filename_generator import FilenameGenerator


def generate_timestamp() -> datetime:
    """Generate UTC timestamp for documents"""
    return datetime.now(timezone.utc)


def calculate_document_size(data: Dict[str, Any]) -> int:
    """Calculate document size in bytes"""
    return len(json.dumps(data).encode('utf-8'))


def extract_uuid_from_filename(filename: str) -> str:
    """Extract UUID from ELN filename"""
    parsed = parse_eln_filename(filename)
    return parsed['uuid']


def generate_filename_and_uuid(
    status: str,
    user_id: str,
    filename_variables: List[str],
    field_ids: Optional[List[str]] = None
) -> tuple[str, str]:
    """
    Generate filename and extract UUID in one operation
    
    Returns:
        tuple: (filename, uuid)
    """
    filename_generator = FilenameGenerator()
    filename = filename_generator.generate_filename(
        status=status,
        username=user_id,
        filename_variables=filename_variables,
        field_ids=field_ids
    )
    
    uuid = extract_uuid_from_filename(filename)
    return filename, uuid


def prepare_document(
    document_uuid: str,
    filename: str,
    sop_id: str,
    user_id: str,
    status: str,
    timestamp: datetime,
    data: Dict[str, Any],
    is_draft: bool = False,
    # Draft-specific params
    session_id: Optional[str] = None,
    # ELN-specific params  
    sop_metadata: Optional[Dict[str, Any]] = None,
    field_definitions: Optional[List[Dict[str, Any]]] = None,
    checksum: Optional[str] = None,
    draft_uuid: Optional[str] = None,
    draft_id: Optional[str] = None
) -> Dict[str, Any]:
    """Prepare document with standard structure - handles both drafts and ELNs"""
    
    # Base document structure common to both drafts and ELNs
    prepared_document = {
        'draft_id': draft_id or '',
        'draft_uuid': draft_uuid or '',
        'filename': filename,
        'sop_id': sop_id,
        'user_id': user_id,
        'timestamp': timestamp.isoformat(),
        'form_data': data,
        'status': status,
    }

    if is_draft:
        # Draft-specific fields
        prepared_document.update({
            'draft_id': filename[:-5] if filename.endswith('.json') else filename,  # Remove .json extension
            'draft_uuid': document_uuid,
            'session_id': session_id or 'default'
        })
    else:
        # ELN-specific fields with LD-JSON compliance
        prepared_document.update({
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            'eln_uuid': document_uuid,
            'sop_metadata': sop_metadata or {},
            'field_definitions': field_definitions or [],
            'checksum': checksum or ''
        })

    return prepared_document

def generate_session_id(timestamp: datetime) -> str:
    """Generate session ID from timestamp"""
    return f"session-{int(timestamp.timestamp())}"


def calculate_checksum(data: Dict[str, Any]) -> str:
    """Calculate SHA256 checksum for data integrity"""
    content = json.dumps(data, sort_keys=True).encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def serialize_document(data: Dict[str, Any]) -> str:
    """Serialize document data to JSON string"""
    return json.dumps(data, sort_keys=True)


def deserialize_document(json_str: str) -> Dict[str, Any]:
    """Deserialize JSON string to document data"""
    return json.loads(json_str)


def safe_timestamp_key(item):
    """
    Safely extract timestamp for sorting, handling both timezone-aware and timezone-naive datetimes.
    
    Args:
        item: Object with a timestamp attribute (DraftMetadata or ELNMetadata)
        
    Returns:
        datetime: Timezone-aware datetime for safe comparison
    """
    ts = item.timestamp
    # If timezone-naive, assume UTC
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts


def process_temp_filename(temp_filename: str) -> str:
    """Process temp filename and return final filename"""
    from .file_validation import parse_temp_filename_and_unescape
    return parse_temp_filename_and_unescape(temp_filename) 