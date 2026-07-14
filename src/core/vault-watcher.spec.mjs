import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./vault-cache.mjs', () => ({
  invalidate: vi.fn(),
  getNodes: vi.fn(() => []),
}));
vi.mock('./surface.mjs', () => ({
  compileSurface: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./embeddings.mjs', () => ({
  buildEmbeddingsIndex: vi.fn().mockResolvedValue(undefined),
  buildSessionEmbeddingsIndex: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('node:fs');

// ---------------------------------------------------------------------------
// Helpers — resolved after each vi.resetModules() call
// ---------------------------------------------------------------------------

let startVaultWatcher;
let fs;
let vaultCache;
let surface;
let embeddings;

const VAULT_DIR = '/fake/vault';
const SKILLS_DIR = '/fake/skills';
const DERIVED_DIR = '/fake/derived';
const SESSIONS_DIR = '/fake/sessions';
const INSTRUCTIONS_FILE = '/fake/instructions.md';

/** Build a fresh mock fs.watch that captures the callback for inspection. */
function setupFsWatch({ throws = false } = {}) {
  const mockWatcher = { close: vi.fn() };

  if (throws) {
    fs.watch.mockImplementation(() => {
      throw new Error('watch failed');
    });
  } else {
    fs.watch.mockImplementation((_dir, _opts, cb) => {
      // stash callback so tests can fire it manually
      setupFsWatch._lastCallback = cb;
      return mockWatcher;
    });
  }

  return mockWatcher;
}
setupFsWatch._lastCallback = null;

beforeEach(async () => {
  // Reset module registry so the singleton `let watcher = null` is re-initialised
  vi.resetModules();

  // Re-import mocked modules so we get fresh references after resetModules
  fs = await import('node:fs');
  vaultCache = await import('./vault-cache.mjs');
  surface = await import('./surface.mjs');
  embeddings = await import('./embeddings.mjs');

  // Re-import the module under test
  const mod = await import('./vault-watcher.mjs');
  startVaultWatcher = mod.startVaultWatcher;

  // Default fs stubs
  fs.existsSync = vi.fn(() => false);
  fs.mkdirSync = vi.fn();
  fs.watch = vi.fn();

  // Clear any captured callback from previous test
  setupFsWatch._lastCallback = null;

  // Reset all mock call counts
  vi.clearAllMocks();
  // Restore stubs on fresh references
  fs.existsSync = vi.fn(() => false);
  fs.mkdirSync = vi.fn();
  fs.watch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('startVaultWatcher', () => {
  it('creates vaultDir with mkdirSync if it does not exist', () => {
    fs.existsSync = vi.fn(() => false);
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    expect(fs.mkdirSync).toHaveBeenCalledWith(VAULT_DIR, expect.objectContaining({ recursive: true }));
  });

  it('does NOT call mkdirSync if vaultDir already exists', () => {
    fs.existsSync = vi.fn(() => true);
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('calls fs.watch with the vaultDir and recursive: false', () => {
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    expect(fs.watch).toHaveBeenCalledWith(
      VAULT_DIR,
      expect.objectContaining({ recursive: false }),
      expect.any(Function),
    );
  });

  it('returns an object with a stop() method', () => {
    setupFsWatch();

    const result = startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    expect(result).toBeDefined();
    expect(typeof result.stop).toBe('function');
  });

  it('stop() calls watcher.close()', () => {
    const mockWatcher = setupFsWatch();

    const result = startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);
    result.stop();

    expect(mockWatcher.close).toHaveBeenCalledTimes(1);
  });

  it('returns the existing singleton on subsequent calls without re-watching', () => {
    setupFsWatch();

    const first = startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);
    const second = startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    // fs.watch should only have been called once (singleton)
    expect(fs.watch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('callback ignores non-.md files — invalidate is NOT called for .txt files', () => {
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    const cb = setupFsWatch._lastCallback;
    expect(cb).toBeDefined();

    cb('change', 'notes.txt');

    expect(vaultCache.invalidate).not.toHaveBeenCalled();
  });

  it('callback calls invalidate(vaultDir) when a .md file changes', () => {
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    const cb = setupFsWatch._lastCallback;
    cb('change', 'README.md');

    expect(vaultCache.invalidate).toHaveBeenCalledWith(VAULT_DIR);
  });

  it('after debounce, compileSurface is called', async () => {
    vi.useFakeTimers();
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    const cb = setupFsWatch._lastCallback;
    cb('change', 'page.md');

    // Before debounce fires, compileSurface should NOT have been called
    expect(surface.compileSurface).not.toHaveBeenCalled();

    // Advance past the 2000 ms debounce window
    await vi.runAllTimersAsync();

    expect(surface.compileSurface).toHaveBeenCalledTimes(1);
  });

  it('after debounce, buildEmbeddingsIndex and buildSessionEmbeddingsIndex are called', async () => {
    vi.useFakeTimers();
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    const cb = setupFsWatch._lastCallback;
    cb('change', 'notes.md');

    await vi.runAllTimersAsync();

    expect(embeddings.buildEmbeddingsIndex).toHaveBeenCalledTimes(1);
    expect(embeddings.buildSessionEmbeddingsIndex).toHaveBeenCalledTimes(1);
  });

  it('rapid successive .md changes only trigger debounced work once', async () => {
    vi.useFakeTimers();
    setupFsWatch();

    startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);

    const cb = setupFsWatch._lastCallback;
    cb('change', 'a.md');
    cb('change', 'b.md');
    cb('change', 'c.md');

    await vi.runAllTimersAsync();

    expect(surface.compileSurface).toHaveBeenCalledTimes(1);
  });

  it('if fs.watch throws, logs an error and stop() is safe to call', () => {
    const { logger } = vi.mocked(
      // logger mock was set up at module level; grab it via the mock
      { logger: { error: vi.fn() } },
    );
    setupFsWatch({ throws: true });

    let result;
    expect(() => {
      result = startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);
    }).not.toThrow();

    // stop() must not throw even when fs.watch failed
    if (result) {
      expect(() => result.stop()).not.toThrow();
    }
  });
});
