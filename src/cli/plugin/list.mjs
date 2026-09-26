import { listInstalledPlugins } from '../../core/plugin-store.mjs';
import { projectPluginsDir, globalPluginsDir } from '../../core/plugin-loader.mjs';

function stripAnsi(str) {
  return String(str || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function padAnsi(str, targetLen) {
  const visibleLen = stripAnsi(str).length;
  const paddingNeeded = Math.max(0, targetLen - visibleLen);
  return String(str || '') + ' '.repeat(paddingNeeded);
}

function clip(str, len) {
  const s = String(str || '');
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

export async function listPlugins(args = []) {
  const isJson = args.includes('--json');
  const plugins = listInstalledPlugins(process.cwd());

  if (isJson) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  console.log(`\n🔌 Total Recall — Installed Plugins\n`);

  if (plugins.length === 0) {
    console.log(`  No plugins installed in ${projectPluginsDir(process.cwd())}`);
    console.log(`  or globally in ${globalPluginsDir()}.`);
    console.log('  See what you can install: npx total-recall plugin available\n');
    return;
  }

  const cols = [
    ['Plugin ID', 22],
    ['Version', 9],
    ['Scope', 8],
    ['Source', 22],
    ['Shared', 7],
    ['Status', 10]
  ];
  const line = (l, m, r) => l + cols.map(([, w]) => '─'.repeat(w + 2)).join(m) + r;
  const row = (cells) => '│ ' + cells.map((c, i) => padAnsi(c, cols[i][1])).join(' │ ') + ' │';

  console.log(line('┌', '┬', '┐'));
  console.log(row(cols.map(([h]) => h)));
  console.log(line('├', '┼', '┤'));

  for (const p of plugins) {
    const source = p.source.kind === 'peer' ? `peer ${p.source.peer_hostname}` : p.source.kind;
    const status = !p.valid
      ? '\x1b[31minvalid\x1b[0m'
      : p.modified_since_install ? '\x1b[33mmodified\x1b[0m' : '\x1b[32mok\x1b[0m';
    console.log(row([
      `\x1b[1m${clip(p.id, 22)}\x1b[0m`,
      `v${p.version}`,
      p.scope,
      clip(source, 22),
      p.shared ? 'yes' : 'no',
      status
    ]));
  }

  console.log(line('└', '┴', '┘'));

  const invalid = plugins.filter(p => !p.valid);
  if (invalid.length > 0) {
    console.log(`\n⚠️  Manifest problems:`);
    for (const inv of invalid) {
      console.log(`  ${inv.id}:`);
      for (const err of inv.errors) console.log(`    - ${err}`);
    }
  }
  const modified = plugins.filter(p => p.modified_since_install);
  if (modified.length > 0) {
    console.log(`\nℹ️  Changed on disk since install (content hash differs): ${modified.map(p => p.id).join(', ')}`);
  }

  console.log();
}
