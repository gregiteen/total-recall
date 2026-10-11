import { describe, it, expect } from 'vitest';
import { validateCardContract } from './card.mjs';
import { validatePluginManifest } from '../plugin-loader.mjs';

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
  card_layout: { template: 'ledger', regions: [
    { widget: 'status' },
    { widget: 'table', source: { command: 'status', path: 'items' }, columns: [{ key: 'id', label: 'Id' }, { key: 'amount', label: 'Amount', format: 'money' }] },
    { widget: 'actions', commands: ['refund'] }
  ] },
  branding: { color: '#635bff', accent: '#0a2540', font: 'ibm-plex', density: 'compact', radius: 'sm', header: 'ledger-rule' }
});

describe('card contract', () => {
  it('accepts a complete declaration', () => {
    expect(validateCardContract(base()).errors).toEqual([]);
    expect(validatePluginManifest(base()).valid).toBe(true);
  });
  it('is optional', () => {
    const m = { id: 'demo', name: 'Demo', version: '1.0.0', description: 'd' };
    expect(validateCardContract(m).errors).toEqual([]);
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
  it('requires layout regions to bind to declared commands', () => {
    const m = base();
    m.card_layout.regions[1].source.command = 'nope';
    m.card_layout.regions.push({ widget: 'table', source: { command: 'status' } });
    const text = validateCardContract(m).errors.join('\n');
    expect(text).toMatch(/source.command must name a declared/);
    expect(text).toMatch(/columns is required for a table/);
  });
  it('rejects unknown templates, widgets and brand tokens', () => {
    const m = base();
    m.card_layout.template = 'winamp';
    m.card_layout.regions[0].widget = 'confetti';
    m.branding.color = 'red';
    m.branding.font = 'comic-sans';
    const text = validateCardContract(m).errors.join('\n');
    expect(text).toMatch(/template' must be one of/);
    expect(text).toMatch(/widget must be one of/);
    expect(text).toMatch(/color must be a #rrggbb/);
    expect(text).toMatch(/font must be one of/);
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
});
