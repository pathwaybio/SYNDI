# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for ELN storage functionality
Tests immutable storage, S3 operations, and metadata handling
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timezone
import json
import boto3
from moto import mock_aws
from pathlib import Path
import tempfile
import shutil

# Tests updated to use current storage API

from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.storage_base import StorageError, StorageNotFoundError, ImmutableStorageError
from rawscribe.utils.metadata import ELNMetadata
from rawscribe.utils.storage_s3 import S3JSONStorage
from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.config_types import StorageConfig

class TestS3StorageBackend:
    """Test S3 storage backend for ELN operations"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.config = StorageConfig(
            type='s3',
            bucket_name='test-claire-bucket',  # Legacy field
            eln_bucket_name='test-claire-bucket',  # For submissions
            draft_bucket_name='test-claire-drafts',  # For drafts
            forms_bucket_name='test-claire-forms',  # For SOPs
            region='us-east-1',
            access_key_id='test-access-key',
            secret_access_key='test-secret-key'
        )
        
        self.sample_form_data = {
            'project_id': 'PROJ-001',
            'patient_id': 'PAT-123',
            'procedure_date': '2024-01-15'
        }
        
        self.sample_sop_fields = [
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
            }
        ]

    @pytest.mark.asyncio
    async def test_submit_eln_success(self):
        """Test successful ELN submission"""
        with mock_aws():
            # Create mock S3 bucket
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket=self.config.eln_bucket_name)
            
            backend = S3JSONStorage(self.config, document_type="submissions")
            
            with patch('rawscribe.utils.filename_generator.datetime') as mock_datetime:
                mock_datetime.now.return_value = datetime(2024, 1, 15, 14, 30, 22, tzinfo=timezone.utc)
                
                with patch('rawscribe.utils.filename_generator.uuid.uuid4') as mock_uuid:
                    mock_uuid.return_value.__str__ = Mock(return_value='abcd1234-5678-90ab-cdef-1234567890ab')
                    
                    # Test ELN submission
                    _, metadata = await backend.save_document(
            document_type="submissions",
                        sop_id='SOP-001',
                        user_id='test_user',
                        status='final',
                        filename_variables=['proj_001', 'pat_123'],
                        data=self.sample_form_data,
                        metadata_class=ELNMetadata,
                        field_definitions=self.sample_sop_fields,
                        sop_metadata={'sop_id': 'SOP-001', 'title': 'Test SOP'}
                    )
                    
                    # Verify metadata
                    assert metadata.eln_uuid == 'abcd1234'
                    assert metadata.sop_id == 'SOP-001'
                    assert metadata.user_id == 'test_user'
                    assert metadata.status == 'final'
                    assert metadata.filename.startswith('final-test_user-proj_001-pat_123')
                    assert metadata.filename.endswith('.json')
                    
                    # Verify file was uploaded to S3
                    eln_key = f"submissions/SOP-001/{metadata.filename}"
                    response = s3_client.get_object(Bucket=self.config.bucket_name, Key=eln_key)
                    stored_data = json.loads(response['Body'].read().decode('utf-8'))
                    
                    assert stored_data['eln_uuid'] == 'abcd1234'
                    assert stored_data['form_data'] == self.sample_form_data

    @pytest.mark.asyncio
    async def test_submit_eln_immutability_violation(self):
        """Test ELN submission with immutability violation"""
        with mock_aws():
            # Create mock S3 bucket
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket=self.config.eln_bucket_name)
            
            backend = S3JSONStorage(self.config, document_type="submissions")
            
            # Pre-upload an ELN to cause collision
            test_filename = 'final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json'
            test_key = f"submissions/SOP-001/{test_filename}"
            s3_client.put_object(
                Bucket=self.config.bucket_name,
                Key=test_key,
                Body='{"test": "data"}'
            )
            
            with patch('rawscribe.utils.filename_generator.datetime') as mock_datetime:
                mock_datetime.now.return_value = datetime(2024, 1, 15, 14, 30, 22, tzinfo=timezone.utc)
                
                with patch('rawscribe.utils.filename_generator.uuid.uuid4') as mock_uuid:
                    mock_uuid.return_value.__str__ = Mock(return_value='abcd1234-5678-90ab-cdef-1234567890ab')
                    
                    # Should fail due to existing file
                    with pytest.raises(ImmutableStorageError):
                        await backend.save_document(
            document_type="submissions",
                            sop_id='SOP-001',
                            user_id='test_user', 
                            status='final',
                            filename_variables=['proj_001', 'pat_123'],
                                                    data=self.sample_form_data,
                        metadata_class=ELNMetadata,
                        field_definitions=self.sample_sop_fields,
                            sop_metadata={'sop_id': 'SOP-001', 'title': 'Test SOP'}
                        )

    @pytest.mark.asyncio
    async def test_get_eln_success(self):
        """Test successful ELN retrieval"""
        with mock_aws():
            # Create mock S3 bucket
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket=self.config.eln_bucket_name)
            
            backend = S3JSONStorage(self.config, document_type="submissions")
            
            # Upload test ELN
            test_filename = 'final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json'
            test_key = f"submissions/SOP-001/{test_filename}"
            test_data = {
                'eln_uuid': 'abcd1234',
                'filename': test_filename,
                'sop_id': 'SOP-001',
                'user_id': 'test_user',
                'status': 'final',
                'form_data': self.sample_form_data
            }
            
            s3_client.put_object(
                Bucket=self.config.bucket_name,
                Key=test_key,
                Body=json.dumps(test_data)
            )
            
            # Test retrieval
            file_basename = test_filename.replace('.json', '') if test_filename.endswith('.json') else test_filename
            retrieved_data = await backend.get_document("submissions", 'SOP-001', file_basename)
            
            assert retrieved_data['eln_uuid'] == 'abcd1234'
            assert retrieved_data['form_data'] == self.sample_form_data

    @pytest.mark.asyncio
    async def test_get_eln_not_found(self):
        """Test ELN retrieval with non-existent file"""
        with mock_aws():
            # Create mock S3 bucket
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket=self.config.eln_bucket_name)
            
            backend = S3JSONStorage(self.config, document_type="submissions")
            
            # Test retrieval of non-existent ELN
            result = await backend.get_document("submissions", 'SOP-001', 'nonexistent')
            assert result is None

    @pytest.mark.asyncio
    async def test_get_eln_by_uuid_success(self):
        """Test successful ELN retrieval by UUID"""
        with mock_aws():
            # Create mock S3 bucket
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket=self.config.eln_bucket_name)
            
            backend = S3JSONStorage(self.config, document_type="submissions")
            
            # Upload test ELN with metadata
            test_filename = 'final-test_user-proj_001-pat_123-20240115_143022-abcd1234.json'
            test_key = f"submissions/SOP-001/{test_filename}"
            test_data = {
                'eln_uuid': 'abcd1234',
                'filename': test_filename,
                'sop_id': 'SOP-001',
                'user_id': 'test_user',
                'status': 'final',
                'timestamp': '2024-01-15T14:30:22+00:00',
                'form_data': self.sample_form_data
            }
            
            s3_client.put_object(
                Bucket=self.config.bucket_name,
                Key=test_key,
                Body=json.dumps(test_data),
                Metadata={
                    'eln-uuid': 'abcd1234',
                    'user-id': 'test_user',
                    'status': 'final'
                }
            )
            
            # Test retrieval by UUID
            eln_data, metadata = await backend.get_eln_by_uuid('abcd1234')
            
            assert eln_data['eln_uuid'] == 'abcd1234'
            assert metadata.eln_uuid == 'abcd1234'
            assert metadata.sop_id == 'SOP-001'

    @pytest.mark.asyncio
    async def test_list_elns_success(self):
        """Test successful ELN listing"""
        with mock_aws():
            # Create mock S3 bucket
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket=self.config.eln_bucket_name)
            
            backend = S3JSONStorage(self.config, document_type="submissions")
            
            # Upload multiple test ELNs
            test_elns = [
                {
                    'filename': 'final-user1-proj_001-pat_123-20240115_143022-uuid0001.json',
                    'user_id': 'user1',
                    'status': 'final'
                },
                {
                    'filename': 'draft-user2-proj_002-pat_456-20240116_143022-uuid0002.json', 
                    'user_id': 'user2',
                    'status': 'draft'
                },
                {
                    'filename': 'final-user1-proj_003-pat_789-20240117_143022-uuid0003.json',
                    'user_id': 'user1', 
                    'status': 'final'
                }
            ]
            
            for eln in test_elns:
                test_key = f"submissions/SOP-001/{eln['filename']}"
                test_data = {
                    'eln_uuid': eln['filename'][:8],
                    'filename': eln['filename'],
                    'sop_id': 'SOP-001',
                    'user_id': eln['user_id'],
                    'status': eln['status'],
                    'timestamp': '2024-01-15T14:30:22+00:00'
                }
                s3_client.put_object(
                    Bucket=self.config.bucket_name,
                    Key=test_key,
                    Body=json.dumps(test_data),
                    Metadata={
                        'eln-uuid': eln['filename'][:8],
                        'user-id': eln['user_id'],
                        'status': eln['status'],
                        'timestamp': '2024-01-15T14:30:22+00:00'
                    }
                )
            
            # Test listing all ELNs
            elns = await backend.list_documents(
                document_type="submissions",
                sop_id='SOP-001',
                metadata_class=ELNMetadata
            )
            assert len(elns) == 3
            
            # Test filtering by user
            user1_elns = await backend.list_documents(
                document_type="submissions",
                sop_id='SOP-001',
                metadata_class=ELNMetadata,
                user_id='user1'
            )
            assert len(user1_elns) == 2
            
            # Test filtering by status
            final_elns = await backend.list_documents(
                document_type="submissions",
                sop_id='SOP-001',
                metadata_class=ELNMetadata,
                status='final'
            )
            assert len(final_elns) == 2
            
            # Test limit
            limited_elns = await backend.list_documents(
                document_type="submissions",
                sop_id='SOP-001',
                metadata_class=ELNMetadata,
                limit=1
            )
            assert len(limited_elns) == 1

    @pytest.mark.asyncio
    async def test_validate_eln_immutability(self):
        """Test ELN immutability validation"""
        with mock_aws():
            # Create mock S3 bucket
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket=self.config.eln_bucket_name)
            
            backend = S3JSONStorage(self.config, document_type="submissions")
            
            # Test validation for non-existent file (should be valid)
            is_valid = await backend.validate_eln_immutability('SOP-001', 'new-file.json')
            assert is_valid == True
            
            # Upload a file
            test_key = 'submissions/SOP-001/existing-file.json'
            s3_client.put_object(
                Bucket=self.config.bucket_name,
                Key=test_key,
                Body='{}'
            )
            
            # Test validation for existing file (should be invalid)
            is_valid = await backend.validate_eln_immutability('SOP-001', 'existing-file.json')
            assert is_valid == False


class TestLocalStorageBackend:
    """Test local storage backend for ELN operations"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        
        self.config = StorageConfig(
            type='local',
            local_path=self.temp_dir
        )
        
        self.sample_form_data = {
            'project_id': 'PROJ-001',
            'patient_id': 'PAT-123'
        }
        
        self.sample_sop_fields = [
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
            }
        ]
    
    def teardown_method(self):
        """Clean up test fixtures"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    @pytest.mark.asyncio
    async def test_submit_eln_success(self):
        """Test successful ELN submission to local storage"""
        backend = LocalJSONStorage(self.config, document_type="submissions")
        
        with patch('rawscribe.utils.filename_generator.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2024, 1, 15, 14, 30, 22, tzinfo=timezone.utc)
            
            with patch('rawscribe.utils.filename_generator.uuid.uuid4') as mock_uuid:
                mock_uuid.return_value.__str__ = Mock(return_value='abcd1234-5678-90ab-cdef-1234567890ab')
                
                # Test ELN submission
                _, metadata = await backend.save_document(
            document_type="submissions",
                    sop_id='SOP-001',
                    user_id='test_user',
                    status='final',
                    filename_variables=['proj_001'],
                                            data=self.sample_form_data,
                        metadata_class=ELNMetadata,
                        field_definitions=self.sample_sop_fields,
                    sop_metadata={'sop_id': 'SOP-001', 'title': 'Test SOP'}
                )
                
                # Verify metadata
                assert metadata.eln_uuid == 'abcd1234'
                assert metadata.sop_id == 'SOP-001'
                assert metadata.user_id == 'test_user'
                assert metadata.status == 'final'
                
                # Verify file was created
                submissions_path = Path(self.temp_dir) / 'eln' / 'submissions' / 'SOP-001'
                eln_file = submissions_path / metadata.filename
                assert eln_file.exists()
                
                # Verify file content
                with open(eln_file, 'r') as f:
                    stored_data = json.load(f)
                assert stored_data['eln_uuid'] == 'abcd1234'
                assert stored_data['form_data'] == self.sample_form_data

    @pytest.mark.asyncio
    async def test_get_eln_success(self):
        """Test successful ELN retrieval from local storage"""
        backend = LocalJSONStorage(self.config, document_type="submissions")
        
        # Create test file
        submissions_path = Path(self.temp_dir) / 'eln' / 'submissions' / 'SOP-001'
        submissions_path.mkdir(parents=True)
        
        test_filename = 'final-test_user-proj_001-20240115_143022-abcd1234.json'
        test_data = {
            'eln_uuid': 'abcd1234',
            'filename': test_filename,
            'sop_id': 'SOP-001',
            'user_id': 'test_user',
            'status': 'final',
            'form_data': self.sample_form_data
        }
        
        eln_file = submissions_path / test_filename
        with open(eln_file, 'w') as f:
            json.dump(test_data, f)
        
        # Test retrieval
        file_basename = test_filename.replace('.json', '') if test_filename.endswith('.json') else test_filename
        retrieved_data = await backend.get_document("submissions", 'SOP-001', file_basename)
        
        assert retrieved_data['eln_uuid'] == 'abcd1234'
        assert retrieved_data['form_data'] == self.sample_form_data

    @pytest.mark.asyncio
    async def test_get_eln_not_found(self):
        """Test ELN retrieval with non-existent file"""
        backend = LocalJSONStorage(self.config, document_type="submissions")
        
        # Test retrieval of non-existent ELN
        result = await backend.get_document("submissions", 'SOP-001', 'nonexistent')
        assert result is None

    @pytest.mark.asyncio
    async def test_list_elns_success(self):
        """Test successful ELN listing from local storage"""
        backend = LocalJSONStorage(self.config, document_type="submissions")
        
        # Create test files
        submissions_path = Path(self.temp_dir) / 'eln' / 'submissions' / 'SOP-001'
        submissions_path.mkdir(parents=True)
        
        test_elns = [
            {
                'filename': 'final-user1-proj_001-20240115_143022-uuid0001.json',
                'user_id': 'user1',
                'status': 'final'
            },
            {
                'filename': 'draft-user2-proj_002-20240116_143022-uuid0002.json',
                'user_id': 'user2', 
                'status': 'draft'
            }
        ]
        
        for eln in test_elns:
            test_data = {
                'eln_uuid': eln['filename'][:8],
                'filename': eln['filename'],
                'sop_id': 'SOP-001',
                'user_id': eln['user_id'],
                'status': eln['status'],
                'timestamp': '2024-01-15T14:30:22+00:00'
            }
            
            eln_file = submissions_path / eln['filename']
            with open(eln_file, 'w') as f:
                json.dump(test_data, f)
        
        # Test listing all ELNs
        elns = await backend.list_documents(
            document_type="submissions",
            sop_id='SOP-001',
            metadata_class=ELNMetadata
        )
        assert len(elns) == 2
        
        # Test filtering by user
        user1_elns = await backend.list_documents(
            document_type="submissions",
            sop_id='SOP-001',
            metadata_class=ELNMetadata,
            user_id='user1'
        )
        assert len(user1_elns) == 1
        assert user1_elns[0].user_id == 'user1'

    @pytest.mark.asyncio
    async def test_validate_eln_immutability(self):
        """Test ELN immutability validation for local storage"""
        backend = LocalJSONStorage(self.config, document_type="submissions")
        
        # Test validation for non-existent file (should be valid)
        is_valid = await backend.validate_eln_immutability('SOP-001', 'new-file.json')
        assert is_valid == True
        
        # Create a file
        submissions_path = Path(self.temp_dir) / 'eln' / 'submissions' / 'SOP-001'
        submissions_path.mkdir(parents=True)
        
        existing_file = submissions_path / 'existing-file.json'
        existing_file.write_text('{}')
        
        # Test validation for existing file (should be invalid)
        is_valid = await backend.validate_eln_immutability('SOP-001', 'existing-file.json')
        assert is_valid == False


class TestStorageManager:
    """Test storage manager with fallback functionality"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.primary_config = StorageConfig(
            type='s3',
            bucket_name='primary-bucket'
        )
        
        self.fallback_config = StorageConfig(
            type='local',
            local_path='/tmp/fallback'
        )

    @pytest.mark.asyncio
    async def test_storage_manager_primary_success(self):
        """Test storage manager with successful primary backend"""
        # Use local storage for testing (no S3 dependencies)
        local_config = StorageConfig(
            type='local',
            local_path=tempfile.mkdtemp()
        )
        
        manager = StorageManager(local_config)
        
        # Test operation
        _, result = await manager.save_document(
            document_type='submissions',
            sop_id='SOP-001',
            user_id='test_user',
            status='final',
            filename_variables=['test'],
            data={'test': 'data'},
            field_definitions=[],
            sop_metadata={'sop_id': 'SOP-001', 'title': 'Test SOP'}
        )
        
        # Verify result
        assert result.eln_uuid is not None
        assert result.sop_id == 'SOP-001'
        assert result.user_id == 'test_user'
        assert result.status == 'final'

    @pytest.mark.asyncio
    async def test_storage_manager_normal_operation(self):
        """Test storage manager normal operation"""
        # Use local storage for testing
        config = StorageConfig(
            type='local',
            local_path=tempfile.mkdtemp()
        )
        
        manager = StorageManager(config)
        
        # Test operation - should work with local storage
        _, result = await manager.save_document(
            document_type='submissions',
            sop_id='SOP-001',
            user_id='test_user',
            status='final',
            filename_variables=['test'],
            data={'test': 'data'},
            field_definitions=[],
            sop_metadata={'sop_id': 'SOP-001', 'title': 'Test SOP'}
        )
        
        # Verify result
        assert result.eln_uuid is not None
        assert result.sop_id == 'SOP-001'
        assert result.user_id == 'test_user'
        assert result.status == 'final' 