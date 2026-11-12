#!/usr/bin/env node
/**
 * record.mjs — the plugin creator's verification battery.
 *
 * Runs the checks the recipe asks for, against a plugin repository. Exits
 * non-zero on any failure and prints the real reason. Nothing here trusts a
 * declaration: every check reads the actual files or runs the actual command.
 *
 *   node record.mjs <pluginDir> [--manifest|--home|--secrets|--scaffold|--reuse|--json]
 *
 * Checks are marked PASS, FAIL or WARN. A WARN is a judgement call the agent
 * must resolve; a FAIL is a rejection.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--card')) {
  console.error('Legacy plugin cards are retired. Verify the native Home with --home.');
  process.exit(2);
}
const json = args.includes('--json');
const only = ['--manifest', '--home', '--secrets', '--scaffold', '--reuse'].filter((f) => args.includes(f));
const root = path.resolve(args.find((a) => !a.startsWith('-')) || '.');
const want = (section) => only.length === 0 || only.includes(section);

const results = [];
const record = (section, level, check, detail) => results.push({ section, level, check, detail });

/* ── helpers ─────────────────────────────────────────────────────────────── */

const read = (rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
};

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
// Every selected section depends on manifest facts. Section filtering must not
// skip prerequisite loading and then report a vacuous successful check run.
{
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

// Use the host that runs block validation when it is given by path.
if (manifest && (want('--manifest') || want('--home'))) {
  const binary = process.env.TOTAL_RECALL_BIN;
  const explicit = binary && path.isAbsolute(binary) && fs.existsSync(binary)
    ? path.resolve(path.dirname(fs.realpathSync(binary)), '../src/core/plugin-loader.mjs')
    : null;
  const loaderPath = [
    explicit,
    path.resolve(import.meta.dirname, '../../../../src/core/plugin-loader.mjs'),
    path.resolve(import.meta.dirname, '../../../../../src/core/plugin-loader.mjs'),
  ].find(file => file && fs.existsSync(file));
  if (loaderPath) {
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
}

if (manifest && (want('--manifest') || want('--home'))) {
  const elements = Array.isArray(manifest.ui?.elements) ? manifest.ui.elements : [];
  const obsolete = ['card', 'card_face', 'card_layout'].filter(field => Object.hasOwn(manifest, field));
  if (elements.some(element => ['card', 'card-face'].includes(element?.kind))) obsolete.push('ui.elements');
  for (const file of walk(root).filter(file => /^ui\/(card|card-face)\.(m?js|css)$/.test(file))) obsolete.push(file);
  record('manifest', obsolete.length ? 'FAIL' : 'PASS', 'native presentation only',
    obsolete.length ? `Remove legacy declarations or assets: ${obsolete.join(', ')}` : 'No legacy declarations or assets');
  if (!manifest.ui?.home && manifest.brick !== true && manifest.scaffold !== true) {
    record('manifest', 'FAIL', 'UI declared', 'Declare a native ui.home.');
  }
}

if (manifest && want('--manifest')) {
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

if (want('--home') && manifest && (manifest.ui?.home || only.includes('--home'))) {
  const hasAuth = manifest.auth?.plugin === 'auth' && manifest.auth.session_verification === true;
  record('home', hasAuth ? 'PASS' : 'FAIL', 'Bundled Auth', hasAuth ? 'Host session verification' : 'Declare auth.plugin and auth.session_verification.');
  const home = manifest.ui?.elements?.find(element => element.id === manifest.ui.home);
  const files = walk(root);
  const validHome = home && ['panel', 'form', 'list', 'detail', 'widget'].includes(home.kind) && files.includes(home.module);
  record('home', validHome ? 'PASS' : 'FAIL', 'Home element', validHome ? home.id : 'Declare a valid native ui.home.');
  if (validHome) {
    const source = read(home.module);
    const seeded = /\b(?:hostname|loadAvg|usedPercent|uptimeSeconds)\s*:\s*(?:["'][^"']+["']|\[\s*\d|\d)/;
    if (seeded.test(source)) record('home', 'FAIL', 'no seeded values', 'A live reading is initialized with a literal.');
    const reassurance = /(?:\|\||\?\?)\s*['"](?:Up to date|Synced|Repository Active|ONLINE|Healthy|Connected|All good|OK)['"]/;
    if (reassurance.test(source)) record('home', 'FAIL', 'no reassuring default', 'An unverified reading defaults to a successful state.');
    const credentialPanel = home.events?.includes('save-token') && home.props?.view && manifest.secrets?.length === 1;
    const ownsCredentialStore = manifest.id === 'auth' && hasAuth &&
      home.events?.includes('auth-inventory') && home.events?.includes('auth-credential-mutate');
    if (!credentialPanel && !ownsCredentialStore && /type\s*=\s*["']password["']|input\.type\s*=\s*["']password["']/.test(source)) {
      record('home', 'FAIL', 'credential interface', 'Use shared Auth or a declared host credential panel.');
    }
  }
  const hasDesign = manifest.ui?.design_tokens === 'DESIGN.md' && !!read('DESIGN.md').trim();
  record('home', hasDesign ? 'PASS' : 'FAIL', 'Owner design', hasDesign ? 'DESIGN.md' : 'Package and declare root DESIGN.md.');
  const covered = new Set();
  let pageBlocks = 0;
  for (const file of files.filter(file => /^ui\/chunks\/[^/]+\.md$/.test(file))) {
    try {
      const output = execFileSync(process.env.TOTAL_RECALL_BIN || 'total-recall',
        ['plugin', 'chunks', 'validate', path.join(root, file), '--plugin-dir', root, '--json'],
        { cwd: root, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
      const { chunk } = JSON.parse(output);
      if (chunk.surfaces.includes('page')) {
        pageBlocks++;
        for (const operation of chunk.operations || []) covered.add(operation);
      }
      record('home', 'PASS', 'SSSS block', chunk.key);
    } catch (error) {
      record('home', 'FAIL', 'SSSS block', `${file}: ${String(error.stdout || error.message).trim().slice(0, 500)}`);
    }
  }
  if (!pageBlocks) record('home', 'FAIL', 'Page blocks', 'Home has no validated page blocks.');
  const missing = (manifest.cli?.subcommands || []).map(operation => operation.name).filter(name => !covered.has(name));
  if (missing.length) record('home', 'FAIL', 'Operation coverage', missing.join(', '));
  else if (pageBlocks) record('home', 'PASS', 'Operation coverage', 'All declared operations have page blocks.');
}

/* ── reuse ───────────────────────────────────────────────────────────────── */

function pluginInventory(command) {
  const binary = process.env.TOTAL_RECALL_BIN || 'total-recall';
  const output = execFileSync(binary, ['plugin', command, '--json'], {
    cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

if (want('--reuse') && manifest) {
  const { reuse } = manifest;
  const commands = reuse?.commands;
  const validCommands = Array.isArray(commands) &&
    commands.every((command) => typeof command === 'string' && command.startsWith('total-recall '));
  if (typeof reuse?.owned !== 'string' || !reuse.owned.trim() || !validCommands) {
    record('reuse', 'FAIL', 'reuse declared', 'Record reuse.commands and reuse.owned after inspecting the plugin library and project bricks');
  } else {
    record('reuse', 'PASS', 'reuse declared', 'Installed operations and plugin responsibility are documented');
    if (manifest.id !== 'auth' && manifest.secrets?.length && !commands.includes('total-recall auth secret')) {
      record('reuse', 'FAIL', 'Auth owner declared', 'Declare total-recall auth secret for the credential interface');
    }
    if (commands.length) {
      try {
        const library = pluginInventory('library');
        const owners = new Set(library.plugins.filter((plugin) =>
          plugin.valid && plugin.callable && plugin.id !== manifest.id).map((plugin) => plugin.id));
        const available = new Set(library.commands.filter((entry) => owners.has(entry.plugin)).map((entry) => entry.command));
        const unresolved = commands.flatMap((command, index) => available.has(command) ? [] : [`reuse.commands[${index}]`]);
        const detail = unresolved.length ? `Resolve ${unresolved.join(', ')} against the installed plugin library` : `${commands.length} owner operations verified`;
        record('reuse', unresolved.length ? 'FAIL' : 'PASS', 'owner commands resolve', detail);
      } catch {
        record('reuse', 'FAIL', 'owner commands resolve', 'Could not read total-recall plugin library --json');
      }
    }
  }

  const requires = manifest.requires === undefined ? [] : manifest.requires;
  const brickIds = Array.isArray(requires) && requires.map((entry) => typeof entry === 'string' ? entry : entry?.id);
  const invalidVersion = Array.isArray(requires) && requires.some((entry) =>
    entry?.range !== undefined || (entry?.version !== undefined && typeof entry.version !== 'string'));
  if (!brickIds || invalidVersion || brickIds.some((id) => typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id) || id === manifest.id)) {
    record('reuse', 'FAIL', 'required bricks present', 'Declare other brick IDs in requires and use version for version constraints');
  } else if (brickIds.length) {
    try {
      const bricks = pluginInventory('bricks');
      const present = new Set(bricks.filter((brick) => ['unchanged', 'modified'].includes(brick.status)).map((brick) => brick.id));
      const missing = brickIds.filter((id) => !present.has(id));
      const detail = missing.length ? `Vendor required bricks through the plugin manager: ${missing.join(', ')}` : `${brickIds.length} project-owned bricks verified`;
      record('reuse', missing.length ? 'FAIL' : 'PASS', 'required bricks present', detail);
    } catch {
      record('reuse', 'FAIL', 'required bricks present', 'Could not read total-recall plugin bricks --json');
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
