/** Cross-field validation for plugin manifests and their command contracts. */
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const COMMAND = /^[a-z][a-z0-9-]{0,63}$/;
const ARG_NAME = /^[a-z][a-zA-Z0-9]{0,63}$/;
const FLAG = /^--[a-z][a-z0-9-]{0,63}$/;
export const ARG_TYPES = ['string', 'number', 'boolean', 'choice'];
export const COMMAND_EFFECTS = ['read', 'write', 'destructive', 'send'];
export const OUTPUT_KINDS = ['json', 'text'];
export const TIERS = ['core', 'official', 'personal', 'community'];
export const LICENSE_CLASSES = ['open', 'closed'];
const BRAND_FONTS = ['system', 'inter', 'ibm-plex', 'space-grotesk', 'jetbrains-mono', 'dm-sans', 'outfit', 'fraunces', 'newsreader', 'chivo-mono'];
const BRAND_DENSITIES = ['compact', 'comfortable', 'spacious'];
const BRAND_RADII = ['none', 'sm', 'md', 'lg', 'pill'];
const BRAND_HEADERS = ['plain', 'ledger-rule', 'band', 'tab-strip', 'badge-left'];
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

export function validateManifestContract(manifest) {
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
      const terminalFlags = sub.terminal_only_args;
      if (sub.terminal_only !== undefined && typeof sub.terminal_only !== 'boolean') errors.push(`${where}.terminal_only must be a boolean`);
      if (terminalFlags !== undefined && (!Array.isArray(terminalFlags) ||
          terminalFlags.some(flag => typeof flag !== 'string' || !FLAG.test(flag)) ||
          new Set(terminalFlags).size !== terminalFlags.length)) {
        errors.push(`${where}.terminal_only_args must contain unique long flags`);
      }
      // The runner refuses anything outside this range, so a manifest that
      // declares it must fail validation rather than every call at run time.
      if (sub.timeout_ms !== undefined && (!Number.isInteger(sub.timeout_ms) || sub.timeout_ms < 1 || sub.timeout_ms > 600000)) errors.push(`${where}.timeout_ms must be an integer from 1 to 600000`);
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
  validatePresentation(manifest, errors, warnings);
  validateBranding(manifest.branding, errors, warnings);
  validateWorkspace(manifest.workspace, errors);
  if (Array.isArray(manifest.secrets)) {
    manifest.secrets.forEach((s, i) => {
      if (!plain(s) || typeof s.key !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(s.key)) errors.push(`secrets[${i}].key must be an uppercase identifier`);
    });
  }
  return { errors, warnings };
}

function validatePresentation(manifest, errors, warnings) {
  for (const field of ['card', 'card_face', 'card_layout']) {
    if (manifest[field] !== undefined) errors.push(`'${field}' is not supported: declare a native ui.home instead`);
  }
  const elements = manifest.ui?.elements;
  // A brick is distributed as capability code alone and has no UI.
  if (manifest.brick === true) {
    validateCapability(manifest, errors);
    if (manifest.ui !== undefined && Array.isArray(elements) && elements.length > 0) {
      errors.push("a brick ships without UI: remove 'ui.elements' or drop 'brick: true'");
    }
    return;
  }
  if (manifest.capability !== undefined) validateCapability(manifest, errors);
  if (manifest.ui?.home !== undefined) return;
  if (manifest.scaffold === true) warnings.push("Scaffold needs an owner-authored 'ui.home' and DESIGN.md before shipping");
  else errors.push("A plugin must declare a native 'ui.home'");
}

/**
 * `capability {entry, exports}` names the host-free module a project vendors:
 * a relative path inside the plugin, and the exported names it promises.
 */
function validateCapability(manifest, errors) {
  const cap = manifest.capability;
  if (!plain(cap)) { errors.push("'capability' must declare {entry, exports}"); return; }
  const entry = cap.entry;
  if (typeof entry !== 'string' || !/^[A-Za-z0-9._\/-]{1,200}\.m?js$/.test(entry) || entry.startsWith('/') || entry.split('/').includes('..')) {
    errors.push("capability.entry must be a relative .js or .mjs path inside the plugin");
  } else if (entry.split('/')[0] === 'ui') {
    errors.push('capability.entry must not live under ui/: a brick contains no UI');
  }
  if (!Array.isArray(cap.exports) || cap.exports.length === 0 || cap.exports.some((n) => typeof n !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(n))) {
    errors.push('capability.exports must be a non-empty array of export names');
  }
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
  const enums = { font: BRAND_FONTS, density: BRAND_DENSITIES, radius: BRAND_RADII, header: BRAND_HEADERS };
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
