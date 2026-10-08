/** A portable, declarative settings contract. Credential values use secrets. */
const NAME = /^[a-z][a-zA-Z0-9]{0,63}$/;
const TYPES = new Set(['string', 'number', 'boolean']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateConfigurationSpec(spec) {
  const errors = [];
  if (!plain(spec) || !Array.isArray(spec.fields)) return ['configuration.fields must be an array'];
  const names = new Set();
  for (const field of spec.fields) {
    if (!plain(field) || !NAME.test(field.name || '') || ['__proto__', 'constructor', 'prototype'].includes(field.name)) {
      errors.push('Configuration fields require safe camelCase names'); continue;
    }
    if (names.has(field.name)) errors.push(`Duplicate configuration field ${field.name}`);
    names.add(field.name);
    if (!TYPES.has(field.type)) errors.push(`${field.name} has an unsupported type`);
    if (/password|secret|apiKey|token/i.test(field.name)) errors.push(`${field.name} belongs in the encrypted secrets store`);
    if (typeof field.label !== 'string' || !field.label.trim()) errors.push(`${field.name} requires a label`);
    if (field.options !== undefined && (!Array.isArray(field.options) || field.options.some(value => typeof value !== field.type))) errors.push(`${field.name} options must match its type`);
    if (field.default !== undefined && typeof field.default !== field.type) errors.push(`${field.name} default must match its type`);
  }
  return errors;
}

export function configurationValues(spec, values = {}) {
  const errors = validateConfigurationSpec(spec);
  if (errors.length) throw new Error(errors.join('; '));
  if (!plain(values)) throw new Error('Configuration must be an object');
  const fields = new Map(spec.fields.map(field => [field.name, field]));
  const result = Object.create(null);
  for (const name of Object.keys(values)) if (!fields.has(name)) throw new Error(`Unknown configuration field ${name}`);
  for (const field of spec.fields) {
    const value = values[field.name] ?? field.default;
    if (value === undefined || value === '') {
      if (field.required) throw new Error(`${field.label} is required`);
      if (value !== undefined) result[field.name] = value;
      continue;
    }
    if (typeof value !== field.type || (field.type === 'number' && !Number.isFinite(value))) throw new Error(`${field.label} requires ${field.type}`);
    if (field.options && !field.options.includes(value)) throw new Error(`${field.label} is not an allowed option`);
    if (field.type === 'string' && value.length > 8192) throw new Error(`${field.label} is too long`);
    result[field.name] = value;
  }
  return result;
}
