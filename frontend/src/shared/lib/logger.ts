// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

// frontend/src/shared/lib/logger.ts
// Enhanced version of prototype devTools.js with better environment detection
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'off';
export type LogCategory = 'api' | 'ui' | 'forms' | 'matrix' | 'inheritance' | 'network' | 'console';

export class Logger {
  private static instance: Logger;
  private level: LogLevel = 'info';
  private enabled: boolean = true;
  private categories: Set<LogCategory> = new Set();

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  configure(level: LogLevel, enabled: boolean = true, categories?: LogCategory[]) {
    this.level = level;
    this.enabled = enabled;
    if (categories) {
      this.categories = new Set(categories);
    }
  }

  // Environment-aware initialization (from prototype)
  private detectEnvironment() {
    const isNode = typeof process !== 'undefined' && process.env;
    const isBrowser = typeof window !== 'undefined';
    const isCI = isNode && process.env.CI === 'true';
    
    // Auto-configure based on environment
    if (isCI) {
      this.configure('off');
    } else if (isBrowser && window.location.search.includes('debug=true')) {
      this.configure('debug');
    }
  }

  debug(component: string, message: string, category?: LogCategory, ...args: any[]) {
    this.log('debug', component, message, category, ...args);
  }

  info(component: string, message: string, category?: LogCategory, ...args: any[]) {
    this.log('info', component, message, category, ...args);
  }

  warn(component: string, message: string, category?: LogCategory, ...args: any[]) {
    this.log('warn', component, message, category, ...args);
  }

  error(component: string, message: string, category?: LogCategory, ...args: any[]) {
    this.log('error', component, message, category, ...args);
  }

  private log(level: LogLevel, component: string, message: string, category?: LogCategory, ...args: any[]) {
    if (!this.enabled || !this.shouldLog(level) || !this.shouldLogCategory(category)) return;
    
    const timestamp = new Date().toISOString();
    const categoryStr = category ? `[${category.toUpperCase()}]` : '';
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${component}]${categoryStr}`;
    
    // Map log levels to console methods
    const consoleMethod = level === 'debug' ? 'log' : 
                         level === 'info' ? 'info' : 
                         level === 'warn' ? 'warn' : 'error';
    
    console[consoleMethod](prefix, message, ...args);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private shouldLogCategory(category?: LogCategory): boolean {
    if (!category || this.categories.size === 0) return true;
    return this.categories.has(category);
  }

  // Factory method for component loggers
  createLogger(componentName: string) {
    return {
      debug: (message: string, category?: LogCategory, ...args: any[]) => 
        this.debug(componentName, message, category, ...args),
      info: (message: string, category?: LogCategory, ...args: any[]) => 
        this.info(componentName, message, category, ...args),
      warn: (message: string, category?: LogCategory, ...args: any[]) => 
        this.warn(componentName, message, category, ...args),
      error: (message: string, category?: LogCategory, ...args: any[]) => 
        this.error(componentName, message, category, ...args),
    };
  }
}

export const logger = Logger.getInstance();

// Configure for debugging UI components
logger.configure('debug', true, ['ui', 'forms']); 