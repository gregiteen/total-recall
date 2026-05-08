/**
 * adapters/index.mjs — Dynamic Agent Adapter Loader (Phase 11.2 + 13)
 *
 * Extracts the hardcoded AGENT_CONFIG from switch-memory-pipeline.mjs into
 * individual adapter files. Each adapter knows how to spawn its CLI agent.
 *
 * Adapters are loaded dynamically and auto-detect binary paths via `which`.
 *
 * Built-in adapters: gemini, claude, codex, aider, copilot, generic
 * Custom adapters can be registered at runtime via registerAdapter().
 */

import { execSync } from 'child_process';

// ─── ADAPTER DEFINITIONS ────────────────────────────────────────────────────────

const ADAPTERS = {
  gemini: {
    label: 'Gemini CLI',
    buildArgs: (prompt, model) => {
      const args = ['-p', prompt, '--yolo', '--sandbox=/Users/greg/.gemini,/Users/greg/.total-recall'];
      if (model) args.push('-m', model);
      return args;
    },
  },
  claude: {
    label: 'Claude Code',
    buildArgs: (prompt, model) => {
      const args = ['-p', prompt, '--dangerously-skip-permissions'];
      if (model) args.push('--model', model);
      return args;
    },
  },
  codex: {
    label: 'Codex CLI',
    buildArgs: (prompt, model) => {
      const args = ['exec', '--full-auto', '--sandbox=/Users/greg/.gemini,/Users/greg/.total-recall', prompt];
      if (model) args.push('-m', model);
      return args;
    },
  },
  aider: {
    label: 'Aider',
    buildArgs: (prompt, model) => {
      const args = ['--message', prompt, '--yes-always', '--no-auto-commits'];
      if (model) args.push('--model', model);
      return args;
    },
  },
  copilot: {
    label: 'Copilot CLI',
    buildArgs: (prompt, _model) => {
      // GitHub Copilot CLI uses --yes for non-interactive mode
      return ['--yes', prompt];
    },
  },
};

// ─── BINARY RESOLUTION ──────────────────────────────────────────────────────────

const _binCache = new Map();

/**
 * Find the absolute path to a CLI binary.
 * Uses `which` with caching. Falls back to the name itself (PATH lookup at spawn time).
 *
 * @param {string} name - Binary name (e.g., 'gemini', 'claude', 'codex')
 * @returns {string} Absolute path or bare name
 */
export function resolveBinary(name) {
  if (_binCache.has(name)) return _binCache.get(name);

  try {
    const resolved = execSync(`which ${name}`, { encoding: 'utf-8', timeout: 3000 }).trim();
    _binCache.set(name, resolved);
    return resolved;
  } catch {
    // Binary not found — return the name and let spawn fail with a clear error
    _binCache.set(name, name);
    return name;
  }
}

// ─── ADAPTER API ────────────────────────────────────────────────────────────────

/**
 * Get an adapter by name.
 *
 * @param {string} name - Adapter name (e.g., 'gemini', 'claude', 'codex')
 * @returns {{ bin: string, label: string, buildArgs: Function, usesStdin?: boolean }}
 * @throws {Error} If adapter not found
 */
export function getAdapter(name) {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    const available = Object.keys(ADAPTERS).join(', ');
    throw new Error(`Unknown agent adapter "${name}". Available: ${available}`);
  }

  return {
    ...adapter,
    bin: resolveBinary(name),
  };
}

/**
 * Check which agents are available on this system.
 *
 * @returns {Object<string, { available: boolean, path: string, label: string }>}
 */
export function checkAvailability() {
  const result = {};
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    const bin = resolveBinary(name);
    let available = false;
    try {
      execSync(`which ${name}`, { timeout: 3000, stdio: 'ignore' });
      available = true;
    } catch { /* not found */ }

    result[name] = {
      available,
      path: bin,
      label: adapter.label,
    };
  }
  return result;
}

/**
 * List all adapter names.
 * @returns {string[]}
 */
export function listAdapters() {
  return Object.keys(ADAPTERS);
}

/**
 * Register a custom adapter at runtime.
 * Useful for user-defined agents in totalrecall.config.mjs.
 *
 * @param {string} name - Adapter name
 * @param {Object} adapter - Adapter definition
 * @param {string} adapter.label - Human-readable label
 * @param {Function} adapter.buildArgs - (prompt, model) => string[]
 * @param {boolean} [adapter.usesStdin] - If true, prompt is piped via stdin
 * @param {string} [adapter.binary] - Override binary name (defaults to adapter name)
 */
export function registerAdapter(name, adapter) {
  if (ADAPTERS[name]) {
    console.warn(`⚠️  Overwriting existing adapter "${name}"`);
  }
  ADAPTERS[name] = adapter;
  // Clear cache for re-resolution
  _binCache.delete(adapter.binary || name);
}

/**
 * Create a generic adapter from a command template.
 * Template uses {PROMPT} and {MODEL} placeholders.
 *
 * Example: createGenericAdapter('my-agent', 'My Agent', 'my-agent run --prompt {PROMPT} --model {MODEL}')
 *
 * @param {string} name - Adapter name
 * @param {string} label - Human-readable label
 * @param {string} template - Command template with {PROMPT} and {MODEL}
 * @param {Object} [options]
 * @param {boolean} [options.usesStdin] - Pipe prompt via stdin instead
 * @returns {{ name: string, label: string, buildArgs: Function }}
 */
export function createGenericAdapter(name, label, template, options = {}) {
  const adapter = {
    label,
    usesStdin: options.usesStdin || false,
    buildArgs: (prompt, model) => {
      const cmd = template
        .replace('{PROMPT}', prompt || '')
        .replace('{MODEL}', model || '');
      // Split on spaces, respecting quoted strings
      return cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    },
  };

  registerAdapter(name, adapter);
  return { name, ...adapter };
}
