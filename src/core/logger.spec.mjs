// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs before importing logger so the module-level existsSync/mkdirSync don't fail
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

// Mock config so brainDir is predictable
vi.mock('./config.mjs', () => ({
  brainDir: '/tmp/test-brain',
}));

describe('logger', () => {
  let logger, logEvents, LOG_DIR, getLogFile;
  let fsMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-apply mocks after resetModules
    vi.mock('fs', () => ({
      default: {
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
        appendFileSync: vi.fn(),
        readdirSync: vi.fn(() => []),
      },
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      appendFileSync: vi.fn(),
    }));

    const mod = await import('./logger.mjs');
    logger = mod.logger;
    logEvents = mod.logEvents;
    LOG_DIR = mod.LOG_DIR;
    getLogFile = mod.getLogFile;
    fsMock = (await import('fs')).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports logger with info/warn/error/debug/log methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.log).toBe('function');
  });

  it('exports logEvents EventEmitter', () => {
    expect(logEvents).toBeDefined();
    expect(typeof logEvents.on).toBe('function');
    expect(typeof logEvents.emit).toBe('function');
  });

  it('exports LOG_DIR as a string', () => {
    expect(typeof LOG_DIR).toBe('string');
    expect(LOG_DIR).toContain('logs');
  });

  it('getLogFile returns a .jsonl path with today\'s date', () => {
    const file = getLogFile();
    expect(file).toMatch(/system-\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  it('logger.log writes a JSON line via fs.appendFileSync', () => {
    const appendSpy = vi.spyOn(fsMock, 'appendFileSync');
    logger.log('test-subsystem', 'info', 'hello world');
    expect(appendSpy).toHaveBeenCalledOnce();
    const [, line] = appendSpy.mock.calls[0];
    const parsed = JSON.parse(line.trim());
    expect(parsed.subsystem).toBe('test-subsystem');
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello world');
    expect(parsed.timestamp).toBeDefined();
  });

  it('logger.info calls logger.log with level=info', () => {
    const logSpy = vi.spyOn(logger, 'log');
    logger.info('sys', 'info message');
    expect(logSpy).toHaveBeenCalledWith('sys', 'info', 'info message', undefined);
  });

  it('logger.warn calls logger.log with level=warn', () => {
    const logSpy = vi.spyOn(logger, 'log');
    logger.warn('sys', 'warn message');
    expect(logSpy).toHaveBeenCalledWith('sys', 'warn', 'warn message', undefined);
  });

  it('logger.error calls logger.log with level=error', () => {
    const logSpy = vi.spyOn(logger, 'log');
    logger.error('sys', 'error message');
    expect(logSpy).toHaveBeenCalledWith('sys', 'error', 'error message', undefined);
  });

  it('logger.debug calls logger.log with level=debug', () => {
    const logSpy = vi.spyOn(logger, 'log');
    logger.debug('sys', 'debug message');
    expect(logSpy).toHaveBeenCalledWith('sys', 'debug', 'debug message', undefined);
  });

  it('logger.log accepts an object as first argument', () => {
    const appendSpy = vi.spyOn(fsMock, 'appendFileSync');
    logger.log({ subsystem: 'core', level: 'warn', message: 'obj-style log' });
    const [, line] = appendSpy.mock.calls[0];
    const parsed = JSON.parse(line.trim());
    expect(parsed.subsystem).toBe('core');
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('obj-style log');
  });

  it('emits log event on logEvents for in-process subscribers', () => {
    const listener = vi.fn();
    logEvents.on('log', listener);
    logger.log('emitter', 'info', 'emitting test');
    expect(listener).toHaveBeenCalledOnce();
    const [entry] = listener.mock.calls[0];
    expect(entry.subsystem).toBe('emitter');
    logEvents.off('log', listener);
  });

  it('does not throw if appendFileSync fails', () => {
    vi.spyOn(fsMock, 'appendFileSync').mockImplementation(() => { throw new Error('disk full'); });
    expect(() => logger.log('sys', 'info', 'resilience test')).not.toThrow();
  });
});
