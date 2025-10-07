<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# SOP Examples

This document provides complete, working examples of SOPs that demonstrate various features and patterns you can use in your own procedures.

## Basic SOP Example

A minimal SOP with essential fields:

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: BASIC_001
name: "Basic Protocol"
title: "Basic Laboratory Protocol"
version: "1.0.0"
author: "Lab User"
approver: "Lab Manager"
date-published: "2024-01-20"
status: "published"
url: "https://example.com/sops/basic"
license: "MIT"
keywords: ["basic", "example", "template"]
applicationCategory: "Laboratory Protocol"

taskgroups:
  - id: main_group
    name: "Main Procedures"
    title: "Primary Laboratory Procedures"
    ordinal: 1
    children:
      - id: general_info_task
        '@type': Task
        name: "General Info"
        title: "General Information"
        ordinal: 1
        children:
          - id: experiment_date
            '@type': Field
            name: "Experiment Date"
            type: "string"
            format: "date"
            required: true
            
          - id: operator_name
            '@type': Field
            name: "Operator Name"
            type: "string"
            required: true
            description: "Full name of person performing the experiment"
```

## Cell Culture SOP

A comprehensive cell culture protocol with multiple tabs and field types:

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: CELL_CULTURE_001
name: "Cell Culture Maintenance"
title: "Cell Culture Maintenance Protocol"
version: "2.1.0"
author: "Dr. Sarah Johnson"
approver: "Lab Director"
date-published: "2024-01-15"
status: "published"
url: "https://example.com/sops/cell-culture"
license: "MIT"
keywords: ["cell culture", "maintenance", "passaging", "mammalian cells"]
applicationCategory: "Cell Biology Protocol"

taskgroups:
  - id: culture_maintenance_group
    name: "Culture Maintenance"
    title: "Cell Culture Maintenance Procedures"
    description: "Standard procedures for maintaining cell cultures"
    ordinal: 1
    ui_config:
      icon: "microscope"
      collapsible: false
    children:
      # Tab 1: Setup
      - id: setup_task
        '@type': Task
        name: "Setup"
        title: "Experiment Setup"
        ordinal: 1
        children:
          - id: project_id
            '@type': Field
            name: "Project ID"
            type: "string"
            required: true
            validation:
              pattern: "^PROJ-[0-9]{4}$"
              message: "Format: PROJ-XXXX"
            children:
              - id: project_id_filename
                '@type': ELNFilenameComponent
                order: 1
                filename_component: true
                
          - id: cell_line
            '@type': Field
            name: "Cell Line"
            type: "string"
            required: true
            enum: ["HEK293", "HeLa", "CHO", "Jurkat", "A549", "Other"]
            
          - id: passage_number
            '@type': Field
            name: "Passage Number"
            type: "number"
            required: true
            min: 1
            max: 50
            description: "Current passage number (P1-P50)"
            
          - id: mycoplasma_test_date
            '@type': Field
            name: "Last Mycoplasma Test"
            type: "string"
            format: "date"
            required: false
            description: "Date of most recent mycoplasma testing"
            
      # Tab 2: Media Preparation
      - id: media_prep_task
        '@type': Task
        name: "Media Prep"
        title: "Media Preparation"
        ordinal: 2
        children:
          - id: base_media
            '@type': Field
            name: "Base Media"
            type: "string"
            required: true
            enum: ["DMEM", "RPMI-1640", "MEM", "Ham's F-12", "Custom"]
            
          - id: serum_percentage
            '@type': Field
            name: "Serum Percentage"
            type: "number"
            unit: "%"
            required: true
            min: 0
            max: 20
            default: 10
            
          - id: antibiotics
            '@type': Field
            name: "Antibiotics Added"
            type: "array"
            items:
              type: "string"
              enum: ["Penicillin/Streptomycin", "Gentamicin", "Amphotericin B", "None"]
            minItems: 0
            maxItems: 3
            
          - id: supplements
            '@type': Field
            name: "Additional Supplements"
            type: "string"
            required: false
            description: "List any additional supplements added to media"
            
      # Tab 3: Passaging Procedure
      - id: passaging_task
        '@type': Task
        name: "Passaging"
        title: "Passaging Procedure"
        ordinal: 3
        children:
          - id: confluency
            '@type': Field
            name: "Starting Confluency"
            type: "number"
            unit: "%"
            required: true
            min: 0
            max: 100
            description: "Estimated confluency before passaging"
            
          - id: split_ratio
            '@type': Field
            name: "Split Ratio"
            type: "string"
            required: true
            enum: ["1:2", "1:3", "1:4", "1:5", "1:10", "Other"]
            default: "1:3"
            
          - id: trypsinization_time
            '@type': Field
            name: "Trypsinization Time"
            type: "number"
            unit: "minutes"
            required: true
            min: 1
            max: 15
            
          - id: cell_count
            '@type': Field
            name: "Cell Count"
            type: "number"
            unit: "cells/mL"
            required: false
            min: 0
            format: "scientific"
            
          - id: viability
            '@type': Field
            name: "Cell Viability"
            type: "number"
            unit: "%"
            required: false
            min: 0
            max: 100
            
      # Tab 4: Quality Control
      - id: qc_task
        '@type': Task
        name: "QC"
        title: "Quality Control"
        ordinal: 4
        children:
          - id: morphology_check
            '@type': Field
            name: "Morphology Normal?"
            type: "boolean"
            required: true
            description: "Are cells displaying normal morphology?"
            
          - id: contamination_check
            '@type': Field
            name: "Contamination Observed?"
            type: "boolean"
            required: true
            description: "Any signs of bacterial/fungal contamination?"
            
          - id: microscopy_images
            '@type': Field
            name: "Microscopy Images"
            type: "file"
            file_config:
              accept: ".jpg,.png,.tif"
              maxSize: 20971520  # 20MB
              multiple: true
            required: false
            
          - id: notes
            '@type': Field
            name: "Additional Notes"
            type: "string"
            format: "textarea"
            required: false
            maxLength: 500
```

