import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installPlugin } from './plugin-distribution.mjs';
import { readPluginRecord } from './plugin-store.mjs';
import { discoverPlugins } from './plugin-loader.mjs';
import { updateInstalledPlugins } from './plugin-updates.mjs';
import { writeFixturePlugin } from './testing/plugin-fixture.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' }).trim();

describe('automatic plugin updates', () => {
  let tmp;
  let proj;
  let prevAgentDir;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-updates-'));
    prevAgentDir = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(tmp, 'home-agent');
    proj = path.join(tmp, 'app');
    fs.mkdirSync(path.join(proj, '.agent'), { recursive: true });
  });

  afterEach(() => {
    if (prevAgentDir === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = prevAgentDir;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function gitPlugin(id, version) {
    const work = path.join(tmp, `${id}-work`);
    fs.mkdirSync(work);
    writeFixturePlugin(work, { id, name: id, version, description: 'Fixture' }, { fs, path });
    git(work, 'init', '-q');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', version);
    const remote = path.join(tmp, `${id}.git`);
    git(tmp, 'clone', '-q', '--bare', work, remote);
    git(work, 'remote', 'add', 'origin', remote);
    return { work, remote };
  }

  function release(work, id, version) {
    writeFixturePlugin(work, { id, name: id, version, description: 'Fixture' }, { fs, path });
    git(work, 'commit', '-q', '-am', version);
    git(work, 'push', '-q', 'origin', 'HEAD');
    return git(work, 'rev-parse', 'HEAD');
  }

  const record = id => readPluginRecord(discoverPlugins(proj).find(plugin => plugin.id === id));

  it('records the installed commit of a git plugin', async () => {
    const { work, remote } = gitPlugin('maps', '0.1.0');
    await installPlugin(remote, { projectRoot: proj, recompile: false });
    expect(record('maps').source).toEqual({ kind: 'git', ref: remote, commit: git(work, 'rev-parse', 'HEAD') });
  });

  it('reinstalls a git plugin when its remote moves ahead, then reports it current', async () => {
    const { work, remote } = gitPlugin('maps', '0.1.0');
    await installPlugin(remote, { projectRoot: proj, recompile: false });
    const head = release(work, 'maps', '0.2.0');

    const first = await updateInstalledPlugins({ roots: [proj] });
    const row = first.results.find(r => r.id === 'maps');
    expect(row).toMatchObject({ status: 'updated', previous_version: '0.1.0', version: '0.2.0', to: head });
    expect(fs.existsSync(row.previous_directory)).toBe(true);
    expect(record('maps').source.commit).toBe(head);
    expect(first.updated).toBe(1);

    const second = await updateInstalledPlugins({ roots: [proj] });
    expect(second.results.find(r => r.id === 'maps')).toMatchObject({ status: 'current', commit: head });
    expect(second.updated).toBe(0);
  });

  it('upgrades a git install recorded before commits were tracked', async () => {
    const { work, remote } = gitPlugin('maps', '0.1.0');
    await installPlugin(remote, { projectRoot: proj, recompile: false });
    const { patchPluginRecord } = await import('./plugin-store.mjs');
    await patchPluginRecord(discoverPlugins(proj).find(p => p.id === 'maps'), { source: { kind: 'git', ref: remote } });
    const report = await updateInstalledPlugins({ roots: [proj] });
    expect(report.results.find(r => r.id === 'maps')).toMatchObject({ status: 'updated', from: null });
    expect(record('maps').source.commit).toBe(git(work, 'rev-parse', 'HEAD'));
  });

  it('only reports in a dry run', async () => {
    const { work, remote } = gitPlugin('maps', '0.1.0');
    await installPlugin(remote, { projectRoot: proj, recompile: false });
    release(work, 'maps', '0.2.0');
    const report = await updateInstalledPlugins({ roots: [proj], dryRun: true });
    expect(report.results.find(r => r.id === 'maps').status).toBe('behind');
    expect(discoverPlugins(proj).find(p => p.id === 'maps').manifest.version).toBe('0.1.0');
  });

  it('follows a copied local directory and fails loudly when that directory is gone', async () => {
    const source = path.join(tmp, 'local-src');
    fs.mkdirSync(source);
    writeFixturePlugin(source, { id: 'local-one', name: 'Local', version: '0.1.0', description: 'Fixture' }, { fs, path });
    await installPlugin(source, { projectRoot: proj, recompile: false });
    expect((await updateInstalledPlugins({ roots: [proj] })).results.find(r => r.id === 'local-one').status).toBe('current');

    writeFixturePlugin(source, { id: 'local-one', name: 'Local', version: '0.2.0', description: 'Fixture' }, { fs, path });
    expect((await updateInstalledPlugins({ roots: [proj] })).results.find(r => r.id === 'local-one')).toMatchObject({ status: 'updated', version: '0.2.0' });

    fs.rmSync(source, { recursive: true, force: true });
    const report = await updateInstalledPlugins({ roots: [proj] });
    expect(report.results.find(r => r.id === 'local-one')).toMatchObject({ status: 'failed' });
    expect(report.failed).toBe(1);
  });

  it('never replaces a linked dev checkout, even when its record says it was copied', async () => {
    const linkedSrc = path.join(tmp, 'dev-checkout');
    fs.mkdirSync(linkedSrc);
    writeFixturePlugin(linkedSrc, { id: 'dev-one', name: 'Dev', version: '0.1.0', description: 'Fixture' }, { fs, path });
    await installPlugin(linkedSrc, { projectRoot: proj, link: true, recompile: false });
    const { patchPluginRecord } = await import('./plugin-store.mjs');
    await patchPluginRecord(discoverPlugins(proj).find(p => p.id === 'dev-one'), { source: { kind: 'bundled', ref: 'dev-one' } });
    const report = await updateInstalledPlugins({ roots: [proj] });
    expect(report.results.find(r => r.id === 'dev-one').status).toBe('linked');
    expect(fs.lstatSync(path.join(proj, '.agent', 'skills', 'total-recall', 'plugins', 'dev-one')).isSymbolicLink()).toBe(true);
  });

  it('reports a copy that records itself as its source as unmanaged, without touching it', async () => {
    const source = path.join(tmp, 'self-src');
    fs.mkdirSync(source);
    writeFixturePlugin(source, { id: 'self-one', name: 'Self', version: '0.1.0', description: 'Fixture' }, { fs, path });
    await installPlugin(source, { projectRoot: proj, recompile: false });
    const installed = discoverPlugins(proj).find(p => p.id === 'self-one');
    const { patchPluginRecord } = await import('./plugin-store.mjs');
    await patchPluginRecord(installed, { source: { kind: 'local', ref: installed.dir } });
    fs.writeFileSync(path.join(installed.dir, 'local-edit.txt'), 'kept');
    const report = await updateInstalledPlugins({ roots: [proj] });
    expect(report.results.find(r => r.id === 'self-one').status).toBe('unmanaged');
    expect(report.unmanaged).toBe(1);
    expect(report.failed).toBe(0);
    expect(fs.readFileSync(path.join(installed.dir, 'local-edit.txt'), 'utf8')).toBe('kept');
  });

  it('leaves linked checkouts to their owner and reports an unreachable git source', async () => {
    const linkedSrc = path.join(tmp, 'linked-src');
    fs.mkdirSync(linkedSrc);
    writeFixturePlugin(linkedSrc, { id: 'linked-one', name: 'Linked', version: '0.1.0', description: 'Fixture' }, { fs, path });
    await installPlugin(linkedSrc, { projectRoot: proj, link: true, recompile: false });
    const { remote } = gitPlugin('maps', '0.1.0');
    await installPlugin(remote, { projectRoot: proj, recompile: false });
    fs.rmSync(remote, { recursive: true, force: true });

    const report = await updateInstalledPlugins({ roots: [proj] });
    expect(report.results.find(r => r.id === 'linked-one').status).toBe('linked');
    expect(report.results.find(r => r.id === 'maps').status).toBe('failed');
    expect(fs.existsSync(path.join(proj, '.agent', 'skills', 'total-recall', 'plugins', 'maps', 'plugin.json'))).toBe(true);
  });
});
