import { Logger, LogLevel, LoggerConfig } from '../../src/utils/logger';
import fs from 'fs';

describe('Logger', () => {
  let logger: Logger;
  let mockStorage: { [key: string]: any };
  let consoleSpy: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
    group: jest.SpyInstance;
    groupEnd: jest.SpyInstance;
  };

  beforeEach(() => {
    // Reset singleton instance
    (Logger as any).instance = undefined;
    
    // Mock console methods
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      group: jest.spyOn(console, 'group').mockImplementation(),
      groupEnd: jest.spyOn(console, 'groupEnd').mockImplementation()
    };
    
    // Mock chrome.storage.local
    mockStorage = {};
    global.chrome = {
      storage: {
        local: {
          set: jest.fn().mockImplementation((items) => {
            Object.assign(mockStorage, items);
            return Promise.resolve();
          }),
          get: jest.fn().mockImplementation((keys) => {
            return Promise.resolve(
              keys.reduce((acc: any, key: string) => {
                acc[key] = mockStorage[key];
                return acc;
              }, {})
            );
          })
        }
      }
    } as any;

    // Mock performance.memory
    global.performance = {
      memory: {
        usedJSHeapSize: 1000000,
        totalJSHeapSize: 2000000,
        jsHeapSizeLimit: 3000000
      },
      now: () => 1000
    } as any;

    // Mock Date.now and performance.now
    jest.spyOn(Date, 'now').mockImplementation(() => 1000);
    jest.spyOn(global.performance, 'now').mockImplementation(() => 1000);

    // Create logger instance with test config
    logger = Logger.getInstance({
      minLevel: LogLevel.INFO,
      persistLogs: true,
      maxLogSize: 5,
      rotationInterval: 1000,
      trackPerformance: true,
      trackMemory: true,
      sensitiveKeys: ['password', 'token'],
      format: {
        timestamp: true,
        level: true,
        context: true,
        stack: true,
        source: true,
        performance: true,
        memory: true
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (logger) logger.cleanup();
  });

  describe('Log Level Filtering', () => {
    it('should filter logs below minimum level', () => {
      logger.setConfig({ minLevel: LogLevel.WARN });
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[1].level).toBe(LogLevel.ERROR);
    });

    it('should allow all logs when minimum level is DEBUG', () => {
      logger.setConfig({ minLevel: LogLevel.DEBUG });
      logger.clearLogs(); // Only test logs should be counted
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(4);
    });
  });

  describe('Log Rotation', () => {
    it('should rotate logs when exceeding max size', () => {
      // Fill buffer beyond max size
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = logger.getLogs();
      expect(logs).toHaveLength(5); // maxLogSize
      expect(logs[0].message).toBe('Message 5');
      expect(logs[4].message).toBe('Message 9');
    });

    it('should not rotate logs when below max size', () => {
      for (let i = 0; i < 3; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
    });
  });

  describe('Performance Measurement', () => {
    it('should track performance metrics correctly', () => {
      logger.startMeasurement('test-operation');
      
      // Simulate time passing
      jest.spyOn(performance, 'now').mockImplementation(() => 2000);
      
      logger.endMeasurement('test-operation');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].performance).toBeDefined();
      expect(logs[0].performance?.duration).toBe(1000);
    });

    it('should warn when ending non-existent measurement', () => {
      logger.endMeasurement('non-existent');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.WARN);
    });
  });

  describe('Context Redaction', () => {
    it('should redact sensitive information from context', () => {
      const context = {
        username: 'test',
        password: 'secret123',
        token: 'abc123',
        data: { key: 'value' }
      };

      logger.info('Test message', context);

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({
        username: 'test',
        password: '[REDACTED]',
        token: '[REDACTED]',
        data: { key: 'value' }
      });
    });

    it('should handle nested sensitive information', () => {
      const context = {
        user: {
          credentials: {
            password: 'secret123',
            token: 'abc123'
          }
        }
      };

      logger.info('Test message', context);

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({
        user: {
          credentials: {
            password: '[REDACTED]',
            token: '[REDACTED]'
          }
        }
      });
    });
  });

  describe('Log Groups', () => {
    it('should create and end log groups correctly', () => {
      logger.startLogGroup('Test Group');
      logger.info('Message in group');
      logger.endLogGroup();

      expect(consoleSpy.group).toHaveBeenCalledWith('Test Group');
      expect(consoleSpy.groupEnd).toHaveBeenCalled();
    });

    it('should warn on nested log groups', () => {
      logger.startLogGroup('Outer Group');
      logger.startLogGroup('Inner Group');
      logger.info('Message');
      logger.endLogGroup();
      logger.endLogGroup();

      const logs = logger.getLogs();
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[0].message).toBe('Nested log groups are not supported');
    });

    it('should handle logs within groups', () => {
      logger.startLogGroup('Test Group');
      logger.info('Info in group');
      logger.warn('Warning in group');
      logger.endLogGroup();

      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].group).toBe('Test Group');
      expect(logs[1].group).toBe('Test Group');
    });
  });

  describe('Memory Monitoring', () => {
    it('should track memory usage when enabled', () => {
      logger.info('Test message');

      const logs = logger.getLogs();
      expect(logs[0].memory).toBeDefined();
      expect(logs[0].memory?.heapUsed).toBe(1000000);
    });

    it('should not track memory when disabled', () => {
      logger.setConfig({ trackMemory: false });
      logger.info('Test message');

      const logs = logger.getLogs();
      expect(logs[0].memory).toBeUndefined();
    });

    it('should handle missing memory API gracefully', () => {
      // Remove memory API
      delete (global.performance as any).memory;
      const originalProcess = global.process;
      // @ts-ignore
      global.process = { ...global.process, memoryUsage: undefined };
      
      logger.info('Test message');

      const logs = logger.getLogs();
      expect(logs[0].memory).toBeUndefined();

      // Restore process
      global.process = originalProcess;
    });
  });

  describe('Log Formatting', () => {
    it('should format logs according to configuration', () => {
      logger.setConfig({
        format: {
          timestamp: true,
          level: true,
          context: true,
          stack: false,
          source: true,
          performance: false,
          memory: false
        }
      });

      logger.info('Test message', { data: 'value' });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[1970-01-01T00:00:01.000Z]')
      );
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO:')
      );
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('Test message')
      );
    });

    it('should export logs in different formats', () => {
      logger.info('Info message');
      logger.warn('Warning message');

      const jsonExport = logger.exportLogs('json');
      const textExport = logger.exportLogs('text');

      expect(() => JSON.parse(jsonExport)).not.toThrow();
      expect(textExport).toContain('Info message');
      expect(textExport).toContain('Warning message');
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration at runtime', () => {
      const newConfig: Partial<LoggerConfig> = {
        minLevel: LogLevel.DEBUG,
        maxLogSize: 10,
        trackMemory: false
      };

      logger.setConfig(newConfig);
      const currentConfig = logger.getConfig();

      expect(currentConfig.minLevel).toBe(LogLevel.DEBUG);
      expect(currentConfig.maxLogSize).toBe(10);
      expect(currentConfig.trackMemory).toBe(false);
    });

    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = {
        minLevel: 'INVALID' as any,
        maxLogSize: -1
      };

      logger.setConfig(invalidConfig);
      const currentConfig = logger.getConfig();

      expect(currentConfig.minLevel).toBe(LogLevel.INFO); // Default value
      expect(currentConfig.maxLogSize).toBeGreaterThan(0);
    });

    it('should validate and merge format configuration', () => {
      const formatConfig: Partial<LoggerConfig> = {
        format: {
          timestamp: false,
          level: true,
          context: false,
          stack: true,
          source: false,
          performance: true,
          memory: false
        }
      };

      logger.setConfig(formatConfig);
      const currentConfig = logger.getConfig();

      expect(currentConfig.format).toEqual({
        timestamp: false,
        level: true,
        context: false,
        stack: true,
        source: false,
        performance: true,
        memory: false
      });
    });

    it('should maintain default values for unspecified config options', () => {
      const partialConfig: Partial<LoggerConfig> = {
        minLevel: LogLevel.DEBUG
      };

      logger.setConfig(partialConfig);
      const currentConfig = logger.getConfig();

      // Check that unspecified options maintain their default values
      expect(currentConfig.persistLogs).toBe(true);
      expect(currentConfig.rotationInterval).toBe(24 * 60 * 60 * 1000); // 24 hours
      expect(currentConfig.trackPerformance).toBe(true);
      expect(currentConfig.memoryCheckInterval).toBe(5 * 60 * 1000); // 5 minutes
      expect(currentConfig.backupInterval).toBe(60 * 60 * 1000); // 1 hour
      expect(currentConfig.sensitiveKeys).toContain('password');
      expect(currentConfig.sensitiveKeys).toContain('token');
    });

    it('should validate and update intervals', () => {
      const intervalConfig: Partial<LoggerConfig> = {
        rotationInterval: 30 * 60 * 1000, // 30 minutes
        memoryCheckInterval: 2 * 60 * 1000, // 2 minutes
        backupInterval: 15 * 60 * 1000 // 15 minutes
      };

      logger.setConfig(intervalConfig);
      const currentConfig = logger.getConfig();

      expect(currentConfig.rotationInterval).toBe(30 * 60 * 1000);
      expect(currentConfig.memoryCheckInterval).toBe(2 * 60 * 1000);
      expect(currentConfig.backupInterval).toBe(15 * 60 * 1000);
    });

    it('should handle empty configuration object', () => {
      logger.setConfig({});
      const currentConfig = logger.getConfig();

      // Should maintain all default values
      expect(currentConfig.minLevel).toBe(LogLevel.INFO);
      expect(currentConfig.persistLogs).toBe(true);
      expect(currentConfig.maxLogSize).toBe(1000);
      expect(currentConfig.rotationInterval).toBe(24 * 60 * 60 * 1000);
      expect(currentConfig.trackPerformance).toBe(true);
      expect(currentConfig.trackMemory).toBe(true);
    });

    it('should validate sensitive keys configuration', () => {
      const sensitiveKeysConfig: Partial<LoggerConfig> = {
        sensitiveKeys: ['apiKey', 'secret', 'authToken']
      };

      logger.setConfig(sensitiveKeysConfig);
      const currentConfig = logger.getConfig();

      expect(currentConfig.sensitiveKeys).toContain('apiKey');
      expect(currentConfig.sensitiveKeys).toContain('secret');
      expect(currentConfig.sensitiveKeys).toContain('authToken');

      // Test redaction with new sensitive keys
      const context = {
        apiKey: 'test-key',
        secret: 'test-secret',
        publicData: 'visible'
      };

      logger.clearLogs();
      logger.info('Test message', context);
      const logs = logger.getLogs();

      expect(logs[0].context).toEqual({
        apiKey: '[REDACTED]',
        secret: '[REDACTED]',
        publicData: 'visible'
      });
    });
  });

  describe('Log Backup', () => {
    it('should successfully backup logs', async () => {
      logger.setConfig({ maxLogSize: 100 });
      logger.info('Test message');
      
      await logger['backupLogs']();

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const logs = logger.getLogs();
      expect(logs[logs.length - 1].level).toBe(LogLevel.INFO);
      expect(logs[logs.length - 1].message).toContain('Logs backed up successfully');
    });

    it('should handle backup failures gracefully', async () => {
      logger.setConfig({ maxLogSize: 100 });
      // Mock storage failure
      (chrome.storage.local.set as jest.Mock).mockRejectedValueOnce(new Error('Storage error'));

      await logger['backupLogs']();

      const logs = logger.getLogs();
      expect(logs[logs.length - 1].level).toBe(LogLevel.ERROR);
      expect(logs[logs.length - 1].message).toBe('Failed to backup logs');
      expect(logger['backupFailures']).toBe(1);
    });

    it('should implement backoff on repeated failures', async () => {
      logger.setConfig({ maxLogSize: 100 });
      // Mock storage failure
      (chrome.storage.local.set as jest.Mock).mockRejectedValue(new Error('Storage error'));

      // Trigger multiple backup attempts
      for (let i = 0; i < 3; i++) {
        await logger['backupLogs']();
        // Advance time to simulate backoff period
        jest.advanceTimersByTime(logger['backupBackoffTime']);
      }

      const logs = logger.getLogs();
      const errorLogs = logs.filter(log => log.level === LogLevel.ERROR);
      expect(errorLogs).toHaveLength(3);
      
      // Check if backoff time increased
      const backoffLogs = logs.filter(log => 
        log.message.includes('implementing backoff')
      );
      expect(backoffLogs.length).toBeGreaterThanOrEqual(2);
      expect(logger['backupBackoffTime']).toBeGreaterThan(logger['INITIAL_BACKOFF_TIME']);
    });
  });

  describe('Log Filtering', () => {
    it('should filter logs by level', () => {
      logger.setConfig({ maxLogSize: 100 });
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const filteredLogs = logger.filterLogs({ level: LogLevel.WARN });
      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0].level).toBe(LogLevel.WARN);
      expect(filteredLogs[1].level).toBe(LogLevel.ERROR);
    });

    it('should filter logs by time range', () => {
      // Set different timestamps
      jest.spyOn(Date, 'now')
        .mockImplementationOnce(() => 1000)  // First log
        .mockImplementationOnce(() => 2000)  // Second log
        .mockImplementationOnce(() => 3000); // Third log

      logger.info('First message');
      logger.info('Second message');
      logger.info('Third message');

      const filteredLogs = logger.filterLogs({
        startTime: 1500,
        endTime: 2500
      });

      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0].message).toBe('Second message');
    });

    it('should filter logs by search term', () => {
      logger.setConfig({ maxLogSize: 100 });
      logger.info('Hello world');
      logger.info('Goodbye world');
      logger.info('Hello there');

      const filteredLogs = logger.filterLogs({ search: 'Hello' });
      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0].message).toBe('Hello world');
      expect(filteredLogs[1].message).toBe('Hello there');
    });

    it('should filter logs by group', () => {
      logger.startLogGroup('Group A');
      logger.info('Message in Group A');
      logger.endLogGroup();

      logger.startLogGroup('Group B');
      logger.info('Message in Group B');
      logger.endLogGroup();

      const filteredLogs = logger.filterLogs({ group: 'Group A' });
      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0].message).toBe('Message in Group A');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid log entries', () => {
      // @ts-ignore - Testing invalid input
      logger.log('INVALID_LEVEL', 'Test message');
      // @ts-ignore - Testing invalid input
      logger.log(LogLevel.INFO, null);
      // @ts-ignore - Testing invalid input
      logger.log(LogLevel.INFO, undefined);

      const logs = logger.getLogs();
      expect(logs).toHaveLength(0); // Invalid entries should be ignored
    });

    it('should handle circular references in context', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      logger.info('Test message', circular);

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ name: 'test', self: '[Circular]' });
    });

    it('should handle extremely large log messages', () => {
      const largeMessage = 'x'.repeat(1024 * 1024); // 1MB message
      logger.info(largeMessage);

      const logs = logger.getLogs();
      expect(logs[0].message.length).toBeLessThan(1024 * 1024); // Should be truncated
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent log operations', async () => {
      const promises = Array(100).fill(null).map((_, i) => 
        Promise.resolve().then(() => logger.info(`Concurrent message ${i}`))
      );

      await Promise.all(promises);

      const logs = logger.getLogs();
      expect(logs.length).toBe(100);
      expect(new Set(logs.map(l => l.message)).size).toBe(100); // All messages should be unique
    });

    it('should handle race conditions in log rotation', async () => {
      logger.setConfig({ maxLogSize: 10 });
      
      const promises = Array(20).fill(null).map((_, i) => 
        Promise.resolve().then(() => logger.info(`Rotation test ${i}`))
      );

      await Promise.all(promises);

      const logs = logger.getLogs();
      expect(logs.length).toBe(10); // Should maintain maxLogSize
      expect(logs[0].message).toBe('Rotation test 10'); // Should keep most recent logs
    });

    it('should handle concurrent configuration updates', async () => {
      const configs = [
        { minLevel: LogLevel.DEBUG },
        { minLevel: LogLevel.INFO },
        { minLevel: LogLevel.WARN }
      ];

      const promises = configs.map(config => 
        Promise.resolve().then(() => logger.setConfig(config))
      );

      await Promise.all(promises);

      const finalConfig = logger.getConfig();
      expect([LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN]).toContain(finalConfig.minLevel);
    });
  });

  describe('Resource Management', () => {
    it('should handle disk space exhaustion', async () => {
      // Mock fs.writeFile to simulate disk space error
      const originalWriteFile = fs.writeFile;
      const mockWriteFile = jest.fn().mockRejectedValue(new Error('ENOSPC'));
      (mockWriteFile as any).__promisify__ = true;
      fs.writeFile = mockWriteFile as any;

      logger.info('Test message');
      await logger['rotateLogFile']();

      const logs = logger.getLogs();
      expect(logs[logs.length - 1].level).toBe(LogLevel.ERROR);
      expect(logs[logs.length - 1].message).toContain('Failed to rotate log file');

      // Restore original fs.writeFile
      fs.writeFile = originalWriteFile;
    });

    it('should handle memory pressure', () => {
      // Simulate memory pressure by creating a large number of logs
      const originalMaxLogSize = logger.getConfig().maxLogSize;
      logger.setConfig({ maxLogSize: 1000000 });

      for (let i = 0; i < 10000; i++) {
        logger.info(`Memory test ${i}`, { data: 'x'.repeat(1000) });
      }

      const logs = logger.getLogs();
      expect(logs.length).toBeLessThanOrEqual(1000000);

      // Restore original config
      logger.setConfig({ maxLogSize: originalMaxLogSize });
    });

    it('should handle file system errors', async () => {
      // Mock fs.readdir to simulate file system error
      const originalReaddir = fs.readdir;
      const mockReaddir = jest.fn().mockRejectedValue(new Error('EACCES'));
      (mockReaddir as any).__promisify__ = true;
      fs.readdir = mockReaddir as any;

      await logger['cleanupOldLogs']();

      const logs = logger.getLogs();
      expect(logs[logs.length - 1].level).toBe(LogLevel.ERROR);
      expect(logs[logs.length - 1].message).toContain('Failed to cleanup old log files');

      // Restore original fs.readdir
      fs.readdir = originalReaddir;
    });
  });

  describe('Recovery', () => {
    it('should recover from backup failures', async () => {
      // Simulate temporary backup failure
      (chrome.storage.local.set as jest.Mock)
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(undefined);

      await logger['backupLogs']();
      await logger['backupLogs']();

      const logs = logger.getLogs();
      const successLogs = logs.filter(log => 
        log.message.includes('Logs backed up successfully')
      );
      expect(successLogs.length).toBe(1);
    });

    it('should recover from rotation failures', async () => {
      // Simulate temporary rotation failure
      const originalWriteFile = fs.writeFile;
      const mockWriteFile = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(undefined);
      (mockWriteFile as any).__promisify__ = true;
      fs.writeFile = mockWriteFile as any;

      await logger['rotateLogFile']();
      await logger['rotateLogFile']();

      const logs = logger.getLogs();
      const successLogs = logs.filter(log => 
        log.message.includes('Log rotation completed')
      );
      expect(successLogs.length).toBe(1);

      // Restore original fs.writeFile
      fs.writeFile = originalWriteFile;
    });

    it('should maintain log integrity after crashes', async () => {
      // Simulate crash during log write
      const originalWriteFile = fs.writeFile;
      const mockWriteFile = jest.fn().mockImplementationOnce(() => {
        throw new Error('Simulated crash');
      });
      (mockWriteFile as any).__promisify__ = true;
      fs.writeFile = mockWriteFile as any;

      logger.info('Test message');
      await logger['rotateLogFile']().catch(() => {});

      const logs = logger.getLogs();
      expect(logs[0].message).toBe('Test message'); // Original log should be preserved

      // Restore original fs.writeFile
      fs.writeFile = originalWriteFile;
    });
  });

  describe('Performance', () => {
    it('should handle high volume logging', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 10000; i++) {
        logger.info(`Performance test ${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(logger.getLogs().length).toBe(10000);
    });

    it('should maintain performance under load', () => {
      const measurements: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        logger.info(`Load test ${i}`);
        measurements.push(performance.now() - start);
      }

      const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;
      expect(avgDuration).toBeLessThan(1); // Average operation should take less than 1ms
    });

    it('should handle rapid configuration changes', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        logger.setConfig({
          minLevel: i % 2 === 0 ? LogLevel.DEBUG : LogLevel.INFO,
          trackPerformance: i % 3 === 0,
          trackMemory: i % 4 === 0
        });
      }

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Security', () => {
    it('should properly redact sensitive data in nested objects', () => {
      const context = {
        user: {
          credentials: {
            password: 'secret123',
            token: 'abc123',
            nested: {
              apiKey: 'xyz789'
            }
          }
        }
      };

      logger.info('Test message', context);

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({
        user: {
          credentials: {
            password: '[REDACTED]',
            token: '[REDACTED]',
            nested: {
              apiKey: '[REDACTED]'
            }
          }
        }
      });
    });

    it('should handle malformed sensitive data', () => {
      const context = {
        password: null,
        token: undefined,
        secret: 123,
        key: { toString: () => 'malicious' }
      };

      logger.info('Test message', context);

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({
        password: null,
        token: undefined,
        secret: 123,
        key: '[REDACTED]'
      });
    });

    it('should prevent log injection attacks', () => {
      const maliciousMessage = 'Test\n[REDACTED]\nInjection';
      logger.info(maliciousMessage);

      const logs = logger.getLogs();
      expect(logs[0].message).toBe(maliciousMessage);
      expect(logs[0].message).not.toContain('[REDACTED]');
    });
  });

  describe('Operational', () => {
    it('should handle log rotation during high load', async () => {
      logger.setConfig({ maxLogSize: 1000 });
      
      const promises = Array(2000).fill(null).map((_, i) => 
        Promise.resolve().then(() => logger.info(`Load test ${i}`))
      );

      await Promise.all(promises);

      const logs = logger.getLogs();
      expect(logs.length).toBe(1000);
      expect(logs[0].message).toBe('Load test 1000');
    });

    it('should handle configuration changes during operation', async () => {
      const operations = [
        () => logger.info('Test message'),
        () => logger.setConfig({ minLevel: LogLevel.DEBUG }),
        () => logger.debug('Debug message'),
        () => logger.setConfig({ minLevel: LogLevel.INFO }),
        () => logger.debug('Should not appear')
      ];

      for (const operation of operations) {
        await operation();
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(3); // INFO, DEBUG, INFO
      expect(logs[2].message).toBe('Test message');
    });

    it('should handle cleanup during shutdown', () => {
      // Set up intervals
      logger.setConfig({
        trackMemory: true,
        persistLogs: true,
        backupInterval: 1000
      });

      // Perform cleanup
      logger.cleanup();

      // Verify intervals are cleared
      expect(logger['memoryCheckIntervalId']).toBeNull();
      expect(logger['backupIntervalId']).toBeNull();
      expect(logger['rotationIntervalId']).toBeNull();
      expect(logger.getLogs().length).toBe(0);
    });
  });
}); 