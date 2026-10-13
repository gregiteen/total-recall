import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vendorPlugin, readBricks } from '../core/plugin-vendor.mjs';
import { discoverPlugins } from '../core/plugin-loader.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'total-recall.mjs');
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function parseNewArgs(args) {
  const positional = [];
  const bricks = [];
  let client = 'claude-code';
  let meshOn = null;
  let noMesh = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--with') bricks.push(...String(args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith('--with=')) bricks.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--client') client = args[++i];
    else if (a === '--mesh-on') meshOn = args[++i];
    else if (a === '--no-mesh') noMesh = true;
    else if (!a.startsWith('-')) positional.push(a);
    else throw new Error(`Unknown option ${a}`);
  }
  const [name] = positional;
  if (!name) throw new Error('Missing project name');
  if (!NAME_PATTERN.test(path.basename(name))) throw new Error(`Invalid project name '${name}'`);
  if (!client) throw new Error('--client needs a value');
  if (meshOn !== null && !meshOn) throw new Error('--mesh-on needs a provider name');
  if (noMesh && meshOn) throw new Error('--no-mesh and --mesh-on cannot be combined');
  return { name, bricks: [...new Set(bricks)], client, meshOn, noMesh };
}

/** A deployment mesh can use: reachable over SSH and carrying a public domain. */
export function meshCapable(p) {
  return Boolean(p && p.ssh && p.ssh.host && p.ssh.user && p.domain);
}

/**
 * Mesh requires a deployment: the deploy plugin with at least one registered
 * provider. Returns the provider to use, or null when the requirements are not
 * met. A failing provider list is an error, never an empty one.
 */
export function resolveMeshTarget(listProviders, meshOn) {
  let providers;
  try {
    providers = listProviders();
  } catch (err) {
    if (err && err.code === 'NO_DEPLOY_PLUGIN') return null;
    throw new Error(`Could not read deployment providers: ${err.message}`);
  }
  providers = Array.isArray(providers) ? providers.filter(meshCapable) : [];
  if (providers.length === 0) return null;
  if (meshOn) {
    const match = providers.find((p) => p.name === meshOn);
    if (!match) throw new Error(`No deployment provider named '${meshOn}'. Registered: ${providers.map((p) => p.name).join(', ')}`);
    return match;
  }
  if (providers.length > 1) throw new Error(`Several deployment providers are registered (${providers.map((p) => p.name).join(', ')}). Choose one with --mesh-on <provider>.`);
  return providers[0];
}

function defaultRun(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.error) throw new Error(`${cmd} failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

function defaultListProviders() {
  const deploy = discoverPlugins(process.cwd()).find((p) => p.id === 'deploy' && p.valid);
  if (!deploy) {
    const err = new Error('deploy plugin is not installed');
    err.code = 'NO_DEPLOY_PLUGIN';
    throw err;
  }
  const r = spawnSync(process.execPath, [BIN, 'deploy', 'providers', '--json'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.status}`).toString().trim().split('\n')[0]);
  const out = r.stdout.split('\n').filter((l) => !l.startsWith('{"timestamp"')).join('\n');
  return JSON.parse(out);
}

function defaultProvision(target, dir) {
  const args = [BIN, 'mesh', 'server', 'init', '--name', target.name, '--host', target.ssh.host, '--user', target.ssh.user, '--port', String(target.ssh.port ?? 22), '--domain', target.domain];
  const r = spawnSync(process.execPath, args, { cwd: dir, stdio: 'inherit' });
  if (r.error) throw new Error(`mesh server init failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`mesh server init exited ${r.status}; the project was created but the control server was not set up`);
}

/**
 * Create a project with the canonical SSSS scaffolder, wire Total Recall,
 * then add the chosen plugins as project-owned bricks (with their requires).
 * The finished project has no runtime dependency on Total Recall or plugins.
 */
export async function createProject(args, { cwd = process.cwd(), run = defaultRun, vendor = vendorPlugin, listProviders = defaultListProviders, provision = defaultProvision } = {}) {
  const { name, bricks, client, meshOn, noMesh } = parseNewArgs(args);
  const dir = path.resolve(cwd, name);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} is not empty`);
  const meshTarget = noMesh ? null : resolveMeshTarget(listProviders, meshOn);
  run('npx', ['--yes', '@gregiteen/ssss-cli', 'new', dir, '--with-total-recall'], cwd);
  run(process.execPath, [BIN, 'init', '--project'], dir);
  run(process.execPath, [BIN, 'connect', client], dir);
  const added = [];
  for (const source of bricks) {
    const r = await vendor(source, undefined, { projectRoot: dir, resolveRequires: true });
    added.push(r.id, ...(r.resolved || []));
  }
  // Mesh is both workspace infrastructure (provision and enroll) and a brick other apps can build on (vendored with its requirements).
  let mesh = null;
  if (meshTarget) {
    const r = await vendor('mesh', undefined, { projectRoot: dir, resolveRequires: true });
    added.push(r.id, ...(r.resolved || []));
    await provision(meshTarget, dir);
    mesh = meshTarget.name;
  }
  return { dir, bricks: [...new Set(added)], registered: readBricks(dir).bricks.map((b) => b.id), mesh };
}

export default async function newProject(args = []) {
  try {
    const r = await createProject(args);
    console.log(`\n✅ Created ${r.dir}`);
    if (r.mesh) console.log(`   Private mesh: control server provisioned on '${r.mesh}' (mesh brick added to bricks/mesh)`);
    console.log(r.bricks.length ? `   Bricks: ${r.bricks.join(', ')} (project-owned; see tr-bricks.json)\n` : '   No bricks added. Add one with: total-recall plugin vendor <id>\n');
  } catch (err) {
    console.error(`❌ ${err.message}`);
    console.error('   Usage: total-recall new <name> [--with id,id] [--client claude-code] [--mesh-on provider | --no-mesh]');
    process.exit(1);
  }
}
