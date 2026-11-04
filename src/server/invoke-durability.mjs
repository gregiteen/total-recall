/**
 * The restricted write child runs under Node's permission model, which disables
 * fsync. Durability is therefore the unconfined parent's job: before a write is
 * reported as successful, it flushes every file the child changed and the
 * directories that hold them.
 */
import fs from 'node:fs';
import path from 'node:path';

// File timestamps can round down, so a change made at the start of the run still counts.
const MTIME_SLACK_MS = 2000;

function flush(target) {
  const fd = fs.openSync(target, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

/** Flush files under `roots` modified since `sinceMs`, then their directories, and return how many files were flushed. */
export function syncChangedFiles(roots, sinceMs) {
  let files = 0;
  const walk = dir => {
    let changed = false;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(target)) changed = true;
      } else if (entry.isFile() && fs.statSync(target).mtimeMs >= sinceMs - MTIME_SLACK_MS) {
        flush(target);
        files++;
        changed = true;
      }
    }
    if (changed) flush(dir);
    return changed;
  };
  for (const root of roots) if (fs.existsSync(root)) walk(root);
  return files;
}
