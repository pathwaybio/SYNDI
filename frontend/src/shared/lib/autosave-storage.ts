// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * Abstract storage interface for autosave data with multiple implementations
 * 
 * Supports localStorage, sessionStorage, and future IndexedDB implementations
 * with LRU cache management and storage limit handling.
 */

export interface AutosaveData {
  id: string;
  type: string; // 'sop', 'eln', etc.
  data: any;
  timestamp: number;
  metadata?: {
    title?: string;
    version?: string;
    checksum?: string;
    userAgent?: string;
  };
}

export interface StorageStats {
  totalItems: number;
  totalSize: number; // in bytes
  oldestItem?: number; // timestamp
  newestItem?: number; // timestamp
  quotaUsed?: number; // percentage (0-100)
}

/**
 * Abstract storage interface
 */
export abstract class AutosaveStorage {
  protected readonly keyPrefix: string;
  protected readonly maxItems: number;
  protected readonly ttl: number;

  constructor(keyPrefix: string, maxItems: number, ttl: number) {
    this.keyPrefix = keyPrefix;
    this.maxItems = maxItems;
    this.ttl = ttl;
  }

  abstract save(key: string, data: AutosaveData): Promise<void>;
  abstract load(key: string): Promise<AutosaveData | null>;
  abstract delete(key: string): Promise<void>;
  abstract list(): Promise<string[]>;
  abstract clear(): Promise<void>;
  abstract getStats(): Promise<StorageStats>;

  /**
   * Generate storage key with prefix
   */
  protected getStorageKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  /**
   * Check if data has expired
   */
  protected isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.ttl;
  }

  /**
   * Generate checksum for data integrity
   */
  protected generateChecksum(data: any): string {
    return btoa(JSON.stringify(data)).slice(0, 8);
  }
}

/**
 * localStorage implementation with LRU cache and cleanup
 */
export class LocalStorageAutosave extends AutosaveStorage {
  private readonly metadataKey: string;

  constructor(keyPrefix: string = 'autosave', maxItems: number = 50, ttl: number = 7 * 24 * 60 * 60 * 1000) {
    super(keyPrefix, maxItems, ttl);
    this.metadataKey = `${keyPrefix}:metadata`;
    this.initializeMetadata();
  }

