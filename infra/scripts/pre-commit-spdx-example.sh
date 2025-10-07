#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

# Example pre-commit hook for adding SPDX headers
# To use this:
#   1. Copy to .git/hooks/pre-commit
#   2. Make it executable: chmod +x .git/hooks/pre-commit
#   3. Customize author name if needed

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel)

# Get git user name for author (or use default)
AUTHOR_NAME=$(git config user.name || echo "Kimberly Robasky")

# Run the SPDX header script
echo "Checking SPDX headers..."
"$REPO_ROOT/infra/scripts/add-spdx-headers.py" \
    --author "$AUTHOR_NAME" \
    --repo-path "$REPO_ROOT" \
    --quiet

# If headers were added, stage the changes
if [ $? -eq 0 ]; then
    echo "✓ All files have SPDX headers"
else
    echo "⚠️  Added SPDX headers to new files"
    # Optionally auto-stage the changes (uncomment if desired)
    # git add -u
fi

exit 0

