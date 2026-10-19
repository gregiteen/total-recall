/**
 * Markdown metadata is data: YAML/JSON only, with no executable engines.
 *
 * YAML frontmatter is read and written by the SSSS parser (@ssss/cli/frontmatter),
 * the single implementation shared with every SSSS host, so Total Recall and SSSS
 * can never disagree about a vault file. This wrapper keeps the gray-matter-style
 * API, the fence/language checks and the CRLF handling.
 */
import { parseFrontmatter, serializeDocument, repairEscapedNewlines } from '@ssss/cli/frontmatter';

// YAML tags (`!!js/function`, `!!python/object`, ...) can request code; SSSS reads
// them as plain text, so refuse them up front instead of storing them as data.
const YAML_TAG = /(?:^|[:,\[{-])[ \t]*!!\S/m;

export default function matter(input) {
  const original = Buffer.isBuffer(input) ? input.toString('utf8') : typeof input === 'string' ? input : input?.content;
  if (typeof original !== 'string') throw new TypeError('Markdown content must be a string');
  const text = repairEscapedNewlines(original.replace(/^﻿/, ''));
  const file = { data: {}, content: text, excerpt: '', orig: original };
  const opening = /^---([^\r\n]*)\r?\n/.exec(text);
  if (!opening || opening[1].startsWith('-')) return file;
  const language = opening[1].trim().toLowerCase() || 'yaml';
  if (['js', 'javascript'].includes(language)) throw new Error('Executable JavaScript frontmatter is not allowed');
  if (!['yaml', 'yml', 'json'].includes(language)) throw new Error(`Unsupported frontmatter language: ${language}`);
  const remainder = text.slice(opening[0].length);
  const closing = /^---(?:\r?\n|$)/m.exec(remainder);
  const metadata = closing ? remainder.slice(0, closing.index) : remainder;
  if (language !== 'json' && YAML_TAG.test(metadata)) throw new Error('YAML tags are not allowed in frontmatter');
  file.data = (language === 'json' ? JSON.parse(metadata || '{}') : parseFrontmatter(metadata.replace(/\r\n/g, '\n'), { strict: true })) || {};
  file.content = closing ? remainder.slice(closing.index + closing[0].length) : '';
  file.matter = metadata;
  file.language = language;
  return file;
}

const newline = value => value.endsWith('\n') ? value : value + '\n';
// Dates become ISO strings (SSSS keeps timestamps as strings); undefined is dropped.
const plain = value => JSON.parse(JSON.stringify(value, (_key, v) => (v instanceof Date ? v.toISOString() : v)));

matter.stringify = (input, data) => {
  if (typeof input === 'string' && data == null) return input;
  const file = typeof input === 'string' ? matter(input) : input;
  if (!file || typeof file.content !== 'string') throw new TypeError('Markdown content must be a string');
  const metadata = plain({ ...file.data, ...(data ?? {}) });
  const head = Object.keys(metadata).length ? serializeDocument(metadata, '') : '';
  return head + newline(file.content);
};
