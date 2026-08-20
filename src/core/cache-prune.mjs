/**
 * cache-prune — bound the caches a long-running brain accumulates.
 *
 * Nothing pruned anything. A brain that had been up for eight days measured
 * 3.2 GB, and half of that was one file:
 *
 *   logs/daemon.log        1.5 GB   single file, no rotation, no cap
 *   logs/system-*.jsonl     27 MB   rotates daily by filename, never deleted
 *   sessions/              200 MB   4,080 files going back three months
 *   .snapshots/             98 MB   never capped
 *
 * The vault itself was 346 MB. The brain was mostly exhaust.
 *
 * Two rules shape everything here:
 *
 * 1. Only caches. Anything that cannot be regenerated is off limits, and the
 *    protected list is checked by resolved path so a policy typo cannot walk
 *    into the vault. `memory-derived/embeddings.db` is deliberately protected
 *    too: it is rebuildable, but it is in constant use and re-embedding the
 *    vault is expensive. Unused is the word that matters, not rebuildable.
 *
 * 2. A file another process holds open is truncated, never unlinked. The daemon
 *    keeps `daemon.log` open in append mode; deleting it orphans that
 *    descriptor and logging silently stops until the next restart, which is a
 *    worse failure than the disk usage being fixed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Directories that must never be pruned, relative to the brain root.
 * Checked by resolved path, not by string prefix.
 */
export const PROTECTED = [
  'memory-vault',      // the source of truth
  'memory-derived',    // embeddings index — rebuildable but always in use
  'memory-inbox',      // pending promotions, not yet durable
  'config',            // includes secrets.enc
  'browser-profile',   // live credentials; never touch
  'skills',
  'skills-registry',
];

/**
 * @typedef {object} Policy
 * @property {string} id
 * @property {string} dir            relative to brainDir
 * @property {RegExp} [match]        which files the policy applies to
 * @property {'age'|'count'|'size'} mode
 * @property {number} limit          days | groups to keep | max bytes
 * @property {number} [keepBytes]    size mode: bytes of tail to preserve
 * @property {boolean} [group]       count mode: group files by name-without-extension
 */

/**
 * A session file is exhaust only once its contents are in the vault.
 *
 * Ingestion is tracked per *entry*, not per file: `memory-derived/content-hashes.jsonl`
 * records a sha256 of each entry's content as it is absorbed. So a file is safe
 * to delete only when every entry in it is already there. Age alone is not a
 * proof of ingestion — a session written while the daemon was stopped can be
 * arbitrarily old and never have been read.
 *
 * Anything unreadable or unparseable is treated as NOT ingested, so corruption
 * costs disk space rather than memory.
 *
 * @param {string} brainDir
 * @returns {(file: {abs: string}) => boolean}
 */
export function sessionIngestedGuard(brainDir) {
  let seen = null;
  const load = () => {
    if (seen) return seen;
    seen = new Set();
    const idx = path.join(brainDir, 'memory-derived', 'content-hashes.jsonl');
    try {
      for (const line of fs.readFileSync(idx, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { seen.add(JSON.parse(line).sha256); } catch { /* corrupt line */ }
      }
    } catch {
      /* no index yet — nothing has been ingested, so nothing is safe to drop */
    }
    return seen;
  };

  return (file) => {
    const hashes = load();
    if (hashes.size === 0) return false;
    let text;
    try {
      text = fs.readFileSync(file.abs, 'utf8');
    } catch {
      return false;
    }
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length === 0) return true; // empty file carries nothing
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { return false; }
      const h = crypto.createHash('sha256').update(String(entry.content || '')).digest('hex');
      if (!hashes.has(h)) return false;
    }
    return true;
  };
}

/** @type {Policy[]} */
export const DEFAULT_POLICIES = [
  {
    id: 'system-logs',
    dir: 'logs',
    match: /^system-\d{4}-\d{2}-\d{2}\.jsonl$/,
    mode: 'age',
    limit: 14,
  },
  {
    // One unrotated file that grew ~190 MB/day. Truncated, never unlinked.
    id: 'daemon-log',
    dir: 'logs',
    match: /^daemon\.log$/,
    mode: 'size',
    limit: 25 * 1024 * 1024,
    keepBytes: 5 * 1024 * 1024,
  },
  {
    // Age selects candidates; the guard decides.
    //
    // NOTE: this policy is deliberately inert on brains with no ingestion
    // evidence. `sessions/` holds the OUTPUT of ingesting external transcripts,
    // and `content-hashes.jsonl` records external-source dedup rather than
    // "this session reached the vault" — so it is a conservative proxy, not a
    // proof. Where the index is absent the guard withholds everything, and the
    // daemon logs the retained count so an inert policy is visible rather than
    // looking like a cache that was already small.
    id: 'sessions',
    dir: 'sessions',
    match: /\.jsonl$/,
    mode: 'age',
    limit: 30,
    guard: sessionIngestedGuard,
  },
  {
    // Snapshots come in pairs (.tar.gz + .json); keeping "10 files" would keep
    // five snapshots and orphan half of a sixth.
    id: 'snapshots',
    dir: '.snapshots',
    mode: 'count',
    limit: 10,
    group: true,
  },
];

/** Is this path inside a protected directory? */
export function isProtected(brainDir, target) {
  const root = path.resolve(brainDir);
  const abs = path.resolve(target);
  // Outside the brain entirely — refuse rather than guess.
  if (abs !== root && !abs.startsWith(root + path.sep)) return true;
  const rel = path.relative(root, abs);
  const first = rel.split(path.sep)[0];
  return PROTECTED.includes(first);
}

