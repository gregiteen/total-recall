/**
 * DSH CLI — query DeepSeek Harness state from Total Recall.
 * Ran as `total-recall dsh <subcommand>`
 * @module @total-recall/plugin-dsh
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DSH_RUNTIME = process.env.DSH_RUNTIME;

function findDsh() {
  const ports = [53626, 54866, 54055];
  for (const port of ports) {
    try {
      // Get full lsof output and find the LISTENing process (the real server)
      const res = spawnSync('lsof', ['-i', `:${port}`, '-P', '-n'], { timeout: 3000 });
      if (res.status === 0) {
        const lines = res.stdout.toString().trim().split('\n').slice(1); // skip header
        for (const line of lines) {
          if (line.includes('(LISTEN)')) {
            const parts = line.split(/\s+/);
            const pid = parseInt(parts[1], 10);
            if (pid) {
              const cmd = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 2000 });
              const startTime = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { timeout: 2000 });
              return {
                pid,
                port,
                name: cmd.stdout.toString().trim(),
                started: startTime.stdout.toString().trim(),
              };
            }
          }
        }
      }
    } catch {}
  }
  return null;
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
  const subcommand = argv[3] || 'help';

  const dsh = findDsh();
  if (!dsh && subcommand !== 'help') {
    console.error('❌ DeepSeek Harness is not running.');
    process.exitCode = 1;
    return;
  }

  const bootInfo = dsh ? fetchBootInfo(dsh.port) : null;

  switch (subcommand) {

    case 'status': {
      const mem = spawnSync('ps', ['-p', String(dsh.pid), '-o', 'rss='], { timeout: 2000 });
      const rss = parseInt(mem.stdout.toString().trim()) || 0;
      const uptime = calcUptime(dsh.started);

      console.log(`\n🤖 DeepSeek Harness — Runtime\n`);
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

      console.log(`\n💬 DeepSeek Harness — Sessions\n`);
      console.log(`  Status:     Running since ${dsh.started} (${elapsed})`);
      console.log(`  Web GUI:    ${process.env.DSH_WEB_URL || 'http://127.0.0.1:' + dsh.port}`);
      console.log(`  API Port:   ${dsh.port}`);
      console.log(`  Revision:   ${bootInfo?.rev || 'unknown'}`);
      console.log(`  Plugins:    ${pluginCount} active`);
      console.log(`\n  🔗 Open the Web GUI to view and manage active sessions.`);
      console.log(`     Session state, conversation logs, and tool usage are`);
      console.log(`     available through the browser interface.\n`);
      return { data: { status: 'running', port: dsh.port, uptime: elapsed, plugins: pluginCount, revision: bootInfo?.rev } };
    }

    case 'models': {
      // Check installed model provider packages
      const providerDir = path.join(DSH_RUNTIME, 'node_modules', '@deepseek-ai');
      const providers = [];
      if (fs.existsSync(providerDir)) {
        for (const pkg of fs.readdirSync(providerDir)) {
          if (pkg.includes('llm') || pkg.includes('model') || pkg.includes('provider')) {
            const pkgPath = path.join(providerDir, pkg, 'package.json');
            if (fs.existsSync(pkgPath)) {
              try {
                const meta = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                providers.push({ name: meta.name, version: meta.version, desc: (meta.description || '').slice(0, 80) });
              } catch {}
            }
          }
        }
      }

      console.log(`\n🧠 DeepSeek Harness — Model Providers\n`);
      console.log(`  Available providers:\n`);
      for (const p of providers) {
        console.log(`  • ${p.name} v${p.version}`);
        if (p.desc) console.log(`    ${p.desc}`);
        console.log();
      }
      console.log(`  Default model is configured through the DSH Web GUI:`);
      console.log(`    Settings → Models → Default Agent Model\n`);
      console.log(`  To see the currently selected model, open:`);
      console.log(`    ${process.env.DSH_WEB_URL || 'http://127.0.0.1:' + dsh.port}/settings/models\n`);
      return { data: { providers: providers.map(p => p.name) } };
    }

    case 'plugins': {
      const entries = bootInfo?.entries || [];

      console.log(`\n🔌 DeepSeek Harness — Client Plugins\n`);
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
      const knownTools = [
        { name: 'browser', desc: 'Browser automation (Chrome/Firefox)' },
        { name: 'web_search', desc: 'Web search via configured provider' },
        { name: 'read/write/edit', desc: 'File system operations' },
        { name: 'bash', desc: 'Command execution' },
        { name: 'cordis_inspect_list/query/self', desc: 'Cordis runtime inspection' },
        { name: 'subagent / subagent_fork', desc: 'Subagent delegation' },
        { name: 'glob / grep', desc: 'File search' },
        { name: 'workflow', desc: 'Multi-agent workflow orchestration' },
      ];

      console.log(`\n🔧 DeepSeek Harness — Tool Registry\n`);
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
      console.log(`\n🤖 DeepSeek Harness — Total Recall Plugin\n`);
      console.log('Usage:  total-recall dsh <subcommand>\n');
      console.log('  dsh status        DSH runtime status (PID, port, memory, uptime)');
      console.log('  dsh sessions      Session status and Web GUI info');
      console.log('  dsh tools         Registered tool inventory');
      console.log('  dsh models        Model provider packages');
      console.log('  dsh plugins       Client plugin inventory\n');
      return;
  }
}