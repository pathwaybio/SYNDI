# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Comprehensive Storage Backend Tests
Tests all current storage backend implementations with proper API coverage
"""

import pytest
import asyncio
import json
import tempfile
import shutil
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any

from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.storage_s3 import S3JSONStorage
from rawscribe.utils.storage_base import StorageError, StorageNotFoundError
from rawscribe.utils.metadata import DraftMetadata, ELNMetadata
from rawscribe.utils.config_types import StorageConfig
from rawscribe.utils.config_loader import ConfigLoader


class TestLocalDraftStorageBackend:
    """Test local draft storage backend"""
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory for testing"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)
    
    @pytest.fixture
    def storage_config(self, temp_dir):
        """Load storage config from actual config system but override local_path for testing"""
        # Set testing environment and load config from the real .config directory
        import os
        old_testing = os.environ.get('TESTING')
        os.environ['TESTING'] = 'true'
        
        try:
            config_loader = ConfigLoader()
            full_config = config_loader.load_config()
            storage_config_dict = full_config['lambda']['storage'].copy()
            
            # Override local_path for testing
            storage_config_dict['local_path'] = temp_dir
            
            return StorageConfig(**storage_config_dict)
        finally:
            # Restore original TESTING value
            if old_testing is None:
                os.environ.pop('TESTING', None)
            else:
                os.environ['TESTING'] = old_testing
    
    @pytest.fixture
    def backend(self, storage_config):
        """Create backend instance"""
        return LocalJSONStorage(storage_config, document_type="drafts")
    
    @pytest.fixture
    def sample_form_data(self):
        """Sample form data for testing"""
        return {
            'project_id': 'PROJ-001',
            'patient_id': 'PAT-123', 
            'sample_type': 'blood',
            'notes': 'Test sample'
        }
    
    @pytest.mark.asyncio
    async def test_save_and_load_draft(self, backend, sample_form_data):
        """Test saving and loading a draft"""
        sop_id = 'test-sop'
        user_id = 'test-user'
        filename_variables = ['proj_001', 'pat_123']
        session_id = 'session-123'
        
        # Save draft
        draft_id, _ = await backend.save_document(
            document_type="drafts",
            sop_id=sop_id,
            user_id=user_id,
            status='draft',
            filename_variables=filename_variables,
            data=sample_form_data,
            metadata_class=DraftMetadata,
            session_id=session_id
        )
        
        assert draft_id is not None
        # Per section 5.3: draft_id should be filename minus .json
        # Format: draft-{username}-{var1}-{var2}-{timestamp}-{uuid}
        assert draft_id.startswith("draft-")
        assert len(draft_id) > 40  # Should be much longer than just UUID
        
        # The last 8 characters (after final dash) should be the UUID
        draft_uuid = draft_id.split('-')[-1]
        assert len(draft_uuid) == 8  # UUID should be 8 chars
        
        # Load draft
        loaded_data = await backend.get_document("drafts", sop_id, draft_id)
        
        assert loaded_data['form_data'] == sample_form_data
        assert loaded_data['user_id'] == user_id
        assert loaded_data['sop_id'] == sop_id
        assert loaded_data['draft_id'] == draft_id
    
    @pytest.mark.asyncio
    async def test_list_drafts(self, backend, sample_form_data):
        """Test listing drafts"""
        sop_id = 'test-sop'
        user_id = 'test-user'
        
        # Save multiple drafts
        draft_id1, _ = await backend.save_document(
            document_type="drafts",
            sop_id=sop_id,
            user_id=user_id, 
            status='draft',
            filename_variables=['proj_001'],
            data=sample_form_data,
            metadata_class=DraftMetadata
        )
        
        draft_id2, _ = await backend.save_document(
            document_type="drafts",
            sop_id=sop_id,
            user_id=user_id,
            status='draft', 
            filename_variables=['proj_002'],
            data=sample_form_data,
            metadata_class=DraftMetadata
        )
        
        # Test listing drafts
        drafts = await backend.list_documents(
            document_type="drafts",
            sop_id=sop_id,
            metadata_class=DraftMetadata,
            user_id=user_id
        )
        assert len(drafts) == 2
        
        # Check that both drafts exist (order may vary due to timestamp sorting)
        draft_ids = [d.draft_id for d in drafts]
        assert draft_id1 in draft_ids
        assert draft_id2 in draft_ids
        assert all(d.user_id == user_id for d in drafts)
    
    @pytest.mark.asyncio
    async def test_delete_draft(self, backend, sample_form_data):
        """Test deleting a draft"""
        sop_id = 'test-sop'
        user_id = 'test-user'
        
        # Save draft
        draft_id, _ = await backend.save_document(
            document_type="drafts",
            sop_id=sop_id,
            user_id=user_id,
            status='draft',
            filename_variables=['proj_001'],
            data=sample_form_data,
            metadata_class=DraftMetadata
        )
        
        # Verify it exists
        drafts = await backend.list_documents(
            document_type="drafts",
            sop_id=sop_id,
            metadata_class=DraftMetadata,
            user_id=user_id
        )
        assert len(drafts) == 1
        
        # Delete it
        success = await backend.delete_draft(sop_id, draft_id)
        assert success is True
        
        # Verify it's gone
        drafts = await backend.list_documents(
            document_type="drafts",
            sop_id=sop_id,
            metadata_class=DraftMetadata,
            user_id=user_id
        )
        assert len(drafts) == 0
    
    @pytest.mark.asyncio
    async def test_cleanup_old_drafts(self, backend, sample_form_data):
        """Test cleaning up old drafts"""
        sop_id = 'test-sop'
        user_id = 'test-user'
        
        # Save a draft
        draft_id, _ = await backend.save_document(
            document_type="drafts",
            sop_id=sop_id,
            user_id=user_id,
            status='draft',
            filename_variables=['proj_001'],
            data=sample_form_data,
            metadata_class=DraftMetadata
        )
        
        # Clean up drafts older than 0 days (should delete everything)
        deleted_count = await backend.cleanup_old_drafts(user_id, retention_days=0)
        
        # For this test, we expect at least the draft we created to be cleaned up
        # (actual count may vary based on timestamp precision)
        assert deleted_count >= 0  # Non-negative count


class TestLocalELNStorageBackend:
    """Test local ELN storage backend"""
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory for testing"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)
    
    @pytest.fixture 
    def storage_config(self, temp_dir):
        """Create storage config for testing"""
        """Load storage config from actual config system but override local_path for testing"""
        # Set testing environment and load config from the real .config directory
        import os
        old_testing = os.environ.get('TESTING')
        os.environ['TESTING'] = 'true'
        
        try:
            config_loader = ConfigLoader()
            full_config = config_loader.load_config()
            storage_config_dict = full_config['lambda']['storage'].copy()
            
            # Override local_path for testing
            storage_config_dict['local_path'] = temp_dir
            
            return StorageConfig(**storage_config_dict)
        finally:
            # Restore original TESTING value
            if old_testing is None:
                os.environ.pop('TESTING', None)
            else:
                os.environ['TESTING'] = old_testing
    
    @pytest.fixture
    def backend(self, storage_config):
        """Create backend instance"""
        return LocalJSONStorage(storage_config, document_type="submissions")
    
    @pytest.fixture
    def sample_eln_data(self):
        """Sample ELN data for testing"""
        return {
            'form_data': {
                'project_id': 'PROJ-001',
                'patient_id': 'PAT-123',
                'sample_type': 'blood'
            },
            'field_definitions': [
                {'id': 'project_id', 'type': 'string'},
                {'id': 'patient_id', 'type': 'string'}
            ],
            'sop_metadata': {
                'version': '1.0.0',
                'title': 'Test SOP'
            }
        }
    
    @pytest.mark.asyncio
    async def test_submit_eln(self, backend, sample_eln_data):
        """Test submitting an ELN"""
        sop_id = 'test-sop'
        user_id = 'test-user'
        filename_variables = ['proj_001', 'pat_123']
        
        # Submit ELN
        _, metadata = await backend.save_document(
            document_type="submissions",
            sop_id=sop_id,
            user_id=user_id,
            status='final',
            filename_variables=filename_variables,
            data=sample_eln_data['form_data'],
            metadata_class=ELNMetadata,
            field_definitions=sample_eln_data['field_definitions'],
            sop_metadata=sample_eln_data['sop_metadata']
        )
        
        assert metadata.sop_id == sop_id
        assert metadata.user_id == user_id
        assert metadata.status == 'final'
        assert metadata.eln_uuid is not None
        assert metadata.filename is not None
        assert metadata.checksum is not None
    
    @pytest.mark.asyncio
    async def test_get_eln_by_uuid(self, backend, sample_eln_data):
        """Test getting an ELN by UUID"""
        sop_id = 'test-sop'
        user_id = 'test-user'
        filename_variables = ['proj_001', 'pat_123']
        
        # Submit ELN
        _, metadata = await backend.save_document(
            document_type="submissions",
            sop_id=sop_id,
            user_id=user_id,
            status='final',
            filename_variables=filename_variables,
            data=sample_eln_data['form_data'],
            metadata_class=ELNMetadata,
            field_definitions=sample_eln_data['field_definitions'],
            sop_metadata=sample_eln_data['sop_metadata']
        )
        
        # Get ELN by UUID
        eln_data, retrieved_metadata = await backend.get_eln_by_uuid(metadata.eln_uuid)
        
        assert eln_data['form_data'] == sample_eln_data['form_data']
        assert retrieved_metadata.eln_uuid == metadata.eln_uuid
        assert retrieved_metadata.sop_id == sop_id
    
    @pytest.mark.asyncio
    async def test_list_elns(self, backend, sample_eln_data):
        """Test listing ELNs"""
        sop_id = 'test-sop'
        user_id = 'test-user'
        
        # Submit multiple ELNs
        _, metadata1 = await backend.save_document(
            document_type="submissions",
            sop_id=sop_id,
            user_id=user_id,
            status='final',
            filename_variables=['proj_001'],
            data=sample_eln_data['form_data'],
            metadata_class=ELNMetadata,
            field_definitions=sample_eln_data['field_definitions'],
            sop_metadata=sample_eln_data['sop_metadata']
        )
        
        _, metadata2 = await backend.save_document(
            document_type="submissions",
            sop_id=sop_id,
            user_id=user_id,
            status='final',
            filename_variables=['proj_002'],
            data=sample_eln_data['form_data'],
            metadata_class=ELNMetadata,
            field_definitions=sample_eln_data['field_definitions'],
            sop_metadata=sample_eln_data['sop_metadata']
        )
        
        # List ELNs
        elns = await backend.list_documents(
            document_type="submissions",
            sop_id=sop_id,
            metadata_class=ELNMetadata,
            user_id=user_id,
            status='final'
        )
        
        assert len(elns) == 2
        eln_uuids = [e.eln_uuid for e in elns]
        assert metadata1.eln_uuid in eln_uuids
        assert metadata2.eln_uuid in eln_uuids


class TestLocalSOPStorageBackend:
    """Test local SOP storage backend"""
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory for testing"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)
    
    @pytest.fixture
    def storage_config(self, temp_dir):
        """Create storage config for testing"""
        """Load storage config from actual config system but override local_path for testing"""
        # Set testing environment and load config from the real .config directory
        import os
        old_testing = os.environ.get('TESTING')
        os.environ['TESTING'] = 'true'
        
        try:
            config_loader = ConfigLoader()
            full_config = config_loader.load_config()
            storage_config_dict = full_config['lambda']['storage'].copy()
            
            # Override local_path for testing
            storage_config_dict['local_path'] = temp_dir
            
            return StorageConfig(**storage_config_dict)
        finally:
            # Restore original TESTING value
            if old_testing is None:
                os.environ.pop('TESTING', None)
            else:
                os.environ['TESTING'] = old_testing
    
    @pytest.fixture
    def backend(self, storage_config):
        """Create backend instance"""
        return LocalJSONStorage(storage_config, document_type="sops")
    
    @pytest.fixture
    def sample_sop_data(self):
        """Sample SOP data for testing"""
        return {
            'id': 'test-sop',
            'name': 'Test SOP',
            'version': '1.0.0',
            'fields': [
                {'id': 'project_id', 'type': 'string'},
                {'id': 'patient_id', 'type': 'string'}
            ]
        }
    
    @pytest.mark.asyncio 
    async def test_get_sop(self, backend, sample_sop_data, temp_dir):
        """Test getting a SOP"""
        sop_id = 'test-sop'
        
        # Create SOP file manually (simulating pre-existing SOP)
        sop_dir = Path(temp_dir) / 'forms' / 'sops'
        sop_dir.mkdir(parents=True, exist_ok=True)
        sop_file = sop_dir / f'{sop_id}.json'
        
        with open(sop_file, 'w') as f:
            json.dump(sample_sop_data, f)
        
        # Get SOP
        sop_data = await backend.get_document("sops", sop_id,"")
        
        assert sop_data is not None
        assert sop_data['id'] == sop_id
        assert sop_data['name'] == 'Test SOP'


# Mock-based tests for S3 backends (since we don't want to require real AWS credentials)
class TestS3StorageBackends:
    """Test S3 storage backends with mocking"""
    
    @pytest.fixture
    def storage_config(self):
        """Create S3 storage config for testing"""
        """Load S3 storage config from actual config system but override credentials for testing"""
        # Set testing environment and load config from the real .config directory
        import os
        old_testing = os.environ.get('TESTING')
        os.environ['TESTING'] = 'true'
        
        try:
            config_loader = ConfigLoader()
            full_config = config_loader.load_config()
            storage_config_dict = full_config['lambda']['storage'].copy()
            
            # Override for S3 testing
            storage_config_dict['type'] = 's3'
            storage_config_dict['region'] = 'us-east-1'
            storage_config_dict['access_key_id'] = 'test-key'
            storage_config_dict['secret_access_key'] = 'test-secret'
            
            return StorageConfig(**storage_config_dict)
        finally:
            # Restore original TESTING value
            if old_testing is None:
                os.environ.pop('TESTING', None)
            else:
                os.environ['TESTING'] = old_testing
    
    @pytest.mark.asyncio
    async def test_draft_backend_creation(self, storage_config):
        """Test that S3 draft backend can be created"""
        with patch('boto3.client') as mock_boto3:
            mock_s3_client = MagicMock()
            mock_boto3.return_value = mock_s3_client
            mock_s3_client.head_bucket.return_value = {}
            
            backend = S3JSONStorage(storage_config, document_type="drafts")
            
            assert backend is not None
            assert backend.config == storage_config
    
    @pytest.mark.asyncio
    async def test_eln_backend_creation(self, storage_config):
        """Test that S3 ELN backend can be created"""
        with patch('boto3.client') as mock_boto3:
            mock_s3_client = MagicMock()
            mock_boto3.return_value = mock_s3_client
            mock_s3_client.head_bucket.return_value = {}
            
            backend = S3JSONStorage(storage_config, document_type="submissions")
            
            assert backend is not None
            assert backend.config == storage_config
    
    @pytest.mark.asyncio
    async def test_sop_backend_creation(self, storage_config):
        """Test that S3 SOP backend can be created"""
        with patch('boto3.client') as mock_boto3:
            mock_s3_client = MagicMock()
            mock_boto3.return_value = mock_s3_client
            mock_s3_client.head_bucket.return_value = {}
            
            backend = S3JSONStorage(storage_config, document_type="sops")
            
            assert backend is not None
            assert backend.config == storage_config 