/** Strip one trailing extension, and `.tar.gz` as a unit. */
function stem(name) {
  return name.replace(/\.tar\.gz$/, '').replace(/\.[^.]+$/, '');
}

function listFiles(dir, match) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (match && !match.test(e.name)) continue;
    const abs = path.join(dir, e.name);
    try {
      const st = fs.statSync(abs);
      out.push({ name: e.name, abs, mtime: st.mtimeMs, size: st.size });
    } catch {
      /* vanished between readdir and stat */
    }
  }
  return out;
}

/**
 * Keep only the tail of an oversized file, in place.
 *
 * Writing to the same path truncates it, and an appender's O_APPEND descriptor
 * simply continues at the new end. Lines written between the read and the write
 * are lost; for a log that is an acceptable trade for not orphaning the fd.
 */
function truncateKeepingTail(file, keepBytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const start = Math.max(0, size - keepBytes);
    const buf = Buffer.alloc(Math.min(keepBytes, size));
    fs.readSync(fd, buf, 0, buf.length, start);
    // Drop a partial first line so the file stays parseable line-by-line.
    const nl = buf.indexOf(0x0a);
    const tail = nl >= 0 && start > 0 ? buf.subarray(nl + 1) : buf;
    fs.writeFileSync(file, tail);
    return size - tail.length;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Apply every policy.
 *
 * @param {{brainDir: string, policies?: Policy[], dryRun?: boolean, now?: number}} opts
 * @returns {{freed_bytes: number, removed: number, dry_run: boolean, results: object[]}}
 */
export function pruneCaches({ brainDir, policies = DEFAULT_POLICIES, dryRun = false, now = Date.now() } = {}) {
  const results = [];
  let freed = 0;
  let removed = 0;

  for (const p of policies) {
    const dir = path.join(brainDir, p.dir);
    const res = { id: p.id, dir: p.dir, freed_bytes: 0, removed: 0, retained: 0, skipped: null };

    if (isProtected(brainDir, dir)) {
      // A policy pointing at protected data is a bug, and it must be loud
      // rather than silently doing nothing.
      res.skipped = `refused: ${p.dir} is protected`;
      results.push(res);
      continue;
    }

    const files = listFiles(dir, p.match);

    if (p.mode === 'size') {
      for (const f of files) {
        if (f.size <= p.limit) continue;
        if (dryRun) {
          res.freed_bytes += f.size - (p.keepBytes || 0);
        } else {
          try {
            res.freed_bytes += truncateKeepingTail(f.abs, p.keepBytes || p.limit);
          } catch (err) {
            res.skipped = `truncate failed: ${err.message}`;
          }
        }
      }
    } else if (p.mode === 'age') {
      const cutoff = now - p.limit * DAY_MS;
      const guard = typeof p.guard === 'function' ? p.guard(brainDir) : null;
      for (const f of files) {
        if (f.mtime >= cutoff) continue;
        if (guard && !guard(f)) { res.retained = (res.retained || 0) + 1; continue; }
        if (!dryRun) {
          try {
            fs.unlinkSync(f.abs);
          } catch {
            continue;
          }
        }
        res.freed_bytes += f.size;
        res.removed += 1;
      }
    } else if (p.mode === 'count') {
      const groups = new Map();
      for (const f of files) {
        const key = p.group ? stem(f.name) : f.name;
        const g = groups.get(key) || { mtime: 0, files: [] };
        g.mtime = Math.max(g.mtime, f.mtime);
        g.files.push(f);
        groups.set(key, g);
      }
      const ordered = [...groups.values()].sort((a, b) => b.mtime - a.mtime);
      for (const g of ordered.slice(p.limit)) {
        for (const f of g.files) {
          if (!dryRun) {
            try {
              fs.unlinkSync(f.abs);
            } catch {
              continue;
            }
          }
          res.freed_bytes += f.size;
          res.removed += 1;
        }
      }
    }

    freed += res.freed_bytes;
    removed += res.removed;
    results.push(res);
  }

  return { freed_bytes: freed, removed, dry_run: !!dryRun, results };
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

/**
 * Throttled entry point for callers on a hot loop.
 *
 * The daemon has no natural "once a day" tick, so the interval is tracked in a
 * marker file rather than in memory — a process that restarts every few minutes
 * would otherwise prune on every boot. Failing to read or write the marker is
 * never fatal: the worst case is pruning more often than intended, which is
 * cheap when there is nothing to prune.
 *
 * @param {{brainDir: string, minIntervalMs?: number, now?: number}} opts
 * @returns {null|object} null when skipped, otherwise the prune report
 */
export function maybePruneCaches({ brainDir, minIntervalMs = 6 * 60 * 60 * 1000, now = Date.now(), ...rest } = {}) {
  const marker = path.join(brainDir, 'scheduler', 'last-cache-prune.json');
  try {
    const last = JSON.parse(fs.readFileSync(marker, 'utf8'))?.at || 0;
    if (now - last < minIntervalMs) return null;
  } catch {
    /* no marker yet — first run */
  }
  const report = pruneCaches({ brainDir, now, ...rest });
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ at: now, freed_bytes: report.freed_bytes }));
  } catch {
    /* marker is an optimisation, not a requirement */
  }
  return report;
}
