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
import { discoverAllHubs, execOnMeshNode } from './mesh-vaults.mjs';
import { extractMarkdownLinks, indexHubsForResolution, resolveLinkTarget } from './markdown-links.mjs';

export async function lintWikiHubs({
  allVaults = false,
  node = null,
  cwd = process.cwd(),
  nested = true,
} = {}) {
  // Delegate to remote mesh node when requested, matching search and graph.
  if (node && node !== 'local' && node !== 'self') {
    const meshRes = execOnMeshNode(node, [
      'lint', ...(allVaults ? ['--all-vaults'] : []), '--json',
    ]);
    if (meshRes.ok) {
      try {
        return JSON.parse(meshRes.stdout);
      } catch {
        throw new Error(`Invalid JSON from mesh node ${node}: ${meshRes.stdout}`);
      }
    }
    throw new Error(`Mesh lint failed on node ${node}: ${meshRes.stderr || meshRes.error}`);
  }

  const hubsResult = await discoverAllHubs({ allVaults, cwd, nested });
  const allHubs = hubsResult.hubs;
  const index = indexHubsForResolution(allHubs);

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

    const { markdownLinks, wikilinks } = extractMarkdownLinks(content);

    for (const link of markdownLinks) {
      totalLinks++;
      outboundCount.set(hub.path, (outboundCount.get(hub.path) || 0) + 1);

      const resolved = resolveLinkTarget(hub, link.target, index, { isWikilink: false });
      if (resolved.existsOnDisk) {
        const targetPath = resolved.hub?.path || resolved.resolvedPath;
        if (targetPath) {
          inboundCount.set(targetPath, (inboundCount.get(targetPath) || 0) + 1);
        }
      } else {
        brokenLinksCount++;
        issues.push({
          type: 'broken_link',
          file: hub.path,
          linkText: link.text,
          target: link.target,
          message: `Target file not found: ${link.target}`,
        });
      }
    }

    for (const link of wikilinks) {
      totalLinks++;
      outboundCount.set(hub.path, (outboundCount.get(hub.path) || 0) + 1);

      const resolved = resolveLinkTarget(hub, link.target, index, { isWikilink: true });
      if (resolved.existsOnDisk && resolved.hub) {
        inboundCount.set(resolved.hub.path, (inboundCount.get(resolved.hub.path) || 0) + 1);
      } else {
        brokenLinksCount++;
        issues.push({
          type: 'broken_wikilink',
          file: hub.path,
          target: link.target,
          message: `Wikilink target not found: [[${link.target}]]`,
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
