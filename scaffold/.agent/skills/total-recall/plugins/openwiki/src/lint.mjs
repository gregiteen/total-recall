/**
 * OpenWiki Documentation & Link Hygiene Linter.
 *
 * Scans markdown hubs across workspace or all vaults, detecting:
 * - Broken relative links and dead file targets
 * - Missing or broken wikilinks
 * - Missing title headers or empty pages
 * - Orphaned hubs with zero inbound or outbound links
 */
import fs from 'node:fs';
import path from 'node:path';
import { discoverAllHubs } from './mesh-vaults.mjs';

export async function lintWikiHubs({
  allVaults = false,
  node = null,
  cwd = process.cwd(),
} = {}) {
  const hubsResult = await discoverAllHubs({ allVaults, node, cwd });
  const allHubs = hubsResult.hubs;

  const existingFileSet = new Set(allHubs.map((h) => path.resolve(h.path)));
  const baseNameMap = new Map();
  for (const h of allHubs) {
    baseNameMap.set(h.fileName.toLowerCase(), h.path);
    baseNameMap.set(h.fileName.replace(/\.md$/, '').toLowerCase(), h.path);
  }

  const issues = [];
  let totalLinks = 0;
  let brokenLinksCount = 0;
  const inboundCount = new Map(allHubs.map((h) => [h.path, 0]));
  const outboundCount = new Map(allHubs.map((h) => [h.path, 0]));

  for (const hub of allHubs) {
    let content;
    try {
      content = fs.readFileSync(hub.path, 'utf8');
    } catch {
      issues.push({
        type: 'unreadable_file',
        file: hub.path,
        message: 'Could not read markdown file',
      });
      continue;
    }

    if (!content.trim()) {
      issues.push({
        type: 'empty_hub',
        file: hub.path,
        message: 'Hub markdown file is completely empty',
      });
      continue;
    }

    // Check title header
    if (!content.match(/^#\s+.+/m)) {
      issues.push({
        type: 'missing_title',
        file: hub.path,
        message: 'Missing level 1 header (# Title)',
      });
    }

    const hubDir = path.dirname(hub.path);

    // 1. Check relative markdown links: [Text](target.md)
    const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = mdLinkRegex.exec(content)) !== null) {
      const linkText = match[1];
      const rawUrl = match[2].trim().split('#')[0]; // exclude anchor
      if (!rawUrl || rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('mailto:')) {
        continue;
      }

      totalLinks++;
      outboundCount.set(hub.path, (outboundCount.get(hub.path) || 0) + 1);

      // Resolve relative to hub file directory
      const resolvedTarget = path.resolve(hubDir, rawUrl);
      if (fs.existsSync(resolvedTarget)) {
        inboundCount.set(resolvedTarget, (inboundCount.get(resolvedTarget) || 0) + 1);
      } else {
        // Fallback: check if matches another hub by basename
        const targetBase = path.basename(rawUrl).toLowerCase();
        if (baseNameMap.has(targetBase)) {
          const alternate = baseNameMap.get(targetBase);
          inboundCount.set(alternate, (inboundCount.get(alternate) || 0) + 1);
        } else {
          brokenLinksCount++;
          issues.push({
            type: 'broken_link',
            file: hub.path,
            linkText,
            target: rawUrl,
            message: `Target file not found: ${rawUrl}`,
          });
        }
      }
    }

    // 2. Check wikilinks: [[Target]]
    const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    while ((match = wikiRegex.exec(content)) !== null) {
      const targetName = match[1].trim().toLowerCase();
      totalLinks++;
      outboundCount.set(hub.path, (outboundCount.get(hub.path) || 0) + 1);

      if (baseNameMap.has(targetName) || baseNameMap.has(`${targetName}.md`)) {
        const targetPath = baseNameMap.get(targetName) || baseNameMap.get(`${targetName}.md`);
        inboundCount.set(targetPath, (inboundCount.get(targetPath) || 0) + 1);
      } else {
        brokenLinksCount++;
        issues.push({
          type: 'broken_wikilink',
          file: hub.path,
          target: match[1].trim(),
          message: `Wikilink target not found: [[${match[1].trim()}]]`,
        });
      }
    }
  }

  // Detect orphaned pages
  const orphans = [];
  for (const hub of allHubs) {
    const inbound = inboundCount.get(hub.path) || 0;
    const outbound = outboundCount.get(hub.path) || 0;
    if (inbound === 0 && outbound === 0 && allHubs.length > 1) {
      orphans.push({
        file: hub.path,
        title: hub.title,
      });
    }
  }

  const score = totalLinks === 0
    ? (issues.length === 0 ? 100 : Math.max(50, 100 - issues.length * 10))
    : Math.max(0, Math.round(((totalLinks - brokenLinksCount) / totalLinks) * 100));

  return {
    ok: issues.length === 0,
    healthScore: score,
    totalHubs: allHubs.length,
    totalLinks,
    brokenLinksCount,
    orphanCount: orphans.length,
    issues,
    orphans,
  };
}
