import { describe, it, expect } from 'vitest';
import { validateConfigurationSpec, configurationValues } from './configuration.mjs';

describe('owner configuration contract', () => {
  const spec = { fields: [
    { name: 'fromNumber', label: 'Outgoing number', type: 'string', required: true },
    { name: 'videoEnabled', label: 'Video', type: 'boolean', default: false },
    { name: 'timeout', label: 'Timeout', type: 'number', options: [15, 30], default: 15 }
  ] };
  it('accepts declared values/defaults and rejects unknown or mistyped settings', () => {
    expect(configurationValues(spec, { fromNumber: '+14155550123' })).toEqual({ fromNumber: '+14155550123', videoEnabled: false, timeout: 15 });
    expect(() => configurationValues(spec, { fromNumber: 'x', videoEnabled: 'yes' })).toThrow('boolean');
    expect(() => configurationValues(spec, { fromNumber: 'x', timeout: 60 })).toThrow('allowed');
    expect(() => configurationValues(spec, { fromNumber: 'x', undeclared: 'x' })).toThrow('Unknown');
    expect(() => configurationValues(spec, {})).toThrow('required');
  });
  it('rejects credential fields, duplicate names and prototype mutations', () => {
    for (const name of ['apiKey', 'password', 'accessToken', '__proto__']) {
      expect(validateConfigurationSpec({ fields: [{ name, label: 'Key', type: 'string' }] }).length).toBeGreaterThan(0);
    }
    expect(validateConfigurationSpec({ fields: [...spec.fields, spec.fields[0]] }).join()).toContain('Duplicate');
    expect(() => configurationValues(spec, JSON.parse('{"__proto__":{}}'))).toThrow('Unknown');
  });
});
