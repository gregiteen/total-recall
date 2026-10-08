/** Markdown metadata is data: YAML/JSON only, with no executable engines. */
import * as yamlModule from 'js-yaml';
const yaml = yamlModule.default || yamlModule;
// Existing source checkouts can still have the legacy CommonJS parser installed.
const load = yaml.safeLoad || yaml.load;
const dump = yaml.safeDump || yaml.dump;
// Preserve the existing YAML 1.2 scalar rules plus dates/merge/collection tags.
const schema = yaml.CORE_SCHEMA?.withTags
  ? yaml.CORE_SCHEMA.withTags(yaml.timestampTag, yaml.mergeTag, yaml.binaryTag, yaml.omapTag, yaml.pairsTag, yaml.setTag)
  : yaml.DEFAULT_SAFE_SCHEMA;

export default function matter(input) {
  const original = Buffer.isBuffer(input) ? input.toString('utf8') : typeof input === 'string' ? input : input?.content;
  if (typeof original !== 'string') throw new TypeError('Markdown content must be a string');
  const text = original.replace(/^\uFEFF/, '');
  const file = { data: {}, content: text, excerpt: '', orig: original };
  const opening = /^---([^\r\n]*)\r?\n/.exec(text);
  if (!opening || opening[1].startsWith('-')) return file;
  const language = opening[1].trim().toLowerCase() || 'yaml';
  if (['js', 'javascript'].includes(language)) throw new Error('Executable JavaScript frontmatter is not allowed');
  if (!['yaml', 'yml', 'json'].includes(language)) throw new Error(`Unsupported frontmatter language: ${language}`);
  const remainder = text.slice(opening[0].length);
  const closing = /^---(?:\r?\n|$)/m.exec(remainder);
  const metadata = closing ? remainder.slice(0, closing.index) : remainder;
  file.data = (language === 'json' ? JSON.parse(metadata || '{}') : load(metadata, { schema })) || {};
  file.content = closing ? remainder.slice(closing.index + closing[0].length) : '';
  file.matter = metadata;
  file.language = language;
  return file;
}

const newline = value => value.endsWith('\n') ? value : value + '\n';
matter.stringify = (input, data, options = {}) => {
  if (typeof input === 'string' && data == null) return input;
  const file = typeof input === 'string' ? matter(input) : input;
  if (!file || typeof file.content !== 'string') throw new TypeError('Markdown content must be a string');
  const metadata = { ...file.data, ...(data ?? {}) };
  const serialized = dump(metadata, options).trim();
  return (serialized === '{}' ? '' : `---\n${serialized}\n---\n`) + newline(file.content);
};
