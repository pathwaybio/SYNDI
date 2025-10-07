<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Troubleshooting Guide

This guide helps you diagnose and resolve common issues when working with SAM and SOPs.

## Quick Diagnostics

Before diving into specific issues, run these quick checks:

```bash
# Check system status
make status

# Validate your SOP
make validate-sop FILE=your-sop.yaml

# Check deployment
ls -la .local/s3/forms/sops/

# Test CLAIRE connection
curl http://localhost:3000/claire/api/health
```

## Common Issues and Solutions

## Configuration Issues

### Missing Configuration Files

**Symptoms:**
- Error: "Config file not found"
- Services won't start
- Authentication errors

**Solutions:**

1. **Verify config files exist:**
   ```bash
   ls -la infra/.config/
   # Should see at minimum: webapp/, lambda/
   ```

2. **If missing, copy from examples:**
   ```bash
   cp -r infra/example-.config/* infra/.config/
   ```
See [Frontend Configuration Guide](../../shared/system-admin/frontend-configuration.md) for help with customizing the configs for your environment

3. **Run setup to create local directories:**
   ```bash
   make setup-local ENV=dev
   ```

4. **Check environment variable:**
   ```bash
   echo $ENV  # Should be "dev" for local development
   ```

For more details, see:
- [Frontend Configuration Guide](../../shared/system-admin/frontend-configuration.md) - Config structure and customization
- [General Configuration Guide](../../shared/system-admin/configuration.md) - Overall configuration management

## Editor Issues

### SAM Editor Not Loading

**Symptoms:**
- Blank page or loading spinner
- JavaScript errors in console
- Components not rendering

**Solutions:**

1. **Clear browser cache:**
   ```bash
   # Force refresh
   Ctrl+Shift+R (Windows/Linux)
   Cmd+Shift+R (Mac)
   ```

2. **Check browser console:**
   - Press F12 to open developer tools
   - Look for red error messages
   - Common errors: network failures, missing dependencies

3. **Verify services running:**
   ```bash
   # Check if SAM is running
   ps aux | grep sam
   
   # Restart SAM
   make restart-sam
   ```

4. **Check network:**
   - Verify localhost:3000 is accessible
   - Check firewall settings
   - Ensure no port conflicts

### Form Builder Not Working

**Symptoms:**
- Can't add fields
- Drag and drop not functioning
- UI elements unresponsive

**Solutions:**

1. **Check schema registry:**
   ```javascript
   // In browser console
   console.log(window.__SCHEMA_REGISTRY__);
   ```

2. **Reload schemas:**
   ```bash
   make build-schemas
   make restart-sam
   ```

3. **Browser compatibility:**
   - Use Chrome, Firefox, or Edge (latest versions)
   - Disable browser extensions that might interfere

### Autosave Not Working

**Symptoms:**
- Changes lost on refresh
- No autosave indicator
- Drafts not appearing

**Solutions:**

1. **Check local storage:**
   ```javascript
   // In browser console
   localStorage.getItem('sam-autosave');
   ```

2. **Clear corrupted data:**
   ```javascript
   localStorage.removeItem('sam-autosave');
   location.reload();
   ```

3. **Verify permissions:**
   - Browser must allow local storage
   - Check privacy/security settings

## Validation Issues

### Validation Never Completes

**Symptoms:**
- Validation spinner runs indefinitely
- No error or success message
- Browser becomes unresponsive

**Solutions:**

1. **Check SOP size:**
   - Very large SOPs (>1000 fields) may timeout
   - Split into smaller SOPs if needed

2. **Look for circular references:**
   ```yaml
   # BAD: Circular reference
   taskA:
     children: [$ref: '#/taskB']
   taskB:
     children: [$ref: '#/taskA']
   ```

3. **Validate YAML syntax first:**
   ```bash
   # Use external validator
   yamllint your-sop.yaml
   ```

### False Validation Errors

**Symptoms:**
- Valid fields marked as invalid
- Schema version mismatch errors
- Type errors on correct types

**Solutions:**

1. **Update schema cache:**
   ```bash
   make clean-cache
   make build-schemas
   ```

2. **Check schema version:**
   ```yaml
   # Ensure using correct version
   '$schema': 'SOPTemplateSchema/v2.0'
   ```

3. **Verify field types:**
   ```yaml
   # Common mistake: quotes on numbers
   ordinal: 1      # Correct
   ordinal: "1"    # Wrong - string not number
   ```

### Validation Passes But Form Broken

**Symptoms:**
- SOP validates successfully
- Form doesn't render in CLAIRE
- Missing tabs or fields

**Solutions:**

1. **Check hierarchical structure:**
   ```yaml
   # Correct structure
   taskgroups:
     - children:  # Must have children
         - '@type': Task  # Must be Task type
   ```

