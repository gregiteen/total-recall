/**
 * The deploy wizard's "connect IDEs + relay" step. The backend token is stored by the Auth
 * owner, bound to the backend URL, before anything uses it. Child processes get it on stdin,
 * never argv, and the relay's brain.json keeps only public settings. Every failure is reported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeFileSecure } from '../core/secure-file.mjs';

const IDE_CLIENTS = {
  'claude-code': { client: 'claude-code', label: 'Claude Code' },
  'codex': { client: 'codex', label: 'Codex' },
  'cursor': { client: 'cursor', label: 'Cursor' },
  'antigravity': { client: 'antigravity', label: 'Antigravity' },
  'vscode': { client: 'vscode', label: 'VS Code Copilot' },
  'gemini': { client: 'gemini', label: 'Gemini CLI' },
  'pi': { client: 'pi', label: 'Pi Coding Agent' },
  'hermes': { client: 'hermes', label: 'Hermes Agent' },
  'hermes-agent': { client: 'hermes-agent', label: 'Hermes Agent' },
  'dsh': { client: 'dsh', label: 'DeepSeek Harness (dsh)' },
  'deepseek-harness': { client: 'deepseek-harness', label: 'DeepSeek Harness' },
  'openclaw': { client: 'openclaw', label: 'OpenClaw' },
};

const lastLine = r => (r.stderr || r.stdout || '').trim().split('\n').pop() || 'failed';

/**
 * @param {{ ides?: string[], installRelay?: boolean, installObsidian?: boolean, brainUrl?: string, token?: string }} request
 * @param {{ spawnSync: Function, nodeBin: string, scriptPath: string, loadAuthConfiguration: () => Promise<object>,
 *   authBrainDir: () => string, relayConfigDir: () => string }} deps
 */
export async function runConnectIdes({ ides = [], installRelay = true, installObsidian = false, brainUrl, token } = {}, deps) {
  const { spawnSync, nodeBin, scriptPath } = deps;
  const results = [];
  let relayResult = null;
  let obsidianResult = null;
  let owner = null;

  if (token) {
    // Store first: nothing may use a token that Auth did not keep.
    try {
      if (typeof token !== 'string' || !token.trim()) throw new Error('empty token');
      owner = await deps.loadAuthConfiguration();
      await owner.saveConnectionToken({ brainDir: await deps.authBrainDir(), url: brainUrl, token, actor: 'deploy-wizard' });
    } catch {
      const message = 'The connection token was not stored by Auth (it needs an http(s) backend URL and an unlocked Auth store); nothing was connected.';
      return { ok: false, results: [{ label: 'Auth credential', ok: false, message }],
        relayResult: installRelay ? { ok: false, message: 'Skipped: the connection token was not stored.' } : null,
        obsidianResult: installObsidian ? { ok: false, message: 'Skipped: the connection token was not stored.' } : null };
    }
  }

  for (const ide of ides) {
    const mapping = IDE_CLIENTS[ide];
    if (!mapping) { results.push({ label: ide, ok: false, message: 'Unknown IDE' }); continue; }
    const args = ['connect', mapping.client];
    if (brainUrl) args.push('--brain', brainUrl);
    // The token travels on stdin only; argv shows in the process list.
    if (token) args.push('--token-stdin');
    args.push('--force');
    try {
      const r = spawnSync(nodeBin, [scriptPath, ...args], { encoding: 'utf8', timeout: 30000, input: token ? `${token}\n` : undefined });
      if (r.status === 0) results.push({ label: mapping.label, ok: true, message: 'Connected' });
      else { const err = lastLine(r); results.push({ label: mapping.label, ok: false, skipped: err.includes('exists'), message: err }); }
    } catch (e) {
      results.push({ label: mapping.label, ok: false, message: e.message });
    }
  }

  if (installRelay) {
    try {
      if (brainUrl) {
        // Public settings only; the relay reads its token from Auth at run time.
        const file = path.join(await deps.relayConfigDir(), 'brain.json');
        let existing = {};
        if (fs.existsSync(file)) {
          try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('The existing relay brain.json is not valid JSON; it was not changed.'); }
          if (!existing || typeof existing !== 'object' || Array.isArray(existing)) throw new Error('The existing relay brain.json is not an object; it was not changed.');
          // Only an existing file can hold a legacy token; Auth owns reading that format.
          try { owner = owner || await deps.loadAuthConfiguration(); owner.assertLegacyTokenNotRebound({ file, url: brainUrl }); }
          catch (err) { throw new Error(/legacy token/.test(String(err?.message)) ? 'The relay brain.json holds a legacy token for its current endpoint; clear it before changing the endpoint.' : 'Auth configuration is unavailable; the relay config was not changed.'); }
        }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        writeFileSecure(file, JSON.stringify({ ...existing, url: brainUrl }, null, 2), { encoding: 'utf8', mode: 0o600 });
      }
      const rr = spawnSync(nodeBin, [scriptPath, 'relay', 'install'], { encoding: 'utf8', timeout: 30000 });
      relayResult = { ok: rr.status === 0, message: rr.status === 0 ? 'Installed as system service (starts on boot)' : lastLine(rr) };
    } catch (e) {
      relayResult = { ok: false, message: e.message };
    }
  }

  if (installObsidian) {
    try {
      const obsArgs = [scriptPath, 'connect', 'obsidian'];
      if (brainUrl) obsArgs.push('--brain', brainUrl);
      obsArgs.push('--force');
      const or = spawnSync(nodeBin, obsArgs, { encoding: 'utf8', timeout: 30000 });
      obsidianResult = { ok: or.status === 0, message: or.status === 0 ? 'Vault sync configured' : lastLine(or) };
    } catch (e) {
      obsidianResult = { ok: false, message: e.message };
    }
  }

  const ok = results.every(r => r.ok || r.skipped) && relayResult?.ok !== false && obsidianResult?.ok !== false;
  return { ok, results, relayResult, obsidianResult };
}
