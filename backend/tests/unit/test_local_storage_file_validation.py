# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Test LocalJSONStorage file validation functionality
Ensures that temp files are found in the correct attachments directory
"""
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
import tempfile
import shutil

from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.config_types import StorageConfig


class TestLocalStorageFileValidation:
    """Test file validation in LocalJSONStorage"""
    
    @pytest.fixture
    def temp_storage_dir(self):
        """Create temporary storage directory"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)
    
    @pytest.fixture
    def storage_config(self, temp_storage_dir):
        """Create storage configuration with temp directory"""
        return StorageConfig(
            type="local",
            local_path=temp_storage_dir,
            draft_bucket_name="eln-drafts",
            eln_bucket_name="eln",
            forms_bucket_name="forms"
        )
    
    @pytest.fixture
    def local_storage(self, storage_config):
        """Create LocalJSONStorage instance"""
        return LocalJSONStorage(storage_config, "drafts")
    
    @pytest.mark.asyncio
    async def test_validate_temp_files_exist_correct_path(self, local_storage, temp_storage_dir):
        """Test that validate_temp_files_exist looks in the attachments subdirectory"""
        sop_id = "TestSOP"
        user_id = "test_user"
        field_id = "field_fileupload"
        file_ids = ["abc123", "def456"]
        
        # Create the correct directory structure
        attachments_dir = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # Create test files in attachments directory
        (attachments_dir / f"{user_id}-{field_id}-abc123-test1.pdf").touch()
        (attachments_dir / f"{user_id}-{field_id}-def456-test2.xlsx").touch()
        
        # Validate files exist
        missing_files = await local_storage.validate_temp_files_exist(
            sop_id=sop_id,
            file_ids=file_ids,
            user_id=user_id,
            field_id=field_id
        )
        
        # Should find all files
        assert missing_files == []
    
    @pytest.mark.asyncio
    async def test_validate_temp_files_with_escaped_field_id(self, local_storage, temp_storage_dir):
        """Test validation with escaped field IDs"""
        sop_id = "TestSOP"
        user_id = "test_user"
        field_id = "field__HYPHEN__fileupload"  # Escaped field ID
        file_ids = ["abc123"]
        
        # Create the attachments directory
        attachments_dir = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # Create file with escaped field ID
        (attachments_dir / f"{user_id}-{field_id}-abc123-test.pdf").touch()
        
        # Validate file exists
        missing_files = await local_storage.validate_temp_files_exist(
            sop_id=sop_id,
            file_ids=file_ids,
            user_id=user_id,
            field_id=field_id
        )
        
        # Should find the file
        assert missing_files == []
    
    @pytest.mark.asyncio
    async def test_validate_temp_files_missing_directory(self, local_storage, temp_storage_dir):
        """Test validation when attachments directory doesn't exist"""
        missing_files = await local_storage.validate_temp_files_exist(
            sop_id="NonExistentSOP",
            file_ids=["abc123"],
            user_id="test_user",
            field_id="field_test"
        )
        
        # Should report all files as missing
        assert missing_files == ["abc123"]
    
    @pytest.mark.asyncio
    async def test_validate_temp_files_wrong_user(self, local_storage, temp_storage_dir):
        """Test that files from wrong user are not validated"""
        sop_id = "TestSOP"
        field_id = "field_fileupload"
        file_id = "abc123"
        
        # Create directory
        attachments_dir = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # Create file for different user
        (attachments_dir / f"other_user-{field_id}-{file_id}-test.pdf").touch()
        
        # Validate for test_user
        missing_files = await local_storage.validate_temp_files_exist(
            sop_id=sop_id,
            file_ids=[file_id],
            user_id="test_user",
            field_id=field_id
        )
        
        # Should not find the file (wrong user)
        assert missing_files == [file_id]
    
    @pytest.mark.asyncio
    async def test_validate_temp_files_wrong_field(self, local_storage, temp_storage_dir):
        """Test that files from wrong field are not validated"""
        sop_id = "TestSOP"
        user_id = "test_user"
        file_id = "abc123"
        
        # Create directory
        attachments_dir = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # Create file for different field
        (attachments_dir / f"{user_id}-other_field-{file_id}-test.pdf").touch()
        
        # Validate for field_fileupload
        missing_files = await local_storage.validate_temp_files_exist(
            sop_id=sop_id,
            file_ids=[file_id],
            user_id=user_id,
            field_id="field_fileupload"
        )
        
        # Should not find the file (wrong field)
        assert missing_files == [file_id]
    
    @pytest.mark.asyncio
    async def test_validate_multiple_files_partial_missing(self, local_storage, temp_storage_dir):
        """Test validation with some files present and some missing"""
        sop_id = "TestSOP"
        user_id = "test_user"
        field_id = "field_fileupload"
        file_ids = ["abc123", "def456", "ghi789"]
        
        # Create directory
        attachments_dir = Path(temp_storage_dir) / "eln-drafts" / "drafts" / sop_id / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # Create only two of three files
        (attachments_dir / f"{user_id}-{field_id}-abc123-test1.pdf").touch()
        (attachments_dir / f"{user_id}-{field_id}-ghi789-test3.pdf").touch()
        
        # Validate files
        missing_files = await local_storage.validate_temp_files_exist(
            sop_id=sop_id,
            file_ids=file_ids,
            user_id=user_id,
            field_id=field_id
        )
        
        # Should report only the missing file
        assert missing_files == ["def456"]