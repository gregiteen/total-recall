/**
 * Agent CLI sign-in, as an auth-plugin capability.
 *
 * Some agent CLIs authenticate on their own terminal — Antigravity (`agy`) prints a Google consent
 * URL and then blocks reading the authorization code. There was no way to do that through the auth
 * plugin, so it was being hand-rolled beside it and the code ended up nowhere.
 *
 * The pty lives in scripts/agent-login-pty.py, owned by this plugin, because Node has no built-in
 * pty and this plugin carries no pty library. This module is the plugin-facing surface: it resolves
 * the agent, runs the helper, relays its events, and reports a result the CLI can act on.
 *
 * It never claims success from the transcript alone — the helper re-runs the CLI's own login probe
 * and reports `ok` only when the session actually exists.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.join(HERE, '..', 'scripts', 'agent-login-pty.py');

/** Only the facts that differ between CLIs are declared. */
export const AGENT_LOGIN_PROFILES = {
  agy: {
    binary: 'agy',
    consentHost: 'accounts.google.com',
    probeArgs: 'models',
    signedOutPattern: 'please sign in',
    signIn: 'Run `agy` with no arguments, open the URL it prints, and approve with the Google account the agent should use.',
  },
};

export function agentLoginProfile(agent) {
  return AGENT_LOGIN_PROFILES[String(agent || '').trim().toLowerCase()];
}

/**
 * @param {object} options
 * @param {string} options.agent
 * @param {string} [options.code]      authorization code if already in hand
 * @param {string} [options.codeFile]  path polled for the code (unattended flows)
 * @param {string} [options.urlFile]   where to write the consent URL
 * @param {number} [options.timeoutMs]
 * @param {(event: object) => void} [options.onEvent]
 */
export async function loginAgent({ agent, code, codeFile, urlFile, timeoutMs = 900_000, onEvent = () => {} }) {
  const profile = agentLoginProfile(agent);
  if (!profile) {
    return {
      ok: false,
      agent,
      error: `No sign-in flow is defined for '${agent}'. Known agents: ${Object.keys(AGENT_LOGIN_PROFILES).join(', ') || '(none)'}.`,
    };
  }

  return new Promise((resolve) => {
    const args = [
      HELPER,
      '--agent', agent,
      '--binary', profile.binary,
      '--consent-host', profile.consentHost,
      '--probe-args', profile.probeArgs,
      '--signed-out-pattern', profile.signedOutPattern,
      '--timeout', String(Math.floor(timeoutMs / 1000)),
    ];
    if (code) args.push('--code', code);
    if (codeFile) args.push('--code-file', codeFile);
    if (urlFile) args.push('--url-file', urlFile);

    const child = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let url = '';
    let sawDone = false;
    let probe = null;
    let helperError = '';

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        onEvent(event);
        if (event.event === 'url') url = event.url || url;
        if (event.event === 'probe') probe = event.probe || probe;
        if (event.event === 'already_signed_in') probe = event.probe || probe;
        if (event.event === 'done') {
          sawDone = true;
          resolve({
            ok: Boolean(event.ok),
            agent,
            url,
            probe,
            alreadySignedIn: Boolean(probe && probe.signed_in),
            reason: event.reason,
            hint: event.ok ? undefined : profile.signIn,
          });
        }
      }
    });

    child.stderr.on('data', (chunk) => { helperError += chunk.toString(); });

    child.on('error', (error) => {
      resolve({ ok: false, agent, error: `Could not start the sign-in helper: ${error.message}` });
    });

    child.on('close', (code_) => {
      if (sawDone) return;
      resolve({
        ok: false,
        agent,
        url,
        probe,
        error: helperError.trim() || `The sign-in helper exited (${code_}) without reporting a result.`,
        hint: profile.signIn,
      });
    });
  });
}
