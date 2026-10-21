/**
 * DSH CLI — query DeepSeek Harness state from Total Recall.
 * Ran as `total-recall cli-agents runtime dsh <subcommand>`
 * @module @total-recall/plugin-dsh
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The DSH Web/desktop GUI binds an EPHEMERAL port chosen at launch (observed
// 49661 -> 49703 -> 52406 within one session), so no fixed port list can ever
// be correct. Earlier revisions hardcoded [53626, 54866, 54055] and therefore
// reported "DeepSeek Harness is not running" against a live GUI.
//
// Discover by PROCESS IDENTITY instead: find the DSH process, then read the
// port it is actually listening on. The debugger port (9229/9230) is excluded.
const DSH_RUNTIME = process.env.DSH_RUNTIME || defaultRuntime();
const DEBUG_PORTS = new Set([9229, 9230]);
/** Process-name fragments that identify a DSH surface. */
const DSH_PROCESS_HINTS = ['Harness Dev.app', 'dsh-desktop', '@deepseek-ai/dsh'];

/** Locate the DSH checkout when DSH_RUNTIME is unset. */
function defaultRuntime() {
  const candidates = [
    process.env.DSH_CHECKOUT,
    path.join(os.homedir(), 'github', 'deepseek-harness'),
    path.join(os.homedir(), 'deepseek-harness')
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'packages'))) return dir;
  }
  return undefined;
}

/** PIDs whose command line looks like a DSH surface. */
function dshPids() {
  const res = spawnSync('ps', ['-Ao', 'pid=,command='], { timeout: 4000, encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout) return [];
  const pids = [];
  for (const line of res.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(\d+)\s+(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, pid, command] = match;
    // Skip the CLI itself and any grep-like helper.
    if (command.includes('tr-plugin-dsh') || command.includes('lsof') || command.includes('ps -Ao')) continue;
    if (DSH_PROCESS_HINTS.some((hint) => command.includes(hint))) pids.push(Number(pid));
  }
  return pids;
}

/** Listening ports held by the given PIDs, debugger ports excluded. */
function listenPorts(pids) {
  const ports = [];
  for (const pid of pids) {
    const res = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)],
      { timeout: 4000, encoding: 'utf8' });
    if (res.status !== 0 || !res.stdout) continue;
    for (const line of res.stdout.split('\n').slice(1)) {
      // lsof columns end with `TCP host:port (LISTEN)`; match the address form
      // directly rather than assuming the port is the last field, which yields
      // the literal '(LISTEN)'.
      const match = /TCP\s+\S*:(\d+)\s+\(LISTEN\)/.exec(line);
      if (!match) continue;
      const port = Number(match[1]);
      if (port && !DEBUG_PORTS.has(port) && !ports.includes(port)) ports.push(port);
    }
  }
  return ports;
}

/**
 * Is this port the DSH Web/desktop GUI?
 *
 * The GUI is not always open: it answers with an authentication notice
 * ("dsh web authentication required; reopen the URL printed by dsh web") rather
 * than the boot payload, so probing for `__DSH_BOOT__` alone would reject the
 * real GUI and fall through to the Electron devtools port.
 */
function servesDsh(port) {
  if (fetchBootInfo(port) !== null) return true;
  const res = spawnSync('curl', ['-s', '-m', '4', `http://127.0.0.1:${port}/`],
    { timeout: 5000, encoding: 'utf8' });
  return res.status === 0 && typeof res.stdout === 'string' && res.stdout.includes('dsh web');
}

function findDsh() {
  const pids = dshPids();
  if (pids.length === 0) return null;

  // Prefer a PID whose port actually serves the DSH boot payload; fall back to
  // the first PID that merely holds a listening socket.
  let fallback = null;
  for (const pid of pids) {
    for (const port of listenPorts([pid])) {
      const entry = () => {
        const cmd = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 2000, encoding: 'utf8' });
        const startTime = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { timeout: 2000, encoding: 'utf8' });
        return {
          pid,
          port,
          name: (cmd.stdout || '').toString().trim(),
          started: (startTime.stdout || '').toString().trim()
        };
      };
      if (servesDsh(port)) return entry();
      fallback ??= entry();
    }
  }
  return fallback;
}

// --- Model configuration -----------------------------------------------------
//
// The configured default model lives in each profile's cordis.patch.yml under
// `- id: agent-default-model`. DSH keeps profiles in more than one home: the
// shared ~/.dsh and the desktop app's isolated build home. Reading only one is
// how a stale default (V3) stayed invisible in the others.

