/**
 * utils.mjs — Shared utilities for Total Recall
 *
 * Common functions used across all core modules: YAML parsing,
 * file walking, slugification, and title extraction.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── YAML FRONTMATTER PARSER ────────────────────────────────────────────────────
// Lightweight parser — zero dependencies. Handles wiki node YAML frontmatter.

export function parseFrontmatter(content) {
  const fm = { body: content, meta: {} };
  if (!content.startsWith('---')) return fm;

  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return fm;

  const yamlBlock = content.slice(3, endIdx).trim();
  fm.body = content.slice(endIdx + 3).trim();

  const lines = yamlBlock.split('\n');
  let currentKey = null;

  for (const line of lines) {
    if (line.startsWith('  -') || line.startsWith('\t-')) {
      // Array item
      if (currentKey && Array.isArray(fm.meta[currentKey])) {
        let item = line.replace(/^\s+-\s*/, '').trim().replace(/^["']|["']$/g, '');
        // Strip [[ ]] wiki link syntax
        item = item.replace(/^\[\[/, '').replace(/\]\]$/, '');
        fm.meta[currentKey].push(item);
      }
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (value === '' || value === '[]') {
      currentKey = key;
      fm.meta[key] = [];
    } else {
      currentKey = null;
      // Parse numbers
      if (/^\d+$/.test(value)) {
        fm.meta[key] = parseInt(value, 10);
      } else {
        fm.meta[key] = value;
      }
    }
  }

  return fm;
}

// ─── WALK MARKDOWN FILES RECURSIVELY ────────────────────────────────────────────

export function walkMarkdown(dir, excludeFiles = ['INDEX.md', 'SCHEMA.md']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdown(fullPath, excludeFiles));
    } else if (entry.name.endsWith('.md') && !excludeFiles.includes(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── SLUGIFY ────────────────────────────────────────────────────────────────────

export function slugify(text) {
  return text
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ─── EXTRACT TITLE FROM MARKDOWN BODY ───────────────────────────────────────────

export function extractTitle(body, fallback = 'Untitled') {
  const match = body.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : fallback;
}

// ─── RESOLVE CONFIG ─────────────────────────────────────────────────────────────
// Loads totalrecall.config.mjs from the repo root, merging with defaults.

const DEFAULTS = {
  dataDir: '.agent',
  systemPromptFile: 'INSTRUCTIONS.md',
  systemPromptFiles: null,  // Array of files to inject surface into (e.g., ['INSTRUCTIONS.md', 'CLAUDE.md']). Overrides systemPromptFile.
  activeContextHeader: '## ACTIVE CONTEXT',
  behavioralSurfaceHeader: '## DISTILLED MEMORY (SUBJECT STATES)',
  watchers: [],
  ranking: {
    halfLife: {
      preference: 90,
      'anti-pattern': 60,
      pattern: 30,
      concept: 30,
      decision: 45,
      project: 14,
    },
    decayFloor: 0.1,
    accessExponent: 0.5,
    surfaceCap: 30,
    hotSlots: 5,
  },
  coprocessor: {
    enabled: true,
    intervalMs: 15000,
    heartbeatIntervalMs: 1800000,  // 30 min — surface recompilation + decay + prune
    analysisModel: 'gemini-3.1-pro-preview',
    researchEnabled: true,
    notificationsEnabled: true,
  },
  agents: {
    default: null,
    archivist: { binary: 'gemini', model: 'gemini-3.1-pro-preview' },
    synthesizer: { binary: 'gemini', model: 'gemini-3.1-pro-preview' },
    factChecker: { binary: 'gemini', model: 'gemini-3.1-pro-preview' },
  },
  // Default to Antigravity brain dir, but this can be overridden per repo
  brainDir: path.join(os.homedir(), '.gemini/antigravity/brain'),
};

export async function loadConfig(root) {
  const configPath = path.join(root, 'totalrecall.config.mjs');
  let userConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      const mod = await import(configPath);
      userConfig = mod.default || mod;
    } catch {
      // Silently fall back to defaults
    }
  }

  // Backward compat: normalize `watcher` (string) → `watchers` (array)
  if (userConfig.watcher && !userConfig.watchers) {
    userConfig.watchers = [userConfig.watcher];
    delete userConfig.watcher;
  }
  if (typeof userConfig.watchers === 'string') {
    userConfig.watchers = [userConfig.watchers];
  }

  return deepMerge(DEFAULTS, userConfig);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ─── PATH RESOLVERS ─────────────────────────────────────────────────────────────
// Given a root directory and config, resolve all standard paths.

export function resolvePaths(root, config) {
  const dataDir = path.join(root, config.dataDir);
  return {
    root,
    dataDir,
    dbPath: path.join(dataDir, 'learning/learning.db'),
    wikiDir: path.join(dataDir, 'memory-wiki'),
    dailyLogsDir: path.join(dataDir, 'memory/daily-logs'),
    episodesDir: path.join(dataDir, 'memory/episodes'),
    handoffsDir: path.join(dataDir, 'memory/handoffs'),
    userMd: path.join(dataDir, 'USER.md'),
    soulMd: path.join(dataDir, 'SOUL.md'),
    memoryMd: path.join(dataDir, 'MEMORY.md'),
    identityMd: path.join(dataDir, 'IDENTITY.md'),
    dreamsFile: path.join(dataDir, 'DREAMS.md'),
    systemPrompt: path.join(root, config.systemPromptFile),
    // Multi-file injection: resolve all target files
    systemPromptFiles: resolveSystemPromptFiles(root, config),
    activeContextFile: path.join(root, '.agent', 'rules', 'active-context.md'),
    brainDir: config.brainDir,
  };
}

/**
 * Resolve the list of system prompt files for behavioral surface injection.
 * Supports both `systemPromptFile` (string, legacy) and `systemPromptFiles` (array, new).
 */
function resolveSystemPromptFiles(root, config) {
  if (config.systemPromptFiles && Array.isArray(config.systemPromptFiles)) {
    return config.systemPromptFiles.map(f => path.join(root, f));
  }
  return [path.join(root, config.systemPromptFile)];
}
