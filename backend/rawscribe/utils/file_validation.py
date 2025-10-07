# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
File Upload Validation and Security Controls for CLAIRE
Provides comprehensive validation for uploaded files including type, size, and content checks
"""

import mimetypes
import logging
from typing import Set, Optional, Tuple, List
from fastapi import UploadFile, HTTPException
from pathlib import Path
import hashlib

# Optional magic import for better MIME detection
try:
    import magic
    HAS_MAGIC = True
except ImportError:
    magic = None
    HAS_MAGIC = False

logger = logging.getLogger(__name__)

class FileValidationError(Exception):
    """Exception raised when file validation fails"""
    def __init__(self, message: str, error_code: str = "VALIDATION_ERROR", details: dict = None):
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

class FileValidator:
    """Comprehensive file validation with security controls"""
    
    # Allowed file extensions (case insensitive)
    ALLOWED_EXTENSIONS: Set[str] = {
        # Documents
        '.pdf', '.doc', '.docx', '.txt', '.rtf',
        # Excel files
        '.xls', '.xlsx', '.xlsm', '.csv',
        # Images  
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg',
        # Archives (for data files)
        '.zip', '.tar', '.gz',
        # Data formats
        '.json', '.xml', '.yaml', '.yml'
    }
    
    # Allowed MIME types with their expected extensions
    ALLOWED_MIME_TYPES: Set[str] = {
        # Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/rtf',
        # Excel
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel.sheet.macroEnabled.12',
        'text/csv',
        # Images
        'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml',
        # Archives
        'application/zip', 'application/x-tar', 'application/gzip',
        # Data
        'application/json', 'application/xml', 'text/yaml', 'text/x-yaml'
    }
    
    # Dangerous extensions that should never be allowed
    DANGEROUS_EXTENSIONS: Set[str] = {
        '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.js', '.jar',
        '.sh', '.bash', '.php', '.asp', '.aspx', '.jsp', '.pl', '.py', '.rb',
        '.msi', '.deb', '.rpm', '.dmg', '.app', '.run'
    }
    
    # File size limits
    MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB per file
    MAX_TOTAL_UPLOAD_SIZE = 100 * 1024 * 1024  # 100MB per upload batch
    MAX_FILES_PER_UPLOAD = 10
    
    def __init__(self):
        """Initialize file validator"""
        # Initialize magic for MIME type detection
        if HAS_MAGIC:
            try:
                self.magic_mime = magic.Magic(mime=True)
            except Exception as e:
                logger.warning(f"Could not initialize python-magic: {e}. MIME detection will use fallback.")
                self.magic_mime = None
        else:
            logger.info("python-magic not available. MIME detection will use filename-based fallback.")
            self.magic_mime = None
    
    async def validate_file(self, file: UploadFile) -> Tuple[str, str]:
        """
        Comprehensive file validation
        
        Returns:
            Tuple[detected_mime_type, sanitized_filename]
            
        Raises:
            FileValidationError: If file fails validation
        """
        # Basic checks
        if not file.filename:
            raise FileValidationError(
                "No filename provided",
                error_code="NO_FILENAME"
            )
        
        # Check file size
        if hasattr(file, 'size') and file.size and file.size > self.MAX_FILE_SIZE:
            size_mb = file.size / (1024 * 1024)
            max_mb = self.MAX_FILE_SIZE / (1024 * 1024)
            raise FileValidationError(
                f"File is too large ({size_mb:.1f} MB). Maximum file size is {max_mb:.0f} MB.",
                error_code="FILE_TOO_LARGE",
                details={
                    "file_size": file.size,
                    "max_size": self.MAX_FILE_SIZE,
                    "filename": file.filename
                }
            )
        
        # Sanitize and validate filename
        sanitized_filename = self._sanitize_filename(file.filename)
        file_ext = Path(sanitized_filename).suffix.lower()
        
        # Check for dangerous extensions FIRST (priority check)
        if file_ext in self.DANGEROUS_EXTENSIONS:
            raise FileValidationError(
                f"File type '{file_ext}' is not allowed for security reasons.",
                error_code="DANGEROUS_FILE_TYPE",
                details={
                    "extension": file_ext,
                    "filename": file.filename
                }
            )
        
        # Check if extension is allowed
        if file_ext not in self.ALLOWED_EXTENSIONS:
            allowed_list = ', '.join(sorted(self.ALLOWED_EXTENSIONS))
            raise FileValidationError(
                f"File type '{file_ext}' is not supported. Supported types: {allowed_list}",
                error_code="UNSUPPORTED_FILE_TYPE",
                details={
                    "extension": file_ext,
                    "filename": file.filename,
                    "allowed_extensions": sorted(self.ALLOWED_EXTENSIONS)
                }
            )
        
        # Read file content for MIME validation
        file_content = await file.read()
        await file.seek(0)  # Reset file pointer
        
        # Validate file size from actual content
        actual_size = len(file_content)
        if actual_size > self.MAX_FILE_SIZE:
            size_mb = actual_size / (1024 * 1024)
            max_mb = self.MAX_FILE_SIZE / (1024 * 1024)
            raise FileValidationError(
                f"File is too large ({size_mb:.1f} MB). Maximum file size is {max_mb:.0f} MB.",
                error_code="FILE_TOO_LARGE",
                details={
                    "file_size": actual_size,
                    "max_size": self.MAX_FILE_SIZE,
                    "filename": file.filename
                }
            )
        
        if actual_size == 0:
            raise FileValidationError(
                "File is empty. Please select a valid file.",
                error_code="EMPTY_FILE",
                details={"filename": file.filename}
            )
        
        # Additional security checks FIRST (before MIME validation)
        self._check_file_content_security(file_content, file_ext)
        
        # Detect MIME type
        detected_mime = self._detect_mime_type(file_content, sanitized_filename)
        
        # Validate MIME type
        if detected_mime not in self.ALLOWED_MIME_TYPES:
            # Allow some common variations
            if not self._is_acceptable_mime_variant(detected_mime, file_ext):
                raise FileValidationError(
                    f"File type mismatch: '{file.filename}' appears to be {detected_mime}, but has extension {file_ext}. Please ensure the file is valid.",
                    error_code="MIME_TYPE_MISMATCH",
                    details={
                        "detected_mime": detected_mime,
                        "extension": file_ext,
                        "filename": file.filename
                    }
                )
        
        logger.info(f"File validation passed: {sanitized_filename} ({detected_mime}, {actual_size} bytes)")
        return detected_mime, sanitized_filename
    
    async def validate_upload_batch(self, files: List[UploadFile]) -> List[Tuple[UploadFile, str, str]]:
        """
        Validate a batch of file uploads
        
        Returns:
            List of (file, detected_mime, sanitized_filename) tuples
        """
        if len(files) > self.MAX_FILES_PER_UPLOAD:
            raise FileValidationError(
                f"Too many files selected ({len(files)}). Maximum {self.MAX_FILES_PER_UPLOAD} files per upload.",
                error_code="TOO_MANY_FILES",
                details={
                    "file_count": len(files),
                    "max_files": self.MAX_FILES_PER_UPLOAD
                }
            )
        
        validated_files = []
        total_size = 0
        
        for file in files:
            detected_mime, sanitized_filename = await self.validate_file(file)
            
            # Check total upload size
            file_size = len(await file.read())
            await file.seek(0)  # Reset file pointer
            
            total_size += file_size
            if total_size > self.MAX_TOTAL_UPLOAD_SIZE:
                total_mb = total_size / (1024 * 1024)
                max_mb = self.MAX_TOTAL_UPLOAD_SIZE / (1024 * 1024)
                raise FileValidationError(
                    f"Total upload size too large ({total_mb:.1f} MB). Maximum total upload size is {max_mb:.0f} MB.",
                    error_code="TOTAL_SIZE_TOO_LARGE",
                    details={
                        "total_size": total_size,
                        "max_total_size": self.MAX_TOTAL_UPLOAD_SIZE,
                        "file_count": len(files)
                    }
                )
            
            validated_files.append((file, detected_mime, sanitized_filename))
        
        return validated_files
    
    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename to prevent path traversal and other attacks"""
        # Remove path components
        filename = Path(filename).name
        
        # Remove dangerous characters
        dangerous_chars = ['<', '>', ':', '"', '|', '?', '*', '\0']
        for char in dangerous_chars:
            filename = filename.replace(char, '_')
        
        # Limit length
        if len(filename) > 255:
            name, ext = Path(filename).stem, Path(filename).suffix
            filename = name[:255-len(ext)] + ext
        
        # Ensure it's not empty or just dots
        if not filename or filename in ['.', '..']:
            filename = 'unnamed_file.bin'
        
        return filename
    
    def _detect_mime_type(self, content: bytes, filename: str) -> str:
        """Detect MIME type using multiple methods"""
        # Try python-magic first (most accurate)
        if self.magic_mime:
            try:
                detected = self.magic_mime.from_buffer(content)
                if detected and detected != 'application/octet-stream':
                    return detected
            except Exception as e:
                logger.warning(f"Magic MIME detection failed: {e}")
        
        # Fallback to mimetypes based on extension
        guessed_type, _ = mimetypes.guess_type(filename)
        if guessed_type:
            return guessed_type
        
        # Default fallback
        return 'application/octet-stream'
    
    def _is_acceptable_mime_variant(self, mime_type: str, file_ext: str) -> bool:
        """Check if MIME type is an acceptable variant for the file extension"""
        # Common variations that are acceptable
        acceptable_variants = {
            '.txt': ['text/plain', 'application/octet-stream'],
            '.csv': ['text/csv', 'text/plain', 'application/csv'],
            '.json': ['application/json', 'text/plain'],
            '.xml': ['application/xml', 'text/xml', 'text/plain'],
            '.yaml': ['text/yaml', 'text/x-yaml', 'text/plain'],
            '.yml': ['text/yaml', 'text/x-yaml', 'text/plain']
        }
        
        return mime_type in acceptable_variants.get(file_ext, [])
    
    def _check_file_content_security(self, content: bytes, file_ext: str) -> None:
        """Additional security checks on file content"""
        # Check for executable signatures
        executable_signatures = [
            b'MZ',  # PE executable
            b'\x7fELF',  # ELF executable
            b'\xfe\xed\xfa',  # Mach-O
            b'#!/bin/',  # Shell script
            b'<?php',  # PHP script
        ]
        
        content_start = content[:1024].lower()  # Check first 1KB
        
        for sig in executable_signatures:
            if sig.lower() in content_start:
                raise FileValidationError(
                    "File contains executable content and cannot be uploaded for security reasons.",
                    error_code="EXECUTABLE_CONTENT",
                    details={"extension": file_ext}
                )
        
        # Check for suspicious patterns in text files
        if file_ext in ['.txt', '.csv', '.json', '.xml', '.yaml', '.yml']:
            self._check_text_content_security(content)
    
    def _check_text_content_security(self, content: bytes) -> None:
        """Security checks for text-based files"""
        try:
            text_content = content.decode('utf-8', errors='ignore').lower()
            
            # Check for script injection patterns
            suspicious_patterns = [
                '<script', '</script>', 'javascript:', 'vbscript:',
                'onload=', 'onerror=', 'onclick=', 'eval(',
                'document.cookie', 'document.write'
            ]
            
            for pattern in suspicious_patterns:
                if pattern in text_content:
                    raise FileValidationError(
                        f"File contains potentially unsafe content and cannot be uploaded for security reasons.",
                        error_code="SUSPICIOUS_CONTENT",
                        details={"pattern": pattern}
                    )
                    
        except UnicodeDecodeError:
            # If it's not valid UTF-8, it might be binary content in a text file
            pass