const DEFAULT_MODEL_PREF = path.join(os.homedir(), '.dsh', 'default-model.txt');

/** Every DSH home that holds profiles, in precedence order. */
function profileHomes() {
  const homes = [path.join(os.homedir(), '.dsh')];
  if (DSH_RUNTIME) {
    homes.push(path.join(DSH_RUNTIME, 'apps', 'desktop', '.desktop-build', 'development', 'home'));
  }
  return homes;
}

/** Read the default model + provider from one profile patch. */
function readProfileDefault(patchFile) {
  try {
    const text = fs.readFileSync(patchFile, 'utf8');
    const block = text.split('- id: agent-default-model')[1];
    if (!block) return null;
    const model = /^\s+model:\s*(\S+)/m.exec(block);
    const provider = /^\s+provider:\s*(\S+)/m.exec(block);
    if (!model) return null;
    return { model: model[1], provider: provider ? provider[1] : 'unknown' };
  } catch { return null; }
}

/** Every profile's configured default across all homes. */
function allProfileDefaults() {
  const found = [];
  for (const home of profileHomes()) {
    const dir = path.join(home, 'profiles');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const patch = path.join(dir, name, 'cordis.patch.yml');
      if (!fs.existsSync(patch)) continue;
      const def = readProfileDefault(patch);
      if (def) found.push({ home: home.replace(os.homedir(), '~'), profile: name, ...def });
    }
  }
  return found;
}

