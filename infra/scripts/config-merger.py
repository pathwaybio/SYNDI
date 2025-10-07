#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Configuration merger for SYNDI project.
Merges base config with org-specific overrides using deep merge strategy.
"""

import json
import sys
import os
from copy import deepcopy


def deep_merge(base, override):
    """
    Deep merge override dict into base dict.
    Mutates base in-place. Override values take precedence.
    
    Args:
        base: Base dictionary (modified in-place)
        override: Override dictionary with new/updated values
    """
    for key, value in override.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            deep_merge(base[key], value)
        else:
            base[key] = value


def deep_merge_copy(base, override):
    """
    Deep merge override into base, returning a new dict.
    Does not mutate inputs.
    
    Args:
        base: Base dictionary (not modified)
        override: Override dictionary with new/updated values
    
    Returns:
        New dictionary with merged values
    """
    result = deepcopy(base)
    deep_merge(result, override)
    return result


def merge_configs(base_path, org_path, output_path):
    """
    Merge base config with org-specific overrides.
    
    Pure JSON merger - no business logic about environments or organizations.
    If _meta fields exist in input files, they get merged like any other field.
    """
    
    # Load base config
    if not os.path.exists(base_path):
        print(f"❌ Base config not found: {base_path}")
        sys.exit(1)
    
    with open(base_path, 'r') as f:
        config = json.load(f)
    
    # Merge org-specific config if it exists
    if os.path.exists(org_path):
        print(f"📄 Merging org-specific config: {org_path}")
        with open(org_path, 'r') as f:
            org_config = json.load(f)
        
        deep_merge(config, org_config)
    else:
        print(f"📄 No org-specific config found at {org_path}, using base only")
    
    # Write merged config
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"✅ Config written to: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python config-merger.py <base_config> <org_config> <output_config>")
        sys.exit(1)
    
    merge_configs(sys.argv[1], sys.argv[2], sys.argv[3])
