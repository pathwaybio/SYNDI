# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for filename generator
Tests regulatory-compliant filename generation with UUID collision handling
"""

import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone
import json

from rawscribe.utils.filename_generator import (
    FilenameGenerator, 
    FilenameGenerationError, 
    UUIDCollisionError
)
from rawscribe.utils.eln_filename_utils import parse_eln_filename, validate_eln_filename_format
from rawscribe.utils.schema_utils import extract_filename_variables, normalize_filename_value

class TestFilenameGenerator:
    """Test filename generation functionality"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.generator = FilenameGenerator()
        
        # Sample SOP fields with filename components
        self.sample_sop_fields = [
            {
                'id': 'project_id',
                'name': 'Project ID',
                'type': 'string',
                'children': [
                    {
                        'filename_component': True,
                        'order': 1
                    }
                ]
            },
            {
                'id': 'patient_id', 
                'name': 'Patient ID',
                'type': 'string',
                'children': [
                    {
                        'filename_component': True,
                        'order': 2
                    }
                ]
            },
            {
                'id': 'procedure_date',
                'name': 'Procedure Date',
                'type': 'string',
                'children': []  # No filename component
            }
        ]
        
        # Sample form data
        self.sample_form_data = {
            'project_id': 'PROJ-001',
            'patient_id': 'PAT-123',
            'procedure_date': '2024-01-15'
        }

    def test_generate_filename_basic(self):
        """Test basic filename generation"""
        with patch('rawscribe.utils.filename_generator.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2024, 1, 15, 14, 30, 22, tzinfo=timezone.utc)
            
            with patch('rawscribe.utils.filename_generator.uuid.uuid4') as mock_uuid:
                mock_uuid.return_value.__str__ = lambda self: 'abcd1234-5678-90ab-cdef-1234567890ab'
                
                filename = self.generator.generate_filename(
                    status='final',
                    username='john_doe',
                    filename_variables=['proj_001', 'pat_123']
                )
                
                expected = 'final-john_doe-proj_001-pat_123-20240115_143022-abcd1234.json'
                assert filename == expected

    def test_generate_filename_draft_status(self):
        """Test filename generation with draft status"""
        with patch('rawscribe.utils.filename_generator.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2024, 1, 15, 14, 30, 22, tzinfo=timezone.utc)
            
            with patch('rawscribe.utils.filename_generator.uuid.uuid4') as mock_uuid:
                mock_uuid.return_value.__str__ = lambda self: 'abcd1234-5678-90ab-cdef-1234567890ab'
                
                filename = self.generator.generate_filename(
                    status='draft',
                    username='jane_smith',
                    filename_variables=['proj_001', 'pat_123']
                )
                
                assert filename.startswith('draft-jane_smith-')
                assert filename.endswith('.json')

    def test_invalid_status(self):
        """Test error handling for invalid status"""
        with pytest.raises(FilenameGenerationError, match="Invalid status"):
            self.generator.generate_filename(
                status='invalid',
                username='test_user',
                filename_variables=['test', 'value']
            )



    def test_normalize_filename_value(self):
        """Test filename value normalization"""
        test_cases = [
            ('PROJ-001', 'proj_001'),
            ('Patient ID 123!', 'patient_id_123'),
            ('  spaces  ', 'spaces'),
            ('multiple___underscores', 'multiple_underscores'),
            ('', ''),
            ('a' * 100, 'a' * 50),  # Length limit
            ('Special@#$%Characters', 'special_characters')
        ]
        
        for input_val, expected in test_cases:
            result = normalize_filename_value(input_val)
            assert result == expected, f"Failed for input: {input_val}"

    def test_generate_timestamp(self):
        """Test timestamp generation format"""
        with patch('rawscribe.utils.filename_generator.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2024, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
            
            timestamp = self.generator._generate_timestamp()
            assert timestamp == '20241231_235959'

    def test_uuid_collision_handling(self):
        """Test UUID collision detection and regeneration"""
        collision_check_calls = []
        
        def mock_existing_checker(filename):
            collision_check_calls.append(filename)
            # First UUID collides, second doesn't
            return len(collision_check_calls) == 1
        
        with patch('rawscribe.utils.filename_generator.uuid.uuid4') as mock_uuid:
            # Mock uuid4 to return different UUIDs on subsequent calls
            mock_uuid.side_effect = [
                type('MockUUID', (), {'__str__': lambda self: 'collision-1234-5678-90ab-cdef12345678'})(),
                type('MockUUID', (), {'__str__': lambda self: 'newuuid4-5678-90ab-cdef-123456789012'})()
            ]
            
            uuid_result = self.generator._generate_unique_uuid(
                'final', 'test_user', ['var1', 'var2'], '20240115_143022',
                mock_existing_checker
            )
            
            # Should return second UUID after collision (first 8 chars)
            assert uuid_result == 'newuuid4'
            assert len(collision_check_calls) >= 1

    def test_uuid_collision_max_retries(self):
        """Test UUID collision handling with max retries exceeded"""
        def always_collides(filename):
            return True  # Always return collision
        
        with pytest.raises(UUIDCollisionError, match="Unable to generate unique UUID"):
            self.generator._generate_unique_uuid(
                'final', 'test_user', ['var1'], '20240115_143022',
                always_collides
            )

    def test_parse_filename(self):
        """Test filename parsing back to components"""
        filename = 'final-john_doe-proj_001-pat_123-20240115_143022-abcd1234.json'
        
        parsed = parse_eln_filename(filename)
        
        expected = {
            'status': 'final',
            'username': 'john_doe',
            'variables': ['proj_001', 'pat_123'],
            'timestamp': '20240115_143022',
            'uuid': 'abcd1234',
            'full_filename': filename
        }
        
        assert parsed == expected

    def test_parse_filename_minimal(self):
        """Test parsing minimal filename"""
        filename = 'draft-user-20240115_143022-uuid1234.json'
        
        parsed = parse_eln_filename(filename)
        
        assert parsed['status'] == 'draft'
        assert parsed['username'] == 'user'
        assert parsed['variables'] == []
        assert parsed['timestamp'] == '20240115_143022'
        assert parsed['uuid'] == 'uuid1234'

    def test_parse_filename_invalid_extension(self):
        """Test parsing filename with invalid extension"""
        with pytest.raises(FilenameGenerationError, match="Invalid filename extension"):
            parse_eln_filename('test.txt')

    def test_parse_filename_invalid_format(self):
        """Test parsing filename with invalid format"""
        with pytest.raises(FilenameGenerationError, match="Invalid filename format"):
                        parse_eln_filename('invalid.json')

    def test_extract_filename_variables(self):
        """Test extraction of filename variables from form data"""
        variables = extract_filename_variables(
            self.sample_form_data, 
            self.sample_sop_fields
        )
        
        # Should extract variables in order based on 'order' field
        assert variables == ['proj_001', 'pat_123']

    def test_extract_filename_variables_empty_values(self):
        """Test extraction with empty values"""
        form_data = {
            'project_id': '',
            'patient_id': 'PAT-123'
        }
        
        variables = extract_filename_variables(
            form_data, 
            self.sample_sop_fields
        )
        
        # Empty values should be replaced with 'empty'
        assert variables == ['empty', 'pat_123']

    def test_extract_filename_variables_missing_fields(self):
        """Test extraction with missing form fields"""
        form_data = {
            'patient_id': 'PAT-123'
            # Missing project_id
        }
        
        variables = extract_filename_variables(
            form_data, 
            self.sample_sop_fields
        )
        
        # Missing fields should be replaced with 'empty'
        assert variables == ['empty', 'pat_123']

    def test_validate_filename_format_valid(self):
        """Test filename format validation with valid filenames"""
        valid_filenames = [
            'final-john_doe-proj_001-pat_123-20240115_143022-abcd1234.json',
            'draft-user-20240115_143022-12345678.json',
            'final-test_user-var1-var2-var3-20241231_235959-ffffffff.json'
        ]
        
        for filename in valid_filenames:
            assert validate_eln_filename_format(filename), f"Failed for: {filename}"

    def test_validate_filename_format_invalid(self):
        """Test filename format validation with invalid filenames"""
        invalid_filenames = [
            'invalid-status-user-20240115_143022-abcd1234.json',  # Invalid status
            'final-user-20240115_14302-abcd1234.json',  # Invalid timestamp
            'final-user-20240115_143022-xyz.json',  # Invalid UUID
            'final-user-20240115_143022-abcd1234.txt',  # Invalid extension
            'incomplete.json'  # Invalid format
        ]
        
        for filename in invalid_filenames:
            assert not validate_eln_filename_format(filename), f"Should fail for: {filename}"

    def test_nested_sop_fields(self):
        """Test extraction from nested SOP field structures"""
        nested_sop_fields = [
            {
                'id': 'taskgroup_1',
                'children': [
                    {
                        'id': 'task_1',
                        'children': [
                            {
                                'id': 'nested_field',
                                'name': 'Nested Field',
                                'type': 'string',
                                'children': [
                                    {
                                        'filename_component': True,
                                        'order': 1
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
        
        form_data = {'nested_field': 'nested_value'}
        
        variables = extract_filename_variables(
            form_data, 
            nested_sop_fields
        )
        
        assert variables == ['nested_value']

    def test_field_ordering(self):
        """Test that fields are ordered correctly by 'order' attribute"""
        unordered_fields = [
            {
                'id': 'field_c',
                'type': 'string',
                'children': [{'filename_component': True, 'order': 3}]
            },
            {
                'id': 'field_a',
                'type': 'string',
                'children': [{'filename_component': True, 'order': 1}]
            },
            {
                'id': 'field_b',
                'type': 'string',
                'children': [{'filename_component': True, 'order': 2}]
            }
        ]
        
        form_data = {
            'field_a': 'value_a',
            'field_b': 'value_b', 
            'field_c': 'value_c'
        }
        
        variables = extract_filename_variables(
            form_data,
            unordered_fields
        )
        
        # Should be ordered by 'order' field: a(1), b(2), c(3)
        assert variables == ['value_a', 'value_b', 'value_c']

    def test_no_filename_fields(self):
        """Test behavior when no fields have filename components"""
        fields_without_filename = [
            {
                'id': 'regular_field',
                'type': 'string',
                'children': []  # No filename component
            }
        ]
        
        variables = extract_filename_variables(
            {'regular_field': 'value'},
            fields_without_filename
        )
        
        assert variables == []

    def test_special_characters_in_values(self):
        """Test handling of special characters in field values"""
        test_data = {
            'field1': 'value/with\\special:characters<>|',
            'field2': 'émojis🚀andünicöde'
        }
        
        fields = [
            {
                'id': 'field1',
                'type': 'string',
                'children': [{'filename_component': True, 'order': 1}]
            },
            {
                'id': 'field2', 
                'type': 'string',
                'children': [{'filename_component': True, 'order': 2}]
            }
        ]
        
        variables = extract_filename_variables(test_data, fields)
        
        # Should normalize special characters
        assert all(not any(char in var for char in '/\\:<>|🚀') for var in variables)
        assert all('_' in var for var in variables)  # Should contain underscores instead

  