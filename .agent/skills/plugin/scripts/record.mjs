#!/usr/bin/env node
/**
 * record.mjs — the plugin creator's verification battery.
 *
 * Runs the checks the recipe asks for, against a plugin repository. Exits
 * non-zero on any failure and prints the real reason. Nothing here trusts a
 * declaration: every check reads the actual files or runs the actual command.
 *
 *   node record.mjs <pluginDir> [--manifest|--card|--secrets|--scaffold|--json]
 *
 * Checks are marked PASS, FAIL or WARN. A WARN is a judgement call the agent
 * must resolve; a FAIL is a rejection.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const json = args.includes('--json');
const only = ['--manifest', '--card', '--secrets', '--scaffold'].filter((f) => args.includes(f));
const root = path.resolve(args.find((a) => !a.startsWith('-')) || '.');
const want = (section) => only.length === 0 || only.includes(section);

const results = [];
const record = (section, level, check, detail) => results.push({ section, level, check, detail });

/* ── helpers ─────────────────────────────────────────────────────────────── */

const read = (rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
};
const exists = (rel) => fs.existsSync(path.join(root, rel));

/** Files the plugin owns, excluding dependencies and the brain. */
function walk(dir, out = [], base = root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'bricks'].includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(abs, out, base);
    else out.push(path.relative(base, abs));
  }
  return out;
}

/* ── manifest ────────────────────────────────────────────────────────────── */

let manifest = null;
if (want('--manifest')) {
  const file = path.join(root, 'plugin.json');
  if (!fs.existsSync(file)) {
    record('manifest', 'FAIL', 'plugin.json exists', 'no plugin.json in ' + root);
  } else {
    try {
      manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      record('manifest', 'PASS', 'plugin.json parses', `${manifest.id} v${manifest.version}`);
    } catch (err) {
      record('manifest', 'FAIL', 'plugin.json parses', err.message);
    }
  }
}

// Validate with the real contract when this skill is inside a Total Recall checkout.
if (manifest) {
  const loaderPath = path.resolve(import.meta.dirname, '../../../../src/core/plugin-loader.mjs');
  if (fs.existsSync(loaderPath)) {
    try {
      const { validatePluginManifest } = await import(pathToFileURL(loaderPath).href);
      const v = validatePluginManifest(manifest);
      for (const e of v.errors || []) record('manifest', 'FAIL', 'contract', e);
      for (const w of v.warnings || []) record('manifest', 'WARN', 'contract', w);
      if (!(v.errors || []).length && !(v.warnings || []).length) {
        record('manifest', 'PASS', 'contract', 'no errors, no warnings');
      }
    } catch (err) {
      record('manifest', 'WARN', 'contract', `validator unavailable: ${err.message}`);
    }
  } else {
    record('manifest', 'WARN', 'contract', 'validator not found; structural checks only');
  }

  // Card declaration
  const elements = manifest.ui?.elements || [];
  // One face (kind 'card') plus any number of screens (kind 'panel'); a panel is never the face.
  const faces = elements.filter((e) => e && e.kind === 'card');
  if (manifest.card_layout !== undefined) {
    record('manifest', 'FAIL', 'no template', "'card_layout' is declared; a face is bespoke owner code");
  } else {
    record('manifest', 'PASS', 'no template', 'no card_layout');
  }
  if (faces.length === 0) {
    record('manifest', 'FAIL', 'card declared', 'every plugin has a card; ui.elements declares none');
  } else if (faces.length > 1) {
    record('manifest', 'FAIL', 'card declared', `${faces.length} faces declared; exactly one is allowed`);
  } else {
    const face = faces[0];
    record('manifest', 'PASS', 'card declared', `<${face.tag}> → ${face.module}`);
    if (!exists(face.module)) record('manifest', 'FAIL', 'card module resolves', `${face.module} does not exist`);
    else record('manifest', 'PASS', 'card module resolves', face.module);
  }

  // Declared effects and typed arguments on the CLI surface.
  for (const sub of manifest.cli?.subcommands || []) {
    if (!['read', 'write', 'destructive', 'send'].includes(sub.effect)) {
      record('manifest', 'FAIL', 'effect declared', `'${sub.name}' has no valid effect`);
    }
    for (const arg of sub.args || []) {
      if (arg.secret === true && arg.flag !== undefined) {
        record('manifest', 'FAIL', 'secret over stdin', `'${sub.name}.${arg.name}' is secret but carries a flag`);
      }
    }
  }

  // Status must bind to a real read command.
  const status = manifest.status;
  if (status?.command) {
    const sub = (manifest.cli?.subcommands || []).find((s) => s.name === status.command);
    if (!sub) record('manifest', 'FAIL', 'status binds', `status.command '${status.command}' is not declared`);
    else if (sub.effect && sub.effect !== 'read') record('manifest', 'FAIL', 'status binds', `status.command '${status.command}' is not a read`);
    else record('manifest', 'PASS', 'status binds', status.command);
  }
}