## Sample Processing SOP with Tables

An example using table inputs for sample tracking:

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: SAMPLE_PROC_001
name: "Sample Processing"
title: "Biological Sample Processing Protocol"
version: "1.5.0"
author: "Clinical Lab Team"
approver: "QC Manager"
date-published: "2024-02-01"
status: "published"
url: "https://example.com/sops/sample-processing"
license: "MIT"
keywords: ["sample", "processing", "clinical", "biobank"]
applicationCategory: "Clinical Protocol"

taskgroups:
  - id: sample_proc_group
    name: "Sample Processing"
    title: "Sample Processing Workflow"
    ordinal: 1
    children:
      # Tab 1: Batch Information
      - id: batch_info_task
        '@type': Task
        name: "Batch Info"
        title: "Batch Information"
        ordinal: 1
        children:
          - id: batch_id
            '@type': Field
            name: "Batch ID"
            type: "string"
            required: true
            validation:
              pattern: "^BATCH-[0-9]{6}$"
              message: "Format: BATCH-YYYYMM"
            children:
              - id: batch_id_filename
                '@type': ELNFilenameComponent
                order: 1
                filename_component: true
                
          - id: processing_date
            '@type': Field
            name: "Processing Date"
            type: "string"
            format: "date"
            required: true
            
          - id: technician
            '@type': Field
            name: "Processing Technician"
            type: "string"
            required: true
            
      # Tab 2: Sample Table
      - id: samples_task
        '@type': Task
        name: "Samples"
        title: "Sample Information"
        ordinal: 2
        children:
          - id: sample_table
            '@type': Table
            name: "Sample Details"
            description: "Enter information for each sample in the batch"
            required: true
            minRows: 1
            maxRows: 96
            columns:
              - id: sample_id_col
                name: "Sample ID"
                type: "string"
                required: true
                validation:
                  pattern: "^S[0-9]{6}$"
                  
              - id: sample_type_col
                name: "Sample Type"
                type: "string"
                required: true
                enum: ["Plasma", "Serum", "Whole Blood", "Urine", "Tissue"]
                
              - id: volume_col
                name: "Volume (mL)"
                type: "number"
                required: true
                min: 0.1
                max: 50
                
              - id: collection_time_col
                name: "Collection Time"
                type: "string"
                format: "time"
                required: true
                
              - id: storage_temp_col
                name: "Storage Temp (°C)"
                type: "number"
                required: true
                enum: [-80, -20, 4, 25]
                
              - id: aliquots_col
                name: "# Aliquots"
                type: "number"
                required: true
                min: 1
                max: 10
                
              - id: notes_col
                name: "Notes"
                type: "string"
                required: false
                maxLength: 100
                
      # Tab 3: Processing Steps
      - id: processing_steps_task
        '@type': Task
        name: "Processing"
        title: "Processing Steps"
        ordinal: 3
        children:
          - id: centrifuge_speed
            '@type': Field
            name: "Centrifuge Speed"
            type: "number"
            unit: "rpm"
            required: true
            min: 100
            max: 15000
            
          - id: centrifuge_time
            '@type': Field
            name: "Centrifuge Time"
            type: "number"
            unit: "minutes"
            required: true
            min: 1
            max: 60
            
          - id: centrifuge_temp
            '@type': Field
            name: "Centrifuge Temperature"
            type: "number"
            unit: "°C"
            required: true
            min: 4
            max: 25
            default: 4
