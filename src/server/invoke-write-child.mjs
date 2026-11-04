/** Structured trusted mutation entrypoint. Never accepts executable code. */
import fs from 'node:fs';

// Node.js Permission Model disables fsync/fsyncSync APIs, so this child cannot
// flush its own writes. The unconfined parent flushes them before reporting
// success (invoke-durability.mjs); without that step these writes would not survive a crash.
if (fs.fsyncSync) {
  const origFsyncSync = fs.fsyncSync;
  fs.fsyncSync = (fd) => {
    try { return origFsyncSync(fd); }
    catch (err) {
      if (err.message && err.message.includes('fsync API is disabled when Permission Model is enabled')) return;
      throw err;
    }
  };
}
if (fs.fsync) {
  const origFsync = fs.fsync;
  fs.fsync = (fd, cb) => {
    origFsync(fd, (err) => {
      if (err && err.message && err.message.includes('fsync API is disabled when Permission Model is enabled')) return cb?.(null);
      return cb?.(err);
    });
  };
}

import { createConfinedFact } from '../core/confined-memory.mjs';

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 16384) throw new Error('Input limit');
  }
  const { brain, params, caller } = JSON.parse(input);
  try { process.stdout.write(JSON.stringify(await createConfinedFact(brain, params, caller))); }
  catch (err) {
    if (err.result) process.stdout.write(JSON.stringify(err.result));
    throw err;
  }
} catch {
  process.stderr.write('Confined fact creation did not complete; check committed/indexed status before retry.');
  process.exitCode = 1;
}
