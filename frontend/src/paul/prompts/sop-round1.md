<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

Replace <sop-id> with:
Replace <protocol-md-path> with:
Replace <protocol-title> with:
Replace <protocol-section> with:

**Prompt: Create a Comprehensive, Compliance-Ready SOP for <protocol-title>, <protocol-section>**

**Goal:** Create a detailed SOP YAML file for "sop<sop-id>.yaml" based on <protocol-section> of `<protocol-md-path>` that will validate with `make schemas-validate-sop SOP_ID=<sop-id>`.

**Critical Requirements:**
1. **Schema Compliance:** Follow `frontend/src/shared/schemas/SOPTemplateSchema.yaml` exactly
2. **Single Container:** Use ONLY ONE container task group in taskgroups array
3. **Validation:** Must pass schema validation without errors
4. **Indentation.** DO NOT MESS IT UP

**Regulatory Compliance Standards:**
- **Traceability:** Every piece of equipment, reagent, and consumable must have identification fields (serial numbers, lot numbers, model numbers)
- **Temporal Records:** All time-sensitive steps must capture start/end times, temperatures, and durations
- **Parameter Documentation:** All instrument settings (RPM, RCF, temperature, program selections) must be explicitly recorded
- **Batch Documentation:** Lot numbers and expiration dates for ALL reagents, not just critical ones
- **Equipment Calibration:** Serial numbers and model information for all equipment used

**Field Type Strategy:**
- **Use appropriate data types:** `number` for weights/volumes/times, `date` for dates, `boolean` for confirmations
- **Enum dropdowns:** Create `enum_values` with `ui_config.component_type: "select"` for any field with predefined options (equipment programs, models, etc.)
- **Required fields:** Mark as `required: true` only for fields critical for safety, traceability, or protocol success
- **Default values:** Provide `default_value` for standard protocol parameters

**Specific SOP Structure:**
1. **Experiment Information:** Project/experiment IDs (with ELN filename components), operator, date
2. **Materials & Equipment:** Detailed reagent verification with lot/expiry dates, equipment verification with serial numbers and models
3. **Procedure Steps:** Sequential tasks with ordinal numbers, capturing all protocol parameters and timing

**User Experience Enhancements:**
- Embed protocol guidance directly in field descriptions
- Use placeholders and help text extensively
- Provide calculation formulas in descriptions
- Include protocol tips

**Export Configuration:** Add ExportConfiguration only to fields needed downstream (experiment IDs, final cell yields)

**Example**
You can use frontend/src/paul/prompt/sopExample1.yaml as an example

**Success Criteria:**
- Passes `make schemas-validate-sop SOP_ID=<sop-id>`
- Captures every detail needed for CLIA/regulatory compliance
- Provides maximum user guidance through appropriate field types and UI components
- Records all traceability information (lots, serials, dates, times, settings)
