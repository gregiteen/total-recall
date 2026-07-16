/**
 * Total Recall — Repo Auto-Sync
 *
 * Automatically ingests all .md files from registered project repos into
 * each repo's Total Recall memory vault. Runs on daemon boot and periodically.
 *
 * This is the core mechanism that ensures repos implementing SSSS have ALL
 * their files tracked by Total Recall — not just memory vault nodes, but
 * every markdown file in the repository.
 *
 * - Scans all repos in project-registry.json
 * - Uses content hashing (SHA-256) to detect new/changed files (incremental)
 * - Writes SSSS-compliant memory nodes directly to the vault
 * - Skips node_modules, .git, memory-vault (avoids circular ingestion)
 * - Tags all ingested nodes with 'repo-sync,auto-ingested' for traceability
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { logger } from './logger.mjs';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.agent', 'memory-vault', 'memory-derived',
  'memory-inbox', '.next', '.turbo', 'dist', 'build', '.cache',
  '.vscode', '.idea', 'coverage', '__pycache__', '.svelte-kit',
]);

/**
 * Load the project registry from the global brain config.
 */
function loadProjectRegistry() {
  const registryPath = path.join(
    os.homedir(), '.agent', 'skills', 'total-recall', 'config', 'project-registry.json'
  );
  if (!fs.existsSync(registryPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Load the hash manifest for a given vault directory.
 * Returns a Map<relPath, sha256Hash>.
 */
function loadHashManifest(vaultDir) {
  const manifestPath = path.join(vaultDir, '..', 'memory-derived', 'repo-sync-hashes.json');
  if (!fs.existsSync(manifestPath)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

/**
 * Save the hash manifest for a given vault directory.
 */
function saveHashManifest(vaultDir, manifest) {
  const derivedDir = path.join(vaultDir, '..', 'memory-derived');
  if (!fs.existsSync(derivedDir)) {
    fs.mkdirSync(derivedDir, { recursive: true });
  }
  const manifestPath = path.join(derivedDir, 'repo-sync-hashes.json');
  const obj = Object.fromEntries(manifest);
  fs.writeFileSync(manifestPath, JSON.stringify(obj, null, 2));
}

/**
 * Recursively scan a directory for .md files, skipping excluded dirs.
 */
function scanMdFiles(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanMdFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Hash file content using SHA-256.
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Generate a slug from a relative path.
 */
function slugFromRelPath(repoName, relPath) {
  const base = relPath
    .replace(/\.md$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
  return `repo-${repoName}-${base}`.substring(0, 120);
}

/**
 * Extract title from markdown content.
 */
function extractTitle(content, filename) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
}

/**
 * Write a single repo-synced node to the vault.
 * Uses SSSS-compatible frontmatter format.
 */
function writeRepoNode(slug, title, content, repoName, relPath, vaultDir) {
  const category = 'facts';
  const categoryDir = path.join(vaultDir, category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  const now = new Date().toISOString();
  const node = {
    slug,
    title: title.substring(0, 200),
    category,
    status: 'active',
    importance: 2,
    priority: 'low',
    confidence: 0.9,
    modality: 'descriptive',
    tags: ['repo-sync', 'auto-ingested', repoName],
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: repoName,
    subject: 'repo',
    predicate: 'documents',
    object: repoName,
    source: `repo-sync:${repoName}:${relPath}`,
    decay: 0,
    created: now,
    updated: now,
    last_accessed: now,
    type: 'memory',
    description: `Auto-ingested from ${repoName}/${relPath}`,
  };

  // Build frontmatter
  const lines = ['---'];
  for (const [key, value] of Object.entries(node)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---');
  lines.push(content);

  const filePath = path.join(categoryDir, `${slug}.md`);

  // If an existing file exists, preserve the created timestamp
  if (fs.existsSync(filePath)) {
    try {
      const existing = fs.readFileSync(filePath, 'utf8');
      const createdMatch = existing.match(/^created:\s*"?([^"\n]+)"?$/m);
      if (createdMatch) {
        const idx = lines.findIndex(l => l.startsWith('created:'));
        if (idx >= 0) lines[idx] = `created: ${JSON.stringify(createdMatch[1])}`;
      }
    } catch { /* use new timestamp */ }
  }

  fs.writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

/**
 * Sync a single repo: scan, hash-diff, ingest new/changed files.
 * Returns { repo, ingested, skipped, errors, deleted }.
 */
function syncRepo(project) {
  const repoPath = project.path;
  const repoName = project.name || path.basename(repoPath);
  const vaultDir = path.join(project.brainDir, 'memory-vault');

  if (!fs.existsSync(repoPath)) {
    return { repo: repoName, ingested: 0, skipped: 0, errors: 0, deleted: 0, reason: 'path-missing' };
  }

  // Ensure vault dir exists
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true });
  }

  const hashManifest = loadHashManifest(vaultDir);
  const newManifest = new Map();

  const mdFiles = scanMdFiles(repoPath);
  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of mdFiles) {
    const relPath = path.relative(repoPath, filePath);
    const hash = hashFile(filePath);
    if (!hash) { errors++; continue; }

    newManifest.set(relPath, hash);

    // Skip if hash unchanged
    if (hashManifest.get(relPath) === hash) {
      skipped++;
      continue;
    }

    // New or changed file — ingest it
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const slug = slugFromRelPath(repoName, relPath);
      const title = extractTitle(content, path.basename(filePath));
      writeRepoNode(slug, title, content, repoName, relPath, vaultDir);
      ingested++;
    } catch (err) {
      logger.warn('repo-sync', `Error ingesting ${repoName}/${relPath}: ${err.message}`);
      errors++;
    }
  }

  // Detect deleted files: entries in old manifest not in new manifest
  let deleted = 0;
  for (const [relPath] of hashManifest) {
    if (!newManifest.has(relPath)) {
      // File was removed from repo — archive the node
      const slug = slugFromRelPath(repoName, relPath);
      const nodeFile = path.join(vaultDir, 'facts', `${slug}.md`);
      if (fs.existsSync(nodeFile)) {
        try {
          let content = fs.readFileSync(nodeFile, 'utf8');
          content = content.replace(/^status:\s*"?active"?$/m, 'status: "archived"');
          fs.writeFileSync(nodeFile, content);
          deleted++;
        } catch { /* non-fatal */ }
      }
    }
  }

  // Save updated manifest
  saveHashManifest(vaultDir, newManifest);

  return { repo: repoName, ingested, skipped, errors, deleted };
}

/**
 * Run a full sync across all registered repos.
 * Called by daemon-loop on boot and periodically.
 *
 * @returns {{ repos: Array, totalIngested: number, totalSkipped: number }}
 */
export function syncAllRepos() {
  const registry = loadProjectRegistry();
  const results = [];
  let totalIngested = 0;
  let totalSkipped = 0;

  for (const project of registry) {
    if (!project.path || !project.brainDir) continue;
    if (!fs.existsSync(project.path)) continue;

    try {
      const result = syncRepo(project);
      results.push(result);
      totalIngested += result.ingested;
      totalSkipped += result.skipped;

      if (result.ingested > 0 || result.deleted > 0) {
        logger.info('repo-sync',
          `${result.repo}: +${result.ingested} ingested, ${result.skipped} unchanged, ${result.deleted} archived, ${result.errors} errors`
        );
      }
    } catch (err) {
      logger.warn('repo-sync', `Failed to sync ${project.name}: ${err.message}`);
      results.push({ repo: project.name, ingested: 0, skipped: 0, errors: 1, deleted: 0, reason: err.message });
    }
  }

  return { repos: results, totalIngested, totalSkipped };
}

/**
 * Sync a single repo by path (used during init).
 */
export function syncSingleRepo(projectPath, brainDir) {
  const project = {
    name: path.basename(projectPath),
    path: projectPath,
    brainDir,
  };
  return syncRepo(project);
}