```

## Multi-Step Protocol with Nested Tasks

Example showing nested task structure for complex procedures:

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: ASSAY_PROTOCOL_001
name: "ELISA Assay"
title: "ELISA Assay Protocol"
version: "3.0.0"
author: "Immunology Lab"
approver: "Research Director"
date-published: "2024-02-10"
status: "published"
url: "https://example.com/sops/elisa"
license: "MIT"
keywords: ["ELISA", "immunoassay", "antibody", "detection"]
applicationCategory: "Immunoassay Protocol"

taskgroups:
  - id: elisa_group
    name: "ELISA Protocol"
    title: "ELISA Assay Procedure"
    ordinal: 1
    children:
      # Tab 1: Preparation
      - id: preparation_task
        '@type': Task
        name: "Preparation"
        title: "Assay Preparation"
        ordinal: 1
        children:
          # Nested card for reagent prep
          - id: reagent_prep_subtask
            '@type': Task
            name: "Reagent Preparation"
            title: "Prepare Reagents"
            ordinal: 1
            ui_config:
              component_type: "card"
              variant: "outlined"
              collapsible: true
            children:
              - id: coating_buffer
                '@type': Field
                name: "Coating Buffer Prepared"
                type: "boolean"
                required: true
                
              - id: wash_buffer
                '@type': Field
                name: "Wash Buffer Volume (mL)"
                type: "number"
                required: true
                min: 100
                max: 2000
                
              - id: blocking_buffer
                '@type': Field
                name: "Blocking Buffer Type"
                type: "string"
                required: true
                enum: ["1% BSA", "5% Milk", "2% BSA", "Custom"]
                
          # Nested card for sample prep
          - id: sample_prep_subtask
            '@type': Task
            name: "Sample Preparation"
            title: "Prepare Samples"
            ordinal: 2
            ui_config:
              component_type: "card"
              variant: "outlined"
              collapsible: true
            children:
              - id: dilution_factor
                '@type': Field
                name: "Sample Dilution Factor"
                type: "string"
                required: true
                enum: ["1:10", "1:50", "1:100", "1:500", "1:1000"]
                
              - id: num_samples
                '@type': Field
                name: "Number of Samples"
                type: "number"
                required: true
                min: 1
                max: 96
                
      # Tab 2: Plate Setup
      - id: plate_setup_task
        '@type': Task
        name: "Plate Setup"
        title: "Plate Configuration"
        ordinal: 2
        children:
          - id: plate_layout
            '@type': Field
            name: "Plate Layout File"
            type: "file"
            file_config:
              accept: ".xlsx,.csv"
              maxSize: 5242880  # 5MB
            required: false
            description: "Upload plate layout template"
            
          - id: standards_range
            '@type': Field
            name: "Standards Concentration Range"
            type: "string"
            required: true
            description: "e.g., 0-1000 pg/mL"
            
      # Tab 3: Incubation Steps
      - id: incubation_task
        '@type': Task
        name: "Incubations"
        title: "Incubation Steps"
        ordinal: 3
        children:
          - id: coating_incubation
            '@type': Task
            name: "Coating"
            title: "Coating Incubation"
            ordinal: 1
            ui_config:
              component_type: "card"
            children:
              - id: coating_time
                '@type': Field
                name: "Incubation Time"
                type: "number"
                unit: "hours"
                required: true
                enum: [2, 4, 16]  # 2h, 4h, or overnight
                
              - id: coating_temp
                '@type': Field
                name: "Temperature"
                type: "string"
                required: true
                enum: ["4°C", "Room Temperature", "37°C"]
                
          - id: primary_antibody
            '@type': Task
            name: "Primary Ab"
            title: "Primary Antibody"
            ordinal: 2
            ui_config:
              component_type: "card"
            children:
              - id: primary_ab_time
                '@type': Field
                name: "Incubation Time"
                type: "number"
                unit: "minutes"
                required: true
                min: 30
                max: 120
                
              - id: primary_ab_dilution
                '@type': Field
                name: "Antibody Dilution"
                type: "string"
                required: true
                validation:
                  pattern: "^1:[0-9]+$"
                  message: "Format: 1:XXXX"
```

