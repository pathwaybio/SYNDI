<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Synthetic Intelligence for Data Integrity (SYNDI) Documentation

Welcome to the comprehensive documentation for **SYNDI**, a next-generation Laboratory Information Management System (LIMS) designed for modern research environments. This integrated platform combines three powerful, interdependent components to streamline laboratory operations, ensure compliance, and accelerate scientific discovery. Our documentation serves researchers, developers, system administrators, and compliance officers with detailed guides, APIs, and best practices.

SYNDI consists of three core components working in harmony:
- **PAUL** <img src="_static/PAUL.png" width="24" style="vertical-align: middle;"/> (Protocol Automation Librarian) - Standard Operating Procedure (SOP) and data element extraction from written protocols
- **SAM** <img src="_static/SAM.png" width="24" style="vertical-align: middle;"/> (SOP Automation to Models) - Chained SOP authoring, validation, and cataloging
- **CLAIRE** <img src="_static/CLAIRE.png" width="24" style="vertical-align: middle;"/> (Compliant Ledger-based Automation for Integrated Reporting and Export) - Uses SOP forms to collect and track electronic notebook (ELN) data with full provenance and reproducibility.

## SYNDI Workflow

<div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin: 20px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  
  <!-- Step 1: SME writes Protocol -->
  <div style="position: relative; background: #e3f2fd; border: 2px solid #1976d2; border-radius: 6px; padding: 8px; width: 50px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="font-weight: bold; font-size: 10px; line-height: 1.2; color: #222;">🧪 SME<br/>writes<br/>Protocol</div>
  </div>
  
  <!-- Arrow 1 -->
  <div style="color: #666; font-size: 16px; margin: 0 2px;">→</div>
  
  <!-- Step 2: PAUL Extracts -->
  <div style="position: relative; background: #f1f8e9; border: 2px solid #388e3c; border-radius: 6px; padding: 8px; width: 50px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="font-weight: bold; font-size: 10px; line-height: 1.2; color: #222;">🤖 PAUL<br/>Extracts<br/>SOP</div>
    <img src="_static/PAUL.png" style="position: absolute; bottom: 2px; right: 2px; width: 18px; height: 18px; opacity: 0.8;"/>
  </div>
  
  <!-- Arrow 2 -->
  <div style="color: #666; font-size: 16px; margin: 0 2px;">→</div>
  
  <!-- Step 3: SAM Validates -->
  <div style="position: relative; background: #f1f8e9; border: 2px solid #388e3c; border-radius: 6px; padding: 8px; width: 50px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="font-weight: bold; font-size: 10px; line-height: 1.2; color: #222;">🔍 SAM<br/>Validates<br/>SOP</div>
    <img src="_static/SAM.png" style="position: absolute; bottom: 2px; right: 2px; width: 18px; height: 18px; opacity: 0.8;"/>
  </div>
  
  <!-- Arrow 3 -->
  <div style="color: #666; font-size: 16px; margin: 0 2px;">→</div>
  
  <!-- Step 4: CLAIRE Collects -->
  <div style="position: relative; background: #f1f8e9; border: 2px solid #388e3c; border-radius: 6px; padding: 8px; width: 65px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="font-weight: bold; font-size: 10px; line-height: 1.2; color: #222;">📋 CLAIRE<br/>Collects <br/>ELN</div>
    <img src="_static/CLAIRE.png" style="position: absolute; bottom: 2px; right: 2px; width: 18px; height: 18px; opacity: 0.8;"/>
  </div>
  
  <!-- Arrow 4 -->
  <div style="color: #666; font-size: 16px; margin: 0 2px;">→</div>
  
  <!-- Step 5: Results & Reports -->
  <div style="position: relative; background: #e3f2fd; border: 2px solid #1976d2; border-radius: 6px; padding: 8px; width: 50px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="font-weight: bold; font-size: 10px; line-height: 1.2; color: #222;">🧠 <br/>AI-ready Data</div>
  </div>
  
</div>

**How SYNDI Works:**
1. **🧪 SME writes Protocol** - Subject matter experts create laboratory protocols
2. **🤖 PAUL<img src="_static/PAUL.png" width="20" style="vertical-align: middle;"/> Extracts SOP** - Automatically extracts Standard Operating Procedures and data elements
3. **🔍 SAM<img src="_static/SAM.png" width="20" style="vertical-align: middle;"/> Validates SOP** - Validates and optimizes the extracted procedures
4. **📋 CLAIRE<img src="_static/CLAIRE.png" width="20" style="vertical-align: middle;"/> Collects ELN** - Collects Electronic Lab Notebook data via validated SOPs
5. **📊 Results & Reports** - Downstream pipelines extract meaningful data slices with full provenance to generate compliant reports and analytics

## Key Documentation Areas

- **Product Documentation**: Comprehensive guides for each component (CLAIRE, PAUL, SAM)
- **User Guides**: Step-by-step workflows for laboratory personnel
- **High Level Design**: System architecture and high level design
- **Developer Resources**: APIs, integration guides, and technical specifications
- **System Administration**: Deployment, configuration, and maintenance
- **Compliance**: Regulatory requirements and audit trails
- **AI Partnering**: How to partner with AI agents to get the most of these tools

```{toctree}
:maxdepth: 1
:caption: Contents:

getting-started
shared/design/index
paul/index
sam/index
claire/index
shared/system-admin/index
shared/compliance/index
shared/ai/index
stakeholders/index
```
