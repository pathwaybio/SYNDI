# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Schema Utilities for ELN Storage
Handles parsing SOP schemas to extract filename variables and normalize values
"""

import re
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)

def extract_filename_variables(
    form_data: Dict[str, Any], 
    sop_fields: List[Dict[str, Any]]
) -> List[str]:
    """
    Extract variables for filename from form data based on schema
    
    Args:
        form_data: Form data submitted by user
        sop_fields: SOP field definitions from schema
        
    Returns:
        List of normalized filename variables
    """
    filename_vars = []
    
    # Find fields that should be included in filename
    filename_fields = _find_filename_fields(sop_fields)
    
    # Sort by filename order
    filename_fields.sort(key=lambda x: _get_filename_order(x))
    
    # Extract values
    for field in filename_fields:
        field_id = field.get('id', '')
        value = form_data.get(field_id, '')
        
        # Convert value to string and normalize
        str_value = str(value) if value is not None else ''
        normalized = normalize_filename_value(str_value)
        
        # Use placeholder if empty
        if not normalized:
            normalized = 'empty'
        
        filename_vars.append(normalized)
    
    logger.debug(f"Extracted filename variables: {filename_vars}")
    return filename_vars

def _find_filename_fields(sop_fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Find fields that should be included in filename
    
    Args:
        sop_fields: SOP field definitions from schema
        
    Returns:
        List of fields with filename components
    """
    filename_fields = []
    
    def check_field_recursive(field_or_task: Dict[str, Any]):
        """Recursively check fields and their children"""
        # Check if this field has filename component configuration
        # Schema-agnostic approach: look for 'type' property to identify fields
        if field_or_task.get('type'):  # Field has 'type' property
            children = field_or_task.get('children', [])
            for child in children:
                # Look for filename component configuration objects
                # Schema-agnostic: check for filename_component property, not schema names
                if (child.get('filename_component', False) and 
                    isinstance(child.get('order'), int)):
                    filename_fields.append({
                        **field_or_task,
                        'filename_order': child.get('order', 0)
                    })
                    break
        
        # Recursively check children
        children = field_or_task.get('children', [])
        for child in children:
            check_field_recursive(child)
    
    # Check all top-level fields and tasks
    for item in sop_fields:
        check_field_recursive(item)
    
    return filename_fields

def _get_filename_order(field: Dict[str, Any]) -> int:
    """Get filename order for field, default to 0"""
    return field.get('filename_order', 0)

def normalize_filename_value(value: str) -> str:
    """
    Normalize value for use in filename
    
    Args:
        value: Raw value to normalize
        
    Returns:
        Normalized value safe for filenames
    """
    if not value:
        return ''
    
    # Convert to string and strip whitespace
    normalized = str(value).strip()
    
    # Replace spaces and special characters with underscores (including hyphens per user requirement)
    normalized = re.sub(r'[^\w._]', '_', normalized)
    # Convert hyphens to underscores for filename component parsing
    normalized = normalized.replace('-', '_')
    
    # Remove multiple consecutive underscores
    normalized = re.sub(r'_+', '_', normalized)
    
    # Remove leading/trailing underscores
    normalized = normalized.strip('_')
    
    # Limit length to 50 characters
    normalized = normalized[:50]
    
    return normalized.lower() 