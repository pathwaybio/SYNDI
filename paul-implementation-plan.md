<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# AI SOP Generator Implementation Plan

## Overview
Create an AI-powered SOP generator that converts protocol documents (docx, pdf, md) into schema-compliant YAML SOPs through a chatbot interface. The solution emphasizes codification over LLM usage, leveraging existing shared components and maintaining strict schema independence.

## Core Requirements

### Functional Requirements
- **File Upload**: Browser-based upload of protocol documents (docx, pdf, md)
- **Chat Interface**: Conversational UI for user instructions and guidance
- **Protocol Analysis**: Automated parsing and extraction of protocol steps
- **SOP Generation**: Schema-compliant YAML output following SOPTemplateSchema
- **Validation Integration**: Real-time validation using existing make targets
- **Output Handling**: Direct loading into SAM or viewing in CLAIRE

### Non-Functional Requirements
- **Performance**: SOP generation <30 seconds, file processing <10 seconds
- **Schema Independence**: No hardcoded field names or assumptions
- **Codification Priority**: Minimize LLM usage, maximize deterministic logic
- **Component Reuse**: Leverage `frontend/src/shared` extensively

## Directory Structure

```
frontend/src/paul/
├── components/
│   ├── chat/
│   │   ├── ChatInterface.tsx          # Main chat UI
│   │   ├── MessageList.tsx            # Message display
│   │   ├── MessageInput.tsx           # User input
│   │   └── TypingIndicator.tsx        # AI response indicator
│   ├── upload/
│   │   ├── FileUploader.tsx           # Protocol document upload
│   │   ├── FileProcessor.tsx          # Document parsing logic
│   │   └── ProtocolPreview.tsx        # Extracted content preview
│   ├── generation/
│   │   ├── SOPGenerator.tsx           # Main generation controller
│   │   ├── ValidationPanel.tsx        # Real-time validation display
│   │   ├── ProgressTracker.tsx        # Generation progress
│   │   └── OutputPreview.tsx          # Generated YAML preview
│   └── common/
│       ├── ErrorBoundary.tsx          # Error handling
│       └── LoadingSpinner.tsx         # Loading states
├── lib/
│   ├── protocol-parser.ts             # Document parsing engine
│   ├── sop-generator.ts               # Core SOP generation logic
│   ├── validation-client.ts           # Integration with validation tools
│   ├── llm-client.ts                  # Minimal LLM interface
│   └── template-engine.ts             # YAML template generation
├── hooks/
│   ├── useProtocolParser.ts           # Protocol parsing hook
│   ├── useSOPGenerator.ts             # SOP generation hook
│   ├── useChatSession.ts              # Chat state management
│   └── useValidation.ts               # Validation integration hook
├── types/
│   ├── protocol.ts                    # Protocol document types
│   ├── chat.ts                        # Chat interface types
│   └── generation.ts                  # Generation process types
├── views/
│   └── SOPGeneratorPage.tsx           # Main application page
└── utils/
    ├── file-readers.ts                # File parsing utilities
    ├── text-extractors.ts             # Content extraction
    └── yaml-formatters.ts             # YAML output formatting
```

## Implementation Details

### 1. Core Components

