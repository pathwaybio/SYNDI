#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

SOURCE_DIR=".config/"
DEST_DIR="example-.config/"

# Absolute path to this script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure we are running from project root
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: Must run this script from the project root where '$SOURCE_DIR' exists."
  exit 1
fi

echo "Syncing $SOURCE_DIR to $DEST_DIR ..."
rsync -av --delete "$SOURCE_DIR" "$DEST_DIR"
echo "Done."
