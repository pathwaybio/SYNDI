<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Feature Backlog

## Overview

This document outlines planned features for the SYNDI laboratory data management platform (CLAIRE, SAM, and PAUL). Features are organized by priority and complexity, focusing on expanding from current single-user deployments to advanced multi-user laboratory environments.

## Planned Features

### Feature Group Benefits Matrix

| Feature | Compliance | Collaboration | Automation | Scalability |
|---------|------------|---------------|------------|-------------|
| Tool-Specific Access Control | | | | |
| * SAM & PAUL Access Restrictions | ✓✓✓ | ✓ | ✓ | ✓ |
| * Researcher Subgroups | ✓✓ | ✓✓✓ | ✓ | ✓✓ |
| * Granular ELN Sharing | ✓ | ✓✓✓ | ✓ | ✓✓ |
| * Two-Factor Authentication (2FA) | ✓✓✓ | ✓ | ✓✓ | ✓✓ |
| * Configuration-Driven Access | ✓✓✓ | ✓✓ | ✓✓ | ✓✓✓ |
| Dynamic Groups | ✓✓ | ✓✓ | ✓✓✓ | ✓✓✓ |
| SOP Chaining | ✓✓ | ✓✓ | ✓✓✓ | ✓✓✓ |
| Enterprise Integration | ✓✓✓ | ✓✓ | ✓✓✓ | ✓✓ |
| Laboratory File Management | | | | |
| * Advanced File Upload | ✓✓ | ✓ | ✓✓ | ✓✓ |
| * SAM File Field Integration | ✓ | ✓ | ✓✓✓ | ✓✓ |
| * Production File Storage | ✓✓ | ✓ | ✓✓ | ✓✓✓ |
| * File Lifecycle Management | ✓✓✓ | ✓ | ✓✓✓ | ✓✓ |

### Tool-Specific Access Control

#### SAM & PAUL Access Restrictions
**Business Need**: Ensure only qualified personnel create SOPs
- Restrict SAM and PAUL access to SOP authors (QA and Admin roles only)
- Implement quality control workflow for SOP creation
- Add role-based UI components for tool access
- Extend existing RBAC system with tool-specific permissions (`access:SAM`, `access:PAUL`)

##### Benefits
- Improved quality control for laboratory procedures
- Compliance with organizational hierarchies
- Reduced risk of unauthorized SOP modifications

#### Researcher Subgroups
**Business Need**: Different SOPs for different expertise areas
- **Clinician Access**: Patient sample submission protocols
- **CRO Access**: Omics data submission workflows  
- **Labtech Access**: Assay execution procedures
- **QA Assignment Control**: QA personnel assign SOPs to researcher types

#### Granular ELN Sharing
**Business Need**: Researcher control over experimental data sharing
- Individual ELN permission management
- Project-based automatic sharing
- Colleague invitation and access control
- Notification system for share requests

##### Technical Requirements
- Database schema for user relationships and sharing permissions
- API endpoints for ELN sharing and access control
- UI components for sharing dialogs and permission management
- Real-time notifications for collaboration requests

#### Two-Factor Authentication (2FA)
**Business Need**: Enhanced security for sensitive laboratory data access
- **TOTP Support**: Time-based one-time password authentication
- **SMS Fallback**: SMS-based 2FA for users without authenticator apps
- **Enforcement Policies**: Role-based 2FA requirements (Admin, QA roles mandatory)
- **Recovery Options**: Secure account recovery for locked users
- **Integration**: Seamless integration with existing SAM/PAUL access controls

##### Benefits
- Enhanced security for laboratory data and SOP management
- Compliance with industry security standards
- Protection against unauthorized access to sensitive protocols
- Reduced risk of data breaches and SOP tampering

##### Technical Requirements
- TOTP library integration (Google Authenticator, Authy compatible)
- SMS gateway integration for fallback authentication
- Database schema for 2FA secrets and recovery codes
- UI components for 2FA setup and verification
- Policy enforcement middleware for protected routes

#### Configuration-Driven Access Control

##### SOP Creator Control
**Business Need**: SOP authors define data access policies
- Template-based permission definitions in SOP metadata
- Dynamic permission inheritance from SOP to ELN
- Researcher override capabilities for inherited permissions
- Permission template library for common access patterns

