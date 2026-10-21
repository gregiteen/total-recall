import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
let source;
if (process.env.TR_PACKAGE_ROOT) {
  const root = path.resolve(process.env.TR_PACKAGE_ROOT);
  if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') throw new Error('Invalid native Total Recall host');
  source = path.join(root, 'src/core/plugin-document-store.mjs');
} else source = require.resolve('total-recall-brain/src/core/plugin-document-store.mjs');
export const { pluginDocumentOperation, parseDocument, serializeDocument } = await import(pathToFileURL(source).href);
export const extension = { registry: 'composable-cli', extends: 'ssss', version: '1.0.0', document_primitives: {
  cli_command: { family: 'capability', append_only: false, portability: 'tenant_private',
    required_fields: ['type', 'id', 'name', 'scope', 'risk', 'version', 'code_sha256'], immutable_fields: ['id'],
    patterns: { name: '^[a-z][a-z0-9-]{0,63}$', code_sha256: '^[a-f0-9]{64}$' },
    enums: { scope: ['project', 'group', 'global'], risk: ['read', 'write', 'money', 'dns-cert', 'production-deploy', 'secret-revoke'] } },
} };
export function writeCommandDocument(file, metadata, body) {
  const now = new Date().toISOString();
  return pluginDocumentOperation({ type: 'operation', path: path.basename(file),
    content: serializeDocument({ ...metadata, title: metadata.title || `Command ${metadata.name}`,
      description: metadata.description || `CLI command ${metadata.name}`, timestamp: now }, body) },
  { plugin: 'composable-cli', vaultRoot: path.dirname(path.resolve(file)), extension });
}
export function deleteCommandDocument(file) {
  return pluginDocumentOperation({ type: 'delete', path: path.basename(file) },
    { plugin: 'composable-cli', vaultRoot: path.dirname(path.resolve(file)), extension });
}
