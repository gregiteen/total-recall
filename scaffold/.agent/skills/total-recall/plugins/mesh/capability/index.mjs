/**
 * Mesh control-server capability: the developer's own Headscale, host-free.
 *
 * A project that vendors this brick provisions, updates and administers its
 * own control server without Total Recall. The caller supplies the target host,
 * and may inject the command runner (`exec`), the release lookups and the HTTP
 * transport; the defaults use only Node built-ins (`ssh` through
 * child_process, global `fetch`). Credentials are never read from a store or
 * the environment here: provisioning returns the new API key to the caller,
 * and the API client takes the key as an argument.
 */
import {
  meshTargetOf,
  sshExec,
  provisionHeadscale,
  updateHeadscale,
  installConsole,
  updateConsole,
} from './control-server.mjs';

export { meshTargetOf, sshExec, shellQuote, patchConfig, parseChecksum, consoleConfig } from './control-server.mjs';
export { createHeadscaleApi, buildMeshSshPolicy, assertSecureControlUrl, normalizeControlUrl } from './headscale-api.mjs';

/**
 * Bind the control-server lifecycle to one host.
 * @param {{ target: { name?: string, host: string, user: string, port?: number, domain: string },
 *   exec?: Function, fetchJson?: Function, fetchText?: Function, checkDns?: Function,
 *   log?: Function, wait?: Function }} options
 */
export function createControlServer({ target, exec, ...deps } = {}) {
  const resolved = meshTargetOf({ name: target?.name, ssh: { host: target?.host, user: target?.user, port: target?.port }, domain: target?.domain });
  if (!resolved) throw new Error('A control-server target needs a valid SSH host, SSH user and a public domain pointing at that host');
  const run = exec || sshExec(resolved);
  const shared = Object.fromEntries(Object.entries(deps).filter(([, v]) => v !== undefined));
  return {
    target: resolved,
    /** Install Headscale on a fresh Debian 12+/Ubuntu 22.04+ host; returns the control URL, API key and a 1-hour pre-auth key. */
    provision: (opts = {}) => provisionHeadscale(resolved, { ...shared, ...opts, exec: run }),
    /** Stage, trial, switch and roll back to the latest release; `checkOnly` reports without changing anything. */
    update: (opts = {}) => updateHeadscale(resolved, { ...shared, ...opts, exec: run }),
    /** Install the optional Headplane console, bound to loopback. */
    installConsole: (opts = {}) => installConsole(resolved, { ...shared, ...opts, exec: run }),
    /** Move the console to the latest release, restoring the previous image on failure. */
    updateConsole: (opts = {}) => updateConsole(resolved, { ...shared, ...opts, exec: run }),
  };
}
