/**
 * Logger Module for GreatShield
 * 
 * @module Logger
 * @description
 * A comprehensive logging system that provides structured logging with different log levels,
 * performance metrics tracking, memory monitoring, and log rotation capabilities.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const logger = Logger.getInstance();
 * logger.info('Application started');
 * 
 * // With context
 * logger.error('Failed to process request', error, { requestId: '123' });
 * 
 * // Performance tracking
 * logger.startMeasurement('processRequest');
 * // ... do some work ...
 * logger.endMeasurement('processRequest', { requestId: '123' });
 * 
 * // Log groups
 * logger.startLogGroup('API Request');
 * logger.info('Request received');
 * logger.debug('Request details', { headers, body });
 * logger.endLogGroup();
 * ```
 * 
 * @features
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Performance metrics tracking with percentiles
 * - Memory usage monitoring
 * - Log rotation and compression
 * - Sensitive data redaction
 * - Log grouping and formatting
 * - Backup with exponential backoff
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

/**
 * Enum defining available log levels in ascending order of severity
 * @enum {string}
 */
export enum LogLevel {
  /** Detailed information for debugging */
  DEBUG = 'DEBUG',
  /** General operational information */
  INFO = 'INFO',
  /** Warning messages for potentially harmful situations */
  WARN = 'WARN',
  /** Error events that might still allow the application to continue */
  ERROR = 'ERROR'
}

/**
 * Interface defining the structure of a log entry
 * @interface LogEntry
 */
export interface LogEntry {
  /** Unix timestamp of when the log was created */
  timestamp: number;
  /** Log level of the entry */
  level: LogLevel;
  /** Main log message */
  message: string;
  /** Additional contextual information */
  context?: Record<string, unknown>;
  /** Stack trace for error logs */
  stack?: string;
  /** Source file and line number */
  source?: string;
  /** Performance metrics if applicable */
  performance?: PerformanceMetric;
  /** Memory usage metrics if applicable */
  memory?: MemoryMetric;
  /** Log group identifier */
  group?: string;
}

/**
 * Performance metric information
 */
export interface PerformanceMetric {
  duration: number;                     // Duration in milliseconds
  startTime: number;                    // Start timestamp
  endTime: number;                      // End timestamp
  operation: string;                    // Operation name
}

/**
 * Memory usage metric information
 */
export interface MemoryMetric {
  heapUsed: number;                     // Heap memory used in bytes
  heapTotal: number;                    // Total heap size in bytes
  external: number;                     // External memory in bytes
}

/**
 * Log formatting options
 */
export interface LogFormat {
  timestamp: boolean;                   // Include timestamp
  level: boolean;                       // Include log level
  context: boolean;                     // Include context
  stack: boolean;                       // Include stack trace
  source: boolean;                      // Include source information
  performance: boolean;                 // Include performance metrics
  memory: boolean;                      // Include memory metrics
}

/**
 * Enhanced performance metrics interface
 */
export interface EnhancedPerformanceMetric extends PerformanceMetric {
  percentiles: {
    p50: number;  // 50th percentile
    p90: number;  // 90th percentile
    p95: number;  // 95th percentile
    p99: number;  // 99th percentile
  };
  count: number;  // Number of measurements
  min: number;    // Minimum duration
  max: number;    // Maximum duration
  avg: number;    // Average duration
}

/**
 * Log rotation configuration
 */
export interface LogRotationConfig {
  maxSize: number;           // Maximum size in bytes before rotation
  maxFiles: number;          // Maximum number of rotated files to keep
  compress: boolean;         // Whether to compress rotated logs
  compressionLevel: number;  // Compression level (1-9)
  dateFormat: string;        // Date format for rotated file names
}

/**
 * Configuration interface for the Logger
 */
export interface LoggerConfig {
  minLevel: LogLevel;           // Minimum log level to be recorded
  persistLogs: boolean;         // Whether to keep logs in memory
  maxLogSize: number;           // Maximum number of log entries to keep
  rotationInterval: number;     // Interval in milliseconds for log rotation
  format: LogFormat;            // Log formatting options
  trackPerformance: boolean;    // Whether to track performance metrics
  trackMemory: boolean;         // Whether to track memory usage
  memoryCheckInterval: number;  // Interval for memory checks in milliseconds
  backupInterval: number;       // Interval for log backups in milliseconds
  sensitiveKeys: string[];      // Keys to redact from context
  rotation: LogRotationConfig;  // Log rotation configuration
  performanceHistory: number;   // Number of performance measurements to keep for percentile calculation
}

