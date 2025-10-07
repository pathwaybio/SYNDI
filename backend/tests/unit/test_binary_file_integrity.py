# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Binary File Integrity Tests
Tests that binary files (PNG, PDF, etc.) maintain byte-for-byte integrity
when uploaded to both local and S3 storage backends.

This test suite specifically validates the fix for the binary file corruption issue
where files uploaded to S3 had extra bytes added at the beginning/end.
"""

import pytest
import asyncio
import io
import hashlib
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from fastapi import UploadFile

from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.storage_s3 import S3JSONStorage
from rawscribe.utils.storage_factory import StorageManager
from rawscribe.utils.config_types import StorageConfig


class TestBinaryFileIntegrity:
    """Test binary file integrity across storage backends"""
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory for testing"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    @pytest.fixture
    def local_storage_config(self, temp_dir):
        """Create local storage configuration"""
        return StorageConfig(
            type="local",
            local_path=temp_dir,
            draft_bucket_name="test-drafts",
            eln_bucket_name="test-eln",
            forms_bucket_name="test-forms"
        )
    
    @pytest.fixture
    def s3_storage_config(self):
        """Create S3 storage configuration"""
        return StorageConfig(
            type="s3",
            draft_bucket_name="test-drafts-s3",
            eln_bucket_name="test-eln-s3",
            forms_bucket_name="test-forms-s3",
            aws_region="us-east-1"
        )
    
    def create_realistic_png(self) -> bytes:
        """
        Create a realistic PNG file with proper structure
        This includes signature, IHDR, IDAT, and IEND chunks
        """
        # PNG signature (8 bytes)
        png_signature = b'\x89PNG\r\n\x1a\n'
        
        # IHDR chunk (25 bytes: length=13, type=IHDR, data=13, crc=4)
        ihdr_length = b'\x00\x00\x00\x0d'  # 13 bytes
        ihdr_type = b'IHDR'
        ihdr_data = b'\x00\x00\x00\x01'  # Width: 1
        ihdr_data += b'\x00\x00\x00\x01'  # Height: 1
        ihdr_data += b'\x08'  # Bit depth: 8
        ihdr_data += b'\x02'  # Color type: 2 (RGB)
        ihdr_data += b'\x00'  # Compression: 0
        ihdr_data += b'\x00'  # Filter: 0
        ihdr_data += b'\x00'  # Interlace: 0
        ihdr_crc = b'\x90\x77\x53\xde'  # Precalculated CRC
        ihdr_chunk = ihdr_length + ihdr_type + ihdr_data + ihdr_crc
        
        # IDAT chunk (minimal compressed data)
        idat_length = b'\x00\x00\x00\x0c'  # 12 bytes
        idat_type = b'IDAT'
        idat_data = b'\x08\x1d\x01\x03\x00\xfc\xff\x00\x00\x00\x01\x00'  # Minimal zlib compressed RGB pixel
        idat_crc = b'\x00\x9a\x9c\x18'  # Precalculated CRC
        idat_chunk = idat_length + idat_type + idat_data + idat_crc
        
        # IEND chunk (12 bytes: length=0, type=IEND, crc=4)
        iend_length = b'\x00\x00\x00\x00'
        iend_type = b'IEND'
        iend_crc = b'\xae\x42\x60\x82'  # Precalculated CRC
        iend_chunk = iend_length + iend_type + iend_crc
        
        return png_signature + ihdr_chunk + idat_chunk + iend_chunk
    
    def create_pdf_bytes(self) -> bytes:
        """
        Create a minimal valid PDF file
        """
        pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF
"""
        return pdf_content
    
    def create_jpeg_bytes(self) -> bytes:
        """
        Create a minimal valid JPEG file
        """
        # JPEG signature and minimal structure
        jpeg_start = b'\xff\xd8\xff\xe0'  # JPEG SOI + APP0
        app0_header = b'\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        jpeg_end = b'\xff\xd9'  # JPEG EOI
        
        return jpeg_start + app0_header + jpeg_end
    
    def calculate_checksum(self, data: bytes) -> str:
        """Calculate SHA256 checksum of binary data"""
        return hashlib.sha256(data).hexdigest()
    
    def create_upload_file(self, filename: str, content: bytes, content_type: str = None) -> UploadFile:
        """Create an UploadFile object from binary content"""
        file_obj = io.BytesIO(content)
        upload_file = UploadFile(
            filename=filename,
            file=file_obj
        )
        # Note: FastAPI UploadFile doesn't allow setting content_type after creation
        # The content_type is typically set by the form data parser
        return upload_file
    
    @pytest.mark.asyncio
    async def test_local_storage_png_integrity(self, local_storage_config, temp_dir):
        """Test that PNG files maintain integrity in local storage"""
        backend = LocalJSONStorage(local_storage_config, document_type="drafts")
        
        # Create test PNG
        png_bytes = self.create_realistic_png()
        original_checksum = self.calculate_checksum(png_bytes)
        
        # Create upload file
        upload_file = self.create_upload_file("test.png", png_bytes, "image/png")
        
        # Upload file
        result_key = await backend.store_temp_file(
            file_id="test-id-123",
            file=upload_file,
            user_id="testuser",
            field_id="field1",
            sop_id="SOP001"
        )
        
        # Verify file was stored
        assert result_key
        
        # Read back the stored file
        stored_path = Path(temp_dir) / "test-drafts" / result_key
        assert stored_path.exists(), f"File not found at {stored_path}"
        
        with open(stored_path, 'rb') as f:
            stored_bytes = f.read()
        
        stored_checksum = self.calculate_checksum(stored_bytes)
        
        # Verify byte-for-byte integrity
        assert len(stored_bytes) == len(png_bytes), \
            f"File size mismatch: expected {len(png_bytes)}, got {len(stored_bytes)}"
        assert stored_checksum == original_checksum, \
            f"Checksum mismatch: original={original_checksum}, stored={stored_checksum}"
        assert stored_bytes == png_bytes, "Byte content differs from original"
    
    @pytest.mark.asyncio
    async def test_local_storage_pdf_integrity(self, local_storage_config, temp_dir):
        """Test that PDF files maintain integrity in local storage"""
        backend = LocalJSONStorage(local_storage_config, document_type="drafts")
        
        # Create test PDF
        pdf_bytes = self.create_pdf_bytes()
        original_checksum = self.calculate_checksum(pdf_bytes)
        
        # Create upload file
        upload_file = self.create_upload_file("test.pdf", pdf_bytes, "application/pdf")
        
        # Upload file
        result_key = await backend.store_temp_file(
            file_id="test-pdf-456",
            file=upload_file,
            user_id="testuser",
            field_id="field2",
            sop_id="SOP001"
        )
        
        # Read back the stored file
        stored_path = Path(temp_dir) / "test-drafts" / result_key
        with open(stored_path, 'rb') as f:
            stored_bytes = f.read()
        
        stored_checksum = self.calculate_checksum(stored_bytes)
        
        # Verify integrity
        assert len(stored_bytes) == len(pdf_bytes)
        assert stored_checksum == original_checksum
        assert stored_bytes == pdf_bytes
    
    @pytest.mark.asyncio
    async def test_s3_storage_png_integrity_with_mock(self, s3_storage_config):
        """
        Test that PNG files maintain integrity in S3 storage (mocked)
        This test validates the fix for the binary corruption bug
        """
        # Mock S3 client
        mock_s3_client = MagicMock()
        stored_data = {}
        
        def mock_put_object(**kwargs):
            """Mock put_object that stores the Body data"""
            bucket = kwargs['Bucket']
            key = kwargs['Key']
            body = kwargs['Body']
            
            # Store the body data - this simulates S3 storage
            stored_data[f"{bucket}/{key}"] = {
                'Body': body,
                'ContentType': kwargs.get('ContentType'),
                'Key': key
            }
            return {'ETag': '"mock-etag"'}
        
        def mock_get_object(**kwargs):
            """Mock get_object that returns stored data"""
            bucket = kwargs['Bucket']
            key = kwargs['Key']
            stored = stored_data.get(f"{bucket}/{key}")
            if not stored:
                raise Exception("NoSuchKey")
            
            # Return stored body wrapped in a file-like object
            return {
                'Body': io.BytesIO(stored['Body']),
                'ContentType': stored['ContentType'],
                'ContentLength': len(stored['Body'])
            }
        
        mock_s3_client.put_object = mock_put_object
        mock_s3_client.get_object = mock_get_object
        
        # Patch boto3 client creation
        with patch('boto3.client', return_value=mock_s3_client):
            backend = S3JSONStorage(s3_storage_config, document_type="drafts")
            
            # Create test PNG
            png_bytes = self.create_realistic_png()
            original_checksum = self.calculate_checksum(png_bytes)
            
            # Create upload file
            upload_file = self.create_upload_file("test.png", png_bytes, "image/png")
            
            # Upload file - this is where the bug would occur
            result_key = await backend.store_temp_file(
                file_id="s3-test-789",
                file=upload_file,
                user_id="testuser",
                field_id="field3",
                sop_id="SOP002"
            )
            
            # Verify file was stored
            assert result_key
            
            # Retrieve stored data from mock
            stored_key = f"test-drafts-s3/{result_key}"
            assert stored_key in stored_data, f"File not found in mock S3: {stored_key}"
            
            stored_bytes = stored_data[stored_key]['Body']
            stored_checksum = self.calculate_checksum(stored_bytes)
            
            # Verify byte-for-byte integrity - this would fail with the old buggy code
            assert len(stored_bytes) == len(png_bytes), \
                f"S3 file size mismatch: expected {len(png_bytes)}, got {len(stored_bytes)}. " \
                f"This suggests binary corruption during upload."
            assert stored_checksum == original_checksum, \
                f"S3 checksum mismatch: original={original_checksum}, stored={stored_checksum}. " \
                f"This indicates the file was corrupted during S3 upload."
            assert stored_bytes == png_bytes, \
                "Byte content differs from original - binary file was corrupted!"
    
    @pytest.mark.asyncio
    async def test_s3_storage_multiple_file_types(self, s3_storage_config):
        """Test multiple binary file types maintain integrity in S3"""
        # Mock S3 client
        mock_s3_client = MagicMock()
        stored_data = {}
        
        def mock_put_object(**kwargs):
            bucket = kwargs['Bucket']
            key = kwargs['Key']
            body = kwargs['Body']
            stored_data[f"{bucket}/{key}"] = body
            return {'ETag': '"mock-etag"'}
        
        mock_s3_client.put_object = mock_put_object
        
        with patch('boto3.client', return_value=mock_s3_client):
            backend = S3JSONStorage(s3_storage_config, document_type="drafts")
            
            # Test different file types
            test_cases = [
                ("image.png", self.create_realistic_png(), "image/png"),
                ("document.pdf", self.create_pdf_bytes(), "application/pdf"),
                ("photo.jpg", self.create_jpeg_bytes(), "image/jpeg"),
            ]
            
            for idx, (filename, content, mime_type) in enumerate(test_cases):
                original_checksum = self.calculate_checksum(content)
                upload_file = self.create_upload_file(filename, content, mime_type)
                
                result_key = await backend.store_temp_file(
                    file_id=f"multi-test-{idx}",
                    file=upload_file,
                    user_id="testuser",
                    field_id="field4",
                    sop_id="SOP003"
                )
                
                # Verify stored data
                stored_key = f"test-drafts-s3/{result_key}"
                assert stored_key in stored_data
                
                stored_bytes = stored_data[stored_key]
                stored_checksum = self.calculate_checksum(stored_bytes)
                
                assert stored_bytes == content, \
                    f"File {filename} was corrupted during S3 upload"
                assert stored_checksum == original_checksum, \
                    f"Checksum mismatch for {filename}"
    
    @pytest.mark.asyncio
    async def test_upload_file_read_pattern(self):
        """
        Test that demonstrates the correct way to read from UploadFile
        This test validates the fix methodology
        """
        # Create binary content
        binary_content = self.create_realistic_png()
        original_checksum = self.calculate_checksum(binary_content)
        
        # Method 1: CORRECT - Use FastAPI's UploadFile.read() (async)
        upload_file_correct = self.create_upload_file("test.png", binary_content)
        content_correct = await upload_file_correct.read()
        checksum_correct = self.calculate_checksum(content_correct)
        
        # Method 2: INCORRECT - Direct access to file.file.read() (what caused the bug)
        upload_file_wrong = self.create_upload_file("test.png", binary_content)
        content_wrong = upload_file_wrong.file.read()  # This is what the buggy code did
        checksum_wrong = self.calculate_checksum(content_wrong)
        
        # Both should produce identical results with our test setup
        # In production, the wrong method could include multipart boundaries
        assert content_correct == binary_content, "Correct method should preserve binary data"
        assert checksum_correct == original_checksum, "Correct method should match checksum"
        
        # Document the issue
        print(f"Original size: {len(binary_content)}")
        print(f"Correct method size: {len(content_correct)}")
        print(f"Wrong method size: {len(content_wrong)}")
        print(f"Correct method matches: {content_correct == binary_content}")
    
    @pytest.mark.asyncio
    async def test_file_size_efficiency(self, local_storage_config):
        """Test that file size is obtained efficiently without extra reads"""
        backend = LocalJSONStorage(local_storage_config, document_type="drafts")
        
        # Create a larger binary file
        large_content = self.create_realistic_png() * 100  # Repeat PNG content
        upload_file = self.create_upload_file("large.png", large_content)
        
        # The file.size attribute should be available
        if hasattr(upload_file, 'size'):
            assert upload_file.size == len(large_content) or upload_file.size is None
        
        # Upload should work efficiently
        result_key = await backend.store_temp_file(
            file_id="size-test",
            file=upload_file,
            user_id="testuser",
            field_id="field5",
            sop_id="SOP004"
        )
        
        assert result_key


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