  async save(key: string, data: AutosaveData): Promise<void> {
    if (!this.isStorageAvailable()) {
      throw new Error('localStorage is not available');
    }

    try {
      const storageKey = this.getStorageKey(key);
      const enhancedData: AutosaveData = {
        ...data,
        timestamp: Date.now(),
        metadata: {
          ...data.metadata,
          checksum: this.generateChecksum(data.data),
          userAgent: navigator.userAgent,
        },
      };

      // Check storage limits before saving
      await this.enforceStorageLimits();

      // Save data
      localStorage.setItem(storageKey, JSON.stringify(enhancedData));
      
      // Update metadata
      await this.updateMetadata(key, enhancedData.timestamp);

      console.log(`Autosave: Saved ${key} (${this.getDataSize(enhancedData)} bytes)`);
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        // Try to free up space and retry
        await this.cleanupOldEntries(5);
        try {
          localStorage.setItem(this.getStorageKey(key), JSON.stringify(data));
          await this.updateMetadata(key, data.timestamp);
        } catch (retryError) {
          throw new Error('Storage quota exceeded and cleanup failed');
        }
      } else {
        throw error;
      }
    }
  }

  async load(key: string): Promise<AutosaveData | null> {
    if (!this.isStorageAvailable()) {
      return null;
    }

    try {
      const storageKey = this.getStorageKey(key);
      const stored = localStorage.getItem(storageKey);
      
      if (!stored) {
        return null;
      }

      const data: AutosaveData = JSON.parse(stored);
      
      // Check if data has expired
      if (this.isExpired(data.timestamp)) {
        await this.delete(key);
        return null;
      }

      // Verify data integrity
      if (data.metadata?.checksum) {
        const currentChecksum = this.generateChecksum(data.data);
        if (currentChecksum !== data.metadata.checksum) {
          console.warn(`Autosave: Checksum mismatch for ${key}, data may be corrupted`);
        }
      }

      // Update access time in metadata
      await this.updateMetadata(key, Date.now());

      return data;
    } catch (error) {
      console.error(`Autosave: Failed to load ${key}:`, error);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const storageKey = this.getStorageKey(key);
      localStorage.removeItem(storageKey);
      await this.removeFromMetadata(key);
    } catch (error) {
      console.error(`Autosave: Failed to delete ${key}:`, error);
    }
  }

  async list(): Promise<string[]> {
    if (!this.isStorageAvailable()) {
      return [];
    }

    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.keyPrefix + ':') && key !== this.metadataKey) {
          keys.push(key.replace(this.keyPrefix + ':', ''));
        }
      }
      return keys;
    } catch (error) {
      console.error('Autosave: Failed to list keys:', error);
      return [];
    }
  }

  async clear(): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const keys = await this.list();
      for (const key of keys) {
        await this.delete(key);
      }
      localStorage.removeItem(this.metadataKey);
    } catch (error) {
      console.error('Autosave: Failed to clear storage:', error);
    }
  }

  async getStats(): Promise<StorageStats> {
    if (!this.isStorageAvailable()) {
      return { totalItems: 0, totalSize: 0 };
    }

    try {
      const keys = await this.list();
      let totalSize = 0;
      let oldestItem: number | undefined;
      let newestItem: number | undefined;

      for (const key of keys) {
        const data = await this.load(key);
        if (data) {
          totalSize += this.getDataSize(data);
          if (!oldestItem || data.timestamp < oldestItem) {
            oldestItem = data.timestamp;
          }
          if (!newestItem || data.timestamp > newestItem) {
            newestItem = data.timestamp;
          }
        }
      }

      // Estimate quota usage (rough approximation)
      const quotaUsed = this.estimateQuotaUsage(totalSize);

      return {
        totalItems: keys.length,
        totalSize,
        oldestItem,
        newestItem,
        quotaUsed,
      };
    } catch (error) {
      console.error('Autosave: Failed to get stats:', error);
      return { totalItems: 0, totalSize: 0 };
    }
  }

  /**
   * Check if localStorage is available
   */
  private isStorageAvailable(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize metadata for LRU tracking
   */
  private initializeMetadata(): void {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const existing = localStorage.getItem(this.metadataKey);
      if (!existing) {
        localStorage.setItem(this.metadataKey, JSON.stringify({
          version: '1.0',
          created: Date.now(),
          lastAccess: {},
        }));
      }
    } catch (error) {
      console.error('Autosave: Failed to initialize metadata:', error);
    }
  }

  /**
   * Update metadata for LRU tracking
   */
  private async updateMetadata(key: string, timestamp: number): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const metadataStr = localStorage.getItem(this.metadataKey);
      const metadata = metadataStr ? JSON.parse(metadataStr) : { lastAccess: {} };
      
      metadata.lastAccess[key] = timestamp;
      localStorage.setItem(this.metadataKey, JSON.stringify(metadata));
    } catch (error) {
      console.error('Autosave: Failed to update metadata:', error);
    }
  }

  /**
   * Remove key from metadata
   */
  private async removeFromMetadata(key: string): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const metadataStr = localStorage.getItem(this.metadataKey);
      if (metadataStr) {
        const metadata = JSON.parse(metadataStr);
        delete metadata.lastAccess[key];
        localStorage.setItem(this.metadataKey, JSON.stringify(metadata));
      }
    } catch (error) {
      console.error('Autosave: Failed to remove from metadata:', error);
    }
  }

  /**
   * Enforce storage limits using LRU eviction
   */
  private async enforceStorageLimits(): Promise<void> {
    const keys = await this.list();
    
    if (keys.length >= this.maxItems) {
      const itemsToRemove = keys.length - this.maxItems + 1;
      await this.cleanupOldEntries(itemsToRemove);
    }
  }

  /**
   * Clean up old entries using LRU algorithm
   */
  private async cleanupOldEntries(count: number): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const metadataStr = localStorage.getItem(this.metadataKey);
      if (!metadataStr) {
        return;
      }

      const metadata = JSON.parse(metadataStr);
      const lastAccess = metadata.lastAccess || {};

      // Sort keys by last access time (oldest first)
      const sortedKeys = Object.entries(lastAccess)
        .sort(([, a], [, b]) => (a as number) - (b as number))
        .map(([key]) => key);

      // Remove the oldest entries
      for (let i = 0; i < Math.min(count, sortedKeys.length); i++) {
        await this.delete(sortedKeys[i]);
        console.log(`Autosave: Evicted old entry: ${sortedKeys[i]}`);
      }
    } catch (error) {
      console.error('Autosave: Failed to cleanup old entries:', error);
    }
  }

  /**
   * Calculate size of data in bytes
   */
  private getDataSize(data: AutosaveData): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  /**
   * Estimate quota usage (rough approximation)
   */
  private estimateQuotaUsage(totalSize: number): number {
    // Rough estimate: assume 5MB localStorage quota
    const estimatedQuota = 5 * 1024 * 1024; // 5MB
    return Math.min(100, (totalSize / estimatedQuota) * 100);
  }
}

