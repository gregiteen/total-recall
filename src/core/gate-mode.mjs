/**
 * Modes for the gate rules that steer work toward a plugin: raw commands a plugin owns, and
 * routing. `off` does nothing, `warn` lets the call run and tells the agent, `enforce` blocks.
 * The preflight receipt is not one of these rules and has no mode.
 *
 * Settings live in `config/gate.json` in a brain:
 *   { "default": "warn", "router": "enforce", "plugins": { "git": "enforce" } }
 * The repository's brain wins over the machine's. This runs on every tool call, so it reads the
 * files directly, and an unreadable file or unknown value counts as unset: a bad settings file
 * must never be what blocks work.
 */
import fs from 'node:fs';
import path from 'node:path';

export const GATE_MODES = ['off', 'warn', 'enforce'];
export const DEFAULT_GATE_MODE = 'warn';

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

const known = (value) => (GATE_MODES.includes(value) ? value : undefined);

/**
 * @param {object[]} layers from readGateLayers
 * @param {'router'|'owned'} kind
 * @param {string} [plugin] the owning plugin, for `owned`
 */
export function resolveGateMode(layers, kind, plugin) {
  for (const layer of layers) {
    const specific = kind === 'router' ? known(layer.router) : known(layer.plugins?.[plugin]);
    const mode = specific ?? known(layer.default);
    if (mode) return mode;
  }
  return DEFAULT_GATE_MODE;
}

/**
 * Change one setting and leave the others alone. A `mode` of null removes the setting, so
 * that level follows the next layer again.
 * @param {string} brainDir
 * @param {{ mode: string|null, plugin?: string, router?: boolean }} change
 */
export function writeGateMode(brainDir, { mode, plugin, router }) {
  const settings = readSettings(brainDir);
  if (router) {
    if (mode === null) delete settings.router; else settings.router = mode;
  } else if (plugin) {
    settings.plugins = settings.plugins && typeof settings.plugins === 'object' ? settings.plugins : {};
    if (mode === null) delete settings.plugins[plugin]; else settings.plugins[plugin] = mode;
  } else if (mode === null) {
    delete settings.default;
  } else {
    settings.default = mode;
  }
  const file = gateConfigPath(brainDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return file;
}
