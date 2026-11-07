import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRIDGE_UNIT,
  CONVERGE_UNIT,
  HOME_UNIT,
  SWAP_CHAIN,
  converge,
  hostContext,
  main,
  moveCheckout,
  parseEnvironment,
  parseListeners,
  retire,
  stage,
  status,
  swapOffRules,
  swapOnRules,
  switchTraffic,
} from './server-release.mjs';

/**
 * A host with the two facts that decide whether a swap has a gap: which process owns a port,
 * and whether the rule sends new connections elsewhere. After every command it checks that a
 * new client could still connect, so an order that opens a gap fails however briefly it lasts.
 */
class FakeHost {
  constructor(root, { homeVersion = '3.43.0', checkoutVersion = '3.43.2', artifactVersion = '3.43.3', dirty = false } = {}) {
    this.root = root;
    this.home = { active: true, pid: 100, version: homeVersion, daemon: 'running' };
    this.bridge = { active: false, pid: 200, version: artifactVersion };
    this.convergeActive = false;
    this.rule = false;
    this.checkoutVersion = checkoutVersion;
    this.artifactVersion = artifactVersion;
    this.dirty = dirty;
    this.gaps = [];
    this.commands = [];
    this.open = { 3900: 0, 3901: 0 };
    this.failHomeStarts = 0;
    this.bridgeBoots = true;
    this.ruleWorks = true;
    this.reloadedRules = [];
    this.stoppedHomeWithRuleOn = null;
  }

  serving() { return this.rule && this.ruleWorks ? this.bridge : this.home; }

  checkGap(step) { if (!this.serving().active) this.gaps.push(step); }

  exec = (binary, args, options = {}) => {
    const line = `${binary} ${args.join(' ')}`;
    this.commands.push(line);
    const result = this.answer(binary, args, options);
    this.checkGap(line);
    return { status: 0, stdout: '', stderr: '', ...result };
  };

  answer(binary, args, options) {
    if (binary === 'systemctl' && args[0] === 'show') {
      return { stdout: [
        'LoadState=loaded',
        `ActiveState=${this.home.active ? 'active' : 'inactive'}`,
        `MainPID=${this.home.active ? this.home.pid : 0}`,
        `WorkingDirectory=${this.root}/checkout`,
        'Environment=NODE_ENV=production PORT=3900 TR_PACKAGE_ROOT=/root/total-recall',
      ].join('\n') };
    }
    if (binary === 'systemctl' && args[0] === 'is-active') {
      const unit = args[2];
      const active = unit === BRIDGE_UNIT ? this.bridge.active : unit === CONVERGE_UNIT ? this.convergeActive : this.home.active;
      return { status: active ? 0 : 3 };
    }
    if (binary === 'systemctl' && args[0] === 'stop') {
      if (args[1] === HOME_UNIT) { this.home.active = false; this.home.daemon = 'dead'; this.stoppedHomeWithRuleOn = this.rule; }
      if (args[1] === BRIDGE_UNIT) this.bridge.active = false;
      return {};
    }
    if (binary === 'systemctl' && args[0] === 'start') {
      if (this.failHomeStarts > 0) { this.failHomeStarts -= 1; return { status: 1, stderr: 'start failed' }; }
      this.home = { active: true, pid: this.home.pid + 1, version: this.checkoutVersion, daemon: 'running' };
      return {};
    }
    if (binary === 'systemctl') return {};
    if (binary === 'systemd-run') {
      const unit = args[args.indexOf('--unit') + 1];
      if (unit === BRIDGE_UNIT) {
        this.bridgeRun = args;
        if (this.bridgeBoots) this.bridge.active = true;
      }
      if (unit === CONVERGE_UNIT) { this.convergeRun = args; this.convergeActive = true; }
      return {};
    }
    if (binary === 'ss' && args[0] === '-ltnH') {
      const port = Number(args[1].split(':')[1]);
      const up = port === 3900 ? this.home.active : port === 3901 ? this.bridge.active : false;
      return { stdout: up ? `LISTEN 0 511 100.64.0.1:${port} 0.0.0.0:*\nLISTEN 0 511 127.0.0.1:${port} 0.0.0.0:*\n` : '' };
    }
    if (binary === 'ss') {
      const port = Number(args[args.length - 1].split(':')[1]);
      return { stdout: 'x\n'.repeat(this.open[port] || 0) };
    }
    if (binary === 'iptables') return { status: this.rule ? 0 : 1 };
    if (binary === 'iptables-restore') {
      this.reloadedRules.push(options.input);
      this.rule = options.input.includes('--to-destination');
      return {};
    }
    if (binary === 'git') return { stdout: this.dirty ? ' M file\n' : '' };
    throw new Error(`Unexpected command: ${binary} ${args.join(' ')}`);
  }

