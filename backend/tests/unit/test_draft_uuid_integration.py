# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for draft_uuid integration in ELN submissions
Tests the complete flow from draft creation to ELN submission with draft_uuid
"""

import pytest
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.config_types import StorageConfig
from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.metadata import DraftMetadata


@pytest.mark.asyncio
class TestDraftUUIDIntegration:
    """Test draft UUID integration in ELN submission flow"""
    
    def setup_method(self):
        """Set up test environment with temporary storage"""
        self.temp_dir = tempfile.mkdtemp()
        self.storage_config = StorageConfig(
            type='local',
            local_path=self.temp_dir
        )
        self.storage_manager = StorageManager(self.storage_config)
        
        # Test data
        self.test_sop_id = "TestSOP"
        self.test_user_id = "test_user"
        self.test_form_data = {
            "field1": "project1",
            "field2": "patient1"
        }
        self.test_field_definitions = [
            {
                "id": "field1",
                "name": "Project ID",
                "type": "string",
                "title": "Project ID",
                "description": "Project identifier",
                "@type": "Field"
            },
            {
                "id": "field2", 
                "name": "Patient ID",
                "type": "string",
                "title": "Patient ID",
                "description": "Patient identifier",
                "@type": "Field"
            }
        ]
        self.test_sop_metadata = {
            "name": "Test SOP",
            "version": "1.0",
            "@type": "SOP"
        }
        self.test_filename_variables = ["project1", "patient1"]
    
    def teardown_method(self):
        """Clean up temporary storage"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    async def test_draft_uuid_lookup_basic(self):
        """Test that draft UUID lookup works correctly"""
        
        # Step 1: Create a draft
        print(f"\n=== Step 1: Creating draft ===")
        draft_id, _ = await self.storage_manager.save_document(
            document_type="drafts",
            sop_id=self.test_sop_id,
            user_id=self.test_user_id,
            filename_variables=self.test_filename_variables,
            data=self.test_form_data
        )
        print(f"Created draft: {draft_id}")
        
        # Step 2: List drafts to verify they exist
        print(f"\n=== Step 2: Listing drafts ===")
        drafts = await self.storage_manager.list_documents(
            document_type="drafts",
            sop_id=self.test_sop_id,
            metadata_class=DraftMetadata,
            user_id=self.test_user_id
        )
        assert len(drafts) == 1
        print(f"Found {len(drafts)} drafts:")
        for draft in drafts:
            print(f"  - {draft.draft_id}, UUID: {draft.draft_uuid}")
        
        assert len(drafts) > 0, "Should have at least one draft"
        expected_draft_uuid = drafts[0].draft_uuid
        print(f"Expected draft_uuid: {expected_draft_uuid}")
        
        # Step 3: Submit ELN and check if draft_uuid is included
        print(f"\n=== Step 3: Submitting ELN ===")
        _, eln_metadata = await self.storage_manager.save_document(
            document_type="submissions",
            sop_id=self.test_sop_id,
            user_id=self.test_user_id,
            status='final',
            filename_variables=self.test_filename_variables,
            data=self.test_form_data,
            field_definitions=self.test_field_definitions,
            sop_metadata=self.test_sop_metadata
        )
        print(f"ELN submitted: {eln_metadata.filename}")
        print(f"ELN UUID: {eln_metadata.eln_uuid}")
        
        # Step 4: Retrieve ELN and verify draft_uuid
        print(f"\n=== Step 4: Verifying draft_uuid in ELN ===")
        file_basename = eln_metadata.filename.replace('.json', '') if eln_metadata.filename.endswith('.json') else eln_metadata.filename
        eln_data = await self.storage_manager.get_document("submissions", self.test_sop_id, file_basename)
        
        actual_draft_uuid = eln_data.get('draft_uuid')
        print(f"Actual draft_uuid in ELN: '{actual_draft_uuid}'")
        print(f"Expected draft_uuid: '{expected_draft_uuid}'")
        
        # Verify the draft_uuid is populated correctly
        assert actual_draft_uuid is not None, "draft_uuid should not be None"
        assert actual_draft_uuid != "", "draft_uuid should not be empty string"
        assert actual_draft_uuid == expected_draft_uuid, f"draft_uuid should be {expected_draft_uuid}, got {actual_draft_uuid}"
        
        print(f"✓ SUCCESS: draft_uuid correctly populated in ELN")
    
    async def test_draft_uuid_with_multiple_drafts(self):
        """Test that the most recent draft UUID is used when multiple drafts exist"""
        
        # Create multiple drafts
        print(f"\n=== Creating multiple drafts ===")
        draft_ids = []
        for i in range(3):
            draft_id, _ = await self.storage_manager.save_document(
                document_type="drafts",
                sop_id=self.test_sop_id,
                user_id=self.test_user_id,
                filename_variables=[f"project{i}", "patient1"],
                data={**self.test_form_data, "iteration": i}
            )
            draft_ids.append(draft_id)
            print(f"Created draft {i+1}: {draft_id}")
        
        # List drafts to see order
        drafts = await self.storage_manager.list_documents(
            document_type="drafts",
            sop_id=self.test_sop_id,
            metadata_class=DraftMetadata,
            user_id=self.test_user_id
        )
        print(f"\nDrafts (newest first):")
        for i, draft in enumerate(drafts):
            print(f"  {i}: {draft.draft_id}, UUID: {draft.draft_uuid}, timestamp: {draft.timestamp}")
        
        # Most recent should be first
        most_recent_draft_uuid = drafts[0].draft_uuid
        print(f"\nMost recent draft UUID: {most_recent_draft_uuid}")
        
        # Submit ELN
        _, eln_metadata = await self.storage_manager.save_document(
            document_type="submissions",
            sop_id=self.test_sop_id,
            user_id=self.test_user_id,
            status='final',
            filename_variables=["final_project", "patient1"],
            data=self.test_form_data,
            field_definitions=self.test_field_definitions,
            sop_metadata=self.test_sop_metadata
        )
        
        # Verify correct draft_uuid is used
        file_basename = eln_metadata.filename.replace('.json', '') if eln_metadata.filename.endswith('.json') else eln_metadata.filename
        eln_data = await self.storage_manager.get_document("submissions", self.test_sop_id, file_basename)
        actual_draft_uuid = eln_data.get('draft_uuid')
        
        assert actual_draft_uuid == most_recent_draft_uuid, f"Should use most recent draft UUID {most_recent_draft_uuid}, got {actual_draft_uuid}"
        print(f"✓ SUCCESS: Most recent draft UUID correctly used")
    
    async def test_draft_uuid_no_drafts(self):
        """Test that empty string is used when no drafts exist"""
        
        # Submit ELN without any existing drafts
        print(f"\n=== Submitting ELN with no existing drafts ===")
        _, eln_metadata = await self.storage_manager.save_document(
            document_type="submissions",
            sop_id="EmptySOP",  # Different SOP with no drafts
            user_id=self.test_user_id,
            status='final',
            filename_variables=["no_draft_project"],
            data=self.test_form_data,
            field_definitions=self.test_field_definitions,
            sop_metadata=self.test_sop_metadata
        )
        
        # Verify draft_uuid is empty string
        file_basename = eln_metadata.filename.replace('.json', '') if eln_metadata.filename.endswith('.json') else eln_metadata.filename
        eln_data = await self.storage_manager.get_document("submissions", "EmptySOP", file_basename)
        actual_draft_uuid = eln_data.get('draft_uuid')
        
        assert actual_draft_uuid == "", f"Should be empty string when no drafts exist, got '{actual_draft_uuid}'"
        print(f"✓ SUCCESS: Empty string used when no drafts exist")
    
    async def test_debug_storage_manager_draft_lookup(self):
        """Debug test to trace exactly what happens in draft lookup"""
        
        # Create a draft
        print(f"\n=== DEBUG: Creating draft and tracing lookup ===")
        draft_id, _ = await self.storage_manager.save_document(
            document_type="drafts",
            sop_id=self.test_sop_id,
            user_id=self.test_user_id,
            filename_variables=self.test_filename_variables,
            data=self.test_form_data
        )
        print(f"Created draft: {draft_id}")
        
        # Manually test the lookup logic used in StorageManager.save_document for submissions
        print(f"\n=== DEBUG: Manual draft lookup ===")
        drafts = await self.storage_manager.list_documents(
            document_type="drafts",
            sop_id=self.test_sop_id,
            metadata_class=DraftMetadata,
            user_id=self.test_user_id
        )
        print(f"StorageManager.list_documents() returned: {len(drafts)} drafts")
        
        if drafts:
            most_recent_draft = drafts[0]
            draft_uuid = most_recent_draft.draft_uuid
            print(f"Most recent draft: {most_recent_draft.draft_id}")
            print(f"Draft UUID: {draft_uuid}")
            print(f"Draft timestamp: {most_recent_draft.timestamp}")
        else:
            draft_uuid = None
            print("No drafts found!")
        
        # Now test ELN submission with logging
        print(f"\n=== DEBUG: ELN submission with logging ===")
        with patch('rawscribe.utils.storage_factory.logger') as mock_logger:
            _, eln_metadata = await self.storage_manager.save_document(
                document_type="submissions",
                sop_id=self.test_sop_id,
                user_id=self.test_user_id,
                status='final',
                filename_variables=self.test_filename_variables,
                data=self.test_form_data,
                field_definitions=self.test_field_definitions,
                sop_metadata=self.test_sop_metadata
            )
            
            # Check what was logged
            print(f"Logger calls:")
            for call in mock_logger.info.call_args_list:
                print(f"  INFO: {call}")
            for call in mock_logger.warning.call_args_list:
                print(f"  WARNING: {call}")
        
        # Verify the final result
        file_basename = eln_metadata.filename.replace('.json', '') if eln_metadata.filename.endswith('.json') else eln_metadata.filename
        eln_data = await self.storage_manager.get_document("submissions", self.test_sop_id, file_basename)
        actual_draft_uuid = eln_data.get('draft_uuid')
        print(f"\nFinal result - draft_uuid in ELN: '{actual_draft_uuid}'")
        print(f"Expected draft_uuid: '{draft_uuid}'")
        
        # This should pass if our fix works
        if draft_uuid:
            assert actual_draft_uuid == draft_uuid, f"Expected '{draft_uuid}', got '{actual_draft_uuid}'"
            print(f"✓ SUCCESS: Draft UUID correctly populated")
        else:
            assert actual_draft_uuid == "", f"Expected empty string, got '{actual_draft_uuid}'"
            print(f"✓ SUCCESS: Empty string when no drafts") 