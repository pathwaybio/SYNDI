# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Test file attachment with ELN document update functionality
Tests the complete flow of attaching files and updating ELN with final paths
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.config_types import StorageConfig


class TestFileAttachmentWithELNUpdate:
    """Test file attachment and ELN update functionality"""
    
    @pytest.fixture
    def mock_storage_config(self):
        """Create mock storage configuration"""
        return StorageConfig(
            type="local",
            local_path="/tmp/test",
            draft_bucket_name="eln-drafts",
            eln_bucket_name="eln",
            forms_bucket_name="forms"
        )
    
    @pytest.fixture
    def mock_eln_document(self):
        """Create a mock ELN document with file fields"""
        return {
            "eln_uuid": "test-uuid-123",
            "sop_id": "TestSOP",
            "user_id": "test_user",
            "form_data": {
                "field_fileupload": {
                    "fileIds": ["abc123", "def456"],
                    "files": [
                        {"path": "./test1.pdf", "relativePath": "./test1.pdf"},
                        {"path": "./test2.xlsx", "relativePath": "./test2.xlsx"}
                    ],
                    "uploadedUrls": [
                        "drafts/TestSOP/attachments/test_user-field_fileupload-abc123-test1.pdf",
                        "drafts/TestSOP/attachments/test_user-field_fileupload-def456-test2.xlsx"
                    ],
                    "metadata": {
                        "originalNames": ["test1.pdf", "test2.xlsx"],
                        "sizes": [1024, 2048],
                        "types": ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
                    }
                }
            },
            "field_definitions": [
                {"id": "field_fileupload", "type": "file", "name": "File Upload"}
            ]
        }
    
    @pytest.mark.asyncio
    async def test_attach_files_updates_eln_document(self, mock_storage_config, mock_eln_document):
        """Test that attaching files correctly updates the ELN document"""
        # Create storage instance
        storage = LocalJSONStorage(mock_storage_config, "submissions")
        
        # Mock the required methods
        storage._list_files_in_bucket = AsyncMock(side_effect=[
            ["drafts/TestSOP/attachments/test_user-field_fileupload-abc123-test1.pdf"],
            ["drafts/TestSOP/attachments/test_user-field_fileupload-def456-test2.xlsx"]
        ])
        storage._copy_file = AsyncMock()
        storage._delete_document = AsyncMock()
        storage._list_documents = AsyncMock(return_value=[
            {"key": "submissions/TestSOP/final-test_user-proj1-20240101_120000-test-uuid-123.json"}
        ])
        storage.get_document = AsyncMock(return_value=mock_eln_document)
        storage._store_document = AsyncMock()
        
        # Call attach_files_to_eln
        result = await storage.attach_files_to_eln(
            eln_uuid="test-uuid-123",
            field_id="field_fileupload",  # Unescaped field ID since field doesn't have hyphens
            file_ids=["abc123", "def456"],
            user_id="test_user",
            sop_id="TestSOP"
        )
        
        # Verify files were copied
        assert storage._copy_file.call_count == 2
        
        # Verify ELN was updated
        storage._store_document.assert_called_once()
        updated_doc = storage._store_document.call_args[0][1]
        
        # Check the file field was updated correctly
        file_field = updated_doc["form_data"]["field_fileupload"]
        assert len(file_field["files"]) == 2
        
        # Check first file
        assert file_field["files"][0]["finalPath"] == "submissions/TestSOP/attachments/test_user-field_fileupload-abc123-test1.pdf"
        assert file_field["files"][0]["originalName"] == "test1.pdf"
        assert file_field["files"][0]["fileId"] == "abc123"
        
        # Check second file
        assert file_field["files"][1]["finalPath"] == "submissions/TestSOP/attachments/test_user-field_fileupload-def456-test2.xlsx"
        assert file_field["files"][1]["originalName"] == "test2.xlsx"
        assert file_field["files"][1]["fileId"] == "def456"
        
        # Verify uploadedUrls was removed
        assert "uploadedUrls" not in file_field
    
    @pytest.mark.asyncio
    async def test_filename_parsing_with_hyphens(self, mock_storage_config):
        """Test that filenames with hyphens are parsed correctly"""
        storage = LocalJSONStorage(mock_storage_config, "submissions")
        
        # Mock file with hyphens in the original name - use field-fileupload with hyphen
        storage._list_files_in_bucket = AsyncMock(return_value=[
            "drafts/TestSOP/attachments/test_user-field__HYPHEN__fileupload-abc123-my-file-with-hyphens.pdf"
        ])
        storage._copy_file = AsyncMock()
        storage._delete_document = AsyncMock()
        storage._list_documents = AsyncMock(return_value=[
            {"key": "submissions/TestSOP/final-test_user-proj1-20240101_120000-test-uuid-123.json"}
        ])
        storage.get_document = AsyncMock(return_value={
            "form_data": {"field-fileupload": {"fileIds": ["abc123"]}},  # Field with hyphen
            "field_definitions": [{"id": "field-fileupload", "type": "file"}]
        })
        storage._store_document = AsyncMock()
        
        # Call attach_files_to_eln
        result = await storage.attach_files_to_eln(
            eln_uuid="test-uuid-123",
            field_id="field__HYPHEN__fileupload",  # Escaped version
            file_ids=["abc123"],
            user_id="test_user",
            sop_id="TestSOP"
        )
        
        # Verify the filename was parsed correctly
        updated_doc = storage._store_document.call_args[0][1]
        file_info = updated_doc["form_data"]["field-fileupload"]["files"][0]
        assert file_info["originalName"] == "my-file-with-hyphens.pdf"
    
    @pytest.mark.asyncio
    async def test_validate_field_exists_in_eln(self, mock_storage_config):
        """Test field validation in ELN documents"""
        storage = LocalJSONStorage(mock_storage_config, "submissions")
        
        # Test with field in form_data
        eln_doc = {
            "form_data": {"field_test": "value"},
            "field_definitions": []
        }
        assert await storage.validate_field_exists_in_eln(eln_doc, "field_test") is True
        
        # Test with escaped field ID
        assert await storage.validate_field_exists_in_eln(eln_doc, "field__HYPHEN__test") is False
        
        # Test with file field in field_definitions
        eln_doc = {
            "form_data": {},
            "field_definitions": [
                {"id": "field_fileupload", "type": "file"}
            ]
        }
        assert await storage.validate_field_exists_in_eln(eln_doc, "field_fileupload") is True
        
        # Test with field that has hyphen
        eln_doc_with_hyphen = {
            "form_data": {},
            "field_definitions": [
                {"id": "field-fileupload", "type": "file"}
            ]
        }
        assert await storage.validate_field_exists_in_eln(eln_doc_with_hyphen, "field__HYPHEN__fileupload") is True
        
        # Test with non-existent field
        assert await storage.validate_field_exists_in_eln(eln_doc, "nonexistent") is False
    
    @pytest.mark.asyncio
    async def test_attach_files_all_successful(self, mock_storage_config):
        """Test successful attachment of all files"""
        storage = LocalJSONStorage(mock_storage_config, "submissions")
        
        # Mock all files found successfully
        storage._list_files_in_bucket = AsyncMock(side_effect=[
            ["drafts/TestSOP/attachments/test_user-field_fileupload-file1-doc1.pdf"],
            ["drafts/TestSOP/attachments/test_user-field_fileupload-file2-doc2.pdf"]
        ])
        storage._copy_file = AsyncMock()
        storage._delete_document = AsyncMock()
        storage._list_documents = AsyncMock(return_value=[
            {"key": "submissions/TestSOP/final-test_user-proj1-20240101_120000-test-uuid-123.json"}
        ])
        storage.get_document = AsyncMock(return_value={
            "form_data": {"field_fileupload": {"fileIds": ["file1", "file2"], "uploadedUrls": ["temp1", "temp2"]}},
            "field_definitions": [{"id": "field_fileupload", "type": "file"}]
        })
        storage._store_document = AsyncMock()
        
        # Call attach_files_to_eln - should succeed
        result = await storage.attach_files_to_eln(
            eln_uuid="test-uuid-123",
            field_id="field_fileupload",
            file_ids=["file1", "file2"],
            user_id="test_user",
            sop_id="TestSOP"
        )
        
        # Verify both files were processed successfully
        assert len(result) == 2
        assert storage._copy_file.call_count == 2
        assert storage._delete_document.call_count == 2
        
        # Verify ELN was updated
        storage._store_document.assert_called_once()
        updated_doc = storage._store_document.call_args[0][1]
        assert len(updated_doc["form_data"]["field_fileupload"]["files"]) == 2
        assert "uploadedUrls" not in updated_doc["form_data"]["field_fileupload"]
    
    @pytest.mark.asyncio
    async def test_attach_files_handles_missing_files(self, mock_storage_config):
        """Test that missing files cause proper error"""
        storage = LocalJSONStorage(mock_storage_config, "submissions")
        
        # Mock first file found, second file missing
        storage._list_files_in_bucket = AsyncMock(side_effect=[
            ["drafts/TestSOP/attachments/test_user-field_fileupload-abc123-test1.pdf"],
            []  # No files found for second ID
        ])
        storage._copy_file = AsyncMock()
        storage._delete_document = AsyncMock()
        storage._list_documents = AsyncMock(return_value=[
            {"key": "submissions/TestSOP/final-test_user-proj1-20240101_120000-test-uuid-123.json"}
        ])
        storage.get_document = AsyncMock(return_value={
            "form_data": {"field_fileupload": {"fileIds": ["abc123", "def456"]}},
            "field_definitions": [{"id": "field_fileupload", "type": "file"}]
        })
        storage._store_document = AsyncMock()
        
        # Call attach_files_to_eln should raise an error for missing file
        from rawscribe.utils.storage_base import StorageError
        with pytest.raises(StorageError) as exc_info:
            await storage.attach_files_to_eln(
                eln_uuid="test-uuid-123",
                field_id="field_fileupload",
                file_ids=["abc123", "def456"],
                user_id="test_user",
                sop_id="TestSOP"
            )
        
        # Verify the error message mentions the missing file
        assert "def456" in str(exc_info.value)
        
        # Verify first file was processed before failure
        assert storage._copy_file.call_count == 1