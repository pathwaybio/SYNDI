// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock fetch globally for tests
global.fetch = vi.fn();

// Mock File API for tests
global.File = class MockFile {
  name: string;
  size: number;
  type: string;
  
  constructor(bits: any[], name: string, options?: any) {
    this.name = name;
    this.size = bits.join('').length;
    this.type = options?.type || 'text/plain';
  }
} as any;

// Mock FormData for tests
global.FormData = class MockFormData {
  private data: Map<string, any> = new Map();
  
  append(key: string, value: any) {
    this.data.set(key, value);
  }
  
  get(key: string) {
    return this.data.get(key);
  }
  
  has(key: string) {
    return this.data.has(key);
  }
  
  delete(key: string) {
    this.data.delete(key);
  }
  
  entries() {
    return this.data.entries();
  }
} as any; 