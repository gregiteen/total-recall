/**
 * Functional card contract. A plugin's card face is its own bespoke Web
 * Component, declared as a `ui.elements[]` entry of kind `card`. There is no
 * template: no shared layout, no widget vocabulary, no allowlist of shapes.
 * Core validates that the face exists and that the commands behind it are
 * declared; it never dictates how the face is arranged.
 */
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const COMMAND = /^[a-z][a-z0-9-]{0,63}$/;
const ARG_NAME = /^[a-z][a-zA-Z0-9]{0,63}$/;
const FLAG = /^--[a-z][a-z0-9-]{0,63}$/;
export const ARG_TYPES = ['string', 'number', 'boolean', 'choice'];
export const COMMAND_EFFECTS = ['read', 'write', 'destructive', 'send'];
export const OUTPUT_KINDS = ['json', 'text'];
export const TIERS = ['core', 'official', 'personal', 'community'];
export const LICENSE_CLASSES = ['open', 'closed'];
const STATUS_STATES = ['ok', 'warn', 'error', 'unknown'];
export const CARD_FONTS = ['system', 'inter', 'ibm-plex', 'space-grotesk', 'jetbrains-mono', 'dm-sans', 'outfit', 'fraunces', 'newsreader', 'chivo-mono'];
export const CARD_DENSITIES = ['compact', 'comfortable', 'spacious'];
export const CARD_RADII = ['none', 'sm', 'md', 'lg', 'pill'];
export const CARD_HEADERS = ['plain', 'ledger-rule', 'band', 'tab-strip', 'badge-left'];
export const WORKSPACE_PERMISSIONS = ['microphone', 'camera', 'notifications'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function validateArg(arg, where, errors) {
  if (!plain(arg)) { errors.push(`${where} must be an object`); return; }
  if (typeof arg.name !== 'string' || !ARG_NAME.test(arg.name)) errors.push(`${where}.name must be camelCase`);
  if (!ARG_TYPES.includes(arg.type)) errors.push(`${where}.type must be one of: ${ARG_TYPES.join(', ')}`);
  if (arg.flag !== undefined && !FLAG.test(arg.flag)) errors.push(`${where}.flag must look like --flag-name`);
  if (arg.flag === undefined && arg.positional !== true && arg.secret !== true) errors.push(`${where} needs a flag or positional: true`);
  if (typeof arg.label !== 'string' || !arg.label.trim()) errors.push(`${where}.label is required`);
  if (arg.type === 'choice' && (!Array.isArray(arg.options) || arg.options.length === 0)) errors.push(`${where}.options is required for a choice`);
  if (arg.required !== undefined && typeof arg.required !== 'boolean') errors.push(`${where}.required must be a boolean`);
  if (arg.secret !== undefined && typeof arg.secret !== 'boolean') errors.push(`${where}.secret must be a boolean`);
  if (arg.secret === true && arg.flag !== undefined) errors.push(`${where}: a secret argument is passed on stdin, not as a flag`);
  if (arg.secret === true && arg.type !== 'string') errors.push(`${where}: a secret stdin argument must be a string`);
}

export function validateCardContract(manifest) {
  const errors = [];
  const warnings = [];
  const subs = manifest.cli?.subcommands;
  const names = new Set();
  if (Array.isArray(subs)) {
    subs.forEach((sub, i) => {
      const where = `cli.subcommands[${i}]`;
      if (!plain(sub)) { errors.push(`${where} must be an object`); return; }
      if (typeof sub.name !== 'string' || !COMMAND.test(sub.name)) errors.push(`${where}.name must be lowercase kebab-case`);
      else if (names.has(sub.name)) errors.push(`${where}: duplicate command '${sub.name}'`);
      else names.add(sub.name);
      if (sub.effect !== undefined && !COMMAND_EFFECTS.includes(sub.effect)) errors.push(`${where}.effect must be one of: ${COMMAND_EFFECTS.join(', ')}`);
      if (sub.output !== undefined && !OUTPUT_KINDS.includes(sub.output)) errors.push(`${where}.output must be one of: ${OUTPUT_KINDS.join(', ')}`);
      if (sub.args !== undefined) {
        if (!Array.isArray(sub.args)) errors.push(`${where}.args must be an array`);
        else {
          const seen = new Set();
          sub.args.forEach((arg, j) => {
            validateArg(arg, `${where}.args[${j}]`, errors);
            if (plain(arg) && seen.has(arg.name)) errors.push(`${where}.args[${j}]: duplicate argument '${arg.name}'`);
            if (plain(arg)) seen.add(arg.name);
          });
          if (sub.args.filter(arg => plain(arg) && arg.secret === true).length > 1) errors.push(`${where}: only one secret stdin argument is supported`);
        }
      }
    });
  }
  if (manifest.status !== undefined) {
    if (!plain(manifest.status)) errors.push("'status' must be an object");
    else {
      if (typeof manifest.status.command !== 'string' || !names.has(manifest.status.command)) errors.push("'status.command' must name a declared cli subcommand");
      else {
        const sub = subs.find((s) => s.name === manifest.status.command);
        if (sub.effect && sub.effect !== 'read') errors.push("'status.command' must be a read command");
      }
      const r = manifest.status.refresh_seconds;
      if (r !== undefined && (!Number.isInteger(r) || r < 5 || r > 86400)) errors.push("'status.refresh_seconds' must be an integer from 5 to 86400");
    }
  }
  if (manifest.distribution !== undefined) {
    if (!plain(manifest.distribution)) errors.push("'distribution' must be an object");
    else {
      if (!TIERS.includes(manifest.distribution.tier)) errors.push(`'distribution.tier' must be one of: ${TIERS.join(', ')}`);
      if (!LICENSE_CLASSES.includes(manifest.distribution.license)) errors.push(`'distribution.license' must be one of: ${LICENSE_CLASSES.join(', ')}`);
    }
  }
  validateCardFace(manifest, errors);
  validateBranding(manifest.branding, errors, warnings);
  validateWorkspace(manifest.workspace, errors);
  if (Array.isArray(manifest.secrets)) {
    manifest.secrets.forEach((s, i) => {
      if (!plain(s) || typeof s.key !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(s.key)) errors.push(`secrets[${i}].key must be an uppercase identifier`);
    });
  }
  if (plain(manifest.card_face) && Array.isArray(manifest.card_face.metrics)) {
    warnings.push("card_face.metrics are fixed text and cannot reflect real state; declare a 'status' command instead");
  }
  return { errors, warnings, states: STATUS_STATES };
}

/**
 * Every plugin has a card face: bespoke owner code, declared once in
 * ui.elements[]. A plugin without one is incomplete, and a plugin that declares
 * a shared template is invalid.
 *
 * The *scaffold* emitted by `plugin create` deliberately contains no card: a
 * face is authored by hand once the plugin's function is understood. The
 * scaffold is therefore not yet a valid plugin, and says so.
 */
function validateCardFace(manifest, errors) {
  if (manifest.card_layout !== undefined) {
    errors.push("'card_layout' is not supported: a card face is bespoke owner code in ui.elements[], never a shared template");
  }
  const elements = manifest.ui?.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    errors.push("'ui.elements' must declare the plugin's card face; every plugin has one, authored by hand");
    return;
  }
  // Panels (token entry, settings drawers) are secondary screens of the plugin, not card faces.
  const faces = elements.filter((element) => plain(element) && element.kind === 'card');
  if (faces.length === 0) errors.push("'ui.elements' must declare an element of kind 'card'");
  if (faces.length > 1) errors.push("'ui.elements' must declare exactly one card face");
}

