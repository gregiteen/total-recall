/** The non-root Unix user Claude runs as when Metaharness itself runs as root on Linux. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configDir } from './paths.mjs';
import { gitMetadataEntries } from './worktree.mjs';

const VERSION = 1;
const NAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const defaultExec = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });

export const validAgentUser = name => typeof name === 'string' && NAME.test(name);

async function userStore() {
  const { PluginStateStore } = await import('./ssss-store.mjs');
  return new PluginStateStore(path.join(configDir(), 'agent-user.json'), 'meta-harness');
}

function requireOperator() {
  if (process.env.TR_META_HARNESS_RUN) throw new Error('Only the operator may change the agent user.');
}

export async function readAgentUser() {
  const state = (await userStore()).read({ version: VERSION, user: null });
  if (state?.version !== VERSION || (state.user !== null && !validAgentUser(state.user))) {
    throw new Error('The agent user setting is invalid; dispatch stopped.');
  }
  return state.user;
}

export async function writeAgentUser(name) {
  requireOperator();
  if (name !== null && !validAgentUser(name)) throw new Error('The agent user must match ^[a-z_][a-z0-9_-]{0,31}$.');
  (await userStore()).write({ version: VERSION, user: name });
  return { user: name };
}

/** Claude refuses full permissions as root, so only a root Linux host needs another user. */
export function agentUserRequired({ platform = process.platform, euid = process.geteuid?.() } = {}) {
  return platform === 'linux' && euid === 0;
}

export function resolveAgentAccount(name, { exec = defaultExec } = {}) {
  if (!validAgentUser(name)) throw new Error('The agent user must match ^[a-z_][a-z0-9_-]{0,31}$.');
  let line;
  try { line = String(exec('getent', ['passwd', name])).split('\n')[0]; }
  catch { throw new Error(`The agent user ${name} does not exist on this node.`); }
  const fields = line.split(':');
  const uid = Number(fields[2]);
  const gid = Number(fields[3]);
  if (fields.length !== 7 || fields[0] !== name || !/^\d+$/.test(fields[2]) || !/^\d+$/.test(fields[3]) ||
      !Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid > 4294967294 || gid > 4294967294 || !path.isAbsolute(fields[5])) {
    throw new Error(`The agent user ${name} does not exist on this node.`);
  }
  if (uid === 0) throw new Error('The agent user must not be root (uid 0).');
  return { user: name, uid, gid, home: fields[5] };
}

/** Check using the target identity, after Node is reachable through its ACL grant. Never provision users. */
export function verifyAgentHome(account, { exec = defaultExec } = {}) {
  try {
    exec(process.execPath, ['--input-type=module', '-e',
      "import fs from 'node:fs'; fs.accessSync(process.cwd(), fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);"],
    { uid: account.uid, gid: account.gid, cwd: account.home,
      env: { HOME: account.home, USER: account.user, LOGNAME: account.user } });
  } catch {
    throw new Error(`The agent user ${account.user} needs an existing readable, writable home at ${account.home}; provision it before dispatch.`);
  }
}

/** Find existing repositories under a grant, without following workspace symlinks. */
export function gitProtectionPaths(directory, { exec = defaultExec } = {}) {
  const protectedPaths = new Set();
  const entries = gitMetadataEntries(directory);
  for (const entry of entries) if (entry.symlink) throw new Error(`Refusing to resolve git metadata through the symlink ${entry.metadata}.`);
  const common = (cwd, required) => {
    let output;
    try { output = String(exec('git', ['-C', cwd, 'rev-parse', '--git-common-dir'])).trim(); }
    catch (error) {
      if (required) throw new Error(`Cannot resolve git metadata in ${cwd}: ${error.message}`);
      return;
    }
    if (!output) throw new Error(`Cannot resolve git metadata in ${cwd}: empty common directory`);
    protectedPaths.add(path.resolve(cwd, output));
  };
  const checkouts = new Set(entries.map(entry => entry.cwd));
  common(path.resolve(directory), checkouts.has(path.resolve(directory)));
  for (const cwd of checkouts) if (cwd !== path.resolve(directory)) common(cwd, true);
  for (const entry of entries) protectedPaths.add(entry.metadata);
  return [...protectedPaths];
}

function canTraverse(stat, account) {
  const mode = stat.mode;
  return Boolean(mode & 0o001) || (stat.gid === account.gid && Boolean(mode & 0o010)) || (stat.uid === account.uid && Boolean(mode & 0o100));
}

/** True when the directory already carries a named ACL entry for the user, which is then left as it is. */
function hasNamedAclEntry(dir, user, { exec = defaultExec, uid } = {}) {
  try {
    return String(exec('getfacl', ['-p', '-c', dir])).split('\n').some(line =>
      line.startsWith(`user:${user}:`) || (uid !== undefined && line.startsWith(`user:${uid}:`)));
  } catch (error) {
    throw new Error(`getfacl failed for ${dir}; cannot preserve existing ACLs. Ensure the acl package is installed: ${String(error.stderr || error.message).trim()}`);
  }
}