2. **Verify parent-child relationships:**
   - All children must reference valid parents
   - No orphaned elements

3. **Test minimal version:**
   - Start with basic structure
   - Add complexity gradually
   - Identify breaking change

## Deployment Problems

### SOP Not Appearing in CLAIRE

**Symptoms:**
- Deployed SOP not in list
- 404 error when accessing
- Old version still showing

**Solutions:**

1. **Verify deployment location:**
   ```bash
   # Check file exists
   ls -la .local/s3/forms/sops/your-sop.yaml
   
   # Check file permissions
   chmod 644 .local/s3/forms/sops/your-sop.yaml
   ```

2. **Clear CLAIRE cache:**
   ```bash
   # Restart CLAIRE
   make restart-claire
   
   # Or clear cache manually
   rm -rf .claire-cache/*
   ```

3. **Check filename:**
   - Must end with `.yaml` or `.yml`
   - No spaces in filename
   - Case-sensitive on Linux

4. **Verify YAML structure:**
   ```bash
   # Test parse
   python -c "import yaml; yaml.safe_load(open('your-sop.yaml'))"
   ```

### Permission Denied Errors

**Symptoms:**
- Can't write to S3
- Access denied messages
- 403 Forbidden errors

**Solutions:**

1. **Local permissions:**
   ```bash
   # Fix local directory permissions
   chmod -R 755 .local/s3/
   chown -R $USER:$USER .local/s3/
   ```

2. **AWS permissions:**
   ```bash
   # Check AWS credentials
   aws sts get-caller-identity
   
   # Test S3 access
   aws s3 ls s3://your-bucket/
   ```

3. **IAM policies:**
   - Verify user has s3:PutObject permission
   - Check bucket policies
   - Review IAM role assignments

### Version Conflicts

**Symptoms:**
- Wrong version deployed
- Multiple versions present
- Version rollback not working

**Solutions:**

1. **Clean deployment:**
   ```bash
   # Remove all versions
   rm .local/s3/forms/sops/your-sop*.yaml
   
   # Deploy specific version
   cp your-sop-v1.0.0.yaml .local/s3/forms/sops/your-sop.yaml
   ```

2. **Version tracking:**
   ```bash
   # List all versions
   ls -la .local/s3/forms/sops/ | grep your-sop
   
   # Check current version
   grep "version:" .local/s3/forms/sops/your-sop.yaml
   ```

## Rendering Issues

### Fields Not Displaying

**Symptoms:**
- Fields defined but not visible
- Empty tabs or sections
- Missing input elements

**Solutions:**

1. **Check type property:**
   ```yaml
   # Field MUST have type to render
   - id: my_field
     '@type': Field
     type: "string"  # Required for rendering
   ```

2. **Verify hierarchy:**
   ```yaml
   taskgroups:
     - children:        # Task groups need children
         - '@type': Task
           children:    # Tasks need children
             - '@type': Field
   ```

3. **Check UI config:**
   ```yaml
   ui_config:
     hidden: false  # Ensure not hidden
     component_type: "field"  # Correct type
   ```

### Tabs Not Working

**Symptoms:**
- Tabs not clickable
- Content not switching
- All tabs show same content

**Solutions:**

1. **Unique IDs required:**
   ```yaml
   # Each task needs unique ID
   - id: task_1  # Must be unique
   - id: task_2  # Must be unique
   ```

2. **Ordinal values:**
   ```yaml
   # Set ordinal for tab order
   - ordinal: 1
   - ordinal: 2
   ```

3. **Parent references:**
   - Tasks must reference parent taskgroup
   - Check for broken references

### Styling Issues

**Symptoms:**
- Components look broken
- Inconsistent styling
- Missing icons or colors

**Solutions:**

1. **Check CSS loading:**
   ```javascript
   // In browser console
   document.styleSheets.length > 0
   ```

2. **Verify UI config:**
   ```yaml
   ui_config:
     variant: "default"  # Use valid variant
     className: "valid-class"  # Check class exists
   ```

3. **Browser compatibility:**
   - Update to latest browser version
   - Check browser-specific CSS issues

## Performance Issues

### Slow Form Loading

**Symptoms:**
- Long load times (>5 seconds)
- Browser freezing
- Memory warnings

**Solutions:**

1. **Reduce complexity:**
   - Limit fields per tab (<50)
   - Minimize nested structures
   - Split large SOPs

2. **Optimize validation:**
   - Simplify regex patterns
   - Reduce cross-field validations
   - Use async validation

3. **Browser optimization:**
   ```javascript
   // Clear memory
   if (window.gc) window.gc();
   ```

### Memory Leaks

**Symptoms:**
- Browser memory usage growing
- Page becomes unresponsive
- Crashes after extended use

**Solutions:**

