import fs from 'node:fs';
import path from 'node:path';
import { resolveSecretsPath, secretsPassword } from './secrets-gateway.mjs';
import { decryptSecretsSync } from './crypto.mjs';

/** Preserve verified ciphertext outside a brain before destructive teardown. */
export function preserveCredentials({ brainDir, destination }) {
  if (!brainDir || !destination) throw new Error('Explicit credential source and destination required');
  const source = resolveSecretsPath(brainDir);
  if (!fs.existsSync(source)) return { preserved: false, reason: 'no-store' };
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('Unsafe credential source');
  const bytes = fs.readFileSync(source);
  const password = secretsPassword();
  if (!password) throw new Error('Unlock auth before preserving credentials');
  const values = decryptSecretsSync(bytes, password); // Plaintext and corrupt stores are rejected.
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid credential payload');
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  if (fs.existsSync(destination)) {
    if (!fs.lstatSync(destination).isFile() || !fs.readFileSync(destination).equals(bytes)) throw new Error('Credential preservation destination conflict');
    fs.chmodSync(destination, 0o600);
  } else {
    fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
  }
  if (!fs.readFileSync(destination).equals(bytes)) throw new Error('Credential preservation verification failed');
  decryptSecretsSync(fs.readFileSync(destination), password);
  return { preserved: true, verified: true };
}