function validateBranding(branding, errors, warnings) {
  if (branding === undefined) return;
  if (!plain(branding)) { errors.push("'branding' must be an object"); return; }
  for (const key of ['color', 'accent']) {
    if (branding[key] !== undefined && !HEX.test(branding[key])) errors.push(`branding.${key} must be a #rrggbb color`);
  }
  if (branding.logo !== undefined) {
    const logo = branding.logo;
    if (typeof logo !== 'string' || !/^[A-Za-z0-9._\/-]{1,200}\.(svg|png)$/.test(logo) || logo.startsWith('/') || logo.split('/').includes('..')) {
      errors.push('branding.logo must be a relative .svg or .png path inside the plugin');
    }
  }
  if (branding.provider !== undefined) {
    const p = branding.provider;
    if (!plain(p) || typeof p.name !== 'string' || !p.name.trim()) errors.push('branding.provider needs a name');
    else if (p.url !== undefined && !/^https:\/\/[^\s]+$/.test(p.url)) errors.push('branding.provider.url must be an https URL');
  }
  if (branding.icon !== undefined) {
    warnings.push('branding.icon is deprecated: show the real logo with branding.logo instead of an emoji or generic icon');
  }
  const enums = { font: CARD_FONTS, density: CARD_DENSITIES, radius: CARD_RADII, header: CARD_HEADERS };
  for (const [key, allowed] of Object.entries(enums)) {
    const value = branding[key];
    if (value === undefined || allowed.includes(value)) continue;
    // Earlier manifests carried a raw CSS font stack. Tolerated with a warning until migrated.
    if (key === 'font' && typeof value === 'string' && /[,'"]/.test(value)) {
      warnings.push(`branding.font is a raw CSS stack; use one of: ${allowed.join(', ')}`);
      continue;
    }
    errors.push(`branding.${key} must be one of: ${allowed.join(', ')}`);
  }
}

function validateWorkspace(workspace, errors) {
  if (workspace === undefined) return;
  if (!plain(workspace)) { errors.push("'workspace' must be an object"); return; }
  if (workspace.component !== undefined && (typeof workspace.component !== 'string' || !workspace.component.trim())) {
    errors.push("'workspace.component' must be a non-empty string");
  }
  if (workspace.tabs !== undefined) {
    if (!Array.isArray(workspace.tabs) || workspace.tabs.some((t) => typeof t !== 'string' || !t.trim())) {
      errors.push("'workspace.tabs' must be an array of non-empty strings");
    }
  }
  if (workspace.permissions !== undefined) {
    if (!Array.isArray(workspace.permissions) || workspace.permissions.some((p) => !WORKSPACE_PERMISSIONS.includes(p))) {
      errors.push(`'workspace.permissions' must be an array of permission strings from: ${WORKSPACE_PERMISSIONS.join(', ')}`);
    }
  }
}
