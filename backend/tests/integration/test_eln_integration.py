# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Integration tests for ELN system
Tests end-to-end ELN submission and immutable storage validation
"""

import pytest
import asyncio
from datetime import datetime, timezone
import tempfile
import shutil
from pathlib import Path
import json
from typing import List

from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_base import ImmutableStorageError, StorageNotFoundError
from rawscribe.utils.metadata import ELNMetadata
from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.eln_filename_utils import parse_eln_filename
from rawscribe.utils.filename_generator import FilenameGenerator
from rawscribe.utils.config_types import StorageConfig

class TestELNIntegration:
    """Integration tests for complete ELN workflow"""
    
    def setup_method(self):
        """Set up test environment"""
        self.temp_dir = tempfile.mkdtemp()
        
        self.config = StorageConfig(
            type='local',
            local_path=self.temp_dir
        )
        
        self.storage = StorageManager(self.config)  # No fallback needed for integration tests
        
        # Sample test data
        self.sop_id = "SOP-TEST-001"
        self.user_id = "integration_test_user"
        
        self.form_data = {
            'project_id': 'INTEGRATION-001',
            'patient_id': 'PAT-INT-001',
            'procedure_date': '2024-01-15',
            'notes': 'Integration test notes'
        }
        
        self.sop_fields = [
            {
                'id': 'project_id',
                'name': 'Project ID',
                '_schemaType': 'Field',
                'children': [
                    {
                        '_schemaType': 'ELNFilenameComponent',
                        'is_component': True,
                        'order': 1
                    }
                ]
            },
            {
                'id': 'patient_id',
                'name': 'Patient ID',
                '_schemaType': 'Field',
                'children': [
                    {
                        '_schemaType': 'ELNFilenameComponent',
                        'is_component': True,
                        'order': 2
                    }
                ]
            },
            {
                'id': 'procedure_date',
                'name': 'Procedure Date',
                '_schemaType': 'Field',
                'children': []  # Not in filename
            }
        ]
    
    def teardown_method(self):
        """Clean up test environment"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def _extract_filename_variables(self, form_data: dict = None) -> List[str]:
        """Helper to extract filename variables from form data based on sop_fields"""
        if form_data is None:
            form_data = self.form_data
            
        filename_variables = []
        for field in self.sop_fields:
            field_id = field.get('id')
            if field_id and any(child.get('_schemaType') == 'ELNFilenameComponent' for child in field.get('children', [])):
                if field_id in form_data:
                    filename_variables.append(str(form_data[field_id]))
        return filename_variables

    @pytest.mark.asyncio
    async def test_complete_eln_workflow(self):
        """Test complete ELN submission and retrieval workflow"""
        
        # Step 1: Submit a draft ELN
        _, draft_metadata = await self.storage.save_document(
            document_type='submissions',
            sop_id=self.sop_id,
            user_id=self.user_id,
            status='draft',
            filename_variables=self._extract_filename_variables(),
            data=self.form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Verify draft submission
        assert draft_metadata.status == 'draft'
        assert draft_metadata.sop_id == self.sop_id
        assert draft_metadata.user_id == self.user_id
        assert 'integration_001' in draft_metadata.filename.lower()
        assert 'pat_int_001' in draft_metadata.filename.lower()
        
        # Step 2: Retrieve the draft ELN
        file_basename = draft_metadata.filename.replace('.json', '') if draft_metadata.filename.endswith('.json') else draft_metadata.filename
        draft_data = await self.storage.get_document("submissions", self.sop_id, file_basename)
        
        assert draft_data['eln_uuid'] == draft_metadata.eln_uuid
        assert draft_data['form_data'] == self.form_data
        assert draft_data['status'] == 'draft'
        
        # Step 3: Submit a final ELN with modified data
        final_form_data = self.form_data.copy()
        final_form_data['notes'] = 'Final version notes'
        
        _, final_metadata = await self.storage.save_document(
            document_type='submissions',
            sop_id=self.sop_id,
            user_id=self.user_id,
            status='final',
            filename_variables=self._extract_filename_variables(final_form_data),
            data=final_form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Verify final submission
        assert final_metadata.status == 'final'
        assert final_metadata.filename != draft_metadata.filename
        assert final_metadata.filename.startswith('final-')
        
        # Step 4: List all ELNs for this SOP
        all_elns = await self.storage.list_documents(
            document_type="submissions",
            sop_id=self.sop_id,
            metadata_class=ELNMetadata
        )
        assert len(all_elns) == 2

        # Test filtering by status
        final_elns = await self.storage.list_documents(
            document_type="submissions",
            sop_id=self.sop_id,
            metadata_class=ELNMetadata,
            status='final'
        )
        assert len(final_elns) == 1

        draft_elns = await self.storage.list_documents(
            document_type="submissions",
            sop_id=self.sop_id,
            metadata_class=ELNMetadata,
            status='draft'
        )
        assert len(draft_elns) == 1
        
        # Step 6: Query prerequisite ELNs
        matching_elns = await self.storage.query_prerequisite_elns(
            sop_id=self.sop_id,
            field_filters={'project_id': 'INTEGRATION-001'}
        )
        
        assert len(matching_elns) == 2  # Both ELNs should match
        
        # Query with more specific filter
        final_only = await self.storage.query_prerequisite_elns(
            sop_id=self.sop_id,
            field_filters={
                'project_id': 'INTEGRATION-001',
                'notes': 'Final version notes'
            }
        )
        
        assert len(final_only) == 1
        eln_data, metadata = final_only[0]
        assert metadata.status == 'final'

    @pytest.mark.asyncio
    async def test_immutable_storage_enforcement(self):
        """Test that immutable storage prevents overwrites"""
        
        # Submit initial ELN
        _, metadata1 = await self.storage.save_document(
            document_type='submissions',
            sop_id=self.sop_id,
            user_id=self.user_id,
            status='final',
            filename_variables=self._extract_filename_variables(),
            data=self.form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Verify ELN was stored successfully by retrieving it through the API
        file_basename = metadata1.filename.replace('.json', '') if metadata1.filename.endswith('.json') else metadata1.filename
        retrieved_data = await self.storage.get_document("submissions", self.sop_id, file_basename)
        assert retrieved_data is not None
        assert retrieved_data['sop_id'] == self.sop_id
        
        # Attempt to submit ELN with same filename (should be prevented by UUID collision)
        # This is unlikely but possible in edge cases
        
        # Verify immutability validation
        is_valid_new = await self.storage.validate_eln_immutability(
            self.sop_id, 
            'new-filename.json'
        )
        assert is_valid_new == True
        
        is_valid_existing = await self.storage.validate_eln_immutability(
            self.sop_id,
            metadata1.filename
        )
        assert is_valid_existing == False

    @pytest.mark.asyncio
    async def test_eln_retrieval_by_uuid(self):
        """Test ELN retrieval by UUID across different SOPs"""
        
        # Submit ELNs to different SOPs
        _, sop1_metadata = await self.storage.save_document(
            document_type='submissions',
            sop_id='SOP-001',
            user_id=self.user_id,
            status='final',
            filename_variables=self._extract_filename_variables(),
            data=self.form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        _, sop2_metadata = await self.storage.save_document(
            document_type='submissions',
            sop_id='SOP-002',
            user_id=self.user_id,
            status='draft',
            filename_variables=self._extract_filename_variables(),
            data=self.form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Retrieve by UUID should work across SOPs
        eln1_data, eln1_meta = await self.storage.get_eln_by_uuid(sop1_metadata.eln_uuid)
        assert eln1_data['sop_id'] == 'SOP-001'
        assert eln1_meta.status == 'final'
        
        eln2_data, eln2_meta = await self.storage.get_eln_by_uuid(sop2_metadata.eln_uuid)
        assert eln2_data['sop_id'] == 'SOP-002'
        assert eln2_meta.status == 'draft'
        
        # Test non-existent UUID
        with pytest.raises(StorageNotFoundError):
            await self.storage.get_eln_by_uuid('nonexistent-uuid')

    @pytest.mark.asyncio
    async def test_filename_generation_consistency(self):
        """Test that filename generation is consistent and deterministic"""
        
        generator = FilenameGenerator()
        
        # Test same inputs produce different filenames (due to timestamp/UUID)
        _, metadata1 = await self.storage.save_document(
            document_type='submissions',
            sop_id=self.sop_id,
            user_id=self.user_id,
            status='final',
            filename_variables=self._extract_filename_variables(),
            data=self.form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Wait a moment to ensure different timestamp
        await asyncio.sleep(0.1)
        
        _, metadata2 = await self.storage.save_document(
            document_type='submissions',
            sop_id=self.sop_id,
            user_id=self.user_id,
            status='final',
            filename_variables=self._extract_filename_variables(),
            data=self.form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Filenames should be different
        assert metadata1.filename != metadata2.filename
        
        # But structure should be similar
        parsed1 = parse_eln_filename(metadata1.filename)
        parsed2 = parse_eln_filename(metadata2.filename)
        
        assert parsed1['status'] == parsed2['status']
        assert parsed1['username'] == parsed2['username']
        assert parsed1['variables'] == parsed2['variables']
        # timestamps and UUIDs should be different

    @pytest.mark.asyncio
    async def test_large_form_data_handling(self):
        """Test handling of large form data"""
        
        # Create large form data
        large_form_data = self.form_data.copy()
        large_form_data['large_field'] = 'x' * 10000  # 10KB of data
        large_form_data['array_field'] = list(range(1000))  # Large array
        
        # Submit ELN with large data
        _, metadata = await self.storage.save_document(
            document_type='submissions',
            sop_id=self.sop_id,
            user_id=self.user_id,
            status='final',
            filename_variables=self._extract_filename_variables(large_form_data),
            data=large_form_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Verify submission succeeded
        assert metadata.size_bytes > 10000
        
        # Retrieve and verify data integrity
        file_basename = metadata.filename.replace('.json', '') if metadata.filename.endswith('.json') else metadata.filename
        retrieved_data = await self.storage.get_document("submissions", self.sop_id, file_basename)
        
        assert retrieved_data['form_data']['large_field'] == 'x' * 10000
        assert retrieved_data['form_data']['array_field'] == list(range(1000))

    @pytest.mark.asyncio
    async def test_concurrent_submissions(self):
        """Test concurrent ELN submissions"""
        
        # Create multiple submission tasks
        async def submit_eln(user_suffix):
            _, metadata = await self.storage.save_document(
                document_type='submissions',
                sop_id=self.sop_id,
                user_id=f"{self.user_id}_{user_suffix}",
                status='final',
                filename_variables=self._extract_filename_variables(),
                data=self.form_data,
                field_definitions=self.sop_fields,
                sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
            )
            return metadata
        
        # Submit multiple ELNs concurrently
        tasks = [submit_eln(i) for i in range(5)]
        metadatas = await asyncio.gather(*tasks)
        
        # Verify all submissions succeeded
        assert len(metadatas) == 5
        
        # Verify all have unique filenames and UUIDs
        filenames = [m.filename for m in metadatas]
        uuids = [m.eln_uuid for m in metadatas]
        
        assert len(set(filenames)) == 5  # All unique
        assert len(set(uuids)) == 5      # All unique
        
        # Verify all can be retrieved
        for metadata in metadatas:
            # Extract basename without .json extension if present
            file_basename = metadata.filename.replace('.json', '') if metadata.filename.endswith('.json') else metadata.filename
            retrieved = await self.storage.get_document("submissions", self.sop_id, file_basename)
            assert retrieved['eln_uuid'] == metadata.eln_uuid

    @pytest.mark.asyncio
    async def test_edge_case_field_values(self):
        """Test handling of edge case field values"""
        
        edge_case_data = {
            'empty_string': '',
            'none_value': None,
            'unicode_text': 'Hello 世界 🌍',
            'special_chars': '!@#$%^&*()[]{}|\\:";\'<>?,./`~',
            'very_long_text': 'a' * 1000,
            'numeric_string': '12345',
            'boolean_value': True,
            'nested_object': {'key': 'value', 'number': 42},
            'project_id': 'EDGE-CASE-001',  # For filename
            'patient_id': 'PAT-EDGE-001'   # For filename
        }
        
        # Submit ELN with edge case data
        _, metadata = await self.storage.save_document(
            document_type='submissions',
            sop_id=self.sop_id,
            user_id=self.user_id,
            status='final',
            filename_variables=self._extract_filename_variables(edge_case_data),
            data=edge_case_data,
            field_definitions=self.sop_fields,
            sop_metadata={'id': self.sop_id, 'title': f'SOP {self.sop_id}'}
        )
        
        # Verify submission succeeded
        assert metadata.eln_uuid is not None
        assert 'edge_case_001' in metadata.filename.lower()
        
        # Retrieve and verify data integrity
        file_basename = metadata.filename.replace('.json', '') if metadata.filename.endswith('.json') else metadata.filename
        retrieved_data = await self.storage.get_document("submissions", self.sop_id, file_basename)
        
        # Check that all data is preserved correctly
        form_data = retrieved_data['form_data']
        assert form_data['empty_string'] == ''
        assert form_data['none_value'] is None
        assert form_data['unicode_text'] == 'Hello 世界 🌍'
        assert form_data['nested_object'] == {'key': 'value', 'number': 42} 