  probe = async ({ host = '127.0.0.1', port, path: target, exempt = false }) => {
    let instance;
    if (port === 3901) instance = this.bridge;
    else if (port === 3900) instance = this.rule && this.ruleWorks && !exempt ? this.bridge : this.home;
    if (!instance?.active) throw Object.assign(new Error(`refused ${host}:${port}`), { code: 'ECONNREFUSED' });
    if (target === '/health/deployment') {
      if (instance.version < '3.43.3') return { status: 404, body: null };
      return { status: 200, body: { status: 'ok', version: instance.version, deploymentId: `total-recall-brain@${instance.version}`, pid: instance.pid, port } };
    }
    return { status: 200, body: { version: instance.version, daemon: instance === this.bridge ? 'running' : instance.daemon, vfs: { path: this.agentDir } } };
  };
}

const made = [];
afterEach(() => { for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function setup(options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-server-release-'));
  made.push(root);
  const host = new FakeHost(root, options);
  host.agentDir = path.join(root, 'agent');
  fs.mkdirSync(path.join(root, 'checkout', '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'checkout', 'package.json'), JSON.stringify({ name: 'total-recall-brain', version: host.checkoutVersion }));
  fs.writeFileSync(path.join(root, 'conntrack-count'), '261\n');
  const ctx = hostContext({
    conntrackCountFile: path.join(root, 'conntrack-count'),
    exec: host.exec,
    probe: host.probe,
    sleep: async () => {},
    stateFile: path.join(root, 'state.json'),
    packageRoot: path.join(root, 'artifact'),
    pkg: { name: 'total-recall-brain', version: host.artifactVersion },
    entry: path.join(root, 'artifact', 'bin', 'total-recall-server-release.mjs'),
    moveCheckout: async ({ version }) => { host.checkoutVersion = version; host.moved = true; },
    now: (() => { let t = 0; return () => { t += 1000; return t; }; })(),
    bootMs: 5000,
    homeBootMs: 5000,
    daemonMs: 5000,
    drainMs: 5000,
  });
  return { host, ctx, root };
}

const release = { version: '3.43.3', slot: 'blue', operationKey: 'stage-key' };
const stageInput = release;
const switchInput = { slot: 'blue', version: '3.43.3', deploymentId: 'total-recall-brain@3.43.3', previousSlot: null, previousDeploymentId: null, operationKey: 'switch-key' };
const retireInput = { slot: 'green', deploymentId: 'total-recall-brain@3.43.0', activeSlot: 'blue', activeVersion: '3.43.3', activeDeploymentId: 'total-recall-brain@3.43.3', operationKey: 'retire-key' };

async function stageAndSwitch(ctx) {
  await stage(stageInput, ctx);
  return switchTraffic(switchInput, ctx);
}

async function finish(host, ctx) {
  const begun = await retire(retireInput, ctx);
  expect(begun.pending).toBe(true);
  try { await converge(ctx); } finally { host.convergeActive = false; }
  return retire(retireInput, ctx);
}

describe('rules', () => {
  const rules = swapOnRules({ addresses: ['100.64.0.1', '127.0.0.1'], homePort: 3900, bridgePort: 3901 });
  it('rewrites only the port, for each address the server listens on', () => {
    expect(rules).toContain(`-A ${SWAP_CHAIN} -p tcp -d 100.64.0.1 --dport 3900 -j DNAT --to-destination :3901`);
    expect(rules).toContain(`-A ${SWAP_CHAIN} -p tcp -d 127.0.0.1 --dport 3900 -j DNAT --to-destination :3901`);
  });
  it('catches mesh callers and local callers in one transaction', () => {
    expect(rules).toContain(`-I PREROUTING 1 -j ${SWAP_CHAIN}`);
    expect(rules).toContain(`-I OUTPUT 1 -j ${SWAP_CHAIN}`);
    expect(rules.trim().endsWith('COMMIT')).toBe(true);
    expect(rules.match(/COMMIT/g)).toHaveLength(1);
  });
  it('lets a local probe through first, so the home port can be checked behind the rule', () => {
    const lines = rules.split('\n');
    const exempt = lines.findIndex((line) => line.includes('--sport 30000:30999 -j RETURN'));
    const first = lines.findIndex((line) => line.includes('DNAT'));
    expect(exempt).toBeGreaterThan(-1);
    expect(exempt).toBeLessThan(first);
    expect(lines[exempt]).toContain('-s 127.0.0.1');
  });
  it('removes everything it added in one transaction', () => {
    const off = swapOffRules();
    for (const part of [`-D PREROUTING -j ${SWAP_CHAIN}`, `-D OUTPUT -j ${SWAP_CHAIN}`, `-F ${SWAP_CHAIN}`, `-X ${SWAP_CHAIN}`, 'COMMIT']) expect(off).toContain(part);
  });
  it('refuses to build a rule for nothing', () => {
    expect(() => swapOnRules({ addresses: [], homePort: 1, bridgePort: 2 })).toThrow(/No listening address/);
  });
});

describe('reading the host', () => {
  it('parses systemd environment, including quoted values', () => {
    expect(parseEnvironment('NODE_ENV=production PORT=3900 "LABEL=a b"')).toEqual({ NODE_ENV: 'production', PORT: '3900', LABEL: 'a b' });
    expect(parseEnvironment('')).toEqual({});
  });
  it('parses listeners from ss', () => {
    expect(parseListeners('LISTEN 0 511 100.64.0.1:3900 0.0.0.0:*\nLISTEN 0 511 127.0.0.1:3900 0.0.0.0:*\n')).toEqual(['100.64.0.1', '127.0.0.1']);
    expect(parseListeners('')).toEqual([]);
  });
});

describe('stage', () => {
  it('starts the verified install beside the server and gives a separate health address', async () => {
    const { host, ctx } = setup();
    const receipt = await stage(stageInput, ctx);
    expect(receipt).toMatchObject({ verified: true, isolated: true, slot: 'blue', version: '3.43.3', deploymentId: 'total-recall-brain@3.43.3', port: 3901, healthUrl: 'http://100.64.0.1:3901/health/deployment' });
    expect(host.home.active).toBe(true);
    expect(host.rule).toBe(false);
    expect(host.bridgeRun).toEqual(expect.arrayContaining(['--collect', '--setenv=PORT=3901', '--setenv=DISABLE_DAEMON=true', '--setenv=TR_MONITOR_PORT=0', `--setenv=AGENT_DIR=${host.agentDir}`, path.join(ctx.packageRoot, 'src', 'server', 'index.mjs')]));
    expect(host.bridgeRun.some((arg) => arg.startsWith('--setenv=TR_SERVER_PID_FILE='))).toBe(true);
    expect(host.gaps).toEqual([]);
  });
  it('answers again from what is running when the call is repeated', async () => {
    const { host, ctx } = setup();
    const first = await stage(stageInput, ctx);
    const runs = host.commands.filter((line) => line.startsWith('systemd-run')).length;
    expect(await stage(stageInput, ctx)).toEqual(first);
    expect(host.commands.filter((line) => line.startsWith('systemd-run'))).toHaveLength(runs);
  });
  it('refuses a version this install does not hold', async () => {
    const { host, ctx } = setup();
    await expect(stage({ ...stageInput, version: '9.9.9' }, ctx)).rejects.toThrow(/Install total-recall-brain@9\.9\.9/);
    expect(host.bridge.active).toBe(false);
  });
  it('refuses while a swap is in progress', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    await expect(stage(stageInput, ctx)).rejects.toThrow(/swap is in progress/);
    expect(host.rule).toBe(true);
  });
  it('refuses while maintenance holds its lock, and proceeds past a dead one', async () => {
    const { host, ctx } = setup();
    const lock = path.join(host.agentDir, 'skills', 'total-recall', 'memory-derived', 'automatic-brain-updates.json.lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, String(process.pid));
    await expect(stage(stageInput, ctx)).rejects.toThrow(/Maintenance is running/);
    expect(host.bridge.active).toBe(false);
    await expect(stage(stageInput, { ...ctx, isAlive: () => false })).resolves.toMatchObject({ verified: true });
  });
  it('refuses when the checkout could not follow, before anything starts', async () => {
    const { host, ctx } = setup({ dirty: true });
    await expect(stage(stageInput, ctx)).rejects.toThrow(/uncommitted changes/);
    expect(host.bridge.active).toBe(false);
  });
  it('refuses when connection tracking is off, because open connections would be reset', async () => {
    const { host, ctx, root } = setup();
    fs.writeFileSync(path.join(root, 'conntrack-count'), '0\n');
    await expect(stage(stageInput, ctx)).rejects.toThrow(/Connection tracking is not active/);
    fs.rmSync(path.join(root, 'conntrack-count'));
    await expect(stage(stageInput, ctx)).rejects.toThrow(/Connection tracking is not active/);
    expect(host.bridge.active).toBe(false);
  });
  it('refuses when the install is the checkout itself', async () => {
    const { host, ctx, root } = setup();
    await expect(stage(stageInput, { ...ctx, packageRoot: path.join(root, 'checkout') })).rejects.toThrow(/separate from the checkout/);
    expect(host.bridge.active).toBe(false);
  });
  it('refuses when nothing is serving, because there is nothing to protect', async () => {
    const { host, ctx } = setup();
    host.home.active = false;
    await expect(stage(stageInput, ctx)).rejects.toThrow(/Nothing answers on port 3900/);
  });
  it('stops the staged server when it does not come up, and leaves the home one alone', async () => {
    const { host, ctx } = setup();
    host.bridgeBoots = false;
    await expect(stage(stageInput, ctx)).rejects.toThrow(/did not happen within/);
    expect(host.commands).toContain(`systemctl stop ${BRIDGE_UNIT}`);
    expect(host.home).toMatchObject({ active: true, pid: 100 });
    expect(host.gaps).toEqual([]);
  });
  it('refuses a staged server that opened another brain', async () => {
    const { host, ctx } = setup();
    const probe = async (request) => {
      const answer = await host.probe(request);
      return request.port === 3901 && request.path === '/health' ? { ...answer, body: { ...answer.body, vfs: { path: '/elsewhere' } } } : answer;
    };
    await expect(stage(stageInput, { ...ctx, probe })).rejects.toThrow(/opened \/elsewhere/);
    expect(host.bridge.active).toBe(false);
  });
});

describe('switch', () => {
  it('moves new connections and names what it displaced on a first release', async () => {
    const { host, ctx } = setup();
    const receipt = await stageAndSwitch(ctx);
    expect(receipt).toMatchObject({ verified: true, graceful: true, activeSlot: 'blue', deploymentId: 'total-recall-brain@3.43.3', displaced: { version: '3.43.0', deploymentId: 'total-recall-brain@3.43.0', port: 3900 } });
    expect(host.rule).toBe(true);
    expect(host.home.active).toBe(true);
    expect(host.gaps).toEqual([]);
  });
  it('names nothing when the deploy state already knows the previous release', async () => {
    const { ctx } = setup();
    await stage(stageInput, ctx);
    const receipt = await switchTraffic({ ...switchInput, previousDeploymentId: 'total-recall-brain@3.43.2' }, ctx);
    expect(receipt.displaced).toBeUndefined();
  });
  it('takes the rule away when traffic does not reach the staged server', async () => {
    const { host, ctx } = setup();
    await stage(stageInput, ctx);
    host.ruleWorks = false;
    await expect(switchTraffic(switchInput, ctx)).rejects.toThrow(/did not reach the staged server/);
    expect(host.rule).toBe(false);
    expect(host.home).toMatchObject({ active: true, pid: 100 });
    expect(host.gaps).toEqual([]);
  });
  it('refuses a release that is not the one staged', async () => {
    const { ctx } = setup();
    await stage(stageInput, ctx);
    await expect(switchTraffic({ ...switchInput, deploymentId: 'total-recall-brain@1.0.0' }, ctx)).rejects.toThrow(/No staged release/);
  });
  it('refuses when the staged server has gone', async () => {
    const { host, ctx } = setup();
    await stage(stageInput, ctx);
    host.bridge.active = false;
    await expect(switchTraffic(switchInput, ctx)).rejects.toThrow(/Nothing was switched/);
    expect(host.rule).toBe(false);
  });
});

describe('the whole swap', () => {
  it('has a gap check that catches a wrong order, so a clean run means something', () => {
    const { host } = setup();
    host.exec('systemctl', ['stop', HOME_UNIT]);
    expect(host.gaps).toEqual([`systemctl stop ${HOME_UNIT}`]);
    const second = setup().host;
    second.bridge.active = true;
    second.exec('iptables-restore', ['--noflush'], { input: swapOnRules({ addresses: ['127.0.0.1'], homePort: 3900, bridgePort: 3901 }) });
    second.exec('systemctl', ['stop', HOME_UNIT]);
    expect(second.gaps).toEqual([]);
    second.exec('iptables-restore', ['--noflush'], { input: swapOffRules() });
    expect(second.gaps).toHaveLength(1);
  });
  it('never leaves a new client without a server, and ends as it began', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    const done = await finish(host, ctx);
    expect(host.gaps).toEqual([]);
    expect(done).toMatchObject({ verified: true, deploymentId: retireInput.deploymentId, stopped: true, filesRemoved: true, drained: true, activePort: 3900, activeHealthUrl: 'http://100.64.0.1:3900/health/deployment' });
    expect(host.rule).toBe(false);
    expect(host.bridge.active).toBe(false);
    expect(host.home).toMatchObject({ active: true, version: '3.43.3', daemon: 'running' });
    expect(host.home.pid).not.toBe(100);
    expect(host.moved).toBe(true);
  });
  it('stops the old server only behind the rule, and removes the rule only after the new home answers', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    await finish(host, ctx);
    expect(host.stoppedHomeWithRuleOn).toBe(true);
    const order = (needle) => host.commands.findIndex((line) => line.startsWith(needle));
    expect(order(`systemctl stop ${HOME_UNIT}`)).toBeLessThan(order(`systemctl start ${HOME_UNIT}`));
    const removed = host.commands.lastIndexOf('iptables-restore --noflush');
    expect(order(`systemctl start ${HOME_UNIT}`)).toBeLessThan(removed);
    expect(removed).toBeLessThan(order(`systemctl stop ${BRIDGE_UNIT}`));
    expect(host.reloadedRules.at(-1)).toContain(`-X ${SWAP_CHAIN}`);
  });
  it('waits for the old server to drain, and reports streams it had to close', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    host.open[3900] = 2;
    const done = await finish(host, ctx);
    expect(done.closedConnections).toBe(2);
    expect(host.gaps).toEqual([]);
  });
  it('keeps traffic on the staged server when the new home does not start, then retries', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    host.failHomeStarts = 1;
    await retire(retireInput, ctx);
    await expect(converge(ctx)).rejects.toThrow(/start failed/);
    host.convergeActive = false;
    expect(host.rule).toBe(true);
    expect(host.bridge.active).toBe(true);
    expect(host.gaps).toEqual([]);
    await expect(retire(retireInput, ctx)).rejects.toThrow(/Traffic stays on the staged server/);
    const done = await finish(host, ctx);
    expect(done.verified).toBe(true);
    expect(host.rule).toBe(false);
    expect(host.home.version).toBe('3.43.3');
    expect(host.gaps).toEqual([]);
  });
  it('keeps traffic on the staged server when the home unit comes up on the wrong release', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    await retire(retireInput, { ...ctx });
    await expect(converge({ ...ctx, moveCheckout: async () => {} })).rejects.toThrow(/reporting 3\.43\.3/);
    host.convergeActive = false;
    expect(host.rule).toBe(true);
    expect(host.bridge.active).toBe(true);
    expect(host.gaps).toEqual([]);
  });
  it('keeps traffic on the staged server when the checkout will not move', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    await retire(retireInput, ctx);
    await expect(converge({ ...ctx, moveCheckout: async () => { throw new Error('no fast-forward'); } })).rejects.toThrow(/no fast-forward/);
    host.convergeActive = false;
    expect(host.rule).toBe(true);
    expect(host.gaps).toEqual([]);
  });
  it('keeps traffic on the staged server when the daemon does not come back', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    await retire(retireInput, ctx);
    const probe = async (request) => {
      const answer = await host.probe(request);
      return request.path === '/health' && request.exempt ? { ...answer, body: { ...answer.body, daemon: 'dead' } } : answer;
    };
    await expect(converge({ ...ctx, probe })).rejects.toThrow(/daemon/);
    host.convergeActive = false;
    expect(host.rule).toBe(true);
    expect(host.gaps).toEqual([]);
  });
  it('does not stop a home server already on the release when a retry resumes', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    await retire(retireInput, ctx);
    const probe = async (request) => {
      const answer = await host.probe(request);
      return request.path === '/health' && request.exempt && host.home.pid === 101 && !host.daemonBack ? { ...answer, body: { ...answer.body, daemon: 'dead' } } : answer;
    };
    await expect(converge({ ...ctx, probe })).rejects.toThrow(/daemon/);
    host.convergeActive = false;
    host.daemonBack = true;
    const stops = host.commands.filter((line) => line === `systemctl stop ${HOME_UNIT}`).length;
    await expect(retire(retireInput, ctx)).rejects.toThrow(/Traffic stays/);
    await finish(host, ctx);
    expect(host.commands.filter((line) => line === `systemctl stop ${HOME_UNIT}`)).toHaveLength(stops);
    expect(host.home.pid).toBe(101);
    expect(host.rule).toBe(false);
  });
  it('reports progress while the detached work runs, and starts it once', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    expect((await retire(retireInput, ctx)).pending).toBe(true);
    expect((await retire(retireInput, ctx)).pending).toBe(true);
    expect(host.commands.filter((line) => line.startsWith(`systemd-run --unit ${CONVERGE_UNIT}`))).toHaveLength(1);
    expect(host.convergeRun).toContain('converge');
  });
  it('refuses to retire before a switch', async () => {
    const { ctx } = setup();
    await stage(stageInput, ctx);
    await expect(retire(retireInput, ctx)).rejects.toThrow(/No switched release/);
  });
  it('answers again with the receipt once finished, so a lost answer can be read back', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    const first = await finish(host, ctx);
    expect(await retire(retireInput, ctx)).toEqual(first);
  });
});

