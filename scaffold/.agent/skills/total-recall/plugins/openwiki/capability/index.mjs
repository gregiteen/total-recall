/**
 * OpenWiki Core Capability Brick
 *
 * Standalone knowledge graph hub discovery, markdown wiki parsing,
 * staleness auditing, and structural bootstrap operations.
 * Operates with zero host coupling and zero runtime dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Discovers markdown wiki hubs within a specified directory.
 * @param {object} options
 * @param {string} options.root Base directory to inspect
 * @param {string} [options.subfolder='openwiki'] Documentation folder name
 * @returns {Array<{ name: string, title: string, path: string, lines: number, size_bytes: number }>}
 */
export function discoverWikiHubs({ root = '.', subfolder = 'openwiki' } = {}) {
  const targetDir = path.resolve(root, subfolder);
  if (!fs.existsSync(targetDir)) return [];

  const stat = fs.statSync(targetDir, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) return [];

  const hubs = [];
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const fullPath = path.join(targetDir, entry.name);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : entry.name.replace(/\.md$/, '');
      const lines = content.split('\n').length;
      hubs.push({
        name: entry.name,
        title,
        path: path.relative(root, fullPath),
        lines,
        size_bytes: Buffer.byteLength(content, 'utf8')
      });
    } catch {
      // Unreadable file skipped cleanly
    }
  }

  return hubs.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parses markdown hub content into structured headings, internal links, and statistics.
 * @param {string} content Markdown document content
 * @returns {{ title: string, headings: string[], links: string[], lineCount: number, wordCount: number }}
 */
export function parseWikiHub(content = '') {
  if (typeof content !== 'string') {
    return { title: 'Untitled', headings: [], links: [], lineCount: 0, wordCount: 0 };
  }

  const lines = content.split('\n');
  const lineCount = lines.length;
  const wordCount = content.trim().length ? content.trim().split(/\s+/).length : 0;

  const headings = [];
  let title = 'Untitled';

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const text = match[2].trim();
      headings.push(text);
      if (match[1].length === 1 && title === 'Untitled') {
        title = text;
      }
    }
  }

  const links = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(content)) !== null) {
    links.push({ text: linkMatch[1], href: linkMatch[2] });
  }

  return {
    title,
    headings,
    links,
    lineCount,
    wordCount
  };
}

/**
 * Inspects documentation directory staleness by checking generation marker state.
 * @param {object} options
 * @param {string} options.root Project root containing an openwiki directory
 * @returns {{ hasWiki: boolean, isStale: boolean, generatedAt: string | null, status: string | null, fileCount: number }}
 */
export function inspectWikiStaleness({ root = '.' } = {}) {
  const wikiDir = path.resolve(root, 'openwiki');
  if (!fs.existsSync(wikiDir)) {
    return { hasWiki: false, isStale: true, generatedAt: null, status: null, fileCount: 0 };
  }

  let fileCount = 0;
  try {
    const entries = fs.readdirSync(wikiDir, { withFileTypes: true });
    fileCount = entries.filter(e => e.isFile() && e.name.endsWith('.md')).length;
  } catch {
    fileCount = 0;
  }

  const markerPath = path.join(wikiDir, '.last-update.json');
  let generatedAt = null;
  let status = null;

  try {
    const raw = fs.readFileSync(markerPath, 'utf8');
    const parsed = JSON.parse(raw);
    generatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    status = typeof parsed.status === 'string' ? parsed.status : null;
  } catch {
    // Marker missing or unreadable
  }

  const isStale = generatedAt === null || fileCount === 0;

  return {
    hasWiki: true,
    isStale,
    generatedAt,
    status,
    fileCount
  };
}

/**
 * Ensures standard wiki files exist without overwriting authored work.
 * @param {object} options
 * @param {string} options.targetDirectory Destination directory path
 * @param {Record<string, string>} [options.templates={}] Filename to markdown content map
 * @param {boolean} [options.dryRun=false] When true, computes actions without filesystem modification
 * @returns {{ created: string[], preserved: string[], directory: string }}
 */
export function bootstrapWikiPages({ targetDirectory, templates = {}, dryRun = false } = {}) {
  if (!targetDirectory || typeof targetDirectory !== 'string') {
    throw new Error('Target directory must be a valid path string');
  }

  const destination = path.resolve(targetDirectory);
  const created = [];
  const preserved = [];

  if (!dryRun && !fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  for (const [filename, content] of Object.entries(templates)) {
    const filePath = path.join(destination, filename);
    if (fs.existsSync(filePath)) {
      preserved.push(filename);
    } else {
      created.push(filename);
      if (!dryRun) {
        fs.writeFileSync(filePath, String(content), 'utf8');
      }
    }
  }

  return {
    directory: destination,
    created,
    preserved
  };
}

/**
 * Compares two semantic version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 when versions match.
 * @param {string} v1 First version string
 * @param {string} v2 Second version string
 * @returns {number}
 */
export function compareSemanticVersions(v1 = '', v2 = '') {
  const parse = (v) => {
    const clean = String(v || '').replace(/^[^\d]*/, '').split('-')[0];
    const parts = clean.split('.').map(n => Number.parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
  };

  const [maj1, min1, pat1] = parse(v1);
  const [maj2, min2, pat2] = parse(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

/**
 * Creates an execution plan for propagating an updated OpenWiki generator across projects.
 * @param {object} options
 * @param {Array<{ name: string, root: string }>} options.projects Registered projects
 * @param {string} options.latestVersion Upstream generator version
 * @param {string} [options.currentVersion] Currently recorded generator version
 * @returns {{ updateRequired: boolean, eligibleCount: number, plannedActions: Array<{ name: string, root: string, action: string, generatorVersion: string }> }}
 */
export function createPropagationPlan({ projects = [], latestVersion = '', currentVersion = '' } = {}) {
  const updateRequired = compareSemanticVersions(latestVersion, currentVersion) > 0;
  const plannedActions = [];

  for (const project of projects) {
    if (!project || typeof project.root !== 'string') continue;
    const staleness = inspectWikiStaleness({ root: project.root });
    if (!staleness.hasWiki) continue;

    plannedActions.push({
      name: project.name || path.basename(project.root),
      root: project.root,
      action: updateRequired ? 'regenerate' : 'verify',
      generatorVersion: latestVersion || currentVersion || 'latest'
    });
  }

  return {
    updateRequired,
    eligibleCount: plannedActions.length,
    plannedActions
  };
}

/**
 * Standardizes a propagation execution receipt for persistent audit logs.
 * @param {object} receipt
 * @returns {{ timestamp: string, previousVersion: string, newVersion: string, totalProjects: number, updatedProjects: number, failedProjects: number, ok: boolean }}
 */
export function formatPropagationReceipt(receipt = {}) {
  return {
    timestamp: receipt.timestamp || new Date().toISOString(),
    previousVersion: String(receipt.previousVersion || 'unknown'),
    newVersion: String(receipt.newVersion || 'unknown'),
    totalProjects: Number.isInteger(receipt.totalProjects) ? receipt.totalProjects : 0,
    updatedProjects: Number.isInteger(receipt.updatedProjects) ? receipt.updatedProjects : 0,
    failedProjects: Number.isInteger(receipt.failedProjects) ? receipt.failedProjects : 0,
    ok: Boolean(receipt.ok ?? (receipt.failedProjects === 0))
  };
}
