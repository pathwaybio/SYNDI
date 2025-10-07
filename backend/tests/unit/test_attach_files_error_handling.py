# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for attach_files_to_eln error handling

Tests comprehensive validation and error responses for the /attach-to-eln endpoint.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from rawscribe.routes.files import router, AttachFilesRequest
from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_base import StorageNotFoundError, StorageError
from rawscribe.utils.auth import User


class TestAttachFilesErrorHandling:
    """Test error handling for attach_files_to_eln endpoint"""
    
    @pytest.fixture
    def mock_storage_manager(self):
        """Mock StorageManager for testing"""
        storage = MagicMock(spec=StorageManager)
        return storage
    
    @pytest.fixture
    def mock_user(self):
        """Mock user for testing"""
        return User(
            id="test_user",
            username="test_user",
            email="test@example.com",
            name="Test User",
            groups=["user"],
            permissions=["read"],
            is_admin=False
        )
    
    @pytest.fixture
    def valid_request(self):
        """Valid attach files request for testing"""
        return AttachFilesRequest(
            eln_uuid="20250727_023143-85f46f7a",
            field_id="task1234",
            file_ids=["45afe17b"],
            sop_id="Test1234"
        )
    
    @pytest.mark.asyncio
    async def test_missing_required_fields(self, mock_storage_manager, mock_user):
        """Test validation of required fields"""
        from rawscribe.routes.files import attach_files_to_eln
        
        # Test missing eln_uuid
        request = AttachFilesRequest(
            eln_uuid="",
            field_id="task1234", 
            file_ids=["45afe17b"],
            sop_id="Test1234"
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 400
        assert "Missing required fields" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_empty_file_ids(self, mock_storage_manager, mock_user):
        """Test validation of empty file_ids"""
        from rawscribe.routes.files import attach_files_to_eln
        
        request = AttachFilesRequest(
            eln_uuid="20250727_023143-85f46f7a",
            field_id="task1234",
            file_ids=[],  # Empty list
            sop_id="Test1234"
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 400
        assert "At least one file_id is required" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_sop_not_found(self, mock_storage_manager, mock_user, valid_request):
        """Test SOP not found error"""
        from rawscribe.routes.files import attach_files_to_eln
        
        # Mock validation failure for SOP not found
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": False,
            "errors": ["sop_not_found"],
            "details": {"sop_id": "SOP 'Test1234' not found in required locations"}
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 404
        error_detail = exc_info.value.detail
        assert error_detail["error"] == "sop_not_found"
        assert "Test1234" in error_detail["message"]
    
    @pytest.mark.asyncio
    async def test_eln_not_found(self, mock_storage_manager, mock_user, valid_request):
        """Test ELN not found error"""
        from rawscribe.routes.files import attach_files_to_eln
        
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": False,
            "errors": ["eln_not_found"],
            "details": {"eln_uuid": "ELN '20250727_023143-85f46f7a' not found in SOP 'Test1234'"}
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 404
        error_detail = exc_info.value.detail
        assert error_detail["error"] == "eln_not_found"
        assert "20250727_023143-85f46f7a" in error_detail["message"]
    
    @pytest.mark.asyncio
    async def test_eln_corrupted(self, mock_storage_manager, mock_user, valid_request):
        """Test ELN corrupted error"""
        from rawscribe.routes.files import attach_files_to_eln
        
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": False,
            "errors": ["eln_corrupted"],
            "details": {"eln_load_error": "ELN document corrupted: Invalid JSON format"}
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 500
        error_detail = exc_info.value.detail
        assert error_detail["error"] == "eln_corrupted"
        assert "corrupted" in error_detail["message"]
    
    @pytest.mark.asyncio
    async def test_field_not_found(self, mock_storage_manager, mock_user, valid_request):
        """Test field not found in ELN error"""
        from rawscribe.routes.files import attach_files_to_eln
        
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": False,
            "errors": ["field_not_found"],
            "details": {"field_id": "Field 'task1234' not found in ELN or does not support attachments"}
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 400
        error_detail = exc_info.value.detail
        assert error_detail["error"] == "invalid_field"
        assert "task1234" in error_detail["message"]
    
    @pytest.mark.asyncio
    async def test_files_not_found(self, mock_storage_manager, mock_user, valid_request):
        """Test files not found error"""
        from rawscribe.routes.files import attach_files_to_eln
        
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": False,
            "errors": ["files_not_found"],
            "details": {
                "missing_files": ["45afe17b", "another_id"],
                "missing_count": 2
            }
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 404
        error_detail = exc_info.value.detail
        assert error_detail["error"] == "files_not_found"
        assert "2 file(s) not found" in error_detail["message"]
        assert "45afe17b" in error_detail["details"]["missing_files"]
    
    @pytest.mark.asyncio
    async def test_validation_error_generic(self, mock_storage_manager, mock_user, valid_request):
        """Test generic validation error"""
        from rawscribe.routes.files import attach_files_to_eln
        
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": False,
            "errors": ["validation_error"],
            "details": {"unexpected_error": "Database connection failed"}
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 500
        error_detail = exc_info.value.detail
        assert error_detail["error"] == "validation_failed"
    
    @pytest.mark.asyncio
    async def test_successful_validation_but_attach_fails(self, mock_storage_manager, mock_user, valid_request):
        """Test successful validation but failure during actual attachment"""
        from rawscribe.routes.files import attach_files_to_eln
        
        # Validation passes
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": True,
            "errors": [],
            "details": {"validated_files": 1, "eln_data_available": True}
        }
        
        # But attach_files_to_eln fails
        mock_storage_manager.attach_files_to_eln.side_effect = StorageError("Storage system unavailable")
        
        with pytest.raises(HTTPException) as exc_info:
            await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert exc_info.value.status_code == 500
        error_detail = exc_info.value.detail
        assert error_detail["error"] == "internal_error"
    
    @pytest.mark.asyncio
    async def test_successful_attach_files(self, mock_storage_manager, mock_user, valid_request):
        """Test successful file attachment"""
        from rawscribe.routes.files import attach_files_to_eln
        
        # Validation passes
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": True,
            "errors": [],
            "details": {"validated_files": 1, "eln_data_available": True}
        }
        
        # Attachment succeeds
        mock_storage_manager.attach_files_to_eln.return_value = [
            "https://storage.example.com/final/file1.pdf"
        ]
        
        response = await attach_files_to_eln(valid_request, mock_user, mock_storage_manager)
        
        assert response.success is True
        assert len(response.final_urls) == 1
        assert "https://storage.example.com" in response.final_urls[0]
    
    @pytest.mark.asyncio
    async def test_field_id_escaping(self, mock_storage_manager, mock_user):
        """Test that field_id with hyphens is properly escaped"""
        from rawscribe.routes.files import attach_files_to_eln
        
        # Request with field_id containing hyphens
        request = AttachFilesRequest(
            eln_uuid="20250727_023143-85f46f7a",
            field_id="task-with-hyphens", 
            file_ids=["45afe17b"],
            sop_id="Test1234"
        )
        
        # Validation passes
        mock_storage_manager.validate_attach_files_request.return_value = {
            "valid": True,
            "errors": [],
            "details": {"validated_files": 1}
        }
        
        mock_storage_manager.attach_files_to_eln.return_value = ["test_url"]
        
        await attach_files_to_eln(request, mock_user, mock_storage_manager)
        
        # Verify escaped field_id was used in validation and attachment
        validation_call = mock_storage_manager.validate_attach_files_request.call_args
        assert "task__HYPHEN__with__HYPHEN__hyphens" in validation_call[1]["field_id"]
        
        attach_call = mock_storage_manager.attach_files_to_eln.call_args
        assert "task__HYPHEN__with__HYPHEN__hyphens" in attach_call[1]["field_id"]