# Global validator instance
file_validator = FileValidator()

def escape_field_id(field_id: str) -> str:
    """
    Escape hyphens in field IDs for filename storage
    Replaces '-' with '__HYPHEN__' to avoid delimiter conflicts
    """
    return field_id.replace('-', '__HYPHEN__')

def unescape_field_id(escaped_field_id: str) -> str:
    """
    Unescape field IDs from filename storage
    Replaces '__HYPHEN__' back to '-'
    """
    return escaped_field_id.replace('__HYPHEN__', '-')

def parse_temp_filename_and_unescape(temp_filename: str) -> str:
    """
    Parse temporary filename and reconstruct with unescaped field_id
    
    Args:
        temp_filename: Filename in format {username}-{escaped_field_id}-{uuid}-{original-filename}.{ext}
        
    Returns:
        Final filename with unescaped field_id: {username}-{original_field_id}-{uuid}-{original-filename}.{ext}
        
    If parsing fails, returns the original filename unchanged.
    """
    try:
        # Split filename to extract components
        parts = temp_filename.split('-', 3)  # Split into max 4 parts
        if len(parts) >= 4:
            username = parts[0]
            escaped_field_id = parts[1]
            file_uuid = parts[2]
            original_filename_with_ext = parts[3]
            
            # Unescape field_id for final filename
            original_field_id = unescape_field_id(escaped_field_id)
            
            # Reconstruct final filename with unescaped field_id
            final_filename = f"{username}-{original_field_id}-{file_uuid}-{original_filename_with_ext}"
            
            logger.debug(f"Parsed temp filename: {temp_filename} -> {final_filename} (field_id: {escaped_field_id} -> {original_field_id})")
            return final_filename
        else:
            # Fallback: use original filename if parsing fails
            logger.warning(f"Could not parse temp filename (insufficient parts): {temp_filename}, using as-is")
            return temp_filename
    except Exception as e:
        logger.warning(f"Error parsing temp filename {temp_filename}: {e}, using as-is")
        return temp_filename 