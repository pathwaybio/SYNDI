## **SYNDI - Synthetic Intelligence for Data Integrity**
Automated lab data capture enabling **AI-ready data**: AI extracts protocols, validates SOPs, collects compliant structured data

[![Documentation Status](https://readthedocs.org/projects/syndi/badge/?version=latest)](https://syndi.readthedocs.io/en/latest/?badge=latest)

### The Three Core Components:

1. **🤖 PAUL (Protocol Automation Librarian)**
   - Automatically extracts Standard Operating Procedures (SOPs) and data elements from written laboratory protocols
   - Uses AI to parse unstructured protocol documents into structured SOPs

2. **🔍 SAM (SOP Authoring Manager)** 
   - Validates and optimizes SOPs extracted by PAUL
   - Provides a template-driven SOP authoring interface
   - Ensures SOPs comply with regulatory requirements

3. **📋 CLAIRE (Compliant Ledger-based Automation for Integrated Reporting and Export)**
   - Electronic Lab Notebook (ELN) data capture system
   - Renders validated SOPs as dynamic tabbed forms
   - Collects structured lab data with full audit trails and provenance tracking
   - Supports instrument integration and prerequisite ELN data import

### How It Works (Workflow):

```
SME writes Protocol → PAUL Extracts SOP → SAM Validates → CLAIRE Collects ELN Data → AI-ready Data for Analytics
```

### Key Features:

- **AWS-based deployment** (Lambda, S3, Cognito, CloudFront, API Gateway)
- **Regulatory compliance** with immutable storage and full audit trails
- **Role-based access control** (Admins, Lab Managers, Researchers, Clinicians)
- **FastAPI backend** (Python) + **React/TypeScript frontend**
- **Multi-organization support** with environment-based configuration (dev/stage/prod)
- **Data provenance tracking** - complete lineage from protocol to final data

### Primary Use Case:

Streamlines laboratory operations by converting written protocols into structured, validated forms that capture research data in an AI-ready format - making lab data immediately ready for analytics, reporting, and regulatory submissions.
