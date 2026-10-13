import fs from 'node:fs';

export const MAX_STDIN_BYTES = 1024 * 1024;

/**
 * Read all of fd 0 synchronously. A pipe inherited from a parent Node process can be
 * non-blocking, and then readFileSync(0) throws EAGAIN when the producer has not
 * written yet (for example `secret get … | secret set … --stdin`, where the first
 * command is still unlocking the store). Wait and retry instead of failing.
 */
export function readAllStdinSync({ fd = 0, maxBytes = MAX_STDIN_BYTES } = {}) {
  const chunks = [];
  let total = 0;
  const buf = Buffer.alloc(64 * 1024);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    let n;
    try {
      n = fs.readSync(fd, buf, 0, buf.length, null);
    } catch (err) {
      if (err.code === 'EAGAIN') { Atomics.wait(pause, 0, 0, 10); continue; }
      if (err.code === 'EOF') break;
      throw err;
    }
    if (n === 0) break;
    total += n;
    if (total > maxBytes) throw new Error(`stdin value exceeds ${maxBytes} bytes`);
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}