/**
 * Give the agent user access with POSIX ACLs and never chown. An ancestor the user cannot already traverse gets
 * execute only, so the user can reach a granted path under /root without listing it. A directory grant is recursive and also
 * a default ACL, so files created later stay reachable; a file grant covers that file alone. `protect`
 * (git directories) is applied after every other grant and leaves the agent read access only.
 */
export function grantAgentAccess(account, { writable = [], readOnly = [], protect = [] } = {}, { exec = defaultExec, lstat = fs.lstatSync, stat = fs.statSync, namedEntry = hasNamedAclEntry } = {}) {
  const user = account.user;
  if (!validAgentUser(user)) throw new Error('Invalid agent user for ACL grants.');
  const setfacl = args => {
    try { exec('setfacl', args); }
    catch (error) {
      const missing = error.code === 'ENOENT';
      throw new Error(missing ? 'setfacl is not installed; install the acl package so the agent user can reach the workspace.'
        : `setfacl failed (${args.join(' ')}); the filesystem must support ACLs and the acl package must be installed: ${String(error.stderr || error.message).trim()}`);
    }
  };
  const writes = [...new Set(writable.map(item => path.resolve(item)))];
  const inside = (parent, item) => { const relative = path.relative(parent, item); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
  // Code and executable read grants can overlap a writable checkout. Never downgrade its ACL.
  const reads = [...new Set(readOnly.map(item => path.resolve(item)))].filter(item => !writes.some(parent =>
    item === parent || (inside(parent, item) && fs.statSync(parent).isDirectory())));
  const grants = [...reads.map(item => ({ item, write: false })), ...writes.map(item => ({ item, write: true }))];
  const granted = new Set(grants.map(({ item }) => item));
  // Git directories are read-only for the agent, whether or not a writable grant covers them: root runs
  // git there later, so an agent-planted hook or config would run as root. They are applied last.
  const protects = [...new Set(protect.map(item => path.resolve(item)))].filter(item => {
    let stat;
    try { stat = fs.lstatSync(item); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Refusing to grant access through the symlink ${item}.`);
    return true;
  });
  // Named-user ACLs cannot restrict an inode's owner, and recursive setfacl skips symlink targets.
  // Refuse either case before any grant could expose metadata through the writable workspace.
  const inspect = [...protects];
  const inspected = new Set();
  while (inspect.length) {
    const item = inspect.pop();
    if (inspected.has(item)) continue;
    inspected.add(item);
    const stat = lstat(item);
    if (stat.isSymbolicLink()) throw new Error(`Cannot protect git metadata through the symlink ${item}.`);
    if (stat.uid === account.uid) throw new Error(`Cannot protect ${item}: it is owned by the agent user ${user}.`);
    if (stat.isDirectory()) for (const entry of fs.readdirSync(item)) inspect.push(path.join(item, entry));
  }
  const covered = item => writes.some(parent => inside(parent, item) && fs.statSync(parent).isDirectory());
  const ancestors = new Set();
  for (const { item } of [...grants, ...protects.filter(item => !covered(item)).map(item => ({ item }))]) {
    for (let dir = path.dirname(item); ; dir = path.dirname(dir)) {
      if (!granted.has(dir)) ancestors.add(dir);
      if (dir === path.parse(dir).root) break;
    }
  }
  // Ancestors first: a granted directory that is also an ancestor must keep its wider grant.
  // A named-user entry replaces the "other" permissions for that user, so it must never narrow access
  // the user already has (/tmp at 1777, / at 755). Add it only where traversal is otherwise impossible.
  for (const dir of ancestors) {
    if (canTraverse(stat(dir), account) || namedEntry(dir, user, { exec, uid: account.uid })) continue;
    setfacl(['-m', `u:${user}:x`, dir]);
  }
  for (const { item, write } of grants) {
    const directory = fs.statSync(item).isDirectory();
    if (directory) setfacl(write ? ['-R', '-m', `u:${user}:rwX,d:u:${user}:rwX`, item] : ['-R', '-m', `u:${user}:rX`, item]);
    else setfacl(['-m', `u:${user}:${write ? 'rwX' : 'rX'}`, item]);
  }
  for (const item of protects) {
    if (fs.statSync(item).isDirectory()) setfacl(['-R', '-m', `u:${user}:rX,d:u:${user}:rX`, item]);
    else setfacl(['-m', `u:${user}:r`, item]);
  }
}

/**
 * What the MCP server, started by Claude as the agent user, needs: this job's inbox and event log, and
 * read access to the plugin source and the node binary. The brain, the secrets store and other jobs stay
 * closed, so the server cannot read the credential store; its `decision` approval call, which needs
 * Total Recall as root, is the part that cannot run as the agent user. Operator approvals only use
 * these job files and do not need Decision or credentials.
 */
export async function mcpAccess(job) {
  const { jobPaths } = await import('./control.mjs');
  const { inbox, events } = jobPaths(job);
  fs.mkdirSync(path.dirname(events), { recursive: true, mode: 0o700 });
  for (const file of [inbox, events]) fs.closeSync(fs.openSync(file, 'a', 0o600));
  const source = path.dirname(fileURLToPath(import.meta.url));
  return { writable: [inbox, events], readOnly: [source, fs.realpathSync(process.execPath)] };
}
