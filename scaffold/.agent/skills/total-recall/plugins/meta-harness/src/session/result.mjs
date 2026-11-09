/** Portable JSON Schema validation. Unsupported assertions fail closed. */
import { isDeepStrictEqual } from 'node:util';
export function validateSchema(schema, value, root = schema, at = '$') {
  if (schema === true) return [];
  if (schema === false) return [`${at}: forbidden value`];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [`${at}: invalid schema`];
  const annotations = ['$schema', '$id', '$defs', 'definitions', 'title', 'description', 'default', 'examples', 'format', 'readOnly', 'writeOnly', '$comment'];
  const supported = ['$ref', 'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items', 'prefixItems', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'allOf', 'anyOf', 'oneOf', 'not', 'minProperties', 'maxProperties'];
  const errors = Object.keys(schema).filter(key => !supported.includes(key) && !annotations.includes(key)).map(key => `${at}: unsupported schema keyword ${key}`);
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/')) return [...errors, `${at}: only local schema references are supported`];
    const ref = schema.$ref.slice(2).split('/').reduce((s, key) => s?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root);
    if (!ref || ref === schema) return [...errors, `${at}: invalid or recursive schema reference`];
    errors.push(...validateSchema(ref, value, root, at));
  }
  const equal = isDeepStrictEqual;
  const type = name => name === 'null' ? value === null : name === 'array' ? Array.isArray(value)
    : name === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : name === 'integer' ? Number.isInteger(value) : name === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === name;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(type)) errors.push(`${at}: expected ${schema.type}`);
  if (schema.enum && !schema.enum.some(v => equal(v, value))) errors.push(`${at}: value is outside enum`);
  if (Object.hasOwn(schema, 'const') && !equal(schema.const, value)) errors.push(`${at}: expected const`);
  for (const key of ['allOf', 'anyOf', 'oneOf']) if (schema[key]) {
    const matches = schema[key].filter(s => !validateSchema(s, value, root, at).length).length;
    if (key === 'allOf' ? matches !== schema[key].length : key === 'oneOf' ? matches !== 1 : matches === 0) errors.push(`${at}: ${key} failed`);
  }
  if (schema.not && !validateSchema(schema.not, value, root, at).length) errors.push(`${at}: not failed`);
  if (type('object')) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: required`);
    for (const [key, entry] of Object.entries(value)) {
      const child = schema.properties?.[key] ?? schema.additionalProperties ?? true;
      errors.push(...validateSchema(child, entry, root, `${at}.${key}`));
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) errors.push(`${at}: too few properties`);
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) errors.push(`${at}: too many properties`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => errors.push(...validateSchema(schema.prefixItems?.[i] ?? schema.items ?? true, entry, root, `${at}[${i}]`)));
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: too many items`);
    if (schema.uniqueItems && value.some((entry, i) => value.slice(0, i).some(previous => equal(entry, previous)))) errors.push(`${at}: duplicate items`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${at}: text too short`);
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) errors.push(`${at}: text too long`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: pattern failed`);
  }
  if (typeof value === 'number') {
    for (const [key, failed] of [['minimum', value < schema.minimum], ['maximum', value > schema.maximum],
      ['exclusiveMinimum', value <= schema.exclusiveMinimum], ['exclusiveMaximum', value >= schema.exclusiveMaximum],
      ['multipleOf', schema.multipleOf !== undefined && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9]]) {
      if (failed) errors.push(`${at}: ${key} failed`);
    }
  }
  return errors;
}

export const GOAL_SCHEMA = { type: 'object', required: ['met', 'evidence', 'remaining'], additionalProperties: false,
  properties: { met: { type: 'boolean' }, evidence: { type: 'array', items: { type: 'string' } }, remaining: { type: 'array', items: { type: 'string' } } } };

export function readResult(result, schema) {
  let value = result.structured;
  if (value === undefined || value === null) {
    try { value = JSON.parse(result.response); } catch { return { errors: ['The final message must be JSON.'] }; }
  }
  return { value, errors: validateSchema(schema, value) };
}
