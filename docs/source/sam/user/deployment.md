<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SOP Deployment Guide

## Overview

This guide explains how to deploy validated SOPs from SAM to CLAIRE, covering local development, staging, and production environments.

## Deployment Architecture

```
SAM (Author) → Validate → Export → S3 Bucket → CLAIRE (Serve) → Users
```

### Storage Locations

| Environment | S3 Path | Purpose | Access |
|------------|---------|---------|---------|
| Local Dev | `.local/s3/forms/sops/` | Development & testing | Local only |
| Test | `s3://[org]-test-forms/sops/` | QA testing | Team access |
| Stage | `s3://[org]-stage-forms/sops/` | Pre-production | Limited access |
| Prod | `s3://[org]-prod-forms/sops/` | Live system | Production users |

## Prerequisites

### Local Development
- SAM and CLAIRE running locally
- Write access to `.local/s3/` directory
- Valid SOP passed validation

### AWS Deployment
- AWS CLI configured
- S3 bucket permissions
- Appropriate IAM role
- Deployment credentials

## Deployment Workflows

## Local Development Deployment

### Quick Deploy (Recommended)

```bash
# 1. Validate your SOP
make validate-sop FILE=my-sop.yaml

# 2. Deploy to local environment
make deploy-sop FILE=my-sop.yaml ENV=dev

# 3. Restart CLAIRE to load new SOP
make restart-claire
```

### Manual Deploy

1. **Export from SAM:**
   - Click "Export" button
   - Choose "YAML" format
   - Save file locally

2. **Copy to local S3:**
   ```bash
   cp my-sop.yaml .local/s3/forms/sops/
   ```

3. **Verify deployment:**
   ```bash
   ls -la .local/s3/forms/sops/
   ```

4. **Access in CLAIRE:**
   - Navigate to `http://localhost:3000/claire`
   - SOP should appear in selection list

### Using Make Commands

```bash
# Deploy single SOP
make deploy-sop FILE=sop.yaml ENV=dev

# Deploy all SOPs from directory
make deploy-sops DIR=./my-sops ENV=dev

# Mirror production structure locally
make mirror ENV=dev

# Full local deployment (frontend + backend + SOPs)
make deploy-local
```

## Test Environment Deployment

### Preparing for Test

1. **Version your SOP:**
   ```yaml
   version: "1.0.0-test.1"  # Test version
   status: "draft"          # Keep as draft
   ```

2. **Create test checklist:**
   - [ ] Validated successfully
   - [ ] Metadata complete
   - [ ] Fields tested locally
   - [ ] Peer reviewed
   - [ ] Test plan created

### Deploy to Test

```bash
# Using Make
make deploy-sop FILE=my-sop.yaml ENV=test

# Using AWS CLI directly
aws s3 cp my-sop.yaml s3://myorg-test-forms/sops/ \
  --metadata version=1.0.0-test.1
```

### Test Verification

```bash
# List deployed SOPs
aws s3 ls s3://myorg-test-forms/sops/

# Verify specific SOP
aws s3api head-object \
  --bucket myorg-test-forms \
  --key sops/my-sop.yaml

# Download and compare
aws s3 cp s3://myorg-test-forms/sops/my-sop.yaml ./verify.yaml
diff my-sop.yaml verify.yaml
```

## Staging Deployment

### Pre-Staging Checklist

- [ ] Passed all test environment checks
- [ ] Performance tested with sample data
- [ ] Integration tested with CLAIRE
- [ ] Documentation updated
- [ ] Version bumped appropriately
- [ ] Stakeholder review completed

### Deploy to Staging

```bash
# Build and deploy to staging
make rs-deploy-stage ORG=myorg

# Or deploy specific SOP only
aws s3 cp my-sop.yaml s3://myorg-stage-forms/sops/ \
  --metadata version=1.0.0-rc.1 \
  --metadata deployed-by=$USER \
  --metadata deployed-date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
```

### Staging Validation

1. **Functional Testing:**
   ```bash
   # Run automated tests
   make test-sop-staging SOP=my-sop
   ```

2. **User Acceptance Testing:**
   - Share staging URL with stakeholders
   - Collect feedback
   - Document issues

3. **Performance Testing:**
   - Load test with multiple users
   - Check form render time
   - Verify data submission

