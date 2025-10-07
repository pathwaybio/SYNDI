# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
ELN Filename Utilities for ELN Storage
Handles parsing and validation of regulatory-compliant ELN filenames
"""

import re
from typing import Dict
import logging

logger = logging.getLogger(__name__)

class FilenameGenerationError(Exception):
    """Base exception for filename generation errors"""
    pass

def parse_eln_filename(filename: str) -> Dict[str, str]:
    """
    Parse ELN filename back into components
    
    Args:
        filename: ELN filename to parse (format: {status}-{username}-{var1}-{var2}-{timestamp}-{uuid}.json)
        
    Returns:
        Dictionary with filename components
        
    Raises:
        FilenameGenerationError: If filename format is invalid
    """
    # Remove .json extension
    if not filename.endswith('.json'):
        raise FilenameGenerationError(f"Invalid filename extension: {filename}")
    
    base_name = filename[:-5]  # Remove .json
    
    # Split into parts
    parts = base_name.split('-')
    
    if len(parts) < 4:
        raise FilenameGenerationError(f"Invalid filename format: {filename}")
    
    # Extract components
    status = parts[0]
    username = parts[1]
    timestamp = parts[-2]
    uuid_part = parts[-1]
    
    # Variables are everything between username and timestamp
    variables = parts[2:-2] if len(parts) > 4 else []
    
    return {
        'status': status,
        'username': username,
        'variables': variables,
        'timestamp': timestamp,
        'uuid': uuid_part,
        'full_filename': filename
    }

def validate_eln_filename_format(filename: str) -> bool:
    """
    Validate ELN filename format
    
    Args:
        filename: ELN filename to validate
        
    Returns:
        True if format is valid, False otherwise
    """
    try:
        parsed = parse_eln_filename(filename)
        
        # Validate status
        if parsed['status'] not in ['draft', 'final']:
            return False
        
        # Validate timestamp format
        timestamp = parsed['timestamp']
        if not re.match(r'^\d{8}_\d{6}$', timestamp):
            return False
        
        # Validate UUID format
        uuid_part = parsed['uuid']
        if not re.match(r'^[a-f0-9]{8}$', uuid_part):
            return False
        
        return True
        
    except FilenameGenerationError:
        return False
 