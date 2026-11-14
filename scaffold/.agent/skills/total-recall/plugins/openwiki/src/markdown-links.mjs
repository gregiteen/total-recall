/**
 * Shared Markdown link extraction and hub target resolution for OpenWiki.
 *
 * Strips fenced code blocks and inline code spans so code examples never create
 * false-positive broken links or graph edges, and resolves targets with
 * same-file-directory and same-repository priority before global fallback.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Remove fenced code blocks (``` / ~~~) and inline code spans (`...`).
 */
export function stripMarkdownCode(content) {
  const withoutFences = String(content || '')
    .replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gm, '');
  return withoutFences.replace(/`[^`\n]+`/g, '');
}

/**
 * Extract Markdown links and Wikilinks from prose (excluding code blocks/spans).
 */
export function extractMarkdownLinks(content) {
  const clean = stripMarkdownCode(content);
  const markdownLinks = [];
  const wikilinks = [];

  const mdLinkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkRegex.exec(clean)) !== null) {
    const text = match[1].trim();
    const rawUrl = match[2].trim().split('#')[0].trim();
    if (!rawUrl || /^(https?:|mailto:|tel:|data:|#)/i.test(rawUrl)) continue;
    markdownLinks.push({ text, target: rawUrl });
  }

  const wikiRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  while ((match = wikiRegex.exec(clean)) !== null) {
    const target = match[1].trim();
    const anchor = (match[2] || target).trim();
    if (target) wikilinks.push({ target, anchor });
  }

  return { markdownLinks, wikilinks };
}

/**
 * Build a multi-level lookup index for hubs so same-repo targets beat
 * cross-repo basename collisions.
 */
export function indexHubsForResolution(hubs) {
  const byPath = new Map();
  const byRepoKey = new Map();
  const byGlobalKey = new Map();

  for (const hub of hubs) {
    const resolved = path.resolve(hub.path);
    byPath.set(resolved, hub);

    const relLower = hub.fileName.toLowerCase();
    const relNoExt = relLower.replace(/\.md$/i, '');
    const baseLower = path.basename(hub.fileName).toLowerCase();
    const baseNoExt = baseLower.replace(/\.md$/i, '');
    const titleLower = (hub.title || '').toLowerCase();

    const keys = [relLower, relNoExt, baseLower, baseNoExt, titleLower].filter(Boolean);
    for (const k of keys) {
      const repoKey = `${hub.repoName}:${k}`;
      if (!byRepoKey.has(repoKey)) byRepoKey.set(repoKey, hub);
      if (!byGlobalKey.has(k)) byGlobalKey.set(k, hub);
    }
  }

  return { byPath, byRepoKey, byGlobalKey };
}

/**
 * Resolve a Markdown link or wikilink target from `sourceHub` using `index`.
 */
export function resolveLinkTarget(sourceHub, rawTarget, index, { isWikilink = false } = {}) {
  const sourceDir = path.dirname(sourceHub.path);

  if (!isWikilink) {
    const resolved = path.resolve(sourceDir, rawTarget);
    if (index.byPath.has(resolved)) {
      return { hub: index.byPath.get(resolved), existsOnDisk: true };
    }
    if (fs.existsSync(resolved)) {
      return { hub: null, existsOnDisk: true, resolvedPath: resolved };
    }
  }

  const normalized = rawTarget.replace(/^\.\//, '').toLowerCase();
  const noExt = normalized.replace(/\.md$/i, '');
  const base = path.basename(normalized);
  const baseNoExt = base.replace(/\.md$/i, '');
  const candidates = isWikilink
    ? [normalized, `${normalized}.md`, base, `${base}.md`]
    : [normalized, noExt, base, baseNoExt];

  for (const key of candidates) {
    const repoMatch = index.byRepoKey.get(`${sourceHub.repoName}:${key}`);
    if (repoMatch) return { hub: repoMatch, existsOnDisk: true };
  }

  for (const key of candidates) {
    const globalMatch = index.byGlobalKey.get(key);
    if (globalMatch) return { hub: globalMatch, existsOnDisk: true };
  }

  return { hub: null, existsOnDisk: false };
}