1. **Monitor memory:**
   - Use Chrome DevTools Memory Profiler
   - Look for detached DOM nodes
   - Check for event listener leaks

2. **Clear unused data:**
   ```javascript
   // Manual cleanup
   window.__CLEAR_CACHE__();
   ```

3. **Restart periodically:**
   - Refresh page every few hours
   - Clear browser cache regularly

## Data Issues

### Lost Form Data

**Symptoms:**
- Entered data disappears
- Drafts not saving
- Submission failures

**Solutions:**

1. **Check autosave:**
   ```javascript
   // View autosave data
   JSON.parse(localStorage.getItem('claire-drafts'));
   ```

2. **Manual backup:**
   ```javascript
   // Export current form data
   copy(JSON.stringify(window.__FORM_DATA__));
   ```

3. **Recovery options:**
   - Check browser history
   - Look for temp files
   - Review server logs

### Validation Errors on Submit

**Symptoms:**
- Can't submit valid data
- Required fields marked empty
- Type mismatch errors

**Solutions:**

1. **Check field values:**
   ```javascript
   // Inspect form data
   console.log(document.querySelector('form').elements);
   ```

2. **Clear and retry:**
   - Clear field and re-enter
   - Check for invisible characters
   - Verify correct format

3. **Debug validation:**
   ```javascript
   // Enable validation debugging
   window.__DEBUG_VALIDATION__ = true;
   ```

## Debug Tools and Commands

### Browser Console Commands

```javascript
// Get current SOP
window.__CURRENT_SOP__

// View form state
window.__FORM_STATE__

// Check validation errors
window.__VALIDATION_ERRORS__

// Export debug info
window.__EXPORT_DEBUG__()

// Clear all caches
window.__CLEAR_ALL__()

// Enable verbose logging
window.__VERBOSE__ = true
```

### Command Line Tools

```bash
# Check system health
make health-check

# Run diagnostics
make diagnose

# View logs
tail -f logs/sam.log
tail -f logs/claire.log

# Test specific SOP
make test-sop FILE=your-sop.yaml

# Full system reset
make clean-all && make setup
```

### Log File Locations

```
logs/
├── sam.log          # SAM editor logs
├── claire.log       # CLAIRE runtime logs
├── validation.log   # Validation errors
├── deployment.log   # Deployment history
└── error.log        # System errors
```

## Getting Help

### Before Asking for Help

1. **Gather information:**
   - Error messages (exact text)
   - Browser console output
   - SOP YAML file
   - Steps to reproduce

2. **Try basic fixes:**
   - Clear cache
   - Restart services
   - Validate YAML
   - Check examples

3. **Document issue:**
   - What you expected
   - What actually happened
   - What you've tried

### Support Channels

1. **Documentation:**
   - This troubleshooting guide
   - [Examples](examples.md)
   - [Schema Reference](schema-reference.md)

2. **Community:**
   - GitHub Issues
   - Discussion forums
   - Stack Overflow

3. **Direct Support:**
   - System administrator
   - Development team
   - Help desk ticket

### Reporting Bugs

Include in bug reports:

```markdown
## Bug Report

**Environment:**
- OS: [Windows/Mac/Linux]
- Browser: [Chrome/Firefox/Safari] [version]
- SAM Version: [version]
- CLAIRE Version: [version]

**Description:**
[What happened]

**Expected Behavior:**
[What should happen]

**Steps to Reproduce:**
1. [First step]
2. [Second step]
3. [Error occurs]

**Error Messages:**
```
[Paste exact error]
```

**SOP YAML:**
```yaml
[Paste relevant section]
```

**Screenshots:**
[Attach if applicable]
```

## Prevention Tips

### Best Practices

1. **Regular maintenance:**
   - Update regularly
   - Clear cache weekly
   - Archive old SOPs
   - Monitor logs

2. **Development workflow:**
   - Test locally first
   - Validate frequently
   - Use version control
   - Document changes

3. **System health:**
   - Monitor disk space
   - Check memory usage
   - Review error logs
   - Update dependencies

### Common Mistakes to Avoid

❌ **Don't:**
- Edit production directly
- Skip validation
- Use special characters in IDs
- Create circular references
- Ignore error messages
- Deploy without testing

✅ **Do:**
- Test thoroughly
- Keep backups
- Follow naming conventions
- Validate before deploying
- Monitor after deployment
- Document everything

## Summary

Most issues can be resolved by:

1. **Validating your SOP**
2. **Clearing caches**
3. **Restarting services**
4. **Checking logs**
5. **Following examples**

When in doubt, start with a minimal working example and gradually add complexity to identify the issue.

## Next Steps

- [Review examples](examples.md)
- [Check schema reference](schema-reference.md)
- [Read deployment guide](deployment.md)
- [Return to main documentation](index.md)
