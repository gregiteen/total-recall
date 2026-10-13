/**
 * Functional card contract. The host renders one card per plugin from these
 * declarations: what the plugin can do (commands with typed arguments and an
 * effect), what it needs (settings, credentials), and how to read its real
 * state (a status command). Everything here is optional; a plugin without it
 * still gets a card listing its commands and secrets.
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
export const CARD_TEMPLATES = ['console', 'ledger', 'monitor', 'inbox', 'dashboard', 'workbench', 'vault'];
export const CARD_WIDGETS = ['status', 'actions', 'table', 'detail', 'log', 'form', 'keypad', 'gauge', 'list', 'settings', 'credentials', 'activity', 'live'];
export const WIDGETS_NEEDING_SOURCE = ['table', 'detail', 'list', 'gauge', 'log'];
export const CARD_FONTS = ['system', 'inter', 'ibm-plex', 'space-grotesk', 'jetbrains-mono', 'dm-sans', 'outfit', 'fraunces', 'newsreader', 'chivo-mono'];
export const CARD_DENSITIES = ['compact', 'comfortable', 'spacious'];
export const CARD_RADII = ['none', 'sm', 'md', 'lg', 'pill'];
export const CARD_HEADERS = ['plain', 'ledger-rule', 'band', 'tab-strip', 'badge-left'];
export const CELL_FORMATS = ['text', 'number', 'money', 'date', 'datetime', 'bytes', 'percent', 'status'];
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
  validateLayout(manifest, names, errors);
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

function validateLayout(manifest, commandNames, errors) {
  const layout = manifest.card_layout;
  if (layout === undefined) return;
  if (!plain(layout)) { errors.push("'card_layout' must be an object"); return; }
  if (!CARD_TEMPLATES.includes(layout.template)) errors.push(`'card_layout.template' must be one of: ${CARD_TEMPLATES.join(', ')}`);
  if (!Array.isArray(layout.regions) || layout.regions.length === 0 || layout.regions.length > 12) {
    errors.push("'card_layout.regions' must be an array of 1 to 12 regions");
    return;
  }
  layout.regions.forEach((region, i) => {
    const where = `card_layout.regions[${i}]`;
    if (!plain(region)) { errors.push(`${where} must be an object`); return; }
    if (!CARD_WIDGETS.includes(region.widget)) { errors.push(`${where}.widget must be one of: ${CARD_WIDGETS.join(', ')}`); return; }
    if (WIDGETS_NEEDING_SOURCE.includes(region.widget)) {
      const cmd = region.source?.command;
      if (typeof cmd !== 'string' || !commandNames.has(cmd)) errors.push(`${where}.source.command must name a declared cli subcommand`);
    }
    if (region.widget === 'form' && !commandNames.has(region.command)) errors.push(`${where}.command must name a declared cli subcommand`);
    if (region.commands !== undefined) {
      if (!Array.isArray(region.commands) || region.commands.some((c) => !commandNames.has(c))) errors.push(`${where}.commands must list declared cli subcommands`);
    }
    if (region.columns !== undefined) {
      if (!Array.isArray(region.columns) || region.columns.length === 0) errors.push(`${where}.columns must be a non-empty array`);
      else region.columns.forEach((c, j) => {
        if (!plain(c) || typeof c.key !== 'string' || typeof c.label !== 'string') errors.push(`${where}.columns[${j}] needs key and label`);
        else if (c.format !== undefined && !CELL_FORMATS.includes(c.format)) errors.push(`${where}.columns[${j}].format must be one of: ${CELL_FORMATS.join(', ')}`);
      });
    }
    if (region.widget === 'table' && !Array.isArray(region.columns)) errors.push(`${where}.columns is required for a table`);
  });
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
