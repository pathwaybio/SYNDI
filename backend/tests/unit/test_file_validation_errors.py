# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for structured file validation error responses
Tests that validation errors return user-friendly, structured error messages
"""

import pytest
import io
from fastapi import UploadFile

from rawscribe.utils.file_validation import file_validator, FileValidationError


class TestFileValidationErrors:
    """Test structured error responses from file validation"""
    
    @pytest.mark.asyncio
    async def test_unsupported_file_type_error(self):
        """Test that unsupported file types return structured error"""
        # Create a file with unsupported extension
        content = b"test content"
        file = UploadFile(filename="test.xyz", file=io.BytesIO(content))
        
        with pytest.raises(FileValidationError) as exc_info:
            await file_validator.validate_file(file)
        
        error = exc_info.value
        assert error.error_code == "UNSUPPORTED_FILE_TYPE"
        assert "not supported" in error.message.lower()
        assert "extension" in error.details
        assert error.details["extension"] == ".xyz"
        assert "allowed_extensions" in error.details
        assert len(error.details["allowed_extensions"]) > 0
    
    @pytest.mark.asyncio
    async def test_file_too_large_error(self):
        """Test that oversized files return structured error"""
        # Create a file larger than max size (25 MB)
        large_content = b"x" * (26 * 1024 * 1024)  # 26 MB
        file = UploadFile(filename="large.pdf", file=io.BytesIO(large_content))
        file.size = len(large_content)  # Set size attribute
        
        with pytest.raises(FileValidationError) as exc_info:
            await file_validator.validate_file(file)
        
        error = exc_info.value
        assert error.error_code == "FILE_TOO_LARGE"
        assert "too large" in error.message.lower()
        assert "MB" in error.message
        assert error.details["file_size"] == len(large_content)
        assert error.details["max_size"] == file_validator.MAX_FILE_SIZE
    
    @pytest.mark.asyncio
    async def test_empty_file_error(self):
        """Test that empty files return structured error"""
        file = UploadFile(filename="empty.txt", file=io.BytesIO(b""))
        
        with pytest.raises(FileValidationError) as exc_info:
            await file_validator.validate_file(file)
        
        error = exc_info.value
        assert error.error_code == "EMPTY_FILE"
        assert "empty" in error.message.lower()
        assert "filename" in error.details
    
    @pytest.mark.asyncio
    async def test_dangerous_file_type_error(self):
        """Test that dangerous file types return structured error"""
        content = b"test"
        file = UploadFile(filename="malware.exe", file=io.BytesIO(content))
        
        with pytest.raises(FileValidationError) as exc_info:
            await file_validator.validate_file(file)
        
        error = exc_info.value
        assert error.error_code == "DANGEROUS_FILE_TYPE"
        assert "security" in error.message.lower()
        assert error.details["extension"] == ".exe"
    
    @pytest.mark.asyncio
    async def test_too_many_files_error(self):
        """Test that uploading too many files returns structured error"""
        # Create more than max files (10)
        files = []
        for i in range(15):
            content = b"test"
            files.append(UploadFile(filename=f"test{i}.txt", file=io.BytesIO(content)))
        
        with pytest.raises(FileValidationError) as exc_info:
            await file_validator.validate_upload_batch(files)
        
        error = exc_info.value
        assert error.error_code == "TOO_MANY_FILES"
        assert "too many" in error.message.lower()
        assert error.details["file_count"] == 15
        assert error.details["max_files"] == file_validator.MAX_FILES_PER_UPLOAD
    
    @pytest.mark.asyncio
    async def test_no_filename_error(self):
        """Test that files without filename return structured error"""
        content = b"test"
        file = UploadFile(filename="", file=io.BytesIO(content))
        
        with pytest.raises(FileValidationError) as exc_info:
            await file_validator.validate_file(file)
        
        error = exc_info.value
        assert error.error_code == "NO_FILENAME"
        assert "filename" in error.message.lower()
    
    def test_error_has_required_attributes(self):
        """Test that FileValidationError has all required attributes"""
        error = FileValidationError(
            message="Test error",
            error_code="TEST_ERROR",
            details={"key": "value"}
        )
        
        assert error.message == "Test error"
        assert error.error_code == "TEST_ERROR"
        assert error.details == {"key": "value"}
        assert str(error) == "Test error"  # Should be string-able
    
    def test_error_default_values(self):
        """Test FileValidationError default values"""
        error = FileValidationError(message="Test")
        
        assert error.message == "Test"
        assert error.error_code == "VALIDATION_ERROR"
        assert error.details == {}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

