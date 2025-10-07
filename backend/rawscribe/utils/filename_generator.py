# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Filename Generator for Regulatory-Compliant ELN Storage
Generates filenames with pattern: {status}-{username}-{var1}-{var2}-{timestamp}-{uuid}.json
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional
import logging

from .eln_filename_utils import FilenameGenerationError
from .schema_utils import normalize_filename_value

logger = logging.getLogger(__name__)

class UUIDCollisionError(FilenameGenerationError):
    """Exception raised when UUID collision detection fails"""
    pass

class FilenameGenerator:
    """Generate regulatory-compliant filenames for ELN storage"""
    
    def __init__(self, max_uuid_retries: int = 10):
        """
        Initialize filename generator
        
        Args:
            max_uuid_retries: Maximum number of attempts to generate unique UUID
        """
        self.max_uuid_retries = max_uuid_retries
    
    def generate_filename(
        self,
        status: str,
        username: str,
        filename_variables: List[str],
        field_ids: Optional[List[str]] = None,
        existing_checker: Optional[callable] = None
    ) -> str:
        """
        Generate regulatory-compliant filename
        
        Args:
            status: 'draft' or 'final'
            username: User identifier from auth context
            filename_variables: Pre-extracted filename variables in order
            existing_checker: Function to check if filename already exists
            
        Returns:
            Generated filename
            
        Raises:
            FilenameGenerationError: If filename generation fails
            UUIDCollisionError: If UUID collision cannot be resolved
        """
        # Validate status
        if status not in ['draft', 'final']:
            raise FilenameGenerationError(f"Invalid status: {status}")
        
        # Process filename variables with field_ids fallback
        filename_vars = []
        field_ids = field_ids or []
        
        # Use field_ids as fallback when filename_variables are empty
        for i, var in enumerate(filename_variables):
            if var and var.strip():  # Non-empty variable
                normalized_var = normalize_filename_value(var)
                filename_vars.append(normalized_var)
            elif i < len(field_ids):  # Use field_id as fallback
                fallback_id = normalize_filename_value(field_ids[i])
                logger.debug(f"Using field_id fallback: {field_ids[i]} -> {fallback_id}")
                filename_vars.append(fallback_id)
            else:  # No fallback available
                filename_vars.append("empty")
        
        logger.debug(f"Processed filename variables: {filename_vars}")
        
        # Normalize username
        normalized_username = normalize_filename_value(username)
        
        # Generate timestamp
        timestamp = self._generate_timestamp()
        
        # Generate unique UUID
        unique_uuid = self._generate_unique_uuid(
            status, normalized_username, filename_vars, timestamp, existing_checker
        )
        
        # Construct filename
        filename_parts = [status, normalized_username] + filename_vars + [timestamp, unique_uuid]
        filename = "-".join(filename_parts) + ".json"
        
        logger.info(f"Generated filename: {filename}")
        return filename

    def generate_temp_file_id(self, existing_checker: Optional[callable] = None) -> str:
        """
        Generate unique 8-character ID for temporary file uploads
        
        Args:
            existing_checker: Optional function to check if ID already exists
            
        Returns:
            Unique 8-character file ID without dashes
        """
        def collision_checker(file_id: str) -> bool:
            """Check if file_id collides with existing files"""
            return existing_checker(file_id) if existing_checker else False
        
        return self._generate_8char_uuid(
            collision_checker=collision_checker,
            collision_context="temp file ID",
            success_message_template="Generated unique temp file ID: {uuid} (attempt {attempt})",
            error_message="Unable to generate unique temp file ID after {max_retries} attempts"
        )
    
    def _generate_8char_uuid(
        self,
        collision_checker: callable,
        collision_context: str,
        success_message_template: str,
        error_message: str
    ) -> str:
        """
        Generate unique 8-character UUID with collision detection
        
        Args:
            collision_checker: Function that returns True if there's a collision
            collision_context: Description of what's being generated (for logging)
            success_message_template: Template for success log message with {uuid} and {attempt} placeholders
            error_message: Error message template with {max_retries} placeholder
            
        Returns:
            Unique 8-character UUID
            
        Raises:
            UUIDCollisionError: If unable to generate unique UUID
        """
        for attempt in range(self.max_uuid_retries):
            # Generate 8-character UUID without dashes
            full_uuid = str(uuid.uuid4()).replace('-', '')
            short_uuid = full_uuid[:8]
            
            # Check for collision
            if not collision_checker(short_uuid):
                if attempt == 0:
                    logger.debug(f"Generated {collision_context}: {short_uuid}")
                else:
                    logger.debug(success_message_template.format(uuid=short_uuid, attempt=attempt + 1))
                return short_uuid
            
            logger.warning(f"{collision_context.capitalize()} collision detected: {short_uuid} (attempt {attempt + 1})")
        
        raise UUIDCollisionError(error_message.format(max_retries=self.max_uuid_retries))
    
    def _generate_timestamp(self) -> str:
        """
        Generate timestamp in YYYYMMDD_HHMMSS format
        
        Returns:
            Formatted timestamp string
        """
        now = datetime.now(timezone.utc)
        return now.strftime("%Y%m%d_%H%M%S")
    
    def _generate_unique_uuid(
        self,
        status: str,
        username: str,
        filename_vars: List[str],
        timestamp: str,
        existing_checker: Optional[callable] = None
    ) -> str:
        """
        Generate unique 8-character UUID with collision detection
        
        Args:
            status: File status
            username: Normalized username
            filename_vars: List of filename variables
            timestamp: Generated timestamp
            existing_checker: Function to check if filename exists
            
        Returns:
            Unique 8-character UUID
            
        Raises:
            UUIDCollisionError: If unable to generate unique UUID
        """
        def collision_checker(short_uuid: str) -> bool:
            """Check if filename with this UUID collides with existing files"""
            if existing_checker is None:
                return False
            
            test_filename_parts = [status, username] + filename_vars + [timestamp, short_uuid]
            test_filename = "-".join(test_filename_parts) + ".json"
            return existing_checker(test_filename)
        
        return self._generate_8char_uuid(
            collision_checker=collision_checker,
            collision_context="UUID",
            success_message_template="Generated unique UUID: {uuid} (attempt {attempt})",
            error_message="Unable to generate unique UUID after {max_retries} attempts"
        ) 