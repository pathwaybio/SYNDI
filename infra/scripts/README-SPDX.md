<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SPDX License Header Management

This directory contains scripts for managing SPDX license headers in source files.

## Scripts

### `add-spdx-headers.py`

Main script for adding and checking SPDX headers on all tracked source files.

**Features:**
- Only processes files tracked by git (excludes build artifacts, node_modules, etc.)
- Supports multiple file types with appropriate comment syntax
- Can be used manually, in git hooks, or in CI/CD pipelines
- Customizable author name

**Usage:**

```bash
# Add headers to all files (interactive mode)
./infra/scripts/add-spdx-headers.py

# Dry-run to see what would be changed
./infra/scripts/add-spdx-headers.py --dry-run

# Check if all files have headers (CI/CD mode)
./infra/scripts/add-spdx-headers.py --check

# Specify custom author
./infra/scripts/add-spdx-headers.py --author "John Doe"

# Quiet mode (only show summary)
./infra/scripts/add-spdx-headers.py --quiet
```

**Exit Codes:**
- `0`: Success (in check mode: all files have headers)
- `1`: Error or missing headers (in check mode: some files need headers)

**Supported File Types:**
- Python (`.py`) - `#` comments before docstrings
- TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`) - `//` comments
- Shell scripts (`.sh`) - `#` comments (preserves shebang)
- YAML (`.yml`, `.yaml`) - `#` comments
- CSS (`.css`, `.scss`, `.sass`) - `/* */` block comments
- HTML (`.html`, `.htm`) - `<!-- -->` comments
- Markdown (`.md`) - `<!-- -->` comments
- TOML (`.toml`) - `#` comments
- Makefile - `#` comments

**Excluded Files:**
- JSON files (no comment support)
- Binary files (images, etc.)
- Build artifacts (automatically excluded by git)
- node_modules, .aws-sam (in .gitignore)

### `ci-check-spdx-headers.sh`

CI/CD integration script that fails the build if any source files are missing SPDX headers.

**Usage in CI/CD:**

```yaml
# GitHub Actions example
- name: Check SPDX Headers
  run: ./infra/scripts/ci-check-spdx-headers.sh
```

### `pre-commit-spdx-example.sh`

Example pre-commit hook that automatically adds SPDX headers to new files.

**Installation:**

```bash
# Copy to git hooks directory
cp infra/scripts/pre-commit-spdx-example.sh .git/hooks/pre-commit

# Make executable
chmod +x .git/hooks/pre-commit

# Customize author name if needed
vim .git/hooks/pre-commit
```

## SPDX Header Format

All source files include these headers:

```
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: [Author Name]
SPDX-License-Identifier: Apache-2.0
```

The comment syntax adapts to the file type (e.g., `#`, `//`, `/* */`, `<!-- -->`).

## Workflow

### For Developers

1. **Write code** - focus on development
2. **Before commit** - run the script to add headers:
   ```bash
   ./infra/scripts/add-spdx-headers.py
   ```
3. **Commit** - headers are included automatically

### For CI/CD

Add to your CI pipeline to enforce headers:

```yaml
# .github/workflows/ci.yml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check SPDX Headers
        run: ./infra/scripts/ci-check-spdx-headers.sh
```

## Troubleshooting

**Script says "not a git repository":**
- Run from repository root, or use `--repo-path` option

**Binary file errors:**
- These are automatically skipped (images, etc.)

**JSON files don't have headers:**
- JSON doesn't support comments, these are intentionally skipped

**Want to skip a file:**
- Add pattern to `EXCLUDE_PATTERNS` in `add-spdx-headers.py`

## License

These scripts are licensed under Apache-2.0 (same as the project).