describe('moveCheckout', () => {
  it('takes the dashboard from the verified install', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-move-checkout-'));
    made.push(root);
    const directory = path.join(root, 'checkout');
    const artifactRoot = path.join(root, 'artifact');
    fs.mkdirSync(path.join(directory, 'frontend', 'dist'), { recursive: true });
    fs.mkdirSync(path.join(artifactRoot, 'frontend', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'total-recall-brain', version: '3.43.3' }));
    fs.writeFileSync(path.join(directory, 'frontend', 'dist', 'old.js'), 'old');
    fs.writeFileSync(path.join(artifactRoot, 'frontend', 'dist', 'new.js'), 'new');
    await moveCheckout({ directory, name: 'total-recall-brain', version: '3.43.3', artifactRoot });
    expect(fs.readdirSync(path.join(directory, 'frontend', 'dist'))).toEqual(['new.js']);
  });
});

describe('status', () => {
  it('reads the swap without changing it', async () => {
    const { host, ctx } = setup();
    await stageAndSwitch(ctx);
    const before = host.commands.filter((line) => /systemctl (stop|start)|iptables-restore|systemd-run/.test(line)).length;
    const report = await status(ctx);
    expect(report).toMatchObject({ rule: true, staged: true, converging: false, home: { port: 3900, version: '3.43.0' }, swap: { phase: 'switched' } });
    expect(host.commands.filter((line) => /systemctl (stop|start)|iptables-restore|systemd-run/.test(line))).toHaveLength(before);
  });
});

