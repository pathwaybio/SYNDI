# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for ELN document structure and LD-JSON compliance
Tests ensure that ELN documents contain required fields including draft_uuid, @type, title, description
"""

import pytest
from datetime import datetime, timezone
from rawscribe.utils import document_utils


class TestELNDocumentStructure:
    """Test ELN document structure and LD-JSON compliance"""
    
    def test_prepare_eln_document_basic_structure(self):
        """Test that prepare_eln_document creates correct basic structure"""
        # Sample data
        eln_uuid = "abc123def"
        filename = "final-test_user-proj1-pt1-20250129_100000-abc123def.json"
        sop_id = "TEST-SOP-001"
        sop_metadata = {
            "@type": "SOP",
            "name": "Test SOP",
            "version": "1.0"
        }
        form_data = {
            "field1": "value1",
            "field2": "value2"
        }
        field_definitions = [
            {
                "id": "field1",
                "name": "Project ID",
                "type": "string",
                "required": True
            },
            {
                "id": "field2", 
                "name": "Patient ID",
                "title": "Patient Identifier",
                "description": "Unique patient identifier",
                "@type": "PatientField",
                "type": "string",
                "required": True
            }
        ]
        user_id = "test_user"
        status = "final"
        timestamp = datetime.now(timezone.utc)
        checksum = "test_checksum"
        
        # Create ELN document
        eln_document = document_utils.prepare_document(
            document_uuid=eln_uuid,
            filename=filename,
            sop_id=sop_id,
            user_id=user_id,
            status=status,
            timestamp=timestamp,
            data=form_data,
            is_draft=False,
            sop_metadata=sop_metadata,
            field_definitions=field_definitions,
            checksum=checksum
        )
        
        # Verify basic structure
        assert eln_document["eln_uuid"] == eln_uuid
        assert eln_document["filename"] == filename
        assert eln_document["sop_id"] == sop_id
        assert eln_document["sop_metadata"] == sop_metadata
        assert eln_document["form_data"] == form_data
        assert eln_document["user_id"] == user_id
        assert eln_document["status"] == status
        assert eln_document["timestamp"] == timestamp.isoformat()
        assert eln_document["checksum"] == checksum
        
        # Verify LD-JSON compliance
        assert eln_document["@context"] == "https://schema.org"
        assert eln_document["@type"] == "Dataset"
        
        # Verify draft_uuid and draft_id default to empty string when not provided
        assert eln_document["draft_uuid"] == ""
        assert eln_document["draft_id"] == ""
    
    def test_prepare_eln_document_with_draft_uuid(self):
        """Test that prepare_eln_document includes draft_uuid and draft_id when provided"""
        draft_uuid = "draft123"
        draft_id = "draft-user-proj1-20250729-draft123.json"
        
        eln_document = document_utils.prepare_document(
            document_uuid="eln123",
            filename="test.json",
            sop_id="TEST-SOP-001",
            user_id="test",
            status="final",
            timestamp=datetime.now(timezone.utc),
            data={},
            is_draft=False,
            sop_metadata={},
            field_definitions=[],
            checksum="test",
            draft_uuid=draft_uuid,
            draft_id=draft_id
        )
        
        assert eln_document["draft_uuid"] == draft_uuid
        assert eln_document["draft_id"] == draft_id
    
    def test_field_definitions_preserved_as_is(self):
        """Test that field_definitions are preserved exactly as provided (no enhancement)"""
        field_definitions = [
            {
                "id": "field1",
                "name": "Basic Field",
                "type": "string"
            },
            {
                "id": "field2",
                "name": "Enhanced Field",
                "title": "Custom Title",
                "description": "Custom description",
                "@type": "CustomField",
                "type": "string"
            },
            {
                "id": "field3",
                "name": "Partial Field",
                "description": "Has description but no title",
                "type": "string"
            }
        ]
        
        eln_document = document_utils.prepare_document(
            document_uuid="test",
            filename="test.json",
            sop_id="TEST-SOP-001",
            user_id="test",
            status="final",
            timestamp=datetime.now(timezone.utc),
            data={},
            is_draft=False,
            sop_metadata={},
            field_definitions=field_definitions,
            checksum="test"
        )
        
        preserved_fields = eln_document["field_definitions"]
        
        # Test field1 - basic field preserved as-is
        field1 = preserved_fields[0]
        assert field1["id"] == "field1"
        assert field1["name"] == "Basic Field"
        assert field1["type"] == "string"
        assert "title" not in field1  # Should not be added
        assert "description" not in field1  # Should not be added
        assert "@type" not in field1  # Should not be added
        
        # Test field2 - custom field with extra properties preserved exactly
        field2 = preserved_fields[1]
        assert field2["id"] == "field2"
        assert field2["name"] == "Enhanced Field"
        assert field2["title"] == "Custom Title"  # Original preserved
        assert field2["description"] == "Custom description"  # Original preserved
        assert field2["@type"] == "CustomField"  # Original preserved
        assert field2["type"] == "string"  # Original preserved
        
        # Test field3 - partial field preserved as-is
        field3 = preserved_fields[2]
        assert field3["id"] == "field3"
        assert field3["name"] == "Partial Field"
        assert field3["description"] == "Has description but no title"  # Original preserved
        assert field3["type"] == "string"  # Original preserved
        assert "title" not in field3  # Should not be added
        assert "@type" not in field3  # Should not be added
    
    def test_field_definitions_preserve_original_fields(self):
        """Test that original field properties are preserved exactly without modification"""
        field_definitions = [
            {
                "id": "field1",
                "name": "Test Field",
                "type": "string",
                "required": True,
                "validation": {"min_length": 1},
                "file_config": {"accept": ".pdf"},
                "ui_config": {"component": "text"}
            }
        ]
        
        eln_document = document_utils.prepare_document(
            document_uuid="test",
            filename="test.json",
            sop_id="TEST-SOP-001",
            user_id="test",
            status="final",
            timestamp=datetime.now(timezone.utc),
            data={},
            is_draft=False,
            sop_metadata={},
            field_definitions=field_definitions,
            checksum="test"
        )
        
        preserved_field = eln_document["field_definitions"][0]
        
        # Verify all original fields are preserved exactly
        assert preserved_field["id"] == "field1"
        assert preserved_field["name"] == "Test Field"
        assert preserved_field["type"] == "string"
        assert preserved_field["required"] == True
        assert preserved_field["validation"] == {"min_length": 1}
        assert preserved_field["file_config"] == {"accept": ".pdf"}
        assert preserved_field["ui_config"] == {"component": "text"}
        
        # Verify no LD-JSON fields are added automatically
        assert "title" not in preserved_field
        assert "description" not in preserved_field
        assert "@type" not in preserved_field
    
    def test_eln_document_required_fields(self):
        """Test that all required fields are present in ELN document"""
        required_fields = [
            "@context", "@type", "eln_uuid", "draft_uuid", "draft_id", "filename", 
            "sop_id", "sop_metadata", "form_data", "field_definitions", "user_id",
            "status", "timestamp", "checksum"
        ]
        
        eln_document = document_utils.prepare_document(
            document_uuid="test",
            filename="test.json",
            sop_id="TEST-SOP-001",
            user_id="test",
            status="final",
            timestamp=datetime.now(timezone.utc),
            data={},
            is_draft=False,
            sop_metadata={},
            field_definitions=[],
            checksum="test"
        )
        
        for field in required_fields:
            assert field in eln_document, f"Required field '{field}' missing from ELN document"
    
    def test_ld_json_context_and_type(self):
        """Test that LD-JSON context and type are correctly set"""
        eln_document = document_utils.prepare_document(
            document_uuid="test",
            filename="test.json",
            sop_id="TEST-SOP-001",
            user_id="test",
            status="final",
            timestamp=datetime.now(timezone.utc),
            data={},
            is_draft=False,
            sop_metadata={},
            field_definitions=[],
            checksum="test"
        )
        
        # Verify LD-JSON compliance
        assert eln_document["@context"] == "https://schema.org"
        assert eln_document["@type"] == "Dataset" 