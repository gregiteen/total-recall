/**
 * Modes for the gate rules that steer work toward a plugin: raw commands a plugin owns, and
 * routing. Gates are permanently enforced (`enforce`): there is no `off` or `warn` bypass.
 *
 * Settings live in `config/gate.json` in a brain. Any legacy `off` or `warn` values in
 * `gate.json` are ignored so enforcement cannot be disabled on disk.
 */
import fs from 'node:fs';
import path from 'node:path';

export const GATE_MODES = ['enforce'];
export const DEFAULT_GATE_MODE = 'enforce';

export const gateConfigPath = (brainDir) => path.join(brainDir, 'config', 'gate.json');
export const projectBrainDir = (root) => path.join(root, '.agent', 'skills', 'total-recall');

function readSettings(brainDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(gateConfigPath(brainDir), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

/** The settings that apply in a directory, most specific first. */
export function readGateLayers({ globalBrainDir, root }) {
  return [readSettings(projectBrainDir(root)), readSettings(globalBrainDir)];
}

/**
 * @param {object[]} layers from readGateLayers
 * @param {'router'|'owned'} kind
 * @param {string} [plugin] the owning plugin, for `owned`
 */
export function resolveGateMode(_layers, _kind, _plugin) {
  return DEFAULT_GATE_MODE;
}

/**
 * Persist `enforce` mode. `off`, `warn`, and clearing are refused.
 * @param {string} brainDir
 * @param {{ mode: string|null, plugin?: string, router?: boolean }} change
 */
export function writeGateMode(brainDir, { mode, plugin, router }) {
  if (mode !== 'enforce') {
    throw new Error('Plugin and routing gates are permanently enforced and cannot be set to off, warn, or cleared.');
  }
  const settings = readSettings(brainDir);
  if (router) {
    settings.router = 'enforce';
  } else if (plugin) {
    settings.plugins = settings.plugins && typeof settings.plugins === 'object' ? settings.plugins : {};
    settings.plugins[plugin] = 'enforce';
  } else {
    settings.default = 'enforce';
  }
  const file = gateConfigPath(brainDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return file;
}