/**
 * SessionStorage implementation (for temporary storage)
 */
export class SessionStorageAutosave extends AutosaveStorage {
  constructor(keyPrefix: string = 'autosave', maxItems: number = 10, ttl: number = 60 * 60 * 1000) {
    super(keyPrefix, maxItems, ttl);
  }

  async save(key: string, data: AutosaveData): Promise<void> {
    if (!this.isStorageAvailable()) {
      throw new Error('sessionStorage is not available');
    }

    try {
      const storageKey = this.getStorageKey(key);
      const enhancedData: AutosaveData = {
        ...data,
        timestamp: Date.now(),
      };

      sessionStorage.setItem(storageKey, JSON.stringify(enhancedData));
    } catch (error) {
      throw new Error(`Failed to save to sessionStorage: ${error}`);
    }
  }

  async load(key: string): Promise<AutosaveData | null> {
    if (!this.isStorageAvailable()) {
      return null;
    }

    try {
      const storageKey = this.getStorageKey(key);
      const stored = sessionStorage.getItem(storageKey);
      
      if (!stored) {
        return null;
      }

      const data: AutosaveData = JSON.parse(stored);
      
      if (this.isExpired(data.timestamp)) {
        await this.delete(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error(`Autosave: Failed to load from sessionStorage ${key}:`, error);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const storageKey = this.getStorageKey(key);
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.error(`Autosave: Failed to delete from sessionStorage ${key}:`, error);
    }
  }

  async list(): Promise<string[]> {
    if (!this.isStorageAvailable()) {
      return [];
    }

    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(this.keyPrefix + ':')) {
          keys.push(key.replace(this.keyPrefix + ':', ''));
        }
      }
      return keys;
    } catch (error) {
      console.error('Autosave: Failed to list sessionStorage keys:', error);
      return [];
    }
  }

  async clear(): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const keys = await this.list();
      for (const key of keys) {
        await this.delete(key);
      }
    } catch (error) {
      console.error('Autosave: Failed to clear sessionStorage:', error);
    }
  }

  async getStats(): Promise<StorageStats> {
    const keys = await this.list();
    let totalSize = 0;

    for (const key of keys) {
      const data = await this.load(key);
      if (data) {
        totalSize += new Blob([JSON.stringify(data)]).size;
      }
    }

    return {
      totalItems: keys.length,
      totalSize,
    };
  }

  private isStorageAvailable(): boolean {
    try {
      const test = '__storage_test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Storage factory for creating appropriate storage instances
 */
export class AutosaveStorageFactory {
  static create(
    type: 'localStorage' | 'sessionStorage' | 'indexedDB',
    keyPrefix: string,
    maxItems: number,
    ttl: number
  ): AutosaveStorage {
    switch (type) {
      case 'localStorage':
        return new LocalStorageAutosave(keyPrefix, maxItems, ttl);
      case 'sessionStorage':
        return new SessionStorageAutosave(keyPrefix, maxItems, ttl);
      case 'indexedDB':
        throw new Error('IndexedDB implementation not yet available');
      default:
        throw new Error(`Unsupported storage type: ${type}`);
    }
  }
} 