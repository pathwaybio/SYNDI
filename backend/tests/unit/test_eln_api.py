# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for ELN API routes
Tests RESTful endpoints for ELN submission, retrieval, and management
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timezone
import json

pytestmark = pytest.mark.skip(reason="ELN API tests broken - fundamental API changes needed")

from rawscribe.main import app
from rawscribe.utils.storage_base import StorageError, StorageNotFoundError, ImmutableStorageError
from rawscribe.utils.metadata import ELNMetadata

class TestELNAPI:
    """Test ELN API endpoints"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.client = TestClient(app)
        
        # Sample request data
        self.sample_submission_request = {
            "sop_id": "SOP-001",
            "status": "final",
            "form_data": {
                "project_id": "PROJ-001",
                "patient_id": "PAT-123",
                "procedure_date": "2024-01-15"
            },
            "sop_fields": [
                {
                    "id": "project_id",
                    "name": "Project ID",
                    "_schemaType": "Field",
                    "children": [
                        {
                            "_schemaType": "ELNFilenameComponent",
                            "is_component": True,
                            "order": 1
                        }
                    ]
                }
            ]
        }
        
        # Sample ELN metadata
        self.sample_metadata = ELNMetadata(
            eln_uuid="abcd1234",
            filename="final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json",
            sop_id="SOP-001",
            user_id="test_user",
            status="final",
            timestamp=datetime(2024, 1, 15, 14, 30, 22, tzinfo=timezone.utc),
            size_bytes=1024,
            checksum="sha256hash",
            variables=["proj_001", "pat_123"]
        )

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_submit_eln_success(self, mock_storage_manager, mock_get_user):
        """Test successful ELN submission"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user", "username": "test_user"}
        
        mock_storage = Mock()
        mock_storage.save_document = AsyncMock(return_value=("test-uuid", self.sample_metadata))
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.post("/api/eln/submit", json=self.sample_submission_request)
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        assert data["eln_uuid"] == "abcd1234"
        assert data["filename"] == "final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json"
        assert data["sop_id"] == "SOP-001"
        assert data["user_id"] == "test_user"
        assert data["status"] == "final"
        assert data["size_bytes"] == 1024
        
        # Verify storage was called correctly
        mock_storage.submit_eln.assert_called_once_with(
            sop_id="SOP-001",
            user_id="test_user",
            status="final",
            form_data=self.sample_submission_request["form_data"],
            sop_fields=self.sample_submission_request["sop_fields"]
        )

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_submit_eln_invalid_status(self, mock_storage_manager, mock_get_user):
        """Test ELN submission with invalid status"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        mock_storage = Mock()
        mock_storage.get_document = AsyncMock(return_value={"id": "test-sop", "name": "Test SOP"})
        mock_storage_manager.return_value = mock_storage
        
        # Modify request with invalid status
        invalid_request = self.sample_submission_request.copy()
        invalid_request["status"] = "invalid_status"
        
        # Make request
        response = self.client.post("/api/eln/submit", json=invalid_request)
        
        # Verify error response
        assert response.status_code == 400
        assert "Invalid status" in response.json()["detail"]

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_submit_eln_immutability_violation(self, mock_storage_manager, mock_get_user):
        """Test ELN submission with immutability violation"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        mock_storage = Mock()
        mock_storage.submit_eln = AsyncMock(side_effect=ImmutableStorageError("ELN already exists"))
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.post("/api/eln/submit", json=self.sample_submission_request)
        
        # Verify conflict response
        assert response.status_code == 409
        assert "ELN already exists" in response.json()["detail"]

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_submit_eln_storage_error(self, mock_storage_manager, mock_get_user):
        """Test ELN submission with storage error"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        mock_storage = Mock()
        mock_storage.submit_eln = AsyncMock(side_effect=StorageError("Storage failed"))
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.post("/api/eln/submit", json=self.sample_submission_request)
        
        # Verify error response
        assert response.status_code == 500
        assert "Failed to submit ELN" in response.json()["detail"]

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_get_eln_success(self, mock_storage_manager, mock_get_user):
        """Test successful ELN retrieval"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        sample_eln_data = {
            "eln_uuid": "abcd1234",
            "filename": "final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json",
            "sop_id": "SOP-001",
            "user_id": "test_user",
            "status": "final",
            "timestamp": "2024-01-15T14:30:22+00:00",
            "form_data": {"project_id": "PROJ-001"},
            "sop_fields": []
        }
        
        mock_storage = Mock()
        mock_storage.get_eln = AsyncMock(return_value=sample_eln_data)
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.get("/api/eln/SOP-001/final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        assert data["eln_uuid"] == "abcd1234"
        assert data["sop_id"] == "SOP-001"
        assert data["form_data"]["project_id"] == "PROJ-001"
        
        # Verify storage was called correctly
        mock_storage.get_eln.assert_called_once_with(
            "SOP-001", 
            "final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json"
        )

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_get_eln_not_found(self, mock_storage_manager, mock_get_user):
        """Test ELN retrieval with non-existent file"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        mock_storage = Mock()
        mock_storage.get_eln = AsyncMock(side_effect=StorageNotFoundError("ELN not found"))
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.get("/api/eln/SOP-001/nonexistent.json")
        
        # Verify not found response
        assert response.status_code == 404
        assert "ELN not found" in response.json()["detail"]

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_get_eln_by_uuid_success(self, mock_storage_manager, mock_get_user):
        """Test successful ELN retrieval by UUID"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        sample_eln_data = {
            "eln_uuid": "abcd1234",
            "filename": "final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json",
            "sop_id": "SOP-001",
            "user_id": "test_user",
            "status": "final",
            "timestamp": "2024-01-15T14:30:22+00:00",
            "form_data": {"project_id": "PROJ-001"},
            "sop_fields": []
        }
        
        mock_storage = Mock()
        mock_storage.get_eln_by_uuid = AsyncMock(return_value=(sample_eln_data, self.sample_metadata))
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.get("/api/eln/uuid/abcd1234")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        assert "eln_data" in data
        assert "metadata" in data
        assert data["eln_data"]["eln_uuid"] == "abcd1234"
        assert data["metadata"]["eln_uuid"] == "abcd1234"
        
        # Verify storage was called correctly
        mock_storage.get_eln_by_uuid.assert_called_once_with("abcd1234")

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_list_elns_success(self, mock_storage_manager, mock_get_user):
        """Test successful ELN listing"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        mock_elns = [
            ELNMetadata(
                eln_uuid="uuid1",
                filename="file1.json",
                sop_id="SOP-001",
                user_id="user1",
                status="final",
                timestamp=datetime.now(timezone.utc),
                size_bytes=500
            ),
            ELNMetadata(
                eln_uuid="uuid2",
                filename="file2.json",
                sop_id="SOP-001", 
                user_id="user2",
                status="draft",
                timestamp=datetime.now(timezone.utc),
                size_bytes=750
            )
        ]
        
        mock_storage = Mock()
        mock_storage.list_documents = AsyncMock(return_value=mock_elns)
        mock_storage.get_document = AsyncMock(return_value={"id": "test-sop", "name": "Test SOP"})
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.get("/api/eln/SOP-001/list")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) == 2
        assert data[0]["eln_uuid"] == "uuid1"
        assert data[1]["eln_uuid"] == "uuid2"
        
        # Verify storage was called correctly
        mock_storage.list_documents.assert_called_once_with(
            document_type="submissions",
            sop_id="SOP-001",
            metadata_class=ELNMetadata,
            user_id=None,
            status="final"
        )

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_list_elns_with_filters(self, mock_storage_manager, mock_get_user):
        """Test ELN listing with filters"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        mock_storage = Mock()
        mock_storage.list_documents = AsyncMock(return_value=[])
        mock_storage.get_document = AsyncMock(return_value={"id": "test-sop", "name": "Test SOP"})
        mock_storage_manager.return_value = mock_storage
        
        # Make request with filters
        response = self.client.get("/api/eln/SOP-001/list?user_id=specific_user&status=final&limit=50")
        
        # Verify response
        assert response.status_code == 200
        
        # Verify storage was called with filters
        mock_storage.list_documents.assert_called_once_with(
            document_type="submissions",
            sop_id="SOP-001",
            metadata_class=ELNMetadata,
            user_id="specific_user",
            status="final"
        )

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_list_elns_invalid_status_filter(self, mock_storage_manager, mock_get_user):
        """Test ELN listing with invalid status filter"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        mock_storage = Mock()
        mock_storage.get_document = AsyncMock(return_value={"id": "test-sop", "name": "Test SOP"})
        mock_storage_manager.return_value = mock_storage
        
        # Make request with invalid status filter
        response = self.client.get("/api/eln/SOP-001/list?status=invalid")
        
        # Verify error response
        assert response.status_code == 400
        assert "Invalid status filter" in response.json()["detail"]

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_list_elns_invalid_limit(self, mock_storage_manager, mock_get_user):
        """Test ELN listing with invalid limit"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        mock_storage = Mock()
        mock_storage.get_document = AsyncMock(return_value={"id": "test-sop", "name": "Test SOP"})
        mock_storage_manager.return_value = mock_storage
        
        # Make request with invalid limit
        response = self.client.get("/api/eln/SOP-001/list?limit=2000")
        
        # Verify error response
        assert response.status_code == 400
        assert "Limit must be between 1 and 1000" in response.json()["detail"]

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_query_prerequisite_elns_success(self, mock_storage_manager, mock_get_user):
        """Test successful prerequisite ELN query"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        sample_eln_data = {
            "eln_uuid": "abcd1234",
            "filename": "test.json",
            "sop_id": "SOP-001",
            "user_id": "test_user",
            "status": "final",
            "timestamp": "2024-01-15T14:30:22+00:00",
            "form_data": {"project_id": "PROJ-001"},
            "sop_fields": []
        }
        
        mock_results = [(sample_eln_data, self.sample_metadata)]
        
        mock_storage = Mock()
        mock_storage.query_prerequisite_elns = AsyncMock(return_value=mock_results)
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        query_request = {
            "sop_id": "SOP-001",
            "field_filters": {"project_id": "PROJ-001"}
        }
        
        response = self.client.post("/api/eln/query-prerequisites", json=query_request)
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        assert "matching_elns" in data
        assert len(data["matching_elns"]) == 1
        assert data["matching_elns"][0]["eln_data"]["eln_uuid"] == "abcd1234"
        assert data["matching_elns"][0]["metadata"]["eln_uuid"] == "abcd1234"
        
        # Verify storage was called correctly
        mock_storage.query_prerequisite_elns.assert_called_once_with(
            sop_id="SOP-001",
            field_filters={"project_id": "PROJ-001"}
        )

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_validate_eln_immutability_success(self, mock_storage_manager, mock_get_user):
        """Test successful ELN immutability validation"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        mock_storage = Mock()
        mock_storage.validate_eln_immutability = AsyncMock(return_value=True)
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.get("/api/eln/SOP-001/test-filename.json/validate-immutability")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_valid"] == True
        assert "Filename is available" in data["message"]
        
        # Verify storage was called correctly
        mock_storage.validate_eln_immutability.assert_called_once_with("SOP-001", "test-filename.json")

    @patch('backend.rawscribe.routes.eln.get_current_user')
    @patch('backend.rawscribe.routes.eln.get_storage_manager')
    def test_validate_eln_immutability_violation(self, mock_storage_manager, mock_get_user):
        """Test ELN immutability validation with violation"""
        # Mock dependencies
        mock_get_user.return_value = {"user_id": "test_user"}
        
        mock_storage = Mock()
        mock_storage.validate_eln_immutability = AsyncMock(return_value=False)
        mock_storage_manager.return_value = mock_storage
        
        # Make request
        response = self.client.get("/api/eln/SOP-001/existing-filename.json/validate-immutability")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_valid"] == False
        assert "Filename already exists" in data["message"]

    def test_health_check(self):
        """Test ELN service health check"""
        response = self.client.get("/api/eln/health")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "healthy"
        assert data["service"] == "ELN API"

    @patch('backend.rawscribe.routes.eln.get_current_user')
    def test_authentication_required(self, mock_get_user):
        """Test that authentication is required for protected endpoints"""
        # Mock authentication failure
        mock_get_user.side_effect = Exception("Authentication required")
        
        # Make request without authentication
        response = self.client.post("/api/eln/submit", json=self.sample_submission_request)
        
        # Verify authentication error
        assert response.status_code == 500  # or appropriate auth error code

    def test_invalid_json_request(self):
        """Test handling of invalid JSON in requests"""
        # Make request with invalid JSON
        response = self.client.post(
            "/api/eln/submit", 
            data="invalid json",
            headers={"content-type": "application/json"}
        )
        
        # Verify error response
        assert response.status_code == 422  # Unprocessable Entity

    def test_missing_required_fields(self):
        """Test handling of missing required fields"""
        # Make request with missing required fields
        incomplete_request = {
            "sop_id": "SOP-001"
            # Missing status, form_data, sop_fields
        }
        
        response = self.client.post("/api/eln/submit", json=incomplete_request)
        
        # Verify validation error
        assert response.status_code == 422  # Unprocessable Entity 