#### SOPGeneratorPage.tsx
```typescript
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUploader } from '../components/upload/FileUploader';
import { ChatInterface } from '../components/chat/ChatInterface';
import { SOPGenerator } from '../components/generation/SOPGenerator';
import { useProtocolParser } from '../hooks/useProtocolParser';
import { useSOPGenerator } from '../hooks/useSOPGenerator';
import { useChatSession } from '../hooks/useChatSession';

export function SOPGeneratorPage() {
  const [activeTab, setActiveTab] = useState('upload');
  const { parsedProtocol, parseFile, isParsingFile } = useProtocolParser();
  const { generatedSOP, generateSOP, isGenerating } = useSOPGenerator();
  const { messages, sendMessage, isProcessing } = useChatSession();

  const handleFileUpload = async (file: File) => {
    await parseFile(file);
    setActiveTab('chat');
  };

  const handleGenerateRequest = async (instructions: string) => {
    if (!parsedProtocol) return;
    await generateSOP(parsedProtocol, instructions);
    setActiveTab('generation');
  };

  return (
    <div className="container mx-auto p-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">Upload Protocol</TabsTrigger>
          <TabsTrigger value="chat" disabled={!parsedProtocol}>
            Configure SOP
          </TabsTrigger>
          <TabsTrigger value="generation" disabled={!generatedSOP}>
            Generate & Validate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card className="p-6">
            <FileUploader 
              onFileUpload={handleFileUpload}
              isProcessing={isParsingFile}
              acceptedTypes={['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/markdown']}
            />
            {parsedProtocol && (
              <ProtocolPreview protocol={parsedProtocol} />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="chat">
          <Card className="p-6">
            <ChatInterface
              messages={messages}
              onSendMessage={sendMessage}
              onGenerateRequest={handleGenerateRequest}
              isProcessing={isProcessing}
              protocol={parsedProtocol}
            />
          </Card>
        </TabsContent>

        <TabsContent value="generation">
          <Card className="p-6">
            <SOPGenerator
              protocol={parsedProtocol}
              generatedSOP={generatedSOP}
              isGenerating={isGenerating}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

#### FileUploader.tsx
```typescript
import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FileUploaderProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
  acceptedTypes: string[];
}

