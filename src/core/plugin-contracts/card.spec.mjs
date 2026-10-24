import { describe, it, expect } from 'vitest';
import { validateCardContract } from './card.mjs';
import { validatePluginManifest } from '../plugin-loader.mjs';

const face = { id: 'card', kind: 'card', tag: 'demo-card', module: 'ui/card.js', description: 'Demo face' };

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
  ui: { elements: [face] },
  branding: { color: '#635bff', accent: '#0a2540', font: 'ibm-plex', density: 'compact', radius: 'sm', header: 'ledger-rule' }
});

describe('card contract', () => {
  it('accepts a complete declaration', () => {
    expect(validateCardContract(base()).errors).toEqual([]);
    expect(validatePluginManifest(base()).valid).toBe(true);
  });
  it('requires a bespoke card face and rejects every shared template', () => {
    // Every plugin has a card. A plugin without one is incomplete.
    const missing = { id: 'demo', name: 'Demo', version: '1.0.0', description: 'd' };
    expect(validateCardContract(missing).errors.join('\n')).toMatch(/must declare the plugin's card face/);

    // A declared-but-empty ui is not a way to opt out.
    const emptyUi = { ...missing, ui: { elements: [] } };
    expect(validateCardContract(emptyUi).errors.join('\n')).toMatch(/must declare the plugin's card face/);

    const templated = base();
    templated.card_layout = { template: 'ledger', regions: [{ widget: 'status' }] };
    const text = validateCardContract(templated).errors.join('\n');
    expect(text).toMatch(/'card_layout' is not supported/);
    expect(text).toMatch(/never a shared template/);

    // The template vocabulary is gone: no template, widget or region concept remains.
    expect(validateCardContract(base()).errors).toEqual([]);
  });
  it('rejects bad arguments, effects and unknown commands', () => {
    const m = base();
    m.cli.subcommands[1].effect = 'explode';
    m.cli.subcommands[1].args[0].type = 'blob';
    m.cli.subcommands[1].args[1].options = [];
    m.status.command = 'missing';
    const { errors } = validateCardContract(m);
    expect(errors.join('\n')).toMatch(/effect must be one of/);
    expect(errors.join('\n')).toMatch(/type must be one of/);
    expect(errors.join('\n')).toMatch(/options is required/);
    expect(errors.join('\n')).toMatch(/status.command/);
  });
  it('keeps secret arguments off the command line', () => {
    const m = base();
    m.cli.subcommands[1].args.push({ name: 'apiKey', flag: '--key', label: 'Key', type: 'string', secret: true });
    expect(validateCardContract(m).errors.join('\n')).toMatch(/stdin, not as a flag/);
  });
  it('accepts one stdin string without positional/flag metadata and rejects ambiguity', () => {
    const m = base();
    m.cli.subcommands[1].args = [{ name: 'key', label: 'Key', type: 'string', secret: true }];
    expect(validateCardContract(m).errors).toEqual([]);
    m.cli.subcommands[1].args.push({ name: 'other', label: 'Other', type: 'number', secret: true });
    expect(validateCardContract(m).errors.join('\n')).toMatch(/must be a string/);
    expect(validateCardContract(m).errors.join('\n')).toMatch(/only one secret/);
  });
  it('requires exactly one declared card face', () => {
    const none = base();
    none.ui.elements = [{ id: 'settings', kind: 'settings', tag: 'x-settings', module: 'ui/settings.js' }];
    expect(validateCardContract(none).errors.join('\n')).toMatch(/must declare an element of kind 'card'/);

    const two = base();
    two.ui.elements = [face, { id: 'second', kind: 'card', tag: 'demo-second', module: 'ui/second.js' }];
    expect(validateCardContract(two).errors.join('\n')).toMatch(/exactly one card face/);

    expect(validateCardContract(base()).errors).toEqual([]);
  });

  it('allows a plugin as many secondary screens as it needs', () => {
    // One face, unlimited panels. A plugin defines its own screens, and there is
    // no host-imposed limit or screen set. The cardinality rule applies to
    // `card` alone.
    const withPanel = base();
    withPanel.ui.elements = [face, { id: 'panel', kind: 'panel', tag: 'demo-panel', module: 'ui/panel.js' }];
    expect(validateCardContract(withPanel).errors).toEqual([]);

    const many = base();
    many.ui.elements = [
      face,
      ...Array.from({ length: 40 }, (_, i) => ({ id: `screen-${i}`, kind: 'panel', tag: `demo-screen-${i}`, module: `ui/screen-${i}.js` })),
    ];
    expect(validateCardContract(many).errors).toEqual([]);
    expect(validatePluginManifest(many).valid).toBe(true);

    // Panels may be declared before or after the face.
    const faceLast = base();
    faceLast.ui.elements = [{ id: 'panel', kind: 'panel', tag: 'demo-panel', module: 'ui/panel.js' }, face];
    expect(validateCardContract(faceLast).errors).toEqual([]);
  });
  it('warns about fixed metrics', () => {
    const m = base();
    m.card_face = { metrics: [{ label: 'STATUS', value: 'ONLINE' }] };
    expect(validateCardContract(m).warnings.join('\n')).toMatch(/cannot reflect real state/);
  });
  it('validates distribution', () => {
    const m = base();
    m.distribution = { tier: 'vip', license: 'secret' };
    expect(validateCardContract(m).errors.length).toBe(2);
  });

  it('validates logo and provider branding and warns on emoji icons', () => {
    const m = base();
    m.branding.logo = 'ui/logo.svg';
    m.branding.provider = { name: 'Stripe', url: 'https://stripe.com' };
    expect(validateCardContract(m).errors).toEqual([]);
    m.branding.logo = '../escape.svg';
    m.branding.provider = { url: 'http://insecure' };
    m.branding.icon = '⚡';
    const result = validateCardContract(m);
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
    expect(validateCardContract(m).errors).toEqual([]);

    m.workspace.tabs = [''];
    m.workspace.permissions = [123];
    const result = validateCardContract(m);
    expect(result.errors.join('\n')).toMatch(/workspace.tabs' must be an array of non-empty strings/);
    expect(result.errors.join('\n')).toMatch(/workspace.permissions' must be an array of permission strings/);
    m.workspace.permissions = ['filesystem'];
    expect(validateCardContract(m).errors.join('\n')).toMatch(/workspace.permissions/);
  });
});
