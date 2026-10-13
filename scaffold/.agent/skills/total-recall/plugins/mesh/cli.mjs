/** Single owner CLI. Never shells back into total-recall mesh. */
import meshCli from './src/cli/mesh.mjs';
import serverCli from './src/cli/server.mjs';
import { meshStatus } from './src/core/status.mjs';
import { saveCredential } from './src/core/credentials.mjs';
import { getMeshPresence, dispatchMesh } from './src/core/presence.mjs';
import { findHeadscaleKeyMeta } from './src/core/headscale-client.mjs';
import { brainDir } from './src/core/config.mjs';
import { grantsCli } from './src/cli/grants.mjs';

export async function run(argv = []) {
  const args = argv.slice(3);
  const sub = args[0] || 'status';
  if (args.includes('--help') || args.includes('-h')) return meshCli(['--help']);
  if (sub === 'status' || sub === 'view' || sub === 'probe') {
    const result = await meshStatus();
    console.log(JSON.stringify(result));
    if (sub === 'probe' && !result.control.verified) process.exitCode = 1;
    return;
  }
  if (sub === 'nodes' && args.includes('--json')) {
    console.log(JSON.stringify({ nodes: (await meshStatus()).nodes })); return;
  }
  if (sub === 'server') { await serverCli(args.slice(1)); return; }
  if (sub === 'grants') { await grantsCli(args.slice(1), brainDir); return; }
  if (sub === 'presence') { console.log(JSON.stringify(await getMeshPresence())); return; }
  if (sub === 'dispatch') {
    const at = args.indexOf('--json-body');
    if (at < 0) throw new Error('dispatch requires --json-body <JSON>');
    const result = await dispatchMesh(JSON.parse(args[at + 1]));
    console.log(JSON.stringify(result));
    if (!result.success) process.exitCode = 1;
    return;
  }
  if (sub === 'token') {
    if (args[1] === 'set' && args.includes('--stdin')) {
      const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
      const config = JSON.parse(process.env.TR_PLUGIN_CONFIG || '{}');
      const at = args.indexOf('--url'); if (at >= 0) config.controlUrl = args[at + 1];
      console.log(JSON.stringify(await saveCredential({ key: 'HEADSCALE_API_KEY', value: Buffer.concat(chunks).toString('utf8').trim(), configuration: config, brainDir: process.env.TR_SECRETS_BRAIN || brainDir })));
    } else if (!args[1] || args[1] === 'status') {
      const meta = await findHeadscaleKeyMeta(brainDir);
      console.log(JSON.stringify({ present: !!meta?.set, secretKey: 'HEADSCALE_API_KEY' }));
    } else throw new Error('token <status|set --stdin [--url URL]>');
    return;
  }
  return meshCli(args);
}
export default run;
