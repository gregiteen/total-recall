import { describe, it, expect } from 'vitest';
import { validateManifestContract } from './manifest.mjs';
import { validatePluginManifest } from '../plugin-loader.mjs';

const home = { id: 'home', kind: 'panel', tag: 'demo-home', module: 'ui/home.js', description: 'Demo Home' };

const base = () => ({
  id: 'demo', name: 'Demo', version: '1.0.0', description: 'A demonstration plugin.',
  cli: { command: 'demo', handler: './cli.mjs', subcommands: [
    { name: 'status', description: 's', effect: 'read', output: 'json' },
    { name: 'refund', description: 'r', effect: 'destructive', args: [
      { name: 'paymentId', flag: '--payment', label: 'Payment', type: 'string', required: true },
      { name: 'reason', flag: '--reason', label: 'Reason', type: 'choice', options: ['duplicate', 'fraud'] }
    ] }
  ] },
  status: { command: 'status', refresh_seconds: 30 },
  distribution: { tier: 'official', license: 'open' },
  ui: { home: home.id, design_tokens: 'DESIGN.md', elements: [home] },
  branding: { color: '#635bff', accent: '#0a2540', font: 'ibm-plex', density: 'compact', radius: 'sm', header: 'ledger-rule' }
});

describe('plugin manifest contract', () => {
  it('accepts a complete declaration', () => {
    expect(validateManifestContract(base()).errors).toEqual([]);
    expect(validatePluginManifest(base()).valid).toBe(true);
  });
  it('requires a native Home and rejects legacy card declarations', () => {
    expect(validatePluginManifest({ ...base(), ui: undefined }).errors).toContain("A plugin must declare a native 'ui.home'");
    for (const field of ['card', 'card_layout', 'card_face']) {
      expect(validatePluginManifest({ ...base(), [field]: {} }).errors.join('\n')).toMatch(/is not supported/);
    }
    for (const kind of ['card', 'card-face']) {
      const manifest = base();
      manifest.ui.elements.push({ id: 'legacy', kind, tag: 'demo-legacy', module: 'ui/legacy.js' });
      expect(validatePluginManifest(manifest).errors.join('\n')).toMatch(/kind must be one of/);
    }
  });
  it('rejects an undeclared Home or a settings element as Home', () => {
    for (const kind of ['settings', 'panel']) {
      const manifest = base();
      manifest.ui.elements = [{ ...home, kind, id: kind === 'panel' ? 'different' : home.id }];
      expect(validatePluginManifest(manifest).errors.join('\n')).toMatch(/must name a declared content element/);
    }
  });
  it('rejects bad arguments, effects and unknown commands', () => {
    const m = base();
    m.cli.subcommands[1].effect = 'explode';
    m.cli.subcommands[1].args[0].type = 'blob';
    m.cli.subcommands[1].args[1].options = [];
    m.status.command = 'missing';
    const { errors } = validateManifestContract(m);
    expect(errors.join('\n')).toMatch(/effect must be one of/);
    expect(errors.join('\n')).toMatch(/type must be one of/);
    expect(errors.join('\n')).toMatch(/options is required/);
    expect(errors.join('\n')).toMatch(/status.command/);
  });
  it('rejects a subcommand timeout the plugin runner would refuse', () => {
    for (const bad of [0, 600001, 900000, 1.5, '60000']) {
      const m = base();
      m.cli.subcommands[1].timeout_ms = bad;
      expect(validateManifestContract(m).errors.join('\n')).toMatch(/timeout_ms must be an integer from 1 to 600000/);
    }
    const ok = base();
    ok.cli.subcommands[1].timeout_ms = 600000;
    expect(validateManifestContract(ok).errors).toEqual([]);
  });
  it('keeps secret arguments off the command line', () => {
    const m = base();
    m.cli.subcommands[1].args.push({ name: 'apiKey', flag: '--key', label: 'Key', type: 'string', secret: true });
    expect(validateManifestContract(m).errors.join('\n')).toMatch(/stdin, not as a flag/);
  });
  it('accepts one stdin string without positional/flag metadata and rejects ambiguity', () => {
    const m = base();
    m.cli.subcommands[1].args = [{ name: 'key', label: 'Key', type: 'string', secret: true }];
    expect(validateManifestContract(m).errors).toEqual([]);
    m.cli.subcommands[1].args.push({ name: 'other', label: 'Other', type: 'number', secret: true });
    expect(validateManifestContract(m).errors.join('\n')).toMatch(/must be a string/);
    expect(validateManifestContract(m).errors.join('\n')).toMatch(/only one secret/);
  });
  it('allows a plugin as many secondary screens as it needs', () => {
    const withPanel = base();
    withPanel.ui.elements = [home, { id: 'panel', kind: 'panel', tag: 'demo-panel', module: 'ui/panel.js' }];
    expect(validateManifestContract(withPanel).errors).toEqual([]);

    const many = base();
    many.ui.elements = [
      home,
      ...Array.from({ length: 40 }, (_, i) => ({ id: `screen-${i}`, kind: 'panel', tag: `demo-screen-${i}`, module: `ui/screen-${i}.js` })),
    ];
    expect(validateManifestContract(many).errors).toEqual([]);
    expect(validatePluginManifest(many).valid).toBe(true);

  });
  it('validates distribution', () => {
    const m = base();
    m.distribution = { tier: 'vip', license: 'secret' };
    expect(validateManifestContract(m).errors.length).toBe(2);
  });

  it('validates logo and provider branding and warns on emoji icons', () => {
    const m = base();
    m.branding.logo = 'ui/logo.svg';
    m.branding.provider = { name: 'Stripe', url: 'https://stripe.com' };
    expect(validateManifestContract(m).errors).toEqual([]);
    m.branding.logo = '../escape.svg';
    m.branding.provider = { url: 'http://insecure' };
    m.branding.icon = '⚡';
    const result = validateManifestContract(m);
    expect(result.errors.join('\n')).toMatch(/branding.logo must be a relative/);
    expect(result.errors.join('\n')).toMatch(/provider needs a name/);
    expect(result.warnings.join('\n')).toMatch(/icon is deprecated/);
  });

  it('validates workspace property when present', () => {
    const m = base();
    m.workspace = {
      component: 'PhoneDialer',
      tabs: ['Dialer', 'Calls', 'Messages', 'Contacts', 'Agents', 'Settings'],
      permissions: ['microphone']
    };
    expect(validateManifestContract(m).errors).toEqual([]);

    m.workspace.tabs = [''];
    m.workspace.permissions = [123];
    const result = validateManifestContract(m);
    expect(result.errors.join('\n')).toMatch(/workspace.tabs' must be an array of non-empty strings/);
    expect(result.errors.join('\n')).toMatch(/workspace.permissions' must be an array of permission strings/);
    m.workspace.permissions = ['filesystem'];
    expect(validateManifestContract(m).errors.join('\n')).toMatch(/workspace.permissions/);
  });
});

describe('brick declaration', () => {
  const brick = () => ({
    id: 'demo', name: 'Demo', version: '1.0.0', description: 'A brick.',
    brick: true, capability: { entry: 'capability/index.mjs', exports: ['createClient'] }
  });
  it('needs no Home', () => {
    expect(validateManifestContract(brick()).errors).toEqual([]);
  });
  it('requires a Home for a standalone plugin', () => {
    const plugin = { ...brick(), brick: undefined };
    expect(validateManifestContract(plugin).errors.join('\n')).toMatch(/must declare a native/);
  });
  it('rejects UI on a brick and a bad capability', () => {
    expect(validateManifestContract({ ...brick(), ui: { elements: [home] } }).errors.join('\n')).toMatch(/ships without UI/);
    expect(validateManifestContract({ ...brick(), capability: { entry: '../x.mjs', exports: [] } }).errors.join('\n'))
      .toMatch(/relative .*path[\s\S]*non-empty array/);
    expect(validateManifestContract({ ...brick(), capability: { entry: 'ui/home.js', exports: ['a'] } }).errors.join('\n')).toMatch(/\.js|ui\//);
  });
});
