/**
 * Append-only JSONL log with last-write-wins semantics and compaction.
 *
 * Write: O(1) — fs.appendFileSync one line
 * Read: O(n) on cold load, cached after first read
 * Compact: Rewrites only latest version of each key
 *
 * File format: One JSON object per line, each with a mandatory `_key` field.
 * Later entries for the same `_key` shadow earlier ones.
 * Tombstones: { "_key": "slug", "_deleted": true }
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './vault.mjs';
import { logger } from './logger.mjs';

/** @type {Map<string, AppendLog>} Registry of all active AppendLog instances */
const activeAppendLogs = new Map();

export class AppendLog {
  #filePath;
  #cache; // Map<string, object> — latest value per key
  #dirty; // number of appended lines since last compact
  #compactThreshold;

  constructor(filePath, { compactThreshold = 500 } = {}) {
    this.#filePath = filePath;
    this.#cache = null;
    this.#dirty = 0;
    this.#compactThreshold = compactThreshold;
    activeAppendLogs.set(filePath, this);
  }

  /** Read the full index. Returns Map<key, value>. Cached after first call. */
  entries() {
    if (this.#cache) return this.#cache;
    this.#cache = new Map();
    if (!fs.existsSync(this.#filePath)) return this.#cache;
    const raw = fs.readFileSync(this.#filePath, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry._deleted) this.#cache.delete(entry._key);
        else this.#cache.set(entry._key, entry);
      } catch { /* skip corrupt lines */ }
    }
    return this.#cache;
  }

  /** Get a single entry by key. */
  get(key) {
    return this.entries().get(key) ?? null;
  }

  /** Append a single entry. O(1) I/O. */
  append(key, value) {
    const dir = path.dirname(this.#filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { _key: key, ...value };
    fs.appendFileSync(this.#filePath, JSON.stringify(entry) + '\n');
    // Update in-memory cache
    this.entries().set(key, entry);
    this.#dirty++;
    if (this.#dirty >= this.#compactThreshold) {
      this.compact();
    }
  }

  /** Write a tombstone for a key. O(1) I/O. */
  remove(key) {
    const dir = path.dirname(this.#filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(this.#filePath, JSON.stringify({ _key: key, _deleted: true }) + '\n');
    this.entries().delete(key);
    this.#dirty++;
  }

  /** Number of live entries. */
  get size() {
    return this.entries().size;
  }

  /** Convert to plain object (for JSON.stringify compatibility). */
  toObject() {
    const obj = {};
    for (const [key, value] of this.entries()) {
      const { _key, ...rest } = value;
      obj[key] = rest;
    }
    return obj;
  }

  /** Compact: rewrite file with only latest versions. */
  compact() {
    const entries = this.entries();
    const lines = [];
    for (const [, value] of entries) {
      lines.push(JSON.stringify(value));
    }
    atomicWrite(this.#filePath, lines.join('\n') + '\n');
    this.#dirty = 0;
    logger.info('append-log', `Compacted ${this.#filePath}: ${lines.length} entries`);
  }

  /** Invalidate the in-memory cache (force reload on next read). */
  invalidate() {
    this.#cache = null;
    this.#dirty = 0;
  }
}

/**
 * Compact all active AppendLog instances.
 * Returns summary with number of logs compacted and total entries.
 */
export function compactAppendLogs() {
  let logsCompacted = 0;
  let totalEntries = 0;
  for (const [filePath, log] of activeAppendLogs) {
    try {
      log.compact();
      logsCompacted++;
      totalEntries += log.size;
    } catch (err) {
      logger.warn('append-log', `Failed to compact ${filePath}: ${err.message}`);
    }
  }
  return { logs_compacted: logsCompacted, total_entries: totalEntries };
}
