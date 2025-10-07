#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Add SPDX license headers to source files tracked by git.
Can be used in pre-commit hooks or CI/CD pipelines.
"""
import subprocess
import sys
import argparse
from pathlib import Path
from typing import List, Optional, Tuple

# Files to exclude (even if tracked by git)
EXCLUDE_PATTERNS = [
    'package-lock.json',
    'package.json',
    '.json',  # JSON doesn't support comments
    'LICENSE',
    'MANIFEST',
]

def get_spdx_lines(author_name: str) -> List[str]:
    """Generate SPDX header lines with author name"""
    return [
        "SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>",
        f"SPDX-FileContributor: {author_name}",
        "SPDX-License-Identifier: Apache-2.0"
    ]

def should_skip_file(filepath: str) -> bool:
    """Check if file should be skipped"""
    for pattern in EXCLUDE_PATTERNS:
        if pattern in filepath:
            return True
    return False

def has_spdx_header(content: str) -> bool:
    """Check if file already has SPDX header"""
    return 'SPDX-FileCopyrightText' in content or 'SPDX-License-Identifier' in content

def get_comment_style(filepath: str) -> Optional[Tuple[str, str, bool]]:
    """Return (prefix, suffix, is_block) for comment style"""
    ext = Path(filepath).suffix.lower()
    name = Path(filepath).name.lower()
    
    # Hash-based comments
    if ext in ['.py', '.sh', '.yml', '.yaml', '.toml'] or name in ['makefile']:
        return ('# ', '', False)
    
    # Double-slash comments
    if ext in ['.ts', '.tsx', '.js', '.jsx']:
        return ('// ', '', False)
    
    # CSS block comments
    if ext in ['.css', '.scss', '.sass']:
        return ('/* ', ' */', True)
    
    # HTML/Markdown comments
    if ext in ['.html', '.htm', '.md']:
        return ('<!-- ', ' -->', True)
    
    return None

def add_spdx_header(filepath: str, author_name: str, dry_run: bool = False, verbose: bool = True) -> bool:
    """
    Add SPDX header to file.
    Returns True if header was added (or would be added in dry-run mode).
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        # Binary files (images, etc.) - skip silently
        return False
    except Exception as e:
        if verbose:
            print(f"  ⚠️  Error reading {filepath}: {e}", file=sys.stderr)
        return False
    
    if has_spdx_header(content):
        return False
    
    comment_info = get_comment_style(filepath)
    if not comment_info:
        return False
    
    prefix, suffix, is_block = comment_info
    spdx_lines = get_spdx_lines(author_name)
    
    # Build header
    if is_block:
        header_lines = [prefix] + spdx_lines + [suffix, '']
        header = '\n'.join(header_lines) + '\n'
    else:
        header_lines = [prefix + line for line in spdx_lines]
        header = '\n'.join(header_lines) + '\n\n'
    
    # Handle special cases
    lines = content.split('\n')
    insert_pos = 0
    
    # Python: preserve shebang and encoding declarations
    if filepath.endswith('.py'):
        while insert_pos < len(lines):
            line = lines[insert_pos].strip()
            if line.startswith('#!') or line.startswith('# -*- coding:') or line.startswith('# coding:'):
                insert_pos += 1
            else:
                break
    
    # Shell: preserve shebang
    elif filepath.endswith('.sh'):
        if lines and lines[0].startswith('#!'):
            insert_pos = 1
    
    # Insert header
    if insert_pos == 0:
        new_content = header + content
    else:
        new_content = '\n'.join(lines[:insert_pos]) + '\n' + header + '\n'.join(lines[insert_pos:])
    
    if dry_run:
        if verbose:
            print(f"  [DRY-RUN] Would add header to {filepath}")
        return True
    else:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            if verbose:
                print(f"  ✓ Added header to {filepath}")
            return True
        except Exception as e:
            if verbose:
                print(f"  ✗ Error writing {filepath}: {e}", file=sys.stderr)
            return False

def get_tracked_files(repo_path: Path) -> List[str]:
    """Get all files tracked by git"""
    result = subprocess.run(
        ['git', 'ls-files'],
        capture_output=True,
        text=True,
        cwd=repo_path
    )
    
    if result.returncode != 0:
        print(f"Error running git ls-files: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    
    return result.stdout.strip().split('\n')

def main():
    parser = argparse.ArgumentParser(
        description='Add SPDX license headers to source files tracked by git'
    )
    parser.add_argument(
        '--author',
        type=str,
        default='Kimberly Robasky',
        help='Author name for SPDX-FileContributor (default: Kimberly Robasky)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without making changes'
    )
    parser.add_argument(
        '--quiet',
        action='store_true',
        help='Only show summary, not individual files'
    )
    parser.add_argument(
        '--repo-path',
        type=str,
        default=None,
        help='Path to git repository (default: current directory or script parent)'
    )
    parser.add_argument(
        '--check',
        action='store_true',
        help='Check mode: exit with code 1 if any files need headers (useful for CI/CD)'
    )
    
    args = parser.parse_args()
    
    # Determine repository path
    if args.repo_path:
        repo_path = Path(args.repo_path).resolve()
    else:
        # Try current directory first, then script's grandparent (for infra/scripts/)
        cwd = Path.cwd()
        if (cwd / '.git').exists():
            repo_path = cwd
        else:
            script_dir = Path(__file__).resolve().parent
            repo_path = script_dir.parent.parent  # Go up from infra/scripts/ to repo root
    
    if not (repo_path / '.git').exists():
        print(f"Error: {repo_path} is not a git repository", file=sys.stderr)
        sys.exit(1)
    
    verbose = not args.quiet
    
    if verbose and not args.check:
        print(f"Repository: {repo_path}")
        print(f"Author: {args.author}")
        if args.dry_run:
            print("Mode: DRY RUN (no files will be modified)")
        print()
    
    # Get all tracked files
    all_files = get_tracked_files(repo_path)
    
    if verbose and not args.check:
        print(f"Found {len(all_files)} tracked files\n")
    
    # Process files
    processed = 0
    skipped = 0
    
    for filepath in all_files:
        if should_skip_file(filepath):
            skipped += 1
            continue
        
        full_path = repo_path / filepath
        
        if add_spdx_header(str(full_path), args.author, dry_run=args.dry_run or args.check, verbose=verbose and not args.check):
            processed += 1
        else:
            skipped += 1
    
    # Print summary
    if verbose or args.check:
        print(f"\n{'='*60}")
        if args.dry_run:
            print(f"Summary (DRY RUN):")
            print(f"  Would process: {processed} files")
            print(f"  Would skip: {skipped} files")
        elif args.check:
            print(f"Check mode summary:")
            print(f"  Files needing headers: {processed}")
            print(f"  Files with headers or skipped: {skipped}")
        else:
            print(f"Summary:")
            print(f"  Processed: {processed} files")
            print(f"  Skipped: {skipped} files")
        print(f"{'='*60}")
    
    # Exit code for check mode
    if args.check and processed > 0:
        if verbose:
            print(f"\n❌ {processed} file(s) are missing SPDX headers!")
        sys.exit(1)
    elif args.check:
        if verbose:
            print("\n✅ All source files have SPDX headers!")
        sys.exit(0)

if __name__ == '__main__':
    main()

