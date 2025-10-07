#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Sync configuration files from CloudFormation stack outputs
Usage: python sync-configs-from-cloudformation.py --env stage --org uga

This script deep-merges CloudFormation outputs into org-specific configs,
preserving any custom fields users have added.
"""

import boto3
import json
import sys
from pathlib import Path
import importlib.util

# Import deep_merge from config-merger to avoid code duplication
script_dir = Path(__file__).parent
config_merger_path = script_dir / "config-merger.py"
spec = importlib.util.spec_from_file_location("config_merger", config_merger_path)
config_merger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config_merger)
deep_merge = config_merger.deep_merge_copy


def get_stack_outputs(stack_name, region='us-east-1'):
    """Get CloudFormation stack outputs"""
    cf = boto3.client('cloudformation', region_name=region)
    
    try:
        response = cf.describe_stacks(StackName=stack_name)
    except cf.exceptions.ClientError as e:
        if 'does not exist' in str(e):
            print(f"❌ Stack '{stack_name}' not found in region {region}")
            print(f"   Make sure you've deployed first: make rs-deploy ENV=... ORG=...")
            sys.exit(1)
        raise
    
    outputs = {}
    for output in response['Stacks'][0]['Outputs']:
        outputs[output['OutputKey']] = output['OutputValue']
    
    return outputs


def update_webapp_config(env, org, outputs, config_dir):
    """
    Update webapp configuration with CloudFormation outputs.
    
    Deep-merges CloudFormation values into existing org-specific config,
    preserving any custom fields users have added.
    """
    org_config_path = config_dir / f"{env}-{org}.json"
    
    # Load existing org-specific config (or start with empty)
    existing_config = {}
    if org_config_path.exists():
        with open(org_config_path, 'r') as f:
            existing_config = json.load(f)
        print(f"📝 Updating existing config: {org_config_path}")
    else:
        print(f"📝 Creating new org-specific config: {org_config_path}")
    
    # Build updates from CloudFormation outputs
    api_endpoint = outputs.get('ApiEndpoint')
    cf_updates = {
        'webapp': {
            'apiEndpoint': api_endpoint,
            'api': {
                'proxyTarget': api_endpoint
            }
        }
    }
    
    # Add Cognito config if available
    if outputs.get('CognitoUserPoolId'):
        cf_updates['webapp']['auth'] = {
            'cognito': {
                'userPoolId': outputs.get('CognitoUserPoolId'),
                'clientId': outputs.get('CognitoClientId')
            }
        }
    
    # Deep merge CloudFormation updates into existing config
    merged_config = deep_merge(existing_config, cf_updates)
    
    # Write merged config
    with open(org_config_path, 'w') as f:
        json.dump(merged_config, f, indent=2)
        f.write('\n')
    
    print(f"✅ Updated org-specific config: {org_config_path}")
    print(f"   (Custom fields preserved, CloudFormation values updated)")
    return org_config_path


def update_lambda_config(env, org, outputs, config_dir):
    """
    Update lambda configuration with CloudFormation outputs.
    
    Deep-merges CloudFormation values into existing org-specific config,
    preserving any custom fields users have added.
    """
    org_config_path = config_dir / f"{env}-{org}.json"
    
    # Load existing org-specific config (or start with empty)
    existing_config = {}
    if org_config_path.exists():
        with open(org_config_path, 'r') as f:
            existing_config = json.load(f)
        print(f"📝 Updating existing lambda config: {org_config_path}")
    else:
        print(f"📝 Creating new org-specific lambda config: {org_config_path}")
    
    # Build updates from CloudFormation outputs
    # Note: Most lambda config comes from CloudFormation environment variables
    # We mainly store Cognito IDs here for consistency
    cf_updates = {'lambda': {}}
    
    if outputs.get('CognitoUserPoolId'):
        cf_updates['lambda']['auth'] = {
            'cognito': {
                'userPoolId': outputs.get('CognitoUserPoolId'),
                'clientId': outputs.get('CognitoClientId')
            }
        }
    
    # Deep merge CloudFormation updates into existing config
    merged_config = deep_merge(existing_config, cf_updates)
    
    # Write merged config
    with open(org_config_path, 'w') as f:
        json.dump(merged_config, f, indent=2)
        f.write('\n')
    
    print(f"✅ Updated org-specific lambda config: {org_config_path}")
    print(f"   (Custom fields preserved, CloudFormation values updated)")
    return org_config_path


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Sync configs from CloudFormation')
    parser.add_argument('--env', required=True, help='Environment (dev/stage/prod)')
    parser.add_argument('--org', required=True, help='Organization')
    parser.add_argument('--region', default='us-east-1', help='AWS region')
    args = parser.parse_args()
    
    stack_name = f"rawscribe-{args.env}-{args.org}"
    
    print(f"🔍 Fetching outputs from stack: {stack_name}")
    outputs = get_stack_outputs(stack_name, args.region)
    
    print("\n📋 CloudFormation Outputs:")
    for key, value in outputs.items():
        print(f"  {key}: {value}")
    
    # Update configs
    project_root = Path(__file__).parent.parent.parent
    webapp_config_dir = project_root / 'infra' / '.config' / 'webapp'
    lambda_config_dir = project_root / 'infra' / '.config' / 'lambda'
    
    # Ensure config directories exist
    webapp_config_dir.mkdir(parents=True, exist_ok=True)
    lambda_config_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n📝 Updating configuration files...")
    webapp_path = update_webapp_config(args.env, args.org, outputs, webapp_config_dir)
    lambda_path = update_lambda_config(args.env, args.org, outputs, lambda_config_dir)
    
    print("\n✅ Configuration sync complete!")
    print("\n📌 Next steps:")
    print(f"  1. Review changes: git diff {webapp_path} {lambda_path}")
    print(f"  2. Test frontend: make start-frontend ENV={args.env} ORG={args.org}")
    print(f"  3. Commit to site-specifi configs repo, if correct: git add {webapp_path} {lambda_path}")


if __name__ == '__main__':
    main()
