/**
 * macOS Keychain as a master-password carrier.
 *
 * `secrets-rekey` knows how to update file carriers — a LaunchAgent plist, an
 * env file — because it can stage, back up and atomically rename them. The
 * Keychain is not a file, so it was simply not a carrier at all. That is fine
 * right up until a shell profile reads the password from the Keychain, which is
 * the arrangement macOS installs steer people toward: a rekey then re-encrypts
 * the store, updates the carriers it knows about, and leaves the Keychain
 * holding the retired password. Every interactive shell breaks at once, with an
 * error — "Unsupported state or unable to authenticate data" — that describes
 * the symptom and not the cause.
 *
 * Portability: this module is macOS-only by nature and reports itself
 * unavailable everywhere else, so callers can treat it as optional.
 *
 * The password is passed to `security` on stdin, never in argv. Anything in
 * argv is visible to every process on the machine through `ps`.
 */

import { spawnSync } from 'node:child_process';

const SECURITY_BIN = '/usr/bin/security';

/**
 * Service name Total Recall stores its own master password under. A product
 * constant like the `TR_SECRETS_PASSWORD` variable name — not a device or user
 * detail — and overridable per invocation.
 */
export const DEFAULT_KEYCHAIN_SERVICE = 'total-recall-secrets';

/** Is the Keychain usable on this host? */
export function keychainAvailable({ platform = process.platform } = {}) {
  if (platform !== 'darwin') return false;
  const probe = spawnSync(SECURITY_BIN, ['help'], { encoding: 'utf8', timeout: 5_000 });
  return probe.status === 0 || probe.status === 1; // `help` exits non-zero on some releases
}

/**
 * Current password held for a service/account, or null when there is no entry.
 * The value is returned, never logged — callers compare it, they do not print it.
 */
export function readKeychainPassword({ service, account = process.env.USER }) {
  if (!service) throw new Error('Keychain carrier requires a service name');
  const res = spawnSync(
    SECURITY_BIN,
    ['find-generic-password', '-a', String(account), '-s', String(service), '-w'],
    { encoding: 'utf8', timeout: 10_000 },
  );
  if (res.status !== 0) return null;
  // `security` terminates the value with a newline that is not part of it.
  return (res.stdout || '').replace(/\n$/, '') || null;
}

/**
 * Create or replace the entry. `-U` updates in place when one already exists,
 * which keeps this idempotent and atomic for a single item.
 *
 * Omitting a value after `-w` makes `security` prompt for the password and read
 * it from stdin — twice, to confirm — which is how the secret is kept out of
 * argv.
 */
export function writeKeychainPassword({ service, account = process.env.USER, password }) {
  if (!service) throw new Error('Keychain carrier requires a service name');
  if (!password) throw new Error('Refusing to write an empty Keychain password');
  const res = spawnSync(
    SECURITY_BIN,
    ['add-generic-password', '-U', '-a', String(account), '-s', String(service), '-w'],
    { input: `${password}\n${password}\n`, encoding: 'utf8', timeout: 10_000 },
  );
  if (res.status !== 0) {
    // stderr may echo the prompt text but never the value itself.
    throw new Error(
      `Could not update Keychain entry ${service}: ${(res.stderr || '').trim().slice(0, 200) || `exit ${res.status}`}`,
    );
  }
  return true;
}

/** `{ service, account }` → a stable label for logs and results. */
export function describeKeychainCarrier(carrier) {
  return `keychain:${carrier.service}(${carrier.account || process.env.USER})`;
}
