/** Pure filesystem helpers. Importing these must not load auth or configuration. */
import fs from 'node:fs';

export function isSafeVaultName(name) {
  const value = String(name);
  return /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(value) && !value.includes('..');
}

export function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // A leftover copy is untracked and unignored, so a commit of everything would publish it.
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}
