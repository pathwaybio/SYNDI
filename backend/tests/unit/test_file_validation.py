# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for file validation and security controls
Tests file upload validation, MIME type detection, and field ID escaping
"""

import pytest
import io
import os
import sys
from unittest.mock import MagicMock, AsyncMock

# Add backend to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from rawscribe.utils.file_validation import (
    FileValidator, 
    FileValidationError, 
    file_validator,
    escape_field_id,
    unescape_field_id,
    parse_temp_filename_and_unescape
)
from fastapi import UploadFile

class TestFileValidator:
    """Test file validation functionality"""

    def test_allowed_extensions(self):
        """Test that allowed extensions are comprehensive"""
        validator = FileValidator()
        
        # Document types
        assert '.pdf' in validator.ALLOWED_EXTENSIONS
        assert '.doc' in validator.ALLOWED_EXTENSIONS
        assert '.docx' in validator.ALLOWED_EXTENSIONS
        assert '.txt' in validator.ALLOWED_EXTENSIONS
        
        # Excel types
        assert '.xls' in validator.ALLOWED_EXTENSIONS
        assert '.xlsx' in validator.ALLOWED_EXTENSIONS
        assert '.csv' in validator.ALLOWED_EXTENSIONS
        
        # Images
        assert '.png' in validator.ALLOWED_EXTENSIONS
        assert '.jpg' in validator.ALLOWED_EXTENSIONS
        assert '.jpeg' in validator.ALLOWED_EXTENSIONS

    def test_dangerous_extensions_blocked(self):
        """Test that dangerous extensions are properly blocked"""
        validator = FileValidator()
        
        dangerous_exts = ['.exe', '.bat', '.sh', '.php', '.js', '.vbs']
        for ext in dangerous_exts:
            assert ext in validator.DANGEROUS_EXTENSIONS

    @pytest.mark.asyncio
    async def test_validate_file_success(self):
        """Test successful file validation"""
        validator = FileValidator()
        
        # Create a mock text file
        content = b"This is a test document content."
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "test_document.txt"
        file_mock.size = len(content)
        file_mock.read = AsyncMock(return_value=content)
        file_mock.seek = AsyncMock()
        
        # Should pass validation
        detected_mime, sanitized_filename = await validator.validate_file(file_mock)
        
        assert sanitized_filename == "test_document.txt"
        assert detected_mime in ['text/plain', 'application/octet-stream']  # Fallback acceptable

    @pytest.mark.asyncio
    async def test_validate_file_dangerous_extension(self):
        """Test that dangerous file extensions are rejected"""
        validator = FileValidator()
        
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "malware.exe"
        file_mock.size = 1000
        
        with pytest.raises(FileValidationError, match="not allowed for security reasons"):
            await validator.validate_file(file_mock)

    @pytest.mark.asyncio
    async def test_validate_file_not_allowed_extension(self):
        """Test that non-allowed file extensions are rejected"""
        validator = FileValidator()
        
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "script.unknown"
        file_mock.size = 1000
        
        with pytest.raises(FileValidationError, match="is not supported"):
            await validator.validate_file(file_mock)

    @pytest.mark.asyncio
    async def test_validate_file_too_large(self):
        """Test that oversized files are rejected"""
        validator = FileValidator()
        
        # Create a file that's too large
        large_content = b"x" * (validator.MAX_FILE_SIZE + 1)
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "large_file.txt"
        file_mock.size = len(large_content)
        file_mock.read = AsyncMock(return_value=large_content)
        
        with pytest.raises(FileValidationError, match="too large"):
            await validator.validate_file(file_mock)

    @pytest.mark.asyncio
    async def test_validate_file_empty(self):
        """Test that empty files are rejected"""
        validator = FileValidator()
        
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "empty.txt"
        file_mock.size = 0
        file_mock.read = AsyncMock(return_value=b"")
        
        with pytest.raises(FileValidationError, match="empty"):
            await validator.validate_file(file_mock)

    @pytest.mark.asyncio
    async def test_validate_file_no_filename(self):
        """Test that files without filename are rejected"""
        validator = FileValidator()
        
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = None
        
        with pytest.raises(FileValidationError, match="No filename provided"):
            await validator.validate_file(file_mock)

    @pytest.mark.asyncio
    async def test_validate_upload_batch_too_many_files(self):
        """Test that too many files in a batch are rejected"""
        validator = FileValidator()
        
        # Create more files than allowed
        files = []
        for i in range(validator.MAX_FILES_PER_UPLOAD + 1):
            file_mock = MagicMock(spec=UploadFile)
            file_mock.filename = f"file_{i}.txt"
            files.append(file_mock)
        
        with pytest.raises(FileValidationError, match="Too many files"):
            await validator.validate_upload_batch(files)

    @pytest.mark.asyncio 
    async def test_security_executable_content_detection(self):
        """Test detection of executable content in files"""
        validator = FileValidator()
        
        # Test PE executable signature
        pe_content = b"MZ\x90\x00\x03\x00\x00\x00" + b"x" * 100
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "document.txt"  # Disguised as text
        file_mock.size = len(pe_content)
        file_mock.read = AsyncMock(return_value=pe_content)
        file_mock.seek = AsyncMock()
        
        with pytest.raises(FileValidationError, match="File contains executable content"):
            await validator.validate_file(file_mock)

    @pytest.mark.asyncio
    async def test_security_script_injection_detection(self):
        """Test detection of script injection in text files"""
        validator = FileValidator()
        
        # Malicious script content
        malicious_content = b"This looks innocent but contains <script>alert('xss')</script> content"
        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "innocent.txt"
        file_mock.size = len(malicious_content)
        file_mock.read = AsyncMock(return_value=malicious_content)
        file_mock.seek = AsyncMock()
        
        with pytest.raises(FileValidationError, match="potentially unsafe content"):
            await validator.validate_file(file_mock)

    def test_filename_sanitization(self):
        """Test filename sanitization"""
        validator = FileValidator()
        
        # Test dangerous characters
        dangerous_filename = 'file<>:"|?*.txt'
        sanitized = validator._sanitize_filename(dangerous_filename)
        assert '<' not in sanitized
        assert '>' not in sanitized
        assert '|' not in sanitized
        
        # Test path traversal
        traversal_filename = '../../etc/passwd'
        sanitized = validator._sanitize_filename(traversal_filename)
        assert '..' not in sanitized
        assert '/' not in sanitized
        
        # Test too long filename
        long_filename = 'x' * 300 + '.txt'
        sanitized = validator._sanitize_filename(long_filename)
        assert len(sanitized) <= 255

class TestFieldIdEscaping:
    """Test field ID escaping and unescaping functionality"""

    def test_escape_field_id_basic(self):
        """Test basic field ID escaping"""
        # Simple field ID without hyphens
        assert escape_field_id("field123") == "field123"
        
        # Field ID with hyphens
        assert escape_field_id("field-123") == "field__HYPHEN__123"
        assert escape_field_id("multi-hyphen-field") == "multi__HYPHEN__hyphen__HYPHEN__field"

    def test_unescape_field_id_basic(self):
        """Test basic field ID unescaping"""
        # No escaping needed
        assert unescape_field_id("field123") == "field123"
        
        # Single hyphen
        assert unescape_field_id("field__HYPHEN__123") == "field-123"
        
        # Multiple hyphens
        assert unescape_field_id("multi__HYPHEN__hyphen__HYPHEN__field") == "multi-hyphen-field"

    def test_escape_unescape_roundtrip(self):
        """Test that escaping and unescaping is reversible"""
        test_field_ids = [
            "simple_field",
            "field-with-hyphens",
            "field-123",
            "complex-field-name-with-many-hyphens",
            "field_1753560250000"  # Typical SOP field ID
        ]
        
        for field_id in test_field_ids:
            escaped = escape_field_id(field_id)
            unescaped = unescape_field_id(escaped)
            assert unescaped == field_id

    def test_filename_parsing_scenario(self):
        """Test realistic filename parsing scenario"""
        # Simulate the filename format: {username}-{escaped_field_id}-{uuid}-{original_filename}.{ext}
        original_field_id = "measurement-results"
        escaped_field_id = escape_field_id(original_field_id)
        
        # Create a realistic filename
        username = "researcher1"
        file_uuid = "abc123def456"
        original_filename = "data.xlsx"
        
        temp_filename = f"{username}-{escaped_field_id}-{file_uuid}-{original_filename}"
        
        # Parse it back (simulating what the storage backend does)
        parts = temp_filename.split('-', 3)
        assert len(parts) == 4
        assert parts[0] == username
        assert parts[1] == escaped_field_id
        assert parts[2] == file_uuid
        assert parts[3] == original_filename
        
        # Unescape field_id
        recovered_field_id = unescape_field_id(parts[1])
        assert recovered_field_id == original_field_id

    def test_parse_temp_filename_and_unescape(self):
        """Test the shared filename parsing utility function"""
        # Test normal case with hyphens in field_id
        original_field_id = "measurement-results"
        escaped_field_id = escape_field_id(original_field_id)
        username = "researcher1" 
        file_uuid = "abc123def456"
        original_filename = "data.xlsx"
        
        temp_filename = f"{username}-{escaped_field_id}-{file_uuid}-{original_filename}"
        expected_final = f"{username}-{original_field_id}-{file_uuid}-{original_filename}"
        
        result = parse_temp_filename_and_unescape(temp_filename)
        assert result == expected_final
        
        # Test case without hyphens in field_id (no escaping needed)
        simple_field_id = "field123"
        temp_filename_simple = f"{username}-{simple_field_id}-{file_uuid}-{original_filename}"
        result_simple = parse_temp_filename_and_unescape(temp_filename_simple)
        assert result_simple == temp_filename_simple  # Should be unchanged
        
        # Test malformed filename (graceful fallback)
        malformed_filename = "not-enough-parts"
        result_malformed = parse_temp_filename_and_unescape(malformed_filename)
        assert result_malformed == malformed_filename  # Should return as-is

class TestGlobalValidator:
    """Test the global validator instance"""

    def test_global_validator_exists(self):
        """Test that global validator instance is available"""
        assert file_validator is not None
        assert isinstance(file_validator, FileValidator)

    def test_global_validator_configuration(self):
        """Test that global validator is properly configured"""
        # Check file size limits are reasonable
        assert file_validator.MAX_FILE_SIZE == 25 * 1024 * 1024  # 25MB
        assert file_validator.MAX_TOTAL_UPLOAD_SIZE == 100 * 1024 * 1024  # 100MB
        assert file_validator.MAX_FILES_PER_UPLOAD == 10 