#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Diagnostic script to test binary file upload and identify UTF-8 encoding corruption
"""
import sys
import os
import asyncio
import io
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent / 'rawscribe'
sys.path.insert(0, str(backend_dir.parent))

from fastapi import UploadFile
from rawscribe.utils.config_types import StorageConfig
from rawscribe.utils.storage_local import LocalJSONStorage
from rawscribe.utils.storage_s3 import S3JSONStorage

# Test PNG signature (first 8 bytes of a PNG file)
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
# Full minimal PNG
PNG_FULL = (
    b'\x89PNG\r\n\x1a\n'  # Signature
    b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'  # IHDR
    b'\x00\x00\x00\x00IEND\xaeB`\x82'  # IEND
)

async def test_upload_file_read():
    """Test that UploadFile.read() returns bytes"""
    print("=" * 60)
    print("TEST 1: UploadFile.read() type check")
    print("=" * 60)
    
    # Create an UploadFile from bytes
    file_obj = io.BytesIO(PNG_FULL)
    upload_file = UploadFile(filename="test.png", file=file_obj)
    
    # Read content
    content = await upload_file.read()
    
    print(f"Content type: {type(content)}")
    print(f"Content length: {len(content)}")
    print(f"First 20 bytes (hex): {content[:20].hex()}")
    print(f"Expected first 20: {PNG_FULL[:20].hex()}")
    print(f"Match: {content == PNG_FULL}")
    print(f"Is bytes: {isinstance(content, bytes)}")
    
    return content == PNG_FULL

async def test_local_storage():
    """Test local storage preserves binary data"""
    print("\n" + "=" * 60)
    print("TEST 2: Local Storage Binary Integrity")
    print("=" * 60)
    
    # Create temp directory
    import tempfile
    temp_dir = tempfile.mkdtemp()
    
    try:
        config = StorageConfig(
            type="local",
            local_path=temp_dir,
            draft_bucket_name="test-drafts",
            eln_bucket_name="test-eln",
            forms_bucket_name="test-forms"
        )
        
        storage = LocalJSONStorage(config, document_type="drafts")
        
        # Create upload file
        file_obj = io.BytesIO(PNG_FULL)
        upload_file = UploadFile(filename="test.png", file=file_obj)
        
        # Store file
        result_key = await storage.store_temp_file(
            file_id="test123",
            file=upload_file,
            user_id="testuser",
            field_id="field1",
            sop_id="SOP001"
        )
        
        print(f"Stored to: {result_key}")
        
        # Read back the file
        stored_path = Path(temp_dir) / "test-drafts" / result_key
        print(f"Full path: {stored_path}")
        
        with open(stored_path, 'rb') as f:
            stored_content = f.read()
        
        print(f"Stored size: {len(stored_content)}")
        print(f"Original size: {len(PNG_FULL)}")
        print(f"First 20 bytes (hex): {stored_content[:20].hex()}")
        print(f"Expected first 20: {PNG_FULL[:20].hex()}")
        print(f"Binary integrity: {stored_content == PNG_FULL}")
        
        # Check for UTF-8 corruption
        if b'\xef\xbf\xbd' in stored_content:
            print("❌ WARNING: UTF-8 replacement character found!")
        else:
            print("✅ No UTF-8 corruption detected")
        
        return stored_content == PNG_FULL
        
    finally:
        # Cleanup
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

async def test_s3_storage_mock():
    """Test S3 storage with mocked boto3"""
    print("\n" + "=" * 60)
    print("TEST 3: S3 Storage Binary Integrity (Mocked)")
    print("=" * 60)
    
    try:
        from unittest.mock import MagicMock
        import boto3
        
        # Mock S3 client
        stored_data = {}
        
        def mock_put_object(**kwargs):
            body = kwargs['Body']
            print(f"  put_object called:")
            print(f"    Body type: {type(body)}")
            print(f"    Body length: {len(body) if hasattr(body, '__len__') else 'N/A'}")
            if isinstance(body, bytes):
                print(f"    First 20 bytes: {body[:20].hex()}")
                # Check for UTF-8 corruption
                if b'\xef\xbf\xbd' in body:
                    print("    ❌ UTF-8 replacement character detected in Body!")
                else:
                    print("    ✅ No UTF-8 corruption in Body")
            elif isinstance(body, str):
                print(f"    ❌ ERROR: Body is STRING, not bytes!")
                print(f"    First 20 chars: {repr(body[:20])}")
            
            stored_data['body'] = body
            stored_data['content_type'] = kwargs.get('ContentType')
            return {'ETag': '"test"'}
        
        mock_s3 = MagicMock()
        mock_s3.put_object = mock_put_object
        mock_s3.head_bucket = MagicMock()
        
        # Patch boto3
        original_client = boto3.client
        boto3.client = lambda *args, **kwargs: mock_s3
        
        try:
            config = StorageConfig(
                type="s3",
                draft_bucket_name="test-drafts-s3",
                eln_bucket_name="test-eln-s3",
                forms_bucket_name="test-forms-s3",
                region="us-east-1"
            )
            
            # Set testing mode
            os.environ['TESTING'] = 'true'
            
            storage = S3JSONStorage(config, document_type="drafts")
            
            # Create upload file
            file_obj = io.BytesIO(PNG_FULL)
            upload_file = UploadFile(filename="test.png", file=file_obj)
            
            # Store file
            result_key = await storage.store_temp_file(
                file_id="test456",
                file=upload_file,
                user_id="testuser",
                field_id="field2",
                sop_id="SOP002"
            )
            
            print(f"\nStored to S3 key: {result_key}")
            
            # Check what was actually stored
            stored_body = stored_data.get('body')
            if stored_body:
                print(f"\nStored body type: {type(stored_body)}")
                print(f"Stored body length: {len(stored_body) if hasattr(stored_body, '__len__') else 'N/A'}")
                
                if isinstance(stored_body, bytes):
                    print(f"First 20 bytes: {stored_body[:20].hex()}")
                    print(f"Expected: {PNG_FULL[:20].hex()}")
                    matches = stored_body == PNG_FULL
                    print(f"Binary integrity: {matches}")
                    
                    if not matches:
                        # Find first difference
                        for i, (orig, stored) in enumerate(zip(PNG_FULL, stored_body)):
                            if orig != stored:
                                print(f"First difference at byte {i}: {orig:02x} != {stored:02x}")
                                break
                    
                    return matches
                else:
                    print("❌ ERROR: Stored body is not bytes!")
                    return False
            else:
                print("❌ ERROR: No body was stored!")
                return False
                
        finally:
            boto3.client = original_client
            os.environ.pop('TESTING', None)
    
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run all tests"""
    print("Binary File Upload Diagnostic Test")
    print("This tests whether binary files are correctly handled\n")
    
    results = []
    
    # Test 1
    try:
        result = await test_upload_file_read()
        results.append(("UploadFile.read() returns correct bytes", result))
    except Exception as e:
        print(f"❌ Test 1 failed: {e}")
        results.append(("UploadFile.read() returns correct bytes", False))
    
    # Test 2
    try:
        result = await test_local_storage()
        results.append(("Local storage preserves binary integrity", result))
    except Exception as e:
        print(f"❌ Test 2 failed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Local storage preserves binary integrity", False))
    
    # Test 3
    try:
        result = await test_s3_storage_mock()
        results.append(("S3 storage preserves binary integrity", result))
    except Exception as e:
        print(f"❌ Test 3 failed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("S3 storage preserves binary integrity", False))
    
    # Print summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(r[1] for r in results)
    print("\n" + ("="*60))
    if all_passed:
        print("✅ ALL TESTS PASSED - Binary integrity is preserved")
    else:
        print("❌ SOME TESTS FAILED - Binary corruption detected")
    print("="*60)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