class TestStorageManagerValidation:
    """Test StorageManager validation methods"""
    
    @pytest.fixture
    def mock_eln_backend(self):
        """Mock ELN backend"""
        backend = AsyncMock()
        return backend
    
    @pytest.fixture
    def mock_draft_backend(self):
        """Mock draft backend"""
        backend = AsyncMock()
        return backend
    
    @pytest.fixture
    def storage_manager(self, mock_eln_backend, mock_draft_backend):
        """StorageManager with mocked backends"""
        manager = MagicMock(spec=StorageManager)
        # Use unified backend
        manager.backend = mock_eln_backend
        
        # Add the real validation method - StorageManager already imported at top
        manager.validate_attach_files_request = StorageManager.validate_attach_files_request.__get__(manager)
        
        return manager
    
    @pytest.mark.asyncio
    async def test_validate_sop_not_found(self, storage_manager, mock_eln_backend):
        """Test SOP validation failure"""
        mock_eln_backend.validate_sop_exists.return_value = False
        
        result = await storage_manager.validate_attach_files_request(
            "test_uuid", "test_field", ["file1"], "user1", "invalid_sop"
        )
        
        assert not result["valid"]
        assert "sop_not_found" in result["errors"]
        assert "invalid_sop" in result["details"]["sop_id"]
    
    @pytest.mark.asyncio
    async def test_validate_eln_not_found(self, storage_manager, mock_eln_backend):
        """Test ELN validation failure"""
        mock_eln_backend.validate_sop_exists.return_value = True
        mock_eln_backend.validate_eln_exists.return_value = False
        
        result = await storage_manager.validate_attach_files_request(
            "invalid_uuid", "test_field", ["file1"], "user1", "test_sop"
        )
        
        assert not result["valid"]
        assert "eln_not_found" in result["errors"]
        assert "invalid_uuid" in result["details"]["eln_uuid"]
    
    @pytest.mark.asyncio
    async def test_validate_eln_load_failure(self, storage_manager, mock_eln_backend):
        """Test ELN load failure"""
        mock_eln_backend.validate_sop_exists.return_value = True
        mock_eln_backend.validate_eln_exists.return_value = True
        mock_eln_backend.load_eln_for_validation.side_effect = StorageNotFoundError("ELN file missing")
        
        result = await storage_manager.validate_attach_files_request(
            "test_uuid", "test_field", ["file1"], "user1", "test_sop"
        )
        
        assert not result["valid"]
        assert "eln_load_failed" in result["errors"]
        assert "ELN file missing" in result["details"]["eln_load_error"]
    
    @pytest.mark.asyncio
    async def test_validate_field_not_found(self, storage_manager, mock_eln_backend):
        """Test field validation failure"""
        mock_eln_backend.validate_sop_exists.return_value = True
        mock_eln_backend.validate_eln_exists.return_value = True
        mock_eln_backend.load_eln_for_validation.return_value = {"form_data": {"other_field": "value"}}
        mock_eln_backend.validate_field_exists_in_eln.return_value = False
        
        result = await storage_manager.validate_attach_files_request(
            "test_uuid", "invalid_field", ["file1"], "user1", "test_sop"
        )
        
        assert not result["valid"]
        assert "field_not_found" in result["errors"]
        assert "invalid_field" in result["details"]["field_id"]
    
    @pytest.mark.asyncio
    async def test_validate_files_missing(self, storage_manager, mock_eln_backend, mock_draft_backend):
        """Test file validation failure"""
        mock_eln_backend.validate_sop_exists.return_value = True
        mock_eln_backend.validate_eln_exists.return_value = True
        mock_eln_backend.load_eln_for_validation.return_value = {"form_data": {"test_field": "value"}}
        mock_eln_backend.validate_field_exists_in_eln.return_value = True
        mock_eln_backend.validate_temp_files_exist.return_value = ["file1", "file2"]  # Missing files
        
        result = await storage_manager.validate_attach_files_request(
            "test_uuid", "test_field", ["file1", "file2", "file3"], "user1", "test_sop"
        )
        
        assert not result["valid"]
        assert "files_not_found" in result["errors"]
        assert result["details"]["missing_files"] == ["file1", "file2"]
        assert result["details"]["missing_count"] == 2
    
    @pytest.mark.asyncio
    async def test_validate_all_pass(self, storage_manager, mock_eln_backend, mock_draft_backend):
        """Test successful validation"""
        mock_eln_backend.validate_sop_exists.return_value = True
        mock_eln_backend.validate_eln_exists.return_value = True
        mock_eln_backend.load_eln_for_validation.return_value = {"form_data": {"test_field": "value"}}
        mock_eln_backend.validate_field_exists_in_eln.return_value = True
        mock_eln_backend.validate_temp_files_exist.return_value = []  # No missing files
        
        result = await storage_manager.validate_attach_files_request(
            "test_uuid", "test_field", ["file1"], "user1", "test_sop"
        )
        
        assert result["valid"]
        assert len(result["errors"]) == 0
        assert result["details"]["validated_files"] == 1
        assert result["details"]["eln_data_available"] 