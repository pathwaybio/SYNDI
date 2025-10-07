#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

# CI/CD script to verify all source files have SPDX headers
# Exit code 1 if any files are missing headers (fails the build)

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

echo "==================================================="
echo "Checking SPDX License Headers"
echo "==================================================="

# Run in check mode - will exit with code 1 if headers are missing
"$REPO_ROOT/infra/scripts/add-spdx-headers.py" \
    --check \
    --repo-path "$REPO_ROOT"

exit $?