/**
 * Default configuration values for the Logger
 */
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: LogLevel.INFO,
  persistLogs: true,
  maxLogSize: 1000,
  rotationInterval: 24 * 60 * 60 * 1000, // 24 hours
  format: {
    timestamp: true,
    level: true,
    context: true,
    stack: true,
    source: true,
    performance: true,
    memory: true
  },
  trackPerformance: true,
  trackMemory: true,
  memoryCheckInterval: 5 * 60 * 1000, // 5 minutes
  backupInterval: 60 * 60 * 1000, // 1 hour
  sensitiveKeys: ['password', 'token', 'key', 'secret', 'authorization'],
  rotation: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    compress: true,
    compressionLevel: 6,
    dateFormat: 'YYYY-MM-DD-HH-mm'
  },
  performanceHistory: 1000 // Keep last 1000 measurements for percentile calculation
};

/**
 * Main Logger class implementing the Singleton pattern
 * @class Logger
 * 
 * @example
 * ```typescript
 * // Get logger instance with default configuration
 * const logger = Logger.getInstance();
 * 
 * // Get logger instance with custom configuration
 * const logger = Logger.getInstance({
 *   minLevel: LogLevel.DEBUG,
 *   persistLogs: true,
 *   trackPerformance: true
 * });
 * ```
 */
export class Logger {
  /** Singleton instance of the Logger */
  private static instance: Logger;
  
  /** Current logger configuration */
  private config: LoggerConfig;
  
  /** Buffer storing log entries */
  private logBuffer: LogEntry[];
  
  /** Flag indicating if logger is initialized */
  private isInitialized: boolean;
  
  /** Map storing performance measurement start times */
  private performanceMarks: Map<string, number>;
  
  /** Interval ID for memory monitoring */
  private memoryCheckIntervalId: number | NodeJS.Timeout | null;
  
  /** Interval ID for log backup */
  private backupIntervalId: number | NodeJS.Timeout | null;
  
  /** Interval ID for log rotation */
  private rotationIntervalId: number | NodeJS.Timeout | null;
  
  /** Current active log group name */
  private currentGroup: string | null;

  /** Backup failure tracking */
  private backupFailures: number;
  private lastBackupAttempt: number;
  private backupBackoffTime: number;
  private readonly MAX_BACKUP_FAILURES = 5;
  private readonly INITIAL_BACKOFF_TIME = 60000; // 1 minute
  private readonly MAX_BACKOFF_TIME = 3600000; // 1 hour

  /** Map storing performance measurement history for percentile calculation */
  private performanceHistory: Map<string, number[]>;
  
  /** Current log file size in bytes */
  private currentLogSize: number;
  
  /** Current log file path */
  private currentLogPath: string | null;