##### YAML Configuration Example
```yaml
metadata:
  eln_default_permissions:
    public: false
    allowed_groups: ["project_team", "QA"]
    researcher_overrides: ["share_with_collaborators"]
    required_permissions: ["view:ELN:project"]
```

##### Implementation Features
- Access control rules embedded in SOP templates
- Policy validation tools
- Migration utilities for existing data
- Administrative interfaces for permission management

### Dynamic Groups & SOP Chaining

#### Filename-Based Dynamic Groups
**Business Need**: Zero-configuration project scaling
- Automatic group creation from filename variables
- Project-based access inheritance (`project_id` groups)
- Experiment-level data isolation
- Dynamic Cognito group management

#### SOP Chaining
**Business Need**: Seamless workflow automation
- Variable passing between linked SOPs
- Chain validation for data compatibility
- Dependency tracking and visualization
- Access permission propagation through chains

#### Design Motivations
1. **Zero-Configuration Scaling**: New projects automatically inherit appropriate access controls
2. **Workflow Automation**: Eliminate manual data transfer between experimental steps
3. **Data Lineage**: Complete traceability through experimental workflows
4. **Compliance Automation**: Automatic audit trails for regulatory requirements

#### Technical Architecture
- Graph database for SOP relationships
- Variable extraction from ELN metadata
- Automated workflow orchestration
- Chain execution monitoring

### Enterprise Laboratory Features

#### Advanced Integration
- **LIMS Connectivity**: Laboratory Information Management System integration
- **Instrument Integration**: Direct data import from laboratory equipment
- **Sample Registry**: Automated sample tracking and lifecycle management
- **External Collaborations**: Secure sharing with external research partners

#### Enhanced Access Control
- **Time-Based Permissions**: Expiring access to sensitive experimental data
- **Hierarchical Organizations**: Support for complex organizational structures
- **Data Classification**: Automatic sensitivity labeling and protection policies
- **Audit Compliance**: Advanced reporting for regulatory requirements

#### Advanced Analytics
- **Usage Analytics**: Laboratory productivity and collaboration metrics
- **Compliance Reporting**: Automated regulatory compliance reports
- **Data Utilization**: Cross-researcher data reuse and collaboration insights
- **Performance Monitoring**: System performance and user experience metrics

### Laboratory File Management

#### Advanced File Upload Features
**Business Need**: Enhanced file handling for complex laboratory workflows
- **File Preview**: Preview images and PDFs before submission
- **File Compression**: Automatic compression for large data files
- **Virus Scanning**: Security validation for uploaded content
- **Enhanced Progress**: Advanced upload progress tracking and error recovery
- **File Versioning**: Track changes to attached laboratory documents

#### SAM File Field Integration
**Business Need**: Streamlined SOP authoring with file upload configuration
- **File Field Configuration**: File upload settings through SAM authoring interface
- **Field Validation**: Prevent filename parsing issues with field naming validation
- **Template Guidance**: File upload hints and validation in SOP templates
- **UI Integration**: Enhanced SAM interface for file field management

#### Production File Storage
**Business Need**: Enterprise-grade file storage for multi-user environments
- **AWS Cross-Bucket Support**: S3 cross-bucket operations for production deployments
- **Storage Optimization**: AWS-specific storage optimizations and permissions
- **Cloud Testing**: Validation and testing for cloud storage backends
- **Performance Tuning**: Optimized file operations for large-scale usage

#### File Lifecycle Management
**Business Need**: Automated maintenance and compliance for laboratory data
- **Draft Cleanup Automation**: Scheduled cleanup of temporary files
- **Storage Optimization**: Automated maintenance for storage efficiency
- **Audit Logging**: Complete file lifecycle tracking for compliance
- **Retention Policies**: Configurable data retention for regulatory requirements

#### Benefits
- **Data Integrity**: Enhanced file validation and security measures
- **User Experience**: Streamlined file upload workflows for researchers
- **Compliance**: Automated audit trails and data retention management
- **Scalability**: Enterprise-ready storage and performance optimization

### [Add new feature backlog here]

