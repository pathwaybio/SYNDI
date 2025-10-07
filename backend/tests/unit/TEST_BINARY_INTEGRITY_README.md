<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Binary File Integrity Tests

## Purpose

This test suite (`test_binary_file_integrity.py`) validates that binary files (PNG, PDF, JPEG, etc.) maintain **byte-for-byte integrity** when uploaded through the CLAIRE system to both local disk and S3 storage.

## Why This Test Exists

### The Bug
Prior to the fix in `storage_s3.py`, binary files uploaded to S3 were corrupted because the code was using `file.file.read()` (direct access to the underlying `SpooledTemporaryFile`) instead of `await file.read()` (FastAPI's proper `UploadFile` method). This caused extra bytes to be added at the beginning and/or end of files, corrupting them.

### The Fix
Changed from:
```python
# WRONG - bypasses FastAPI's multipart handling
file_content = file.file.read()
```

To:
```python
# CORRECT - uses FastAPI's proper multipart handling
file_content = await file.read()
```

## What the Tests Validate

1. **Local Storage Integrity** - Binary files maintain exact byte content when stored locally
2. **S3 Storage Integrity** - Binary files maintain exact byte content when stored in S3 (mocked)
3. **Multiple File Types** - PNG, PDF, and JPEG files all maintain integrity
4. **Checksum Validation** - SHA256 checksums of uploaded files match original files
5. **File Size Validation** - File sizes remain unchanged after upload
6. **Read Pattern Validation** - Demonstrates correct vs incorrect file reading patterns

## Running the Tests

### Run just the binary integrity tests:
```bash
cd backend
pytest tests/unit/test_binary_file_integrity.py -v
```

### Run with detailed output:
```bash
cd backend
pytest tests/unit/test_binary_file_integrity.py -v -s
```

### Run a specific test:
```bash
cd backend
pytest tests/unit/test_binary_file_integrity.py::TestBinaryFileIntegrity::test_s3_storage_png_integrity_with_mock -v
```

### Run all file-related tests:
```bash
cd backend
pytest tests/unit/test_binary_file_integrity.py tests/unit/test_files_api.py -v
```

## Test Coverage

### Local Storage Tests
- `test_local_storage_png_integrity` - Validates PNG files
- `test_local_storage_pdf_integrity` - Validates PDF files

### S3 Storage Tests (Mocked)
- `test_s3_storage_png_integrity_with_mock` - Validates S3 PNG uploads
- `test_s3_storage_multiple_file_types` - Validates PNG, PDF, and JPEG
- `test_upload_file_read_pattern` - Demonstrates correct vs buggy patterns

### Efficiency Tests
- `test_file_size_efficiency` - Validates efficient file size retrieval

## Expected Results

All tests should **PASS** with the fix in place. If any test fails:

1. **Checksum mismatch** - The file content was altered during upload
2. **Size mismatch** - Extra bytes were added/removed
3. **Byte content differs** - The raw bytes don't match the original

## Testing with Real S3 (Integration Test)

To test with real S3 (requires AWS credentials):

```bash
# Set up test environment
export AWS_PROFILE=your-profile
export TESTING=true

# Run integration tests (if available)
pytest tests/integration/test_s3_uploads.py -v
```

## Verifying the Fix Manually

### Upload a test file:
```bash
# 1. Create a test PNG
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > test.png

# 2. Calculate checksum
md5sum test.png
sha256sum test.png

# 3. Upload via API (using curl or frontend)
# 4. Download from S3
aws s3 cp s3://your-bucket/path/to/uploaded/test.png downloaded.png

# 5. Compare checksums
md5sum downloaded.png
sha256sum downloaded.png

# They should match!
```

## Related Files

- **Fix Applied**: `backend/rawscribe/utils/storage_s3.py` (lines 372-396)
- **Secondary Fix**: `backend/rawscribe/routes/files.py` (lines 112-141)
- **Related Tests**: `backend/tests/unit/test_files_api.py`
- **Storage Base**: `backend/rawscribe/utils/storage_base.py`

## Maintenance

When adding new file upload functionality:
1. Always use `await file.read()` not `file.file.read()`
2. Add new binary file types to `test_s3_storage_multiple_file_types`
3. Verify checksums match before/after upload
4. Test with actual binary files (not text files)

## Debugging Failed Tests

If tests fail:

### Check file sizes:
```python
print(f"Original: {len(original_bytes)}")
print(f"Stored: {len(stored_bytes)}")
print(f"Difference: {len(stored_bytes) - len(original_bytes)} bytes")
```

### Check first/last bytes:
```python
print(f"Original first 20 bytes: {original_bytes[:20].hex()}")
print(f"Stored first 20 bytes: {stored_bytes[:20].hex()}")
print(f"Original last 20 bytes: {original_bytes[-20:].hex()}")
print(f"Stored last 20 bytes: {stored_bytes[-20:].hex()}")
```

### Compare hex dumps:
```python
import difflib
orig_hex = original_bytes.hex()
stored_hex = stored_bytes.hex()
diff = difflib.unified_diff([orig_hex], [stored_hex], lineterm='')
print('\n'.join(diff))
```

## Notes

- Tests use mocked S3 client to avoid AWS dependencies in unit tests
- Real binary file structures (PNG, PDF, JPEG) are used for authenticity
- Checksums (SHA256) provide cryptographic verification of integrity
- Tests run quickly (<1 second each) due to minimal file sizes