## File Upload and Import Example

SOP demonstrating file uploads and data import:

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: DATA_IMPORT_001
name: "Sequencing Data Import"
title: "Sequencing Data Import Protocol"
version: "1.0.0"
author: "Bioinformatics Team"
approver: "Data Manager"
date-published: "2024-02-15"
status: "published"
url: "https://example.com/sops/seq-import"
license: "MIT"
keywords: ["sequencing", "data import", "NGS", "bioinformatics"]
applicationCategory: "Data Management Protocol"

taskgroups:
  - id: import_group
    name: "Data Import"
    title: "Sequencing Data Import"
    ordinal: 1
    children:
      - id: file_upload_task
        '@type': Task
        name: "File Upload"
        title: "Upload Sequencing Files"
        ordinal: 1
        children:
          - id: fastq_files
            '@type': Field
            name: "FASTQ Files"
            type: "file"
            file_config:
              accept: ".fastq,.fastq.gz,.fq,.fq.gz"
              maxSize: 5368709120  # 5GB
              multiple: true
            required: true
            description: "Upload paired-end FASTQ files"
            
          - id: metadata_file
            '@type': Field
            name: "Sample Metadata"
            type: "file"
            file_config:
              accept: ".csv,.xlsx"
              maxSize: 10485760  # 10MB
              multiple: false
            required: true
            description: "CSV or Excel file with sample information"
            
          - id: reference_genome
            '@type': Field
            name: "Reference Genome"
            type: "string"
            required: true
            enum: ["hg38", "hg19", "mm10", "mm9", "custom"]
            
          - id: custom_reference
            '@type': Field
            name: "Custom Reference File"
            type: "file"
            file_config:
              accept: ".fa,.fasta,.fa.gz"
              maxSize: 1073741824  # 1GB
            required: false
            description: "Required if 'custom' selected above"
            
      - id: import_template_task
        '@type': Task
        name: "Import Template"
        title: "Data Import Template"
        ordinal: 2
        children:
          - id: sample_import
            '@type': ImportTemplate
            name: "Sample Import Template"
            format: "csv"
            description: "Use this template for bulk sample import"
            columns:
              - field: "sample_id"
                header: "Sample ID"
                required: true
                type: "string"
                
              - field: "patient_id"
                header: "Patient ID"
                required: true
                type: "string"
                
              - field: "tissue_type"
                header: "Tissue Type"
                required: true
                type: "string"
                enum: ["Blood", "Tumor", "Normal", "Cell Line"]
                
              - field: "read_length"
                header: "Read Length"
                required: true
                type: "number"
                
              - field: "paired_end"
                header: "Paired End"
                required: true
                type: "boolean"