## Production Deployment

### Production Requirements

**Mandatory:**
- Approved by designated approver
- Passed staging validation
- Change request documented
- Rollback plan prepared
- Deployment window scheduled

### Production Checklist

#### Pre-Deployment
- [ ] Final version number set
- [ ] Status changed to "published"
- [ ] All test data removed
- [ ] Security review completed
- [ ] Backup of current version saved
- [ ] Deployment communication sent

#### Deployment Steps

1. **Final Validation:**
   ```bash
   make validate-sop FILE=my-sop.yaml STRICT=true
   ```

2. **Create Backup:**
   ```bash
   # Backup current production version
   aws s3 cp s3://myorg-prod-forms/sops/my-sop.yaml \
            s3://myorg-prod-forms/sops/archive/my-sop-$(date +%Y%m%d).yaml
   ```

3. **Deploy to Production:**
   ```bash
   # Deploy with full metadata
   make rs-deploy-prod ORG=myorg
   
   # Or manual deployment with tracking
   aws s3 cp my-sop.yaml s3://myorg-prod-forms/sops/ \
     --metadata version=1.0.0 \
     --metadata status=published \
     --metadata deployed-by=$USER \
     --metadata deployed-date=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
     --metadata change-request=CR-12345
   ```

4. **Verify Deployment:**
   ```bash
   # Check deployment
   aws s3api head-object \
     --bucket myorg-prod-forms \
     --key sops/my-sop.yaml
   
   # Test in production
   curl https://claire-prod.example.com/api/sops/my-sop
   ```

#### Post-Deployment
- [ ] Verify SOP loads in CLAIRE
- [ ] Test critical paths
- [ ] Monitor for errors (first 24 hours)
- [ ] Update documentation
- [ ] Close change request
- [ ] Communicate completion

## Version Management

### Versioning Strategy

```
MAJOR.MINOR.PATCH[-PRERELEASE]

1.0.0       - Production release
1.0.1       - Bug fix
1.1.0       - New features
2.0.0       - Breaking changes
1.0.0-test.1 - Test version
1.0.0-rc.1   - Release candidate
```

### Version Promotion

```
Development → Test → Staging → Production
  0.1.0    → 0.1.0-test.1 → 0.1.0-rc.1 → 1.0.0
```

### Tracking Versions

```yaml
# In SOP metadata
version: "1.2.3"
date-published: "2024-01-20"
date-deployed: "2024-01-21"

# Version history (maintain separately)
versions:
  - version: "1.0.0"
    date: "2024-01-01"
    changes: "Initial release"
  - version: "1.1.0"
    date: "2024-01-15"
    changes: "Added new fields"
  - version: "1.2.0"
    date: "2024-01-20"
    changes: "Updated validation rules"
```

## Rollback Procedures

### Immediate Rollback

If critical issues discovered immediately:

```bash
# 1. Restore previous version
aws s3 cp s3://myorg-prod-forms/sops/archive/my-sop-backup.yaml \
         s3://myorg-prod-forms/sops/my-sop.yaml

# 2. Invalidate CloudFront cache (if using)
aws cloudfront create-invalidation \
  --distribution-id ABCD1234 \
  --paths "/sops/*"

# 3. Notify users
echo "SOP rollback completed" | send-notification
```

### Planned Rollback

For non-critical issues:

1. **Schedule maintenance window**
2. **Prepare fixed version**
3. **Test in staging**
4. **Deploy fix during window**
5. **Document incident**

## Automation

### CI/CD Pipeline

```yaml
# .github/workflows/deploy-sop.yml
name: Deploy SOP
on:
  push:
    branches: [main]
    paths:
      - 'sops/*.yaml'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Validate SOPs
        run: make validate-all-sops

  deploy-test:
    needs: validate
    if: github.ref == 'refs/heads/develop'
    steps:
      - name: Deploy to Test
        run: make deploy-sop ENV=test

  deploy-prod:
    needs: validate
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Deploy to Production
        run: make rs-deploy-prod ORG=${{ secrets.ORG }}
```

### Automated Deployment Script

