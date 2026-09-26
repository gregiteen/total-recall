import { listAvailableBundled } from '../../core/plugin-store.mjs';
import { listPeerPlugins } from '../../core/plugin-peers.mjs';

function parseArgs(args) {
  const isJson = args.includes('--json');
  let useCase = null;
  const words = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') continue;
    if (args[i] === '--use-case' && args[i + 1]) {
      useCase = args[++i];
      continue;
    }
    words.push(args[i]);
  }
  return { isJson, useCase, query: words.join(' ').toLowerCase().trim() };
}

function matches(p, query, useCase) {
  if (useCase && !(p.use_cases || []).includes(useCase)) return false;
  if (!query) return true;
  return [p.id, p.name, p.description, ...(p.use_cases || [])]
    .some((v) => String(v || '').toLowerCase().includes(query));
}

function printPlugin(p, installHint) {
  const installed = p.installed ? ' \x1b[32m(installed)\x1b[0m' : '';
  console.log(`\x1b[1;36m● ${p.name}\x1b[0m (id: \x1b[33m${p.id}\x1b[0m, v${p.version})${installed}`);
  console.log(`  ${p.description}`);
  if (p.use_cases?.length) console.log(`  Use cases: ${p.use_cases.join(', ')}`);
  if (p.sha256) console.log(`  sha256:    ${p.sha256.slice(0, 16)}… (${p.file_count} files, ${p.size_bytes} bytes)`);
  if (!p.installed) console.log(`  Install:   \x1b[32mnpx total-recall plugin install ${installHint}\x1b[0m`);
  console.log();
}

/** `plugin available` — plugins bundled with this Total Recall package. */
export async function listAvailable(args = []) {
  const { isJson, useCase, query } = parseArgs(args);
  const results = listAvailableBundled(process.cwd()).filter((p) => matches(p, query, useCase));

  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('\n📦 Total Recall — Bundled Plugins\n');
  if (results.length === 0) {
    console.log(`No bundled plugins match${query ? ` "${query}"` : ''}${useCase ? ` for use case "${useCase}"` : ''}.\n`);
    return;
  }
  for (const p of results) printPlugin(p, p.id);
}

/** `plugin peers` — plugins shared by mesh peers, asked live. */
export async function listPeers(args = []) {
  const { isJson, useCase, query } = parseArgs(args);
  const result = await listPeerPlugins();
  for (const peer of result.peers) {
    peer.plugins = peer.plugins.filter((p) => matches(p, query, useCase));
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n🛰️  Total Recall — Plugins Shared on the Mesh\n');
  if (!result.mesh.available) {
    console.log('  This node is not connected to a mesh. Set one up with: npx total-recall mesh enroll (see: npx total-recall mesh --help)\n');
    return;
  }
  if (result.peers.length === 0) {
    console.log('  No other nodes on the mesh.\n');
    return;
  }
  for (const peer of result.peers) {
    const label = peer.status === 'ok'
      ? `\x1b[32m${peer.plugins.length} shared\x1b[0m`
      : `\x1b[33m${peer.status}\x1b[0m${peer.error ? ` — ${peer.error}` : ''}`;
    console.log(`\x1b[1m${peer.hostname}\x1b[0m (${peer.ip}) ${label}`);
    for (const p of peer.plugins) {
      console.log(`  ● ${p.name} (id: \x1b[33m${p.id}\x1b[0m, v${p.version})`);
      console.log(`    ${p.description}`);
      if (p.use_cases.length) console.log(`    Use cases: ${p.use_cases.join(', ')}`);
      console.log(`    sha256 ${p.sha256.slice(0, 16)}… · ${p.file_count} files · ${p.size_bytes} bytes`);
      console.log(`    Install: \x1b[32mnpx total-recall plugin install peer:${peer.hostname}/${p.id}\x1b[0m`);
    }
    console.log();
  }
}

/** `plugin search <query>` — bundled plugins plus whatever mesh peers share. */
export async function searchPlugins(args = []) {
  const { isJson, useCase, query } = parseArgs(args);
  const bundled = listAvailableBundled(process.cwd()).filter((p) => matches(p, query, useCase));
  const peers = await listPeerPlugins();
  const shared = [];
  for (const peer of peers.peers) {
    for (const p of peer.plugins) {
      if (matches(p, query, useCase)) shared.push({ ...p, peer: peer.hostname, source: `peer:${peer.hostname}/${p.id}` });
    }
  }

  if (isJson) {
    console.log(JSON.stringify({ bundled, peers: shared }, null, 2));
    return;
  }

  console.log(`\n🔎 Plugins matching "${query || '*'}"${useCase ? ` (use case: ${useCase})` : ''}\n`);
  if (bundled.length === 0 && shared.length === 0) {
    console.log('No plugins found.\n');
    return;
  }
  if (bundled.length) {
    console.log('Bundled:\n');
    for (const p of bundled) printPlugin(p, p.id);
  }
  if (shared.length) {
    console.log('Shared on the mesh:\n');
    for (const p of shared) printPlugin({ ...p, name: `${p.name} — from ${p.peer}` }, p.source);
  }
}
