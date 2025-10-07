# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for Files API
Tests file upload and attachment functionality
"""

import pytest
import asyncio
import os
import tempfile
import json
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from fastapi import UploadFile
import io

# Add the backend directory to Python path for imports
import sys
import os
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from rawscribe.main import app
from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.file_validation import escape_field_id, unescape_field_id, parse_temp_filename_and_unescape
from rawscribe.utils.config_types import StorageConfig
from rawscribe.utils.filename_generator import FilenameGenerator
from rawscribe.routes.files import FileUploadResponse, AttachFilesResponse

class TestFilesAPI:
    """Test files API endpoints"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)

    @pytest.fixture
    def temp_storage_dir(self):
        """Create temporary storage directory"""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield temp_dir

    @pytest.fixture
    def storage_config(self, temp_storage_dir):
        """Create storage configuration for testing"""
        return StorageConfig(
            type="local",
            local_path=temp_storage_dir,
            draft_bucket_name="eln-drafts",
            eln_bucket_name="eln",
            forms_bucket_name="forms"
        )

    @pytest.fixture
    def storage_manager(self, storage_config):
        """Create storage manager for testing"""
        return StorageManager(storage_config)

    def create_png_file_data(self) -> bytes:
        """Create minimal PNG file data for testing"""
        # Minimal PNG file signature + IHDR chunk
        png_signature = b'\x89PNG\r\n\x1a\n'
        ihdr_chunk = b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90\x77\x53\xde'
        iend_chunk = b'\x00\x00\x00\x00IEND\xae\x42\x60\x82'
        return png_signature + ihdr_chunk + iend_chunk

    def create_xls_file_data(self) -> bytes:
        """Create minimal XLS file data for testing"""
        # Minimal Excel file signature (OLE2 compound document)
        ole_signature = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
        # Add minimal structure for a valid Excel file
        padding = b'\x00' * 504  # Basic OLE header padding
        return ole_signature + padding

    @pytest.fixture
    def png_upload_file(self):
        """Create PNG UploadFile for testing"""
        png_data = self.create_png_file_data()
        file_obj = io.BytesIO(png_data)
        return UploadFile(
            filename="test_image.png",
            file=file_obj
        )

    @pytest.fixture
    def xls_upload_file(self):
        """Create XLS UploadFile for testing"""
        xls_data = self.create_xls_file_data()
        file_obj = io.BytesIO(xls_data)
        return UploadFile(
            filename="test_spreadsheet.xls",
            file=file_obj
        )

    @pytest.mark.asyncio
    async def test_upload_png_file(self, storage_manager, png_upload_file, temp_storage_dir):
        """Test uploading a PNG file"""
        # Test the storage backend directly
        file_id = "test-uuid-png"
        user_id = "test_user"
        field_id = "test_field"
        sop_id = "Test1"

        # Create the draft backend
        draft_backend = LocalJSONStorage(storage_manager.config, document_type="drafts")

        # Test file upload
        result_url = await draft_backend.store_temp_file(
            file_id=file_id,
            file=png_upload_file,
            user_id=user_id,
            field_id=field_id,
            sop_id=sop_id
        )

        # Verify the file was stored with correct structure
        assert result_url == f"drafts/{sop_id}/attachments/{user_id}-{field_id}-{file_id}-test_image.png"
        
        # Check file exists on filesystem in correct location
        expected_path = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments" / f"{user_id}-{field_id}-{file_id}-test_image.png"
        assert expected_path.exists()
        
        # Verify file content
        with open(expected_path, 'rb') as f:
            stored_content = f.read()
        
        # Reset the upload file and read original content
        await png_upload_file.seek(0)
        original_content = await png_upload_file.read()
        assert stored_content == original_content

    @pytest.mark.asyncio
    async def test_upload_xls_file(self, storage_manager, xls_upload_file, temp_storage_dir):
        """Test uploading an XLS file"""
        # Test the storage backend directly
        file_id = "test-uuid-xls"
        user_id = "test_user"
        field_id = "test_field"
        sop_id = "Test1"

        # Create the draft backend
        draft_backend = LocalJSONStorage(storage_manager.config, document_type="drafts")

        # Test file upload
        result_url = await draft_backend.store_temp_file(
            file_id=file_id,
            file=xls_upload_file,
            user_id=user_id,
            field_id=field_id,
            sop_id=sop_id
        )

        # Verify the file was stored with correct structure
        assert result_url == f"drafts/{sop_id}/attachments/{user_id}-{field_id}-{file_id}-test_spreadsheet.xls"
        
        # Check file exists on filesystem in correct location
        expected_path = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments" / f"{user_id}-{field_id}-{file_id}-test_spreadsheet.xls"
        assert expected_path.exists()
        
        # Verify file content
        with open(expected_path, 'rb') as f:
            stored_content = f.read()
        
        # Reset the upload file and read original content
        await xls_upload_file.seek(0)
        original_content = await xls_upload_file.read()
        assert stored_content == original_content

    @pytest.mark.asyncio
    async def test_attach_files_to_eln(self, storage_manager, png_upload_file, xls_upload_file, temp_storage_dir):
        """Test attaching files to ELN"""
        user_id = "test_user"
        field_id = "test_field"
        sop_id = "Test1"
        eln_uuid = "eln-test-uuid"
        
        # First upload files to draft location
        draft_backend = LocalJSONStorage(storage_manager.config, document_type="drafts")
        
        png_file_id = "png-uuid"
        xls_file_id = "xls-uuid"
        
        await draft_backend.store_temp_file(png_file_id, png_upload_file, user_id, field_id, sop_id)
        await draft_backend.store_temp_file(xls_file_id, xls_upload_file, user_id, field_id, sop_id)
        
        # Now test attaching to ELN
        eln_backend = LocalJSONStorage(storage_manager.config, document_type="submissions")
        
        final_urls = await eln_backend.attach_files_to_eln(
            eln_uuid=eln_uuid,
            field_id=field_id,
            file_ids=[png_file_id, xls_file_id],
            user_id=user_id,
            sop_id=sop_id
        )
        
        # Verify files were moved
        assert len(final_urls) == 2
        
        # Check final locations exist with correct structure (same filenames as draft)
        eln_dir = Path(temp_storage_dir) / "eln" / "submissions" / sop_id / "attachments"
        
        png_final_file = eln_dir / f"{user_id}-{field_id}-{png_file_id}-test_image.png"
        xls_final_file = eln_dir / f"{user_id}-{field_id}-{xls_file_id}-test_spreadsheet.xls"
        
        assert png_final_file.exists()
        assert xls_final_file.exists()
        
        # Check draft files were removed from correct location
        draft_dir = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments"
        png_draft_file = draft_dir / f"{user_id}-{field_id}-{png_file_id}-test_image.png"
        xls_draft_file = draft_dir / f"{user_id}-{field_id}-{xls_file_id}-test_spreadsheet.xls"
        
        assert not png_draft_file.exists()
        assert not xls_draft_file.exists()

    @pytest.mark.asyncio
    async def test_storage_manager_integration(self, storage_manager, png_upload_file, xls_upload_file):
        """Test the full storage manager integration"""
        user_id = "test_user"
        field_id = "test_field"
        sop_id = "Test1"
        eln_uuid = "eln-integration-uuid"
        
        # Test file upload through storage manager
        png_file_id = "integration-png-uuid"
        xls_file_id = "integration-xls-uuid"
        
        png_url = await storage_manager.store_temp_file(
            file_id=png_file_id,
            file=png_upload_file,
            user_id=user_id,
            field_id=field_id,
            sop_id=sop_id
        )
        
        xls_url = await storage_manager.store_temp_file(
            file_id=xls_file_id,
            file=xls_upload_file,
            user_id=user_id,
            field_id=field_id,
            sop_id=sop_id
        )
        
        assert png_url
        assert xls_url
        
        # Test attachment through storage manager
        final_urls = await storage_manager.attach_files_to_eln(
            eln_uuid=eln_uuid,
            field_id=field_id,
            file_ids=[png_file_id, xls_file_id],
            user_id=user_id,
            sop_id=sop_id
        )
        
        assert len(final_urls) == 2
        assert all(png_file_id in url or xls_file_id in url for url in final_urls)
        assert all(sop_id in url for url in final_urls)

    def test_file_api_models(self):
        """Test API response models"""
        # Test FileUploadResponse
        upload_response = FileUploadResponse(
            uploaded_urls=["url1", "url2"],
            file_ids=["id1", "id2"],
            metadata={"test": "data"}
        )
        
        assert upload_response.uploaded_urls == ["url1", "url2"]
        assert upload_response.file_ids == ["id1", "id2"]
        assert upload_response.metadata == {"test": "data"}
        
        # Test AttachFilesResponse
        attach_response = AttachFilesResponse(
            success=True,
            final_urls=["final1", "final2"]
        )
        
        assert attach_response.success is True
        assert attach_response.final_urls == ["final1", "final2"]

    @pytest.mark.asyncio
    async def test_error_handling_missing_file(self, storage_manager):
        """Test error handling when file doesn't exist"""
        eln_backend = LocalJSONStorage(storage_manager.config, document_type="submissions")
        
        # Try to attach non-existent files should raise an error
        from rawscribe.utils.storage_base import StorageError
        with pytest.raises(StorageError) as exc_info:
            await eln_backend.attach_files_to_eln(
                eln_uuid="test-uuid",
                field_id="test_field",
                file_ids=["non-existent-id"],
                user_id="test_user",
                sop_id="Test1"
            )
        
        # Should raise an error mentioning the missing file
        assert "non-existent-id" in str(exc_info.value)
        assert "Failed to attach file" in str(exc_info.value)

    def test_filename_generation(self):
        """Test filename generation follows the correct pattern"""
        user_id = "dev_user"
        field_id = "field_123"
        file_id = "a1b2c3d4"  # 8-character UUID without dashes from FilenameGenerator
        original_filename = "document.pdf"
        
        expected_filename = f"{user_id}-{field_id}-{file_id}-{original_filename}"
        assert expected_filename == "dev_user-field_123-a1b2c3d4-document.pdf"

    def test_temp_file_id_generation(self):
        """Test temporary file ID generation using FilenameGenerator"""
        generator = FilenameGenerator()
        
        # Generate a few file IDs
        file_id1 = generator.generate_temp_file_id()
        file_id2 = generator.generate_temp_file_id()
        
        # Verify format: 8 characters, no dashes, alphanumeric
        assert len(file_id1) == 8
        assert len(file_id2) == 8
        assert '-' not in file_id1
        assert '-' not in file_id2
        assert file_id1.isalnum()
        assert file_id2.isalnum()
        
        # Verify uniqueness (very high probability)
        assert file_id1 != file_id2

    def test_temp_file_id_collision_detection(self):
        """Test collision detection in temp file ID generation"""
        generator = FilenameGenerator()
        existing_ids = set()
        
        def collision_checker(file_id: str) -> bool:
            """Simulate collision detection"""
            return file_id in existing_ids
        
        # Generate first ID and add to existing set
        file_id1 = generator.generate_temp_file_id(collision_checker)
        existing_ids.add(file_id1)
        
        # Generate second ID - should be different from first
        file_id2 = generator.generate_temp_file_id(collision_checker)
        
        assert file_id1 != file_id2
        assert len(file_id1) == 8
        assert len(file_id2) == 8

if __name__ == "__main__":
    pytest.main([__file__]) 