export function FileUploader({ onFileUpload, isProcessing, acceptedTypes }: FileUploaderProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0]);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/markdown': ['.md'],
    },
    maxFiles: 1,
    disabled: isProcessing,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent 
          {...getRootProps()} 
          className={`p-8 border-2 border-dashed cursor-pointer transition-colors ${
            isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center text-center space-y-4">
            {isProcessing ? (
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <div>
              <p className="text-lg font-medium">
                {isProcessing 
                  ? 'Processing protocol document...' 
                  : isDragActive 
                    ? 'Drop the protocol document here'
                    : 'Upload protocol document'
                }
              </p>
              <p className="text-sm text-muted-foreground">
                Supports PDF, DOCX, and Markdown files
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {fileRejections.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {fileRejections[0].errors[0].message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

### 2. Core Business Logic

#### protocol-parser.ts
```typescript
import { ProtocolDocument, ProtocolSection, ProtocolStep } from '../types/protocol';

export class ProtocolParser {
  async parseFile(file: File): Promise<ProtocolDocument> {
    const content = await this.extractContent(file);
    return this.analyzeProtocol(content, file.name);
  }

  private async extractContent(file: File): Promise<string> {
    const fileType = file.type;
    
    switch (fileType) {
      case 'text/markdown':
        return await file.text();
      case 'application/pdf':
        return await this.extractPDFContent(file);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await this.extractDOCXContent(file);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  private async extractPDFContent(file: File): Promise<string> {
    // Use pdf-parse or similar library
    // Implementation depends on chosen PDF parsing library
    throw new Error('PDF parsing not yet implemented');
  }

  private async extractDOCXContent(file: File): Promise<string> {
    // Use mammoth.js or similar library
    throw new Error('DOCX parsing not yet implemented');
  }

  private analyzeProtocol(content: string, filename: string): ProtocolDocument {
    const sections = this.extractSections(content);
    const materials = this.extractMaterials(content);
    const equipment = this.extractEquipment(content);
    const procedures = this.extractProcedures(content);

    return {
      filename,
      title: this.extractTitle(content),
      overview: this.extractOverview(content),
      sections,
      materials,
      equipment,
      procedures,
      metadata: {
        wordCount: content.length,
        extractedAt: new Date().toISOString(),
        confidence: this.calculateConfidence(sections, materials, equipment, procedures),
      },
    };
  }

  private extractSections(content: string): ProtocolSection[] {
    // Regex patterns for common section headers
    const sectionPatterns = [
      /^#{1,3}\s*(.+)$/gm, // Markdown headers
      /^(\d+\.?\s*.+)$/gm, // Numbered sections
      /^([A-Z][^a-z\n]*[A-Z])$/gm, // ALL CAPS headers
    ];

    const sections: ProtocolSection[] = [];
    // Implementation for section extraction
    return sections;
  }

  private extractMaterials(content: string): string[] {
    // Common material section indicators
    const materialKeywords = [
      'materials needed', 'reagents', 'supplies', 'equipment',
      'materials and methods', 'chemicals', 'solutions'
    ];
    
    // Implementation for material extraction
    return [];
  }

  private extractEquipment(content: string): string[] {
    // Equipment-specific patterns
    const equipmentPatterns = [
      /centrifuge/gi,
      /microscope/gi,
      /incubator/gi,
      /water bath/gi,
      /pipette?/gi,
    ];

    // Implementation for equipment extraction
    return [];
  }

  private extractProcedures(content: string): ProtocolStep[] {
    // Step extraction logic
    const stepPatterns = [
      /^\d+\.\s*(.+)$/gm, // Numbered steps
      /^step\s*\d+[:.]\s*(.+)$/gmi, // "Step N:" format
      /^[a-z]\)\s*(.+)$/gm, // Lettered steps
    ];

    // Implementation for procedure extraction
    return [];
  }

  private calculateConfidence(
    sections: ProtocolSection[],
    materials: string[],
    equipment: string[],
    procedures: ProtocolStep[]
  ): number {
    // Simple confidence scoring based on extracted content
    let score = 0;
    
    if (sections.length > 0) score += 25;
    if (materials.length > 0) score += 25;
    if (equipment.length > 0) score += 25;
    if (procedures.length > 0) score += 25;

    return Math.min(score, 100);
  }
}
```

#### sop-generator.ts
```typescript
import { ProtocolDocument } from '../types/protocol';
import { SOPTemplate } from '../types/generation';
import { ValidationClient } from './validation-client';

export class SOPGenerator {
  private validationClient: ValidationClient;

  constructor() {
    this.validationClient = new ValidationClient();
  }

  async generateSOP(
    protocol: ProtocolDocument, 
    userInstructions: string,
    sopId: string
  ): Promise<SOPTemplate> {
    // Generate base SOP structure
    const baseSOP = this.createBaseStructure(protocol, sopId);
    
    // Apply user instructions
    const enhancedSOP = await this.applyUserInstructions(baseSOP, userInstructions);
    
    // Validate against schema
    const validatedSOP = await this.validateAndRefine(enhancedSOP);
    
    return validatedSOP;
  }

  private createBaseStructure(protocol: ProtocolDocument, sopId: string): SOPTemplate {
    const currentDate = new Date().toISOString().split('T')[0];
    
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      id: sopId,
      name: this.generateSOPName(protocol.title),
      title: protocol.title,
      version: '1.0',
      author: 'AI SOP Generator',
      approver: 'To Be Assigned',
      'date-published': currentDate,
      url: `https://example.com/sops/${sopId}`,
      license: 'Internal Use Only',
      keywords: this.extractKeywords(protocol),
      applicationCategory: 'Laboratory Protocol',
      description: protocol.overview,
      requires: [],
      taskgroups: this.generateTaskGroups(protocol),
      metadata: this.generateMetadata(),
    };
  }

  private generateTaskGroups(protocol: ProtocolDocument): any[] {
    return [
      {
        id: 'container_main',
        '@type': 'TaskGroup',
        name: 'Container',
        title: `${protocol.title} Container`,
        description: 'Main container for the protocol',
        children: [
          this.generateExperimentInfoGroup(),
          this.generateMaterialsGroup(protocol.materials, protocol.equipment),
          this.generateProcedureGroup(protocol.procedures),
        ],
      },
    ];
  }

  private generateExperimentInfoGroup(): any {
    return {
      id: 'taskgroup_experiment_info',
      '@type': 'TaskGroup',
      name: 'ExperimentInfo',
      title: 'Experiment Information',
      description: 'Project identification and experiment details',
      parents: ['container_main'],
      children: [
        {
          id: 'task_experiment_details',
          '@type': 'Task',
          name: 'ExperimentDetails',
          title: 'Experiment Identification',
          description: 'Core experiment information required for tracking',
          ordinal: 1,
          parents: ['taskgroup_experiment_info'],
          children: [
            this.generateProjectIdField(),
            this.generateExperimentIdField(),
            this.generateOperatorField(),
            this.generateDateField(),
          ],
        },
      ],
    };
  }

  private generateProjectIdField(): any {
    return {
      id: 'field_project_id',
      '@type': 'Field',
      name: 'ProjectID',
      title: 'Project ID',
      description: 'Project identifier for this experiment',
      type: 'string',
      required: true,
      parents: ['task_experiment_details'],
      children: [
        {
          id: 'ProjectID_filename_component',
          '@type': 'ELNFilenameComponent',
          order: 1,
          filename_component: true,
        },
        {
          id: 'ProjectID_exported',
          '@type': 'ExportConfiguration',
          enabled: true,
          value_immutable: true,
          default_immutable: true,
        },
      ],
    };
  }

  private async validateAndRefine(sop: SOPTemplate): Promise<SOPTemplate> {
    const validationResult = await this.validationClient.validateSOP(sop);
    
    if (!validationResult.isValid) {
      // Apply automatic fixes for common validation errors
      return this.applyValidationFixes(sop, validationResult.errors);
    }
    
    return sop;
  }

  private applyValidationFixes(sop: SOPTemplate, errors: string[]): SOPTemplate {
    const fixedSOP = { ...sop };
    
    // Apply common fixes based on validation errors
    errors.forEach(error => {
      if (error.includes('version') && error.includes('string')) {
        fixedSOP.version = String(fixedSOP.version);
      }
      // Add more common fixes as needed
    });
    
    return fixedSOP;
  }
}
```

#### validation-client.ts
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ValidationClient {
  async validateSOP(sop: any): Promise<ValidationResult> {
    try {
      // Write SOP to temporary file
      const tempFilePath = await this.writeTempSOPFile(sop);
      
      // Run validation using make command
      const sopId = sop.id;
      const { stdout, stderr } = await execAsync(`make schemas-validate-sop SOP_ID=${sopId}`);
      
      // Parse validation output
      return this.parseValidationOutput(stdout, stderr);
    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: [],
      };
    }
  }

  private async writeTempSOPFile(sop: any): Promise<string> {
    const yaml = require('js-yaml');
    const fs = require('fs').promises;
    const path = require('path');
    
    const tempPath = path.join('.local/s3/forms/sops', `${sop.id}.yaml`);
    const yamlContent = yaml.dump(sop, { 
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    });
    
    await fs.writeFile(tempPath, yamlContent, 'utf8');
    return tempPath;
  }

  private parseValidationOutput(stdout: string, stderr: string): ValidationResult {
    const output = stdout + stderr;
    
    if (output.includes('✅ SOP is valid and compliant')) {
      return {
        isValid: true,
        errors: [],
        warnings: [],
      };
    }
    
    // Extract errors from validation output
    const errors: string[] = [];
    const errorMatches = output.match(/❌.*?:\s*(.+)/g);
    if (errorMatches) {
      errors.push(...errorMatches.map(match => match.replace(/❌.*?:\s*/, '')));
    }
    
    return {
      isValid: false,
      errors,
      warnings: [],
    };
  }
}
```

### 3. React Hooks

#### useSOPGenerator.ts
```typescript
import { useState, useCallback } from 'react';
import { ProtocolDocument } from '../types/protocol';
import { SOPTemplate } from '../types/generation';
import { SOPGenerator } from '../lib/sop-generator';
import { logger } from '@/shared/lib/logger';

export function useSOPGenerator() {
  const [generatedSOP, setGeneratedSOP] = useState<SOPTemplate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const sopGenerator = new SOPGenerator();

  const generateSOP = useCallback(async (
    protocol: ProtocolDocument,
    instructions: string,
    sopId?: string
  ) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const finalSopId = sopId || `Generated_${Date.now()}`;
      const sop = await sopGenerator.generateSOP(protocol, instructions, finalSopId);
      setGeneratedSOP(sop);
      logger.info('SOP generated successfully', { sopId: finalSopId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate SOP';
      setError(errorMessage);
      logger.error('SOP generation failed', { error: errorMessage });
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clearSOP = useCallback(() => {
    setGeneratedSOP(null);
    setError(null);
  }, []);

  const downloadSOP = useCallback((filename?: string) => {
    if (!generatedSOP) return;
    
    const yaml = require('js-yaml');
    const yamlContent = yaml.dump(generatedSOP, { lineWidth: -1 });
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `${generatedSOP.id}.yaml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generatedSOP]);

  return {
    generatedSOP,
    isGenerating,
    error,
    generateSOP,
    clearSOP,
    downloadSOP,
  };
}
```

### 4. Type Definitions

#### types/protocol.ts
```typescript
export interface ProtocolDocument {
  filename: string;
  title: string;
  overview: string;
  sections: ProtocolSection[];
  materials: string[];
  equipment: string[];
  procedures: ProtocolStep[];
  metadata: ProtocolMetadata;
}