  /**
   * Private constructor to enforce singleton pattern
   * @param config - Optional configuration to override defaults
   */
  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = this.mergeWithDefaults(config);
    this.logBuffer = [];
    this.isInitialized = false;
    this.performanceMarks = new Map();
    this.memoryCheckIntervalId = null;
    this.backupIntervalId = null;
    this.rotationIntervalId = null;
    this.currentGroup = null;
    this.backupFailures = 0;
    this.lastBackupAttempt = 0;
    this.backupBackoffTime = this.INITIAL_BACKOFF_TIME;
    this.performanceHistory = new Map();
    this.currentLogSize = 0;
    this.currentLogPath = null;
    this.initialize();
  }

  /**
   * Gets the singleton instance of the Logger
   * @param {Partial<LoggerConfig>} [config] - Optional configuration to override defaults (only used on first instantiation)
   * @returns {Logger} Logger instance
   * 
   * @example
   * ```typescript
   * // Get default logger
   * const logger = Logger.getInstance();
   * 
   * // Get logger with custom config
   * const logger = Logger.getInstance({
   *   minLevel: LogLevel.DEBUG,
   *   persistLogs: true
   * });
   * ```
   */
  public static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Merges provided configuration with default values
   * @param config - Partial configuration to merge with defaults
   * @returns Complete configuration object
   */
  private mergeWithDefaults(config: Partial<LoggerConfig>): LoggerConfig {
    let minLevel: LogLevel = DEFAULT_CONFIG.minLevel;
    if (config.minLevel && Object.values(LogLevel).includes(config.minLevel as LogLevel)) {
      minLevel = config.minLevel as LogLevel;
    }
    let maxLogSize = DEFAULT_CONFIG.maxLogSize;
    if (typeof config.maxLogSize === 'number' && config.maxLogSize > 0) {
      maxLogSize = config.maxLogSize;
    }
    return {
      ...DEFAULT_CONFIG,
      ...config,
      minLevel,
      maxLogSize,
      format: {
        ...DEFAULT_CONFIG.format,
        ...(config.format || {})
      }
    };
  }

  /**
   * Initializes the logger with configuration
   * Sets up log rotation, memory monitoring, and backup if enabled
   */
  private initialize(): void {
    if (this.isInitialized) return;

    if (this.config.persistLogs) {
      this.setupLogRotation();
    }

    if (this.config.trackMemory) {
      this.setupMemoryMonitoring();
    }

    if (this.config.backupInterval > 0) {
      this.setupLogBackup();
    }

    this.isInitialized = true;
  }

  /**
   * Sets up periodic log rotation based on configuration
   */
  private setupLogRotation(): void {
    if (this.rotationIntervalId) {
      globalThis.clearInterval(this.rotationIntervalId);
      this.rotationIntervalId = null;
    }
    this.rotationIntervalId = globalThis.setInterval(() => {
      this.rotateLogs();
    }, this.config.rotationInterval);
  }

  /**
   * Rotates logs by removing oldest entries when buffer exceeds max size
   */
  private rotateLogs(): void {
    if (this.logBuffer.length > this.config.maxLogSize) {
      this.logBuffer = this.logBuffer.slice(-this.config.maxLogSize);
    }
  }

  /**
   * Sets up periodic memory usage monitoring
   */
  private setupMemoryMonitoring(): void {
    if (!this.getMemoryUsage()) {
      this.debug('Memory monitoring is not supported in this environment');
      return;
    }

    if (this.memoryCheckIntervalId) {
      globalThis.clearInterval(this.memoryCheckIntervalId);
      this.memoryCheckIntervalId = null;
    }

    this.memoryCheckIntervalId = globalThis.setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.memoryCheckInterval);
  }

  /**
   * Sets up periodic log backup
   */
  private setupLogBackup(): void {
    if (this.backupIntervalId) {
      globalThis.clearInterval(this.backupIntervalId);
      this.backupIntervalId = null;
    }

    this.backupIntervalId = globalThis.setInterval(() => {
      this.backupLogs();
    }, this.config.backupInterval);
  }

  /**
   * Gets current memory usage metrics
   * @returns Memory usage information or undefined if not available
   */
  private getMemoryUsage(): MemoryMetric | undefined {
    try {
      // Prefer globalThis.performance for compatibility
      const perf = typeof globalThis !== 'undefined' && globalThis.performance ? globalThis.performance : (typeof performance !== 'undefined' ? performance : undefined);
      if (!perf) return undefined;

      // Chrome-specific memory API
      if ('memory' in perf) {
        const memory = (perf as any).memory;
        if (memory && typeof memory.usedJSHeapSize === 'number') {
          return {
            heapUsed: memory.usedJSHeapSize,
            heapTotal: memory.totalJSHeapSize,
            external: memory.jsHeapSizeLimit - memory.totalJSHeapSize
          };
        }
      }

      // Firefox memory API (if available)
      if ('memory' in perf && 'jsHeapSizeLimit' in (perf as any).memory) {
        const memory = (perf as any).memory;
        return {
          heapUsed: memory.usedJSHeapSize || 0,
          heapTotal: memory.totalJSHeapSize || 0,
          external: memory.jsHeapSizeLimit - (memory.totalJSHeapSize || 0)
        };
      }

      // Safari/WebKit memory API (if available)
      if ('webkitMemory' in perf) {
        const memory = (perf as any).webkitMemory;
        if (memory && typeof memory.usedJSHeapSize === 'number') {
          return {
            heapUsed: memory.usedJSHeapSize,
            heapTotal: memory.totalJSHeapSize || memory.usedJSHeapSize,
            external: 0
          };
        }
      }

      // Fallback: Try to get memory info from process if in Node.js
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memory = process.memoryUsage();
        return {
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
          external: memory.external
        };
      }

      return undefined;
    } catch (error) {
      // Silently fail and return undefined
      return undefined;
    }
  }

  /**
   * Checks and logs current memory usage
   */
  private checkMemoryUsage(): void {
    const memoryUsage = this.getMemoryUsage();
    if (memoryUsage) {
      this.info('Memory Usage Check', { memory: memoryUsage });
    }
  }

  /**
   * Gets current timestamp with high precision if available
   * @returns Current timestamp in milliseconds
   */
  private getCurrentTime(): number {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * Starts performance measurement for an operation
   * @param {string} operation - Name of the operation to measure
   * 
   * @example
   * ```typescript
   * logger.startMeasurement('processPayment');
   * // ... do payment processing ...
   * logger.endMeasurement('processPayment', { orderId: '123' });
   * ```
   */
  public startMeasurement(operation: string): void {
    if (!this.config.trackPerformance) return;
    this.performanceMarks.set(operation, this.getCurrentTime());
  }

  /**
   * Calculates performance percentiles for a given operation
   * @param operation - Operation name
   * @returns Enhanced performance metrics
   */
  private calculatePerformanceMetrics(operation: string): EnhancedPerformanceMetric {
    const measurements = this.performanceHistory.get(operation) || [];
    if (measurements.length === 0) {
      return {
        duration: 0,
        startTime: 0,
        endTime: 0,
        operation,
        percentiles: { p50: 0, p90: 0, p95: 0, p99: 0 },
        count: 0,
        min: 0,
        max: 0,
        avg: 0
      };
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = sorted.reduce((a, b) => a + b, 0) / count;

    return {
      duration: measurements[measurements.length - 1],
      startTime: 0, // These will be set by the caller
      endTime: 0,   // These will be set by the caller
      operation,
      percentiles: {
        p50: sorted[Math.floor(count * 0.5)],
        p90: sorted[Math.floor(count * 0.9)],
        p95: sorted[Math.floor(count * 0.95)],
        p99: sorted[Math.floor(count * 0.99)]
      },
      count,
      min,
      max,
      avg
    };
  }

  /**
   * Records a performance measurement
   * @param operation - Operation name
   * @param duration - Duration in milliseconds
   */
  private recordPerformanceMeasurement(operation: string, duration: number): void {
    if (!this.performanceHistory.has(operation)) {
      this.performanceHistory.set(operation, []);
    }

    const measurements = this.performanceHistory.get(operation)!;
    measurements.push(duration);

    // Keep only the last N measurements as configured
    if (measurements.length > this.config.performanceHistory) {
      measurements.splice(0, measurements.length - this.config.performanceHistory);
    }
  }

  /**
   * Rotates the current log file if necessary
   * @returns Promise that resolves when rotation is complete
   */
  private async rotateLogFile(): Promise<void> {
    if (!this.currentLogPath || this.currentLogSize < this.config.rotation.maxSize) {
      return;
    }

    try {
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '-')
        .replace('Z', '');
      const rotatedPath = `${this.currentLogPath}.${timestamp}`;

      // Write current logs to file
      const logContent = this.exportLogs('text');
      await this.writeToFile(rotatedPath, logContent);

      // Compress if enabled
      if (this.config.rotation.compress) {
        await this.compressFile(rotatedPath);
      }

      // Clean up old rotated files
      await this.cleanupOldLogs();

      // Reset current log
      this.currentLogSize = 0;
      this.clearLogs();
    } catch (error) {
      this.error('Failed to rotate log file', error as Error);
    }
  }

  /**
   * Writes content to a file
   * @param filePath - Path to write to
   * @param content - Content to write
   */
  private async writeToFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      this.error('Failed to write to log file', error as Error);
      throw error;
    }
  }

  /**
   * Compresses a file using the configured compression level
   * @param filePath - Path to the file to compress
   */
  private async compressFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const compressed = await gzip(content, { level: this.config.rotation.compressionLevel });
      await fs.writeFile(`${filePath}.gz`, compressed);
      await fs.unlink(filePath); // Remove original file after compression
    } catch (error) {
      this.error('Failed to compress log file', error as Error);
      throw error;
    }
  }

  /**
   * Cleans up old rotated log files
   */
  private async cleanupOldLogs(): Promise<void> {
    if (!this.currentLogPath) return;

    try {
      const dir = path.dirname(this.currentLogPath);
      const baseName = path.basename(this.currentLogPath);
      const files = await fs.readdir(dir);
      
      // Filter log files for the current logger
      const logFiles = files.filter(file => 
        file.startsWith(baseName) && 
        (file.endsWith('.gz') || file.includes('.'))
      );

      // Sort by creation time (newest first)
      const fileStats = await Promise.all(
        logFiles.map(async file => {
          const stat = await fs.stat(path.join(dir, file));
          return { file, stat };
        })
      );
      fileStats.sort((a, b) => b.stat.ctimeMs - a.stat.ctimeMs);

      // Remove excess files
      const filesToRemove = fileStats.slice(this.config.rotation.maxFiles);
      await Promise.all(
        filesToRemove.map(({ file }) => 
          fs.unlink(path.join(dir, file))
            .catch(error => this.error(`Failed to remove old log file: ${file}`, error as Error))
        )
      );
    } catch (error) {
      this.error('Failed to cleanup old log files', error as Error);
      throw error;
    }
  }

  /**
   * Updates the current log size
   * @param content - Content to be written
   */
  private updateLogSize(content: string): void {
    this.currentLogSize += Buffer.byteLength(content, 'utf8');
    if (this.currentLogSize >= this.config.rotation.maxSize) {
      this.rotateLogFile().catch(error => 
        this.error('Failed to rotate log file', error as Error)
      );
    }
  }

  /**
   * Ends performance measurement for an operation
   * @param {string} operation - Name of the operation
   * @param {Record<string, unknown>} [context] - Optional context information
   * 
   * @example
   * ```typescript
   * logger.startMeasurement('processPayment');
   * // ... do payment processing ...
   * logger.endMeasurement('processPayment', { orderId: '123' });
   * ```
   */
  public endMeasurement(operation: string, context?: Record<string, unknown>): void {
    const startTime = this.performanceMarks.get(operation);
    if (!startTime) {
      this.warn(`No start time found for operation: ${operation}`);
      return;
    }

    const endTime = this.getCurrentTime();
    const duration = endTime - startTime;

    // Record the measurement for percentile calculation
    this.recordPerformanceMeasurement(operation, duration);

    // Calculate enhanced metrics
    const metrics = this.calculatePerformanceMetrics(operation);
    metrics.startTime = startTime;
    metrics.endTime = endTime;
    metrics.duration = duration;

    // Log with enhanced metrics
    this.log(LogLevel.INFO, `Operation completed: ${operation}`, {
      ...context,
      performance: metrics
    });

    this.performanceMarks.delete(operation);
  }

  /**
   * Gets source file and line information from stack trace
   * @returns Source information string (file:line)
   */
  private getSourceInfo(): string {
    try {
      const stack = new Error().stack;
      if (!stack) return '';

      const stackLines = stack.split('\n');
      
      // Skip the first two lines (Error and getSourceInfo)
      const relevantLines = stackLines.slice(2);
      
      // Try different stack trace patterns
      const patterns = [
        // Chrome/V8 format: "    at functionName (file:line:column)"
        /at\s+(?:\w+\s+)?\(?(.+):(\d+):(\d+)\)?/,
        // Firefox format: "functionName@file:line:column"
        /@(.+):(\d+):(\d+)/,
        // Webpack format: "at functionName (webpack:///./file:line:column)"
        /at\s+(?:\w+\s+)?\(?(?:webpack:\/\/\/\.\/)?(.+):(\d+):(\d+)\)?/,
        // Minified format: "at functionName (file:line)"
        /at\s+(?:\w+\s+)?\(?(.+):(\d+)\)?/,
        // Basic format: "file:line"
        /(.+):(\d+)/
      ];

      for (const line of relevantLines) {
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            const [, file, line] = match;
            // Clean up the file path
            const cleanFile = file
              .replace(/^webpack:\/\/\/\.\//, '') // Remove webpack prefix
              .replace(/^file:\/\//, '')         // Remove file:// prefix
              .replace(/^https?:\/\//, '')       // Remove http(s):// prefix
              .split('/')                        // Split path
              .slice(-2)                         // Get last two parts
              .join('/');                        // Rejoin
            return `${cleanFile}:${line}`;
          }
        }
      }

      // Fallback: return the first non-empty line that looks like a file path
      for (const line of relevantLines) {
        const cleanLine = line.trim().replace(/^at\s+/, '');
        if (cleanLine && !cleanLine.includes('Error') && !cleanLine.includes('getSourceInfo')) {
          return cleanLine;
        }
      }
    } catch (error) {
      // If anything goes wrong, return empty string
      return '';
    }

    return '';
  }

  /**
   * Sanitizes context object by redacting sensitive information and preventing log injection
   * @param context - Context object to sanitize
   * @returns Sanitized context object
   */
  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const seen = new WeakSet();
    
    const isSensitiveKey = (key: string): boolean => {
      return this.config.sensitiveKeys.some(sensitiveKey => 
        key.toLowerCase().includes(sensitiveKey.toLowerCase())
      );
    };

    const redact = (obj: any, depth = 0): any => {
      // Prevent stack overflow with max depth
      if (depth > 10) return '[Max Depth Exceeded]';
      
      // Handle null and undefined
      if (obj === null || obj === undefined) {
        return obj;
      }

      // Handle circular references
      if (typeof obj === 'object' && obj !== null) {
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);
      }

      try {
        // Handle different types
        if (typeof obj === 'string') {
          return obj.replace(/[\n\r\t\v\f\b]/g, ' ')
                   .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                   .replace(/[^\x20-\x7E\u0080-\uFFFF]/g, '');
        }
        
        if (Array.isArray(obj)) {
          return obj.map(item => redact(item, depth + 1));
        }
        
        if (obj instanceof Date) {
          return obj;
        }
        
        if (typeof obj === 'object' && obj !== null) {
          const result: Record<string, any> = {};
          
          for (const [key, value] of Object.entries(obj)) {
            if (isSensitiveKey(key)) {
              result[key] = '[REDACTED]';
            } else {
              result[key] = redact(value, depth + 1);
            }
          }
          
          return result;
        }
        
        // Handle primitive types
        if (typeof obj === 'number' || typeof obj === 'boolean') {
          return obj;
        }
        
        // Handle other types (functions, symbols, etc.)
        return String(obj).replace(/[\n\r\t\v\f\b]/g, ' ')
                         .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                         .replace(/[^\x20-\x7E\u0080-\uFFFF]/g, '');
      } catch (error) {
        return '[Error: Invalid Data]';
      }
    };

    try {
      return redact(context);
    } catch (error) {
      return { error: '[Error: Failed to sanitize context]' };
    }
  }

  /**
   * Safely converts object to JSON string with additional security measures
   * @param obj - Object to stringify
   * @returns JSON string or error message
   */
  private safeStringify(obj: unknown): string {
    try {
      let sanitized;
      if (typeof obj === 'object' && obj !== null) {
        sanitized = this.sanitizeContext(obj as Record<string, unknown>);
      } else {
        sanitized = { value: String(obj).replace(/[\n\r\t\v\f\b]/g, ' ')
                                      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                                      .replace(/[^\x20-\x7E\u0080-\uFFFF]/g, '') };
      }
      
      return JSON.stringify(sanitized, (key, value) => {
        if (value === null || value === undefined) {
          return value;
        }
        if (typeof value === 'bigint') {
          return value.toString();
        }
        if (value instanceof Error) {
          return {
            message: String(value.message).replace(/[\n\r\t\v\f\b]/g, ' ')
                                        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                                        .replace(/[^\x20-\x7E\u0080-\uFFFF]/g, ''),
            stack: value.stack ? String(value.stack).replace(/[\n\r\t\v\f\b]/g, ' ')
                                                   .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                                                   .replace(/[^\x20-\x7E\u0080-\uFFFF]/g, '') 
                              : undefined
          };
        }
        return value;
      }, 2);
    } catch (error) {
      return '[Error: Invalid JSON Data]';
    }
  }

  /**
   * Logs a message with specified level and context
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context information
   */
  public log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    try {
      // Sanitize message
      const sanitizedMessage = String(message).replace(/[\n\r\t\v\f\b]/g, ' ')
                                            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                                            .replace(/[^\x20-\x7E\u0080-\uFFFF]/g, '');

      const entry: LogEntry = {
        timestamp: Date.now(),
        level,
        message: sanitizedMessage,
        context: context ? this.sanitizeContext(context) : undefined,
        source: this.getSourceInfo(),
        group: this.currentGroup || undefined
      };

      if (context && 'performance' in context) {
        entry.performance = context.performance as PerformanceMetric;
      }

      if (this.config.trackMemory) {
        const memoryUsage = this.getMemoryUsage();
        if (memoryUsage) {
          entry.memory = memoryUsage;
        }
      }

      this.logBuffer.push(entry);
      this.rotateLogs();
      this.outputToConsole(entry);

      const logContent = this.formatLogEntry(entry);
      this.updateLogSize(logContent);
    } catch (error) {
      console.error('Failed to log message:', error);
    }
  }

  /**
   * Checks if a log level should be recorded based on minimum level configuration
   * @param level - Log level to check
   * @returns boolean indicating if the log should be recorded
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const minLevelIndex = levels.indexOf(this.config.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex >= minLevelIndex;
  }

  /**
   * Outputs log entry to console with appropriate formatting
   * @param entry - Log entry to output
   */
  private outputToConsole(entry: LogEntry): void {
    const message = this.formatLogEntry(entry);

    if (entry.group && !this.currentGroup) {
      console.group(entry.group);
      this.currentGroup = entry.group;
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }
  }

  /**
   * Formats a log entry for file output
   * @param entry - Log entry to format
   * @returns Formatted log string
   */
  private formatLogEntry(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.config.format.timestamp) {
      parts.push(`[${new Date(entry.timestamp).toISOString()}]`);
    }

    if (this.config.format.level) {
      parts.push(`${entry.level}:`);
    }

    parts.push(entry.message);

    if (this.config.format.source && entry.source) {
      parts.push(`(${entry.source})`);
    }

    if (this.config.format.context && entry.context) {
      parts.push(this.safeStringify(entry.context));
    }

    if (this.config.format.performance && entry.performance) {
      parts.push(`[Duration: ${entry.performance.duration.toFixed(2)}ms]`);
    }

    if (this.config.format.memory && entry.memory) {
      parts.push(`[Memory: ${(entry.memory.heapUsed / 1024 / 1024).toFixed(2)}MB]`);
    }

    if (this.config.format.stack && entry.stack) {
      parts.push(`\nStack: ${entry.stack}`);
    }

    return parts.join(' ') + '\n';
  }

  /**
   * Logs a debug level message
   * @param message - Debug message
   * @param context - Optional context information
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Logs an info level message
   * @param message - Info message
   * @param context - Optional context information
   */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Logs a warning level message
   * @param message - Warning message
   * @param context - Optional context information
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Logs an error level message with optional error object
   * @param message - Error message
   * @param error - Optional Error object
   * @param context - Optional context information
   */
  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: LogLevel.ERROR,
      message,
      context: {
        ...(context ? this.sanitizeContext(context) : {}),
        error: error ? {
          message: error.message,
          stack: error.stack
        } : undefined
      },
      stack: error?.stack,
      source: this.getSourceInfo(),
      group: this.currentGroup || undefined
    };

    this.logBuffer.push(entry);
    this.outputToConsole(entry);
  }

  /**
   * Starts a new log group
   * @param name - Name of the log group
   */
  public startLogGroup(name: string): void {
    if (this.currentGroup) {
      this.warn('Nested log groups are not supported');
      return;
    }
    this.currentGroup = name;
    console.group(name);
  }

  /**
   * Ends the current log group
   */
  public endLogGroup(): void {
    if (this.currentGroup) {
      console.groupEnd();
      this.currentGroup = null;
    }
  }

  /**
   * Updates logger configuration at runtime
   * @param {Partial<LoggerConfig>} partial - Partial configuration to update
   * @returns {LoggerConfig} Updated configuration
   * 
   * @example
   * ```typescript
   * // Enable debug logging
   * logger.setConfig({ minLevel: LogLevel.DEBUG });
   * 
   * // Disable performance tracking
   * logger.setConfig({ trackPerformance: false });
   * 
   * // Update multiple settings
   * logger.setConfig({
   *   minLevel: LogLevel.DEBUG,
   *   persistLogs: true,
   *   trackPerformance: true
   * });
   * ```
   */
  public setConfig(partial: Partial<LoggerConfig>): LoggerConfig {
    const oldConfig = this.config;
    this.config = this.mergeWithDefaults(partial);

    // Handle interval updates
    if (partial.memoryCheckInterval !== oldConfig.memoryCheckInterval || partial.trackMemory !== oldConfig.trackMemory) {
      if (this.memoryCheckIntervalId) {
        globalThis.clearInterval(this.memoryCheckIntervalId);
        this.memoryCheckIntervalId = null;
      }
      if (this.config.trackMemory) {
        this.setupMemoryMonitoring();
      }
    }

    if (partial.backupInterval !== oldConfig.backupInterval) {
      if (this.backupIntervalId) {
        globalThis.clearInterval(this.backupIntervalId);
        this.backupIntervalId = null;
      }
      if (this.config.backupInterval > 0) {
        this.resetBackupFailureTracking();
        this.setupLogBackup();
      }
    }

    if (partial.rotationInterval !== oldConfig.rotationInterval || partial.persistLogs !== oldConfig.persistLogs) {
      if (this.rotationIntervalId) {
        globalThis.clearInterval(this.rotationIntervalId);
        this.rotationIntervalId = null;
      }
      if (this.config.persistLogs) {
        this.setupLogRotation();
      }
    }

    // Log the configuration change
    // this.info('Logger configuration updated', {
    //   changes: Object.keys(partial),
    //   newConfig: this.config
    // });

    return this.config;
  }

  /**
   * Gets current logger configuration
   * @returns Current configuration
   */
  public getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Changes the minimum log level
   * @param level - New minimum log level
   * @deprecated Use setConfig({ minLevel }) instead
   */
  public setLogLevel(level: LogLevel): void {
    this.setConfig({ minLevel: level });
  }

  /**
   * Retrieves all stored logs
   * @returns Array of log entries
   */
  public getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * Clears all stored logs
   */
  public clearLogs(): void {
    this.logBuffer = [];
  }

  /**
   * Exports logs in specified format
   * @param format - Export format ('json' or 'text')
   * @returns Formatted log string
   */
  public exportLogs(format: 'json' | 'text'): string {
    if (format === 'json') {
      return this.safeStringify(this.logBuffer);
    }

    return this.logBuffer.map(entry => {
      const parts: string[] = [];
      if (this.config.format.timestamp) {
        parts.push(`[${new Date(entry.timestamp).toISOString()}]`);
      }
      if (this.config.format.level) {
        parts.push(`${entry.level}:`);
      }
      parts.push(entry.message);
      if (entry.context) {
        parts.push(this.safeStringify(entry.context));
      }
      return parts.join(' ');
    }).join('\n');
  }

  /**
   * Filters logs based on specified criteria
   * @param {Object} options - Filter options
   * @param {LogLevel} [options.level] - Filter by log level
   * @param {number} [options.startTime] - Filter by start time
   * @param {number} [options.endTime] - Filter by end time
   * @param {string} [options.search] - Filter by search term
   * @param {string} [options.group] - Filter by log group
   * @returns {LogEntry[]} Filtered log entries
   * 
   * @example
   * ```typescript
   * // Get all error logs
   * const errorLogs = logger.filterLogs({ level: LogLevel.ERROR });
   * 
   * // Get logs from last hour
   * const recentLogs = logger.filterLogs({
   *   startTime: Date.now() - 3600000
   * });
   * 
   * // Search logs
   * const searchResults = logger.filterLogs({
   *   search: 'payment failed'
   * });
   * ```
   */
  public filterLogs(options: {
    level?: LogLevel;
    startTime?: number;
    endTime?: number;
    search?: string;
    group?: string;
  }): LogEntry[] {
    return this.logBuffer.filter(entry => {
      if (options.level) {
        const levels = Object.values(LogLevel);
        const targetLevelIndex = levels.indexOf(options.level);
        const entryLevelIndex = levels.indexOf(entry.level);
        if (entryLevelIndex < targetLevelIndex) return false;
      }
      if (options.startTime && entry.timestamp < options.startTime) return false;
      if (options.endTime && entry.timestamp > options.endTime) return false;
      if (options.group && entry.group !== options.group) return false;
      if (options.search) {
        const searchLower = options.search.toLowerCase();
        return entry.message.toLowerCase().includes(searchLower) ||
               this.safeStringify(entry.context ?? '').toLowerCase().includes(searchLower);
      }
      return true;
    });
  }

  /**
   * Handles backup failure by implementing backoff strategy
   */
  private handleBackupFailure(skipIncrement = false): void {
    if (!skipIncrement) {
      this.backupFailures++;
      this.lastBackupAttempt = Date.now();
    }

    if (this.backupFailures >= this.MAX_BACKUP_FAILURES) {
      this.warn('Backup disabled due to repeated failures', {
        failures: this.backupFailures,
        lastAttempt: new Date(this.lastBackupAttempt).toISOString()
      });

      if (this.backupIntervalId) {
        globalThis.clearInterval(this.backupIntervalId);
        this.backupIntervalId = null;
      }
      return;
    }

    // Implement exponential backoff
    this.backupBackoffTime = Math.min(
      this.backupBackoffTime * 2,
      this.MAX_BACKOFF_TIME
    );

    this.warn('Backup failed, implementing backoff', {
      failures: this.backupFailures,
      nextAttempt: new Date(this.lastBackupAttempt + this.backupBackoffTime).toISOString(),
      backoffTime: this.backupBackoffTime
    });

    // Reschedule backup with backoff
    if (this.backupIntervalId) {
      globalThis.clearInterval(this.backupIntervalId);
      this.backupIntervalId = globalThis.setTimeout(() => {
        this.setupLogBackup();
      }, this.backupBackoffTime);
    }
  }

  /**
   * Resets backup failure tracking after successful backup
   */
  private resetBackupFailureTracking(): void {
    this.backupFailures = 0;
    this.backupBackoffTime = this.INITIAL_BACKOFF_TIME;
  }

  /**
   * Backs up logs to Chrome storage
   * @returns Promise that resolves when backup is complete or fails
   */
  private async backupLogs(): Promise<void> {
    // Check if we're in backoff period
    if (this.backupFailures > 0) {
      const timeSinceLastAttempt = Date.now() - this.lastBackupAttempt;
      if (timeSinceLastAttempt < this.backupBackoffTime) {
        this.debug('Skipping backup due to backoff period', {
          timeRemaining: this.backupBackoffTime - timeSinceLastAttempt
        });
        return;
      }
    }

    try {
      const logs = this.exportLogs('json');
      const backupKey = `log_backup_${Date.now()}`;
      
      await chrome.storage.local.set({ [backupKey]: logs });
      this.info('Logs backed up successfully', { backupKey });
      this.resetBackupFailureTracking();
    } catch (error) {
      this.backupFailures++;
      this.lastBackupAttempt = Date.now();
      this.error('Failed to backup logs', error instanceof Error ? error : new Error(String(error)), { 
        error: error instanceof Error ? error.message : String(error),
        failures: this.backupFailures,
        backoffTime: this.backupBackoffTime
      });
      setTimeout(() => this.handleBackupFailure(true), 0);
      return;
    }
  }

  /**
   * Cleans up resources and stops monitoring
   * 
   * @example
   * ```typescript
   * // Clean up before application shutdown
   * logger.cleanup();
   * ```
   */
  public cleanup(): void {
    if (this.memoryCheckIntervalId) {
      globalThis.clearInterval(this.memoryCheckIntervalId);
      this.memoryCheckIntervalId = null;
    }
    if (this.backupIntervalId) {
      globalThis.clearInterval(this.backupIntervalId);
      this.backupIntervalId = null;
    }
    if (this.rotationIntervalId) {
      globalThis.clearInterval(this.rotationIntervalId);
      this.rotationIntervalId = null;
    }
    if (this.currentGroup) {
      console.groupEnd();
      this.currentGroup = null;
    }
    this.clearLogs();
  }
} 