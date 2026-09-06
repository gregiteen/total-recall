import { discoverPlugins } from '../../core/plugin-loader.mjs';

function stripAnsi(str) {
  return String(str || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function padAnsi(str, targetLen) {
  const visibleLen = stripAnsi(str).length;
  const paddingNeeded = Math.max(0, targetLen - visibleLen);
  return String(str || '') + ' '.repeat(paddingNeeded);
}

export async function listPlugins(args = []) {
  const isJson = args.includes('--json');
  const projectRoot = process.cwd();
  const plugins = discoverPlugins(projectRoot);

  if (isJson) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  console.log(`\n🔌 Total Recall — Installed Plugins\n`);

  if (plugins.length === 0) {
    console.log('  No plugins installed in this project or globally (~/.agent/plugins/).');
    console.log('  Install one with: npx total-recall plugin install <path|git-url>\n');
    return;
  }

  const colId = 20;
  const colName = 28;
  const colVer = 10;
  const colStatus = 12;
  const colCats = 24;

  const topBorder = `┌${'─'.repeat(colId + 2)}┬${'─'.repeat(colName + 2)}┬${'─'.repeat(colVer + 2)}┬${'─'.repeat(colStatus + 2)}┬${'─'.repeat(colCats + 2)}┐`;
  const midBorder = `├${'─'.repeat(colId + 2)}┼${'─'.repeat(colName + 2)}┼${'─'.repeat(colVer + 2)}┼${'─'.repeat(colStatus + 2)}┼${'─'.repeat(colCats + 2)}┤`;
  const botBorder = `└${'─'.repeat(colId + 2)}┴${'─'.repeat(colName + 2)}┴${'─'.repeat(colVer + 2)}┴${'─'.repeat(colStatus + 2)}┴${'─'.repeat(colCats + 2)}┘`;

  console.log(topBorder);
  console.log(
    `│ ${padAnsi('Plugin ID', colId)} │ ` +
    `${padAnsi('Name', colName)} │ ` +
    `${padAnsi('Version', colVer)} │ ` +
    `${padAnsi('Status', colStatus)} │ ` +
    `${padAnsi('SSSS Categories', colCats)} │`
  );
  console.log(midBorder);

  for (const p of plugins) {
    const id = p.id;
    const name = (p.manifest.name || id).slice(0, colName);
    const ver = p.manifest.version ? `v${p.manifest.version}` : '—';
    const status = p.valid ? '\x1b[32mActive ✅\x1b[0m' : '\x1b[31mInvalid ❌\x1b[0m';
    const cats = (p.manifest.ssss_schemas?.categories || []).map(c => c.name).join(', ') || '—';
    const catStr = cats.length > colCats ? cats.slice(0, colCats - 3) + '...' : cats;

    console.log(
      `│ \x1b[1m${padAnsi(id, colId)}\x1b[0m │ ` +
      `${padAnsi(name, colName)} │ ` +
      `${padAnsi(ver, colVer)} │ ` +
      `${padAnsi(status, colStatus)} │ ` +
      `${padAnsi(catStr, colCats)} │`
    );
  }

  console.log(botBorder);

  // Show detailed validation errors if any
  const invalid = plugins.filter(p => !p.valid);
  if (invalid.length > 0) {
    console.log(`\n⚠️  Configuration Warnings:`);
    for (const inv of invalid) {
      console.log(`  Plugin '${inv.id}':`);
      for (const err of inv.errors) {
        console.log(`    - ${err}`);
      }
    }
  }

  console.log();
}