/** Catalogue cached by the model refresh script, when present. */
function cachedCatalogue() {
  const file = path.join(os.homedir(), '.dsh', 'openrouter-models.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.data;
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

/** Provider packages compiled into the DSH tree. */
function providerPackages() {
  const providers = [];
  if (!DSH_RUNTIME) return providers;
  const providerDir = path.join(DSH_RUNTIME, 'node_modules', '@deepseek-ai');
  if (!fs.existsSync(providerDir)) return providers;
  for (const pkg of fs.readdirSync(providerDir)) {
    if (!(pkg.includes('llm') || pkg.includes('model') || pkg.includes('provider'))) continue;
    const pkgPath = path.join(providerDir, pkg, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      providers.push({ name: meta.name, version: meta.version, desc: (meta.description || '').slice(0, 80) });
    } catch { /* unreadable package */ }
  }
  return providers;
}

function calcUptime(started) {
  if (!started) return 'unknown';
  const start = new Date(started);
  const now = new Date();
  const diff = (now - start) / 1000;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

function fetchBootInfo(port) {
  try {
    const res = spawnSync('curl', ['-s', `http://127.0.0.1:${port}/`], { timeout: 5000, encoding: 'utf8' });
    if (res.status !== 0) return null;
    const html = res.stdout;
    // Extract __DSH_BOOT__ JSON
    const idx = html.indexOf('__DSH_BOOT__');
    if (idx === -1) return null;
    const brace = html.indexOf('{', idx);
    let depth = 0, end = brace;
    for (let i = brace; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    const boot = JSON.parse(html.slice(brace, end));
    return boot;
  } catch { return null; }
}

export async function run(argv) {
  const subcommand = argv.includes('--help') || argv.includes('-h') ? 'help' : argv[3] || 'help';

  const dsh = findDsh();
  // `model`/`models` read profile files on disk, so they work without a running
  // DSH; every other subcommand needs the live process.
  const FILE_ONLY = new Set(['model', 'models']);
  if (!dsh && subcommand !== 'help' && !FILE_ONLY.has(subcommand)) {
    console.error(' DeepSeek Harness is not running.');
    process.exitCode = 1;
    return;
  }

  const bootInfo = dsh ? fetchBootInfo(dsh.port) : null;

  switch (subcommand) {

    case 'status': {
      const mem = spawnSync('ps', ['-p', String(dsh.pid), '-o', 'rss='], { timeout: 2000 });
      const rss = parseInt(mem.stdout.toString().trim()) || 0;
      const uptime = calcUptime(dsh.started);

      console.log(`\n DeepSeek Harness — Runtime\n`);
      console.log(`  PID:       ${dsh.pid}`);
      console.log(`  Memory:    ${(rss / 1024).toFixed(1)} MB`);
      console.log(`  Port:      ${dsh.port}`);
      console.log(`  Process:   ${dsh.name}`);
      console.log(`  Uptime:    ${uptime}`);
      console.log(`  Revision:  ${bootInfo?.rev || 'unknown'}`);
      console.log(`  Plugins:   ${bootInfo?.entries?.length || 'unknown'} client plugins loaded`);
      console.log(`  Web GUI:   ${process.env.DSH_WEB_URL || 'http://127.0.0.1:' + dsh.port}\n`);
      return { data: { pid: dsh.pid, port: dsh.port, memory: (rss / 1024).toFixed(1), uptime, revision: bootInfo?.rev } };
    }

    case 'sessions': {
      // DSH sessions are Cordis-managed. Report what we can observe externally
      const elapsed = calcUptime(dsh.started);
      const pluginCount = bootInfo?.entries?.length || 0;

      console.log(`\n DeepSeek Harness — Sessions\n`);
      console.log(`  Status:     Running since ${dsh.started} (${elapsed})`);
      console.log(`  Web GUI:    ${process.env.DSH_WEB_URL || 'http://127.0.0.1:' + dsh.port}`);
      console.log(`  API Port:   ${dsh.port}`);
      console.log(`  Revision:   ${bootInfo?.rev || 'unknown'}`);
      console.log(`  Plugins:    ${pluginCount} active`);
      console.log(`\n   Open the Web GUI to view and manage active sessions.`);
      console.log(`     Session state, conversation logs, and tool usage are`);
      console.log(`     available through the browser interface.\n`);
      return { data: { status: 'running', port: dsh.port, uptime: elapsed, plugins: pluginCount, revision: bootInfo?.rev } };
    }

    case 'models': {
      const providers = providerPackages();
      const defaults = allProfileDefaults();
      const catalogue = cachedCatalogue();

      console.log(`\n DeepSeek Harness — Models\n`);

      console.log(`  Configured default model (per profile):\n`);
      if (defaults.length === 0) {
        console.log(`    (no profile declares agent-default-model)\n`);
      } else {
        for (const d of defaults) {
          console.log(`    ${d.home}/${d.profile}`);
          console.log(`      model:    ${d.model}`);
          console.log(`      provider: ${d.provider}`);
        }
        const distinct = [...new Set(defaults.map((d) => d.model))];
        if (distinct.length > 1) {
          console.log(`\n    WARNING profiles disagree: ${distinct.join(', ')}`);
          console.log(`    A refresh that hardcodes a model id will revert these.`);
        }
        console.log();
      }

      let pref = '';
      try { pref = fs.readFileSync(DEFAULT_MODEL_PREF, 'utf8').trim(); } catch { /* unset */ }
      console.log(`  Persisted preference: ${pref || '(unset)'}`);
      console.log(`    ${DEFAULT_MODEL_PREF}`);
      console.log(`    The model refresh keeps this model instead of a hardcoded id.\n`);

      console.log(`  Catalogue cache: ${catalogue.length} models`);
      console.log(`    ~/.dsh/openrouter-models.json\n`);

      console.log(`  Provider packages: ${providers.length}\n`);
      for (const p of providers) {
        console.log(`  • ${p.name} v${p.version}`);
        if (p.desc) console.log(`    ${p.desc}`);
      }
      console.log(`\n  Cache the catalogue for offline reads:  total-recall cli-agents runtime dsh model --cache\n`);
      return { data: { defaults, preference: pref || null, catalogueSize: catalogue.length, providers: providers.map((p) => p.name) } };
    }

    case 'model': {
      // Model caching: read live configuration and (optionally) cache it.
      const defaults = allProfileDefaults();
      const catalogue = cachedCatalogue();
      const asJson = argv.includes('--json');
      const wantCache = argv.includes('--cache');

      const payload = {
        generatedAt: new Date().toISOString(),
        runtime: DSH_RUNTIME || null,
        preference: (() => {
          try { return fs.readFileSync(DEFAULT_MODEL_PREF, 'utf8').trim(); } catch { return null; }
        })(),
        defaults,
        catalogueSize: catalogue.length
      };

      if (wantCache) {
        // Cache through SSSS memory so `total-recall recall` can answer model
        // questions offline and on any mesh node.
        const summary = [
          `DSH model configuration cached ${payload.generatedAt}.`,
          payload.preference ? `Persisted preference: ${payload.preference}.` : 'No persisted preference file.',
          ...defaults.map((d) => `${d.home}/${d.profile} -> ${d.model} (${d.provider}).`),
          `OpenRouter catalogue cache holds ${catalogue.length} models.`
        ].join(' ');
        const res = spawnSync('total-recall', [
          'remember', 'fact', summary,
          '--title', 'DSH model configuration (cached)',
          '--slug', 'dsh-model-configuration-cache',
          '--tags', 'dsh,model,cache,openrouter',
          '--global'
        ], { timeout: 60000, encoding: 'utf8' });
        payload.cached = res.status === 0;
        payload.cacheOutput = (res.stdout || '').trim().split('\n').slice(-1)[0] || '';
        if (res.status !== 0) {
          console.error(`  Cache write failed: ${(res.stderr || '').trim().split('\n')[0] || 'unknown error'}`);
        }
      }

      if (asJson) {
        console.log(JSON.stringify(payload, null, 2));
        return { data: payload };
      }

      console.log(`\n DeepSeek Harness — Model Cache\n`);
      console.log(`  Preference:  ${payload.preference || '(unset)'}`);
      console.log(`  Profiles:    ${defaults.length}`);
      for (const d of defaults) {
        console.log(`    • ${d.home}/${d.profile} -> ${d.model}`);
      }
      console.log(`  Catalogue:   ${catalogue.length} models cached`);
      if (wantCache) {
        console.log(`  SSSS cache:  ${payload.cached ? 'written' : 'FAILED'}`);
      } else {
        console.log(`\n  Write the cache:  total-recall cli-agents runtime dsh model --cache`);
      }
      console.log();
      return { data: payload };
    }

    case 'plugins': {
      const entries = bootInfo?.entries || [];

      console.log(`\n DeepSeek Harness — Client Plugins\n`);
      console.log(`  Total: ${entries.length} plugins loaded\n`);
      for (const e of entries) {
        const deps = e.inject?.length ? `  [deps: ${e.inject.join(', ')}]` : '';
        const imm = e.immediately ? ' [immediate]' : '';
        console.log(`  • ${e.id}${imm}${deps}`);
      }
      console.log(`\n  Dynamic Cordis Plugins (from current session):`);
      console.log(`    Use cordis_inspect_self inside a DSH session to list them.\n`);
      return { data: { pluginCount: entries.length, plugins: entries.map(e => e.id) } };
    }

    case 'tools': {
      // Parse available plug-in packages for tool-related ones
      const pluginDir = path.join(DSH_RUNTIME, 'node_modules', '@deepseek-ai');
      const tools = [];
      if (fs.existsSync(pluginDir)) {
        for (const pkg of fs.readdirSync(pluginDir)) {
          if (pkg.includes('tool') || pkg.includes('skill') || pkg.includes('command')) {
            const pkgPath = path.join(pluginDir, pkg, 'package.json');
            if (fs.existsSync(pkgPath)) {
              try {
                const meta = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                tools.push({ name: meta.name, version: meta.version, desc: (meta.description || '').slice(0, 100) });
              } catch {}
            }
          }
        }
      }

      // Known tool packages specific to DSH
      const knownTools = []; // Only observed packages are reported; no fabricated live tool registry.

      console.log(`\n DeepSeek Harness — Tool Registry\n`);
      console.log(`  Built-in Agent Tools:\n`);
      for (const t of knownTools) {
        console.log(`  • ${t.name} — ${t.desc}`);
      }

      if (tools.length > 0) {
        console.log(`\n  Tool-related Packages:\n`);
        for (const t of tools) {
          console.log(`  • ${t.name} v${t.version}`);
          if (t.desc) console.log(`    ${t.desc}`);
        }
      }
      console.log(`\n  To see the complete live tool registry:`);
      console.log(`    Use cordis_inspect_list inside a DSH session, or`);
      console.log(`    check the Settings → Plugins panel in the Web GUI.\n`);
      return { data: { builtIn: knownTools.map(t => t.name), packages: tools.map(t => t.name) } };
    }

    default:
      console.log(`\n DeepSeek Harness — Total Recall Plugin\n`);
      console.log('Usage:  total-recall cli-agents runtime dsh <subcommand>\n');
      console.log('  dsh status        DSH runtime status (PID, port, memory, uptime)');
      console.log('  dsh sessions      Session status and Web GUI info');
      console.log('  dsh tools         Registered tool inventory');
      console.log('  dsh models        Configured default model per profile + providers');
      console.log('  dsh model         Model cache (--cache writes an SSSS node, --json)');
      console.log('  dsh plugins       Client plugin inventory\n');
      return;
  }
}