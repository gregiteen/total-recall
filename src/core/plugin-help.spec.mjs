import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { asksForHelp, manifestHelp } from './plugin-help.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'total-recall.mjs');

describe('asksForHelp', () => {
  it('recognises the help flags anywhere, and help as the first word', () => {
    for (const args of [['--help'], ['-h'], ['send', '--help'], ['send', 'x', '-h'], ['help']]) expect(asksForHelp(args), args.join(' ')).toBe(true);
  });
  it('leaves everything else alone', () => {
    for (const args of [[], ['send'], ['send', 'help'], ['--helpful']]) expect(asksForHelp(args), args.join(' ')).toBe(false);
  });
});

describe('manifestHelp', () => {
  const plugin = (cli = {}, rest = {}) => ({ id: 'fx', manifest: { description: 'Does things.', cli: { command: 'fx', subcommands: [
    { name: 'send', description: 'Send a message.', effect: 'write', args: [{ name: 'to', positional: true, label: 'Who gets it', required: true }, { name: 'dryRun', flag: '--dry-run', type: 'boolean', label: 'Do not send' }, { name: 'body', flag: '--body', type: 'string', label: 'The text' }] },
    { name: 'status', description: 'Show status.', effect: 'read' },
  ], ...cli }, ...rest } });

  it('describes a subcommand from its declaration', () => {
    const text = manifestHelp(plugin(), { args: ['send', '--help'] });
    expect(text).toContain('total-recall fx send — Send a message.');
    expect(text).toContain('Usage: total-recall fx send <to> [options]');
    expect(text).toContain('--dry-run');
    expect(text).toContain('--body <body>');
    expect(text).toContain('Who gets it (required)');
    expect(text).toContain('Effect: write');
    expect(text).toContain('nothing was run');
  });
  it('describes the plugin at the namespace level, with the work that belongs to it', () => {
    const text = manifestHelp(plugin({}, { gate: { tasks: ['Send a message'] } }), { args: ['--help'] });
    expect(text).toContain('total-recall fx — Does things.');
    expect(text).toContain('Use it to:');
    expect(text).toContain('Send a message');
    expect(text).toMatch(/send\s+Send a message\./);
    expect(text).toMatch(/status\s+Show status\./);
  });
  it('accepts the subcommand given separately, as programmatic callers do', () => {
    expect(manifestHelp(plugin(), { subcommand: 'status', args: ['--help'] })).toContain('total-recall fx status');
  });
  it('says so for an unknown command, and still lists the real ones', () => {
    const text = manifestHelp(plugin(), { args: ['nope', '--help'] });
    expect(text).toContain('Unknown command: nope');
    expect(text).toMatch(/send\s+Send a message\./);
  });
  it('steps aside when help was not asked for, or the plugin answers for itself', () => {
    expect(manifestHelp(plugin(), { args: ['send', 'x'] })).toBeNull();
    expect(manifestHelp(plugin({ answers_help: true }), { args: ['send', '--help'] })).toBeNull();
  });
  it('handles a plugin that declares no commands', () => {
    expect(manifestHelp({ id: 'fx', manifest: { cli: { command: 'fx' } } }, { args: ['--help'] })).toContain('total-recall fx');
  });
});

describe('--help through the real command never runs plugin code', () => {
  let home;
  let marker;
  const pluginDir = () => path.join(home, '.agent', 'skills', 'total-recall', 'plugins', 'fx');
  const env = () => ({ ...process.env, HOME: home, AGENT_DIR: path.join(home, '.agent'), _TR_TEST_AGENT_DIR: '', TR_SECRETS_PASSWORD: '' });
  const run = (...args) => spawnSync(process.execPath, [BIN, 'fx', ...args], { cwd: home, encoding: 'utf8', env: env() });
  const install = (cli = {}) => {
    fs.mkdirSync(path.join(pluginDir(), 'ui'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), JSON.stringify({
      id: 'fx', name: 'Fixture', version: '1.0.0', description: 'Sends real messages.',
      cli: { command: 'fx', handler: './cli.mjs', subcommands: [{ name: 'send', description: 'Send a real message.', effect: 'write' }], ...cli },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'fx-card', module: 'ui/card.js' }] },
    }));
    fs.writeFileSync(path.join(pluginDir(), 'ui', 'card.js'), '');
    // A plugin that ignores --help and does its real work, like most of the 166 the audit found.
    fs.writeFileSync(path.join(pluginDir(), 'cli.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' ')); console.log('SENT');`);
  };

  beforeAll(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-help-')));
    marker = path.join(home, 'message-was-sent');
    install();
  });
  afterAll(() => fs.rmSync(home, { recursive: true, force: true }));
  beforeEach(() => fs.rmSync(marker, { force: true }));

  for (const args of [['send', '--help'], ['send', '-h'], ['send', 'someone', '--help'], ['--help'], ['-h'], ['help']]) {
    it(`does nothing on: fx ${args.join(' ')}`, () => {
      const r = run(...args);
      expect(r.status, r.stderr).toBe(0);
      expect(fs.existsSync(marker)).toBe(false);
      expect(r.stdout).not.toContain('SENT');
      expect(r.stdout).toContain('Send a real message.');
    });
  }
  it('still runs the command when help was not asked for', () => {
    const r = run('send', 'someone');
    expect(r.stdout).toContain('SENT');
    expect(fs.readFileSync(marker, 'utf8')).toContain('someone');
  });
  it('answers even when the plugin is broken, so an agent can still read about it', () => {
    fs.writeFileSync(path.join(pluginDir(), 'cli.mjs'), 'throw new Error("boom");');
    expect(run('send', '--help').status).toBe(0);
    install();
  });
  it('lets a plugin verified to answer for itself do so', () => {
    install({ answers_help: true });
    fs.writeFileSync(path.join(pluginDir(), 'cli.mjs'), 'console.log("MY OWN HELP");');
    expect(run('send', '--help').stdout).toContain('MY OWN HELP');
    install();
  });
});
