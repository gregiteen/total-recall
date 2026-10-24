/** Pure filesystem helpers. Importing these must not load auth or configuration. */
import fs from 'node:fs';

export function isSafeVaultName(name) {
  const value = String(name);
  return /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(value) && !value.includes('..');
}

export function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}