```bash
#!/bin/bash
# deploy-sop.sh

SOP_FILE=$1
ENV=$2

# Validate
if ! make validate-sop FILE=$SOP_FILE; then
  echo "❌ Validation failed"
  exit 1
fi

# Deploy based on environment
case $ENV in
  dev)
    cp $SOP_FILE .local/s3/forms/sops/
    echo "✅ Deployed to local"
    ;;
  test)
    aws s3 cp $SOP_FILE s3://${ORG}-test-forms/sops/
    echo "✅ Deployed to test"
    ;;
  stage)
    aws s3 cp $SOP_FILE s3://${ORG}-stage-forms/sops/
    echo "✅ Deployed to staging"
    ;;
  prod)
    # Requires additional confirmation
    read -p "Deploy to PRODUCTION? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
      aws s3 cp $SOP_FILE s3://${ORG}-prod-forms/sops/
      echo "✅ Deployed to production"
    fi
    ;;
esac
```

## Monitoring Deployments

### CloudWatch Metrics

Monitor S3 access for deployed SOPs:

```bash
# Set up CloudWatch alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "SOP-Access-Errors" \
  --alarm-description "Alert on SOP access failures" \
  --metric-name 4xxErrors \
  --namespace AWS/S3 \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

### Deployment Logs

Track all deployments:

```bash
# Log deployment
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | $USER | $SOP_FILE | $ENV | $VERSION" \
  >> deployments.log

# Query recent deployments
tail -20 deployments.log | column -t -s "|"
```

## Security Considerations

### Access Control

```bash
# S3 Bucket Policy Example
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOnlySOPs",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/ClaireReadRole"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::myorg-prod-forms/sops/*"
    },
    {
      "Sid": "DeploySOPs",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/SOPDeployRole"
      },
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::myorg-prod-forms/sops/*"
    }
  ]
}
```

### Encryption

- Enable S3 bucket encryption
- Use KMS for sensitive SOPs
- Encrypt in transit (HTTPS only)

### Audit Trail

```bash
# Enable S3 access logging
aws s3api put-bucket-logging \
  --bucket myorg-prod-forms \
  --bucket-logging-status file://logging-config.json

# Query deployment history
aws s3api list-object-versions \
  --bucket myorg-prod-forms \
  --prefix sops/my-sop.yaml
```

## Troubleshooting Deployment

### Common Issues

#### SOP Not Appearing in CLAIRE

**Check:**
1. File in correct location
2. Correct file extension (.yaml)
3. CLAIRE cache refreshed
4. No permission errors

**Fix:**
```bash
# Verify file exists
aws s3 ls s3://bucket/sops/my-sop.yaml

# Check permissions
aws s3api get-object-acl --bucket bucket --key sops/my-sop.yaml

# Force CLAIRE refresh
make restart-claire
```

#### Permission Denied

**Check:**
- IAM role has S3 permissions
- Bucket policy allows access
- No conflicting deny rules

**Fix:**
```bash
# Test permissions
aws s3 cp test.txt s3://bucket/sops/ --dryrun

# Update IAM policy if needed
aws iam put-role-policy --role-name DeployRole \
  --policy-name S3Access --policy-document file://policy.json
```

#### Version Conflicts

**Check:**
- No duplicate versions deployed
- Version number incremented
- Old version archived

**Fix:**
```bash
# List all versions
aws s3api list-object-versions --bucket bucket --prefix sops/

# Remove duplicate
aws s3 rm s3://bucket/sops/duplicate.yaml
```

## Best Practices

### DO's
✅ Always validate before deploying
✅ Test in lower environments first
✅ Keep deployment logs
✅ Use semantic versioning
✅ Create backups before updates
✅ Document deployment procedures
✅ Automate repetitive tasks

### DON'Ts
❌ Deploy directly to production
❌ Skip validation steps
❌ Ignore version conflicts
❌ Deploy during peak hours
❌ Forget to communicate changes
❌ Leave test data in production SOPs

## Summary

Key deployment steps:

1. **Validate** - Ensure SOP is correct
2. **Version** - Update version appropriately  
3. **Test** - Deploy to test environment first
4. **Stage** - Validate in staging
5. **Deploy** - Push to production with care
6. **Monitor** - Watch for issues
7. **Document** - Record deployment details

## Next Steps

- [View schema reference](schema-reference.md)
- [Browse examples](examples.md)
- [Troubleshooting guide](troubleshooting.md)
- [Return to main guide](index.md)