```

## Validation Example

SOP with extensive validation rules:

```yaml
'@context': https://schema.org
'@type': SoftwareApplication
id: VALIDATION_EXAMPLE_001
name: "Validated Protocol"
title: "Protocol with Complex Validation"
version: "1.0.0"
author: "QC Team"
approver: "QC Director"
date-published: "2024-02-20"
status: "published"
url: "https://example.com/sops/validation"
license: "MIT"
keywords: ["validation", "QC", "quality control"]
applicationCategory: "Quality Control"

# Cross-field validation rules
schema_dependencies:
  cross_field_validations:
    - name: "date_validation"
      fields: ["start_date", "end_date"]
      condition: 
        type: "comparison"
        operator: "less_than_or_equal"
      error_message: "End date must be after start date"
      
    - name: "volume_validation"
      fields: ["initial_volume", "final_volume"]
      condition:
        type: "comparison"
        operator: "greater_than"
      error_message: "Final volume cannot exceed initial volume"
      
    - name: "concentration_calc"
      fields: ["mass", "volume", "concentration"]
      condition:
        type: "calculation"
        formula: "concentration = mass / volume"
      error_message: "Concentration must equal mass/volume"

taskgroups:
  - id: validation_group
    name: "Validation Examples"
    title: "Various Validation Rules"
    ordinal: 1
    children:
      - id: validation_task
        '@type': Task
        name: "Validations"
        title: "Field Validations"
        ordinal: 1
        children:
          # Email validation
          - id: email_field
            '@type': Field
            name: "Contact Email"
            type: "string"
            format: "email"
            required: true
            validation:
              pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
              message: "Please enter a valid email address"
              
          # URL validation
          - id: protocol_url
            '@type': Field
            name: "Protocol URL"
            type: "string"
            format: "uri"
            required: false
            validation:
              pattern: "^https?://.+"
              message: "URL must start with http:// or https://"
              
          # Custom pattern
          - id: lot_number
            '@type': Field
            name: "Lot Number"
            type: "string"
            required: true
            validation:
              pattern: "^LOT[0-9]{4}-[A-Z]{2}$"
              message: "Format: LOT####-XX (e.g., LOT2024-AB)"
              
          # Numeric range
          - id: ph_value
            '@type': Field
            name: "pH Value"
            type: "number"
            required: true
            min: 0
            max: 14
            step: 0.1
            validation:
              precision: 1
              message: "pH must be between 0 and 14"
              
          # Date range
          - id: start_date
            '@type': Field
            name: "Start Date"
            type: "string"
            format: "date"
            required: true
            validation:
              min: "2024-01-01"
              max: "2024-12-31"
              message: "Date must be in 2024"
              
          - id: end_date
            '@type': Field
            name: "End Date"
            type: "string"
            format: "date"
            required: true
              
          # Conditional required field
          - id: requires_approval
            '@type': Field
            name: "Requires Approval?"
            type: "boolean"
            required: true
            
          - id: approver_name
            '@type': Field
            name: "Approver Name"
            type: "string"
            required: false  # Becomes required based on previous field
            description: "Required if approval is needed"
```

## Tips for Using Examples

1. **Start Simple**: Begin with the basic example and add complexity gradually
2. **Copy and Modify**: Use these examples as templates, changing IDs and fields as needed
3. **Test Incrementally**: Validate after each major change
4. **Combine Features**: Mix and match features from different examples
5. **Keep IDs Unique**: Always ensure all IDs are unique within your SOP

## Common Patterns Reference

### Pattern: Multi-Step Procedure
- Use ordinal numbers for step sequence
- Create separate tabs for each major phase
- Nest related substeps within cards

### Pattern: Data Collection Form
- Group related fields in tasks
- Use appropriate field types for data
- Add validation to ensure data quality

### Pattern: Sample Tracking
- Use tables for batch sample entry
- Include filename components for tracking
- Add export configuration for reporting

### Pattern: File Processing
- Specify accepted file types clearly
- Set appropriate size limits
- Provide clear upload instructions

### Pattern: Quality Control
- Include boolean checks for pass/fail
- Add notes fields for observations
- Require documentation uploads

## Next Steps

- [Create your own SOP](creating-sops.md)
- [Validate your SOP](validation.md)
- [Deploy to production](deployment.md)
- [Troubleshooting guide](troubleshooting.md)