describe('main', () => {
  const output = () => { const lines = []; return { lines, write: (text) => lines.push(text) }; };
  it('prints help and does nothing on --help', async () => {
    const { lines, write } = output();
    const makeContext = () => { throw new Error('unexpected'); };
    expect(await main(['--help'], { write, makeContext, platform: 'linux' })).toBe(0);
    expect(lines.join('')).toContain('stage <payload>');
    expect(await main([], { write, makeContext, platform: 'linux' })).toBe(0);
  });
  it('refuses unknown operations and arguments', async () => {
    const { lines, write } = output();
    const makeContext = () => { throw new Error('unexpected'); };
    expect(await main(['destroy'], { write, makeContext, platform: 'linux' })).toBe(1);
    expect(await main(['status', 'extra'], { write, makeContext, platform: 'linux' })).toBe(1);
    expect(await main(['stage', 'e30', '--force'], { write, makeContext, platform: 'linux' })).toBe(1);
    expect(await main(['stage', 'not json!'], { write, makeContext, platform: 'linux' })).toBe(1);
    expect(lines.every((line) => JSON.parse(line).verified === false)).toBe(true);
  });
  it('refuses a host without systemd and iptables', async () => {
    const { lines, write } = output();
    expect(await main(['status'], { write, makeContext: () => { throw new Error('unexpected'); }, platform: 'darwin' })).toBe(1);
    expect(JSON.parse(lines[0]).error).toContain('Linux');
  });
  it('prints one JSON document carrying the operation key, success or failure', async () => {
    const { host, ctx } = setup();
    host.bridgeBoots = false;
    const { lines, write } = output();
    const payload = Buffer.from(JSON.stringify({ ...stageInput, version: '9.9.9' })).toString('base64url');
    expect(await main(['stage', payload], { write, makeContext: () => ctx, platform: 'linux' })).toBe(1);
    expect(JSON.parse(lines[0])).toMatchObject({ operationKey: 'stage-key', verified: false });
    expect(lines[0].trim().split('\n')).toHaveLength(1);
  });
});