/* ── card ────────────────────────────────────────────────────────────────── */

if (want('--card') && manifest) {
  const face = (manifest.ui?.elements || []).find((e) => e && e.kind === 'card');
  const src = face ? read(face.module) : '';
  if (!src) {
    record('card', 'FAIL', 'card source readable', 'no card module to read');
  } else {
    const lines = src.split('\n');

    // A credential must never be collectable from the face.
    if (/type\s*=\s*["']password["']/.test(src) || /input\.type\s*=\s*["']password["']/.test(src)) {
      record('card', 'FAIL', 'never collects a credential', 'a password input exists in the card');
    } else {
      record('card', 'PASS', 'never collects a credential', 'no password input');
    }
    if (/save-token|dispatchEvent\(\s*new CustomEvent\(\s*["']save-/.test(src)) {
      record('card', 'FAIL', 'never transmits a credential', 'the card dispatches a credential event');
    } else {
      record('card', 'PASS', 'never transmits a credential', 'no credential event');
    }

    // Seeded values: a literal that looks like a reading, not a read of one.
    // Each pattern requires an actual literal (a digit or a quoted string), so
    // a ternary such as `? h.loadAvg : []` is not mistaken for a seed.
    const seedPatterns = [
      [/\bthis\.(sample|reading|status|telemetry|gateway|data)\s*=\s*\{[^}]*\b(hostname|loadAvg|usedPercent|uptimeSeconds)\b/s, 'a seeded reading object'],
      [/hostname\s*:\s*["'][^"']+["']/, 'a literal hostname'],
      [/usedPercent\s*:\s*\d/, 'a literal usedPercent'],
      [/loadAvg\s*:\s*\[\s*\d/, 'a literal load average'],
      [/\bvalue\s*=\s*["']\d+(\.\d+)?["']/, 'a seeded input value'],
    ];
    let seeded = [];
    for (const [re, what] of seedPatterns) if (re.test(src)) seeded.push(what);
    if (seeded.length) record('card', 'FAIL', 'no seeded values', seeded.join('; '));
    else record('card', 'PASS', 'no seeded values', 'no literal reading found');

    // A reassuring default is a *fallback* for an unknown — `x || 'Up to date'`
    // or `x ?? 'Synced'`. The same word chosen by a ternary between two honest
    // labels (`ok ? 'Connected' : 'Unconfigured'`) is not a default, so only a
    // fallback position is flagged.
    const reassuringWords = ['Up to date', 'Synced', 'Repository Active', 'ONLINE', 'Healthy', 'Connected', 'All good', 'OK'];
    const reassuranceFallbacks = [];
    for (const word of reassuringWords) {
      for (const quote of ["'", '"']) {
        const literal = `${quote}${word}${quote}`;
        const index = src.indexOf(literal);
        if (index === -1) continue;
        // Look back for the operator that makes it a default.
        const before = src.slice(Math.max(0, index - 40), index);
        if (/\|\||\?\?\s*$/.test(before) || /\?\?\s*$/.test(src.slice(Math.max(0, index - 6), index))) {
          reassuranceFallbacks.push(word);
          break;
        }
        // A default inside a catch branch is a fallback too.
        const sinceCatch = src.slice(src.lastIndexOf('catch', index) === -1 ? 0 : src.lastIndexOf('catch', index), index);
        if (src.lastIndexOf('catch', index) !== -1 && sinceCatch.length < 200 && !/}\s*(else|finally)/.test(sinceCatch)) {
          reassuranceFallbacks.push(`${word} (in a catch)`);
          break;
        }
      }
    }
    if (reassuranceFallbacks.length) record('card', 'FAIL', 'no reassuring default', reassuranceFallbacks.join(', '));
    else record('card', 'PASS', 'no reassuring default', 'none found');

    // Randomness is how fabricated ids appear.
    if (/Math\.random\(/.test(src)) record('card', 'FAIL', 'no invented identifiers', 'Math.random in the card');
    else record('card', 'PASS', 'no invented identifiers', 'no Math.random');

    // Every read must go through the host, and failures must be states.
    if (!/host\.run|this\.host/.test(src)) {
      record('card', 'WARN', 'reads through the host', 'no host.run reference; does it render real data?');
    } else {
      record('card', 'PASS', 'reads through the host', 'host.run is used');
    }
    if (!/catch/.test(src)) record('card', 'WARN', 'failures are states', 'no catch; can the card show a failed read?');
    else record('card', 'PASS', 'failures are states', 'a catch exists');

    // A timer left running after disconnect.
    if (/setInterval/.test(src) && !/disconnectedCallback/.test(src)) {
      record('card', 'FAIL', 'timers cleared', 'setInterval without disconnectedCallback');
    } else {
      record('card', 'PASS', 'timers cleared', 'no leaked interval');
    }

    // Raw hex outside a token block suggests a hard-coded palette.
    const hex = [...src.matchAll(/#[0-9a-fA-F]{6}\b/g)];
    const tokenBlockHex = (src.match(/--face-[a-z-]+:\s*#[0-9a-fA-F]{3,8}/g) || []).length;
    if (hex.length - tokenBlockHex > 6) {
      record('card', 'WARN', 'tokens only', `${hex.length - tokenBlockHex} raw hex values outside token declarations`);
    } else {
      record('card', 'PASS', 'tokens only', 'colour is declared as tokens');
    }

    // The host's tokens must actually be used.
    for (const token of ['--text-primary', '--border']) {
      if (!src.includes(token)) record('card', 'WARN', 'host tokens used', `${token} is not referenced; the face may not adapt to the dashboard`);
    }

    // Accessibility floor.
    if (!/min-height:\s*(4[4-9]|[5-9]\d)px/.test(src)) {
      record('card', 'WARN', 'touch targets', 'no control declares a >=44px minimum height');
    } else {
      record('card', 'PASS', 'touch targets', 'controls reach 44px');
    }
    if (!/prefers-reduced-motion/.test(src)) {
      record('card', 'WARN', 'reduced motion', 'prefers-reduced-motion is not respected');
    } else {
      record('card', 'PASS', 'reduced motion', 'respected');
    }
  }
}

/* ── secrets ─────────────────────────────────────────────────────────────── */

if (want('--secrets') && manifest) {
  const files = walk(root).filter((f) => /\.(mjs|js)$/.test(f));

  // A declared credential must not be read from the ambient environment.
  for (const secret of manifest.secrets || []) {
    const key = secret.key;
    let envRead = null;
    for (const f of files) {
      if (f.startsWith('test/')) continue;
      const src = read(f);
      if (new RegExp(`process\\.env(\\.${key}|\\[\\s*["']${key}["']\\s*\\])`).test(src)) { envRead = f; break; }
    }
    if (envRead) record('secrets', 'FAIL', 'declared secret is not ambient', `${key} read from process.env in ${envRead}`);
    else record('secrets', 'PASS', 'declared secret is not ambient', key);
  }

  // The card may name a credential's identifier — it must, so the operator
  // knows which key to set. What it must never do is receive or render the
  // value. The only channel a value could travel on is stdin, so that is the
  // thing to forbid.
  const faceSrc = read(manifest.ui?.elements?.find?.((e) => e.kind === 'card')?.module || '');
  if (/stdin\s*:/.test(faceSrc)) {
    record('secrets', 'FAIL', 'card never receives a credential', 'the card passes stdin to host.run');
  } else {
    record('secrets', 'PASS', 'card never receives a credential', 'no stdin channel from the face');
  }
  const names = (manifest.secrets || []).filter((s) => faceSrc.includes(s.key));
  if (names.length) {
    record('secrets', 'PASS', 'card names the identifier only', `${names.map((s) => s.key).join(', ')} — so the operator can fix it`);
  }

  // Credential access must go through auth.
  const authUse = files.some((f) => /auth['"],\s*['"]secret|auth secret/.test(read(f)));
  if ((manifest.secrets || []).length && !authUse) {
    record('secrets', 'FAIL', 'credentials resolve through auth', 'no auth secret call found');
  } else if ((manifest.secrets || []).length) {
    record('secrets', 'PASS', 'credentials resolve through auth', 'auth secret is used');
  }
}

/* ── scaffold ────────────────────────────────────────────────────────────── */

if (want('--scaffold')) {
  const capDir = path.join(root, 'capability');
  if (!fs.existsSync(capDir)) {
    record('scaffold', 'WARN', 'scaffold present', 'no capability/ — fine if another app would not want this capability');
  } else {
    const capEntry = manifest?.capability?.entry || 'capability/index.mjs';
    const capSrc = read(capEntry);
    if (!capSrc) {
      record('scaffold', 'FAIL', 'entry resolves', `${capEntry} does not exist`);
    } else {
      record('scaffold', 'PASS', 'entry resolves', capEntry);

      const hostRefs = capSrc.match(/total-recall|TOTAL_RECALL_BIN|auth secret/g) || [];
      if (hostRefs.length) record('scaffold', 'FAIL', 'no Total Recall dependency', hostRefs.join(', '));
      else record('scaffold', 'PASS', 'no Total Recall dependency', 'none reachable from the capability');

      const placeholders = capSrc.match(/example\.com|example\.org|localhost:\d+/g) || [];
      if (placeholders.length) record('scaffold', 'FAIL', 'no placeholder values', placeholders.join(', '));
      else record('scaffold', 'PASS', 'no placeholder values', 'none');

      if (!/export\s+(async\s+)?function|export\s+const/.test(capSrc)) {
        record('scaffold', 'FAIL', 'exports the capability', 'no exported function; a builder cannot import it');
      } else {
        record('scaffold', 'PASS', 'exports the capability', 'exported functions present');
      }

      if (/process\.argv|process\.exitCode/.test(capSrc)) {
        record('scaffold', 'FAIL', 'no CLI concerns', 'argv or exitCode inside the capability');
      } else {
        record('scaffold', 'PASS', 'no CLI concerns', 'no argv or exitCode');
      }

      if (fs.existsSync(path.join(capDir, 'ui'))) {
        record('scaffold', 'FAIL', 'no UI in the scaffold', 'capability/ui exists');
      } else {
        record('scaffold', 'PASS', 'no UI in the scaffold', 'no ui under capability/');
      }
    }

    // Prove standalone operation: import it with Total Recall unavailable.
    try {
      const env = { ...process.env };
      delete env.TOTAL_RECALL_BIN;
      env.PATH = '/nonexistent';
      execFileSync(process.execPath, ['--input-type=module', '-e',
        `await import(${JSON.stringify(pathToFileURL(path.join(root, capEntry)).href)})`],
        { env, stdio: 'pipe', timeout: 15000 });
      record('scaffold', 'PASS', 'loads with Total Recall absent', 'imported successfully');
    } catch (err) {
      record('scaffold', 'FAIL', 'loads with Total Recall absent', String(err.stderr || err.message).trim().split('\n').slice(-2).join(' '));
    }
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

const fails = results.filter((r) => r.level === 'FAIL');
const warns = results.filter((r) => r.level === 'WARN');

if (json) {
  process.stdout.write(JSON.stringify({
    plugin: manifest?.id || path.basename(root),
    root,
    pass: results.filter((r) => r.level === 'PASS').length,
    fail: fails.length,
    warn: warns.length,
    results,
  }, null, 2) + '\n');
} else {
  const tag = { PASS: '  ok  ', FAIL: ' FAIL ', WARN: ' warn ' };
  let section = '';
  for (const r of results) {
    if (r.section !== section) { section = r.section; console.log(`\n${section.toUpperCase()}`); }
    console.log(`[${tag[r.level]}] ${r.check} — ${r.detail}`);
  }
  console.log(`\n${results.filter((r) => r.level === 'PASS').length} passed, ${fails.length} failed, ${warns.length} warnings`);
  if (warns.length) console.log('\nA warning is a judgement call to resolve, not a pass.');
}

process.exitCode = fails.length ? 1 : 0;
