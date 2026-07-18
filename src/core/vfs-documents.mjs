import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { brainDir } from './config.mjs';

export function defaultVaultRoot() {
  return path.join(brainDir, 'memory-vault');
}

function walkMarkdown(root, current = root, output = []) {
  if (!fs.existsSync(current)) return output;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) walkMarkdown(root, fullPath, output);
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(fullPath);
  }
  return output;
}

function parseDocument(filePath, vaultRoot) {
  try {
    const parsed = matter(fs.readFileSync(filePath, 'utf8'));
    return {
      ...parsed.data,
      frontmatter: parsed.data,
      body: parsed.content.trim(),
      vfs_path: path.relative(vaultRoot, filePath).split(path.sep).join('/'),
    };
  } catch {
    return null;
  }
}

function resolveVfsPath(vfsPath, vaultRoot) {
  const normalized = String(vfsPath || '').split(path.sep).join('/').replace(/^\/+/, '');
  const resolvedRoot = path.resolve(vaultRoot);
  const resolvedPath = path.resolve(resolvedRoot, normalized);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  return { normalized, resolvedPath };
}

/** Read all SSSS documents, including host extension types. */
export function listVfsDocuments(vaultRoot = defaultVaultRoot()) {
  return walkMarkdown(vaultRoot)
    .map((filePath) => parseDocument(filePath, vaultRoot))
    .filter(Boolean);
}

/** Read only one VFS subtree. Host extension routes should prefer this over a full-vault walk. */
export function listVfsDocumentsUnder(vfsPrefix, vaultRoot = defaultVaultRoot()) {
  const target = resolveVfsPath(vfsPrefix, vaultRoot);
  if (!target || !fs.existsSync(target.resolvedPath)) return [];
  return walkMarkdown(vaultRoot, target.resolvedPath, [])
    .map((filePath) => parseDocument(filePath, vaultRoot))
    .filter(Boolean);
}

export function findVfsDocument(predicate, vaultRoot = defaultVaultRoot()) {
  return listVfsDocuments(vaultRoot).find(predicate) || null;
}

export function findVfsDocumentByType(type, vaultRoot = defaultVaultRoot()) {
  return findVfsDocument((doc) => doc.type === type, vaultRoot);
}

export function findVfsDocumentByPath(vfsPath, vaultRoot = defaultVaultRoot()) {
  const target = resolveVfsPath(vfsPath, vaultRoot);
  if (!target || !target.normalized.endsWith('.md') || !fs.existsSync(target.resolvedPath)) return null;
  const stat = fs.statSync(target.resolvedPath);
  return stat.isFile() ? parseDocument(target.resolvedPath, vaultRoot) : null;
}