export interface ProtocolSection {
  id: string;
  title: string;
  content: string;
  subsections?: ProtocolSection[];
}

export interface ProtocolStep {
  id: string;
  ordinal: number;
  title: string;
  description: string;
  duration?: string;
  temperature?: string;
  equipment?: string[];
  materials?: string[];
  notes?: string[];
}

export interface ProtocolMetadata {
  wordCount: number;
  extractedAt: string;
  confidence: number;
  version?: string;
  author?: string;
}
```

#### types/chat.ts
```typescript
export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  context: ChatContext;
  status: 'active' | 'complete' | 'error';
}

export interface ChatContext {
  protocol?: ProtocolDocument;
  generationPhase: 'initial' | 'refinement' | 'validation' | 'complete';
  userPreferences: UserPreferences;
}

export interface UserPreferences {
  sopId?: string;
  includeTimestamps: boolean;
  includeSerialNumbers: boolean;
  complianceLevel: 'basic' | 'clia' | 'gmp';
  outputFormat: 'yaml' | 'json';
}
```

## Integration Points

### Shared Component Reuse
- **UI Components**: Leverage `@/components/ui/*` for all interface elements
- **Hooks**: Extend `useSimpleAutosave` for draft persistence
- **Utils**: Use existing `logger` instead of console.log
- **Auth**: Integrate with `auth.tsx` for user context

### SAM Integration
```typescript
// Export function for SAM to import generated SOPs
export function loadGeneratedSOP(sopYaml: string): void {
  // Integration with SAM's SOP loading mechanism
  window.postMessage({
    type: 'LOAD_SOP',
    data: sopYaml
  }, '*');
}
```

### CLAIRE Integration
```typescript
// Preview generated SOP in CLAIRE format
export function previewInCLAIRE(sop: SOPTemplate): void {
  // Open CLAIRE preview window with generated SOP
  const claireUrl = `/claire?sop=${encodeURIComponent(sop.id)}`;
  window.open(claireUrl, '_blank');
}
```

## Performance Optimizations

### Codification Strategies
1. **Template-Based Generation**: Pre-built YAML templates for common patterns
2. **Rule-Based Parsing**: Deterministic regex patterns for content extraction
3. **Validation Caching**: Cache validation results for identical structures
4. **Lazy Loading**: Load LLM only when complex decisions are required

### LLM Usage Minimization
- **Use LLM only for**:
  - Ambiguous section classification
  - Complex instruction interpretation
  - Content refinement requests
- **Avoid LLM for**:
  - Standard YAML structure generation
  - Schema validation
  - File parsing
  - Basic content extraction

## Testing Strategy

### Unit Tests
```typescript
// Example test structure
describe('ProtocolParser', () => {
  it('should extract sections from markdown content', () => {
    const parser = new ProtocolParser();
    const content = '# Section 1\nContent here\n## Subsection\nMore content';
    const result = parser.extractSections(content);
    expect(result).toHaveLength(2);
  });
});
```

### Integration Tests
- File upload and processing flow
- End-to-end SOP generation
- Validation integration
- Output format verification

## Deployment Considerations

### Development Setup
```bash
# Install additional dependencies
npm install pdf-parse mammoth js-yaml react-dropzone

# Add to existing make targets
make start-paul  # Start Paul development server
```

### Configuration
```json
// Add to frontend config
{
  "paul": {
    "enabled": true,
    "llmEndpoint": "https://api.anthropic.com/v1/messages",
    "maxFileSize": "50MB",
    "supportedFormats": ["pdf", "docx", "md"]
  }
}
```

This implementation plan provides a comprehensive, codified approach to SOP generation while maintaining strict adherence to schema independence principles and maximizing reuse of existing shared components.