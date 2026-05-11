/**
 * vault.mjs — SSSS Vault I/O for the 3-Tier Memory Architecture
 *
 * Reads and writes MemoryNode files from/to the memory-vault directory.
 * All operations are agnostic to any specific workspace or project.
 *
 * Dependencies: gray-matter (YAML frontmatter parsing)
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');

// ─── PATH HELPERS ────────────────────────────────────────────────────────────────

/**
 * Walk a directory recursively and return all .md file paths.
 * @param {string} dir
 * @returns {string[]}
 */
export function walkMd(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Walk a skill directory and return all SKILL.md file paths.
 * @param {string} skillsRoot
 * @returns {string[]}
 */
export function walkSkillMd(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) return [];
  const results = [];
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const skillMd = path.join(skillsRoot, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMd)) results.push(skillMd);
    }
  }
  return results;
}

// ─── ATOMIC WRITE ────────────────────────────────────────────────────────────────

/**
 * Atomically write content to a file using write-then-rename.
 * Prevents partial file corruption on crash or concurrent access.
 * @param {string} filePath - Absolute path to target file
 * @param {string} content - File content
 */
export function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// ─── NODE I/O ────────────────────────────────────────────────────────────────────

/**
 * Parse a MemoryNode from a .md file.
 * Returns null if parsing fails or the file is not a valid SSSS node.
 * @param {string} filePath
 * @returns {import('../types/memory.js').MemoryNode | null}
 */
export function parseNode(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data: meta, content: body } = matter(raw);

    if (meta.type !== 'memory') return null;

    return {
      ...meta,
      body: body.trim(),
      // Ensure required arrays exist
      supersedes: meta.supersedes ?? [],
      contradicts: meta.contradicts ?? [],
      tags: meta.tags ?? [],
      related: meta.related ?? [],
      routes_to_skills: meta.routes_to_skills ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Load all active MemoryNodes from a vault directory.
 * Skips files that fail to parse or have status !== 'active'.
 * @param {string} vaultDir - Path to .agent/memory-vault/
 * @param {{ includeAll?: boolean }} [opts]
 * @returns {import('../types/memory.js').MemoryNode[]}
 */
export function loadNodes(vaultDir, { includeAll = false } = {}) {
  const files = walkMd(vaultDir);
  const nodes = [];

  for (const fp of files) {
    const node = parseNode(fp);
    if (!node) continue;
    if (!includeAll && node.status !== 'active') continue;
    nodes.push(node);
  }

  return nodes;
}

/**
 * Write a MemoryNode to the vault as an SSSS-compliant .md file.
 * Uses atomicWrite to prevent corruption.
 * @param {import('../types/memory.js').MemoryNode} node
 * @param {string} vaultDir - Path to .agent/memory-vault/
 * @returns {string} Absolute path written to
 */
export function writeNode(node, vaultDir) {
  const { body, ...meta } = node;
  const dir = path.join(vaultDir, node.category);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${node.slug}.md`);

  // Build SSSS frontmatter + body
  const frontmatter = matter.stringify(body ?? '', meta);
  atomicWrite(filePath, frontmatter);

  return filePath;
}

/**
 * Update a single frontmatter field on an existing node file.
 * @param {string} vaultDir
 * @param {string} slug
 * @param {string} key
 * @param {unknown} value
 */
export function setFrontmatterField(vaultDir, slug, key, value) {
  const filePath = findNodeFile(vaultDir, slug);
  if (!filePath) throw new Error(`Node not found: ${slug}`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: meta, content: body } = matter(raw);
  meta[key] = value;
  meta.updated = new Date().toISOString();
  const updated = matter.stringify(body, meta);
  atomicWrite(filePath, updated);
}

/**
 * Set the status field on an existing node file.
 * @param {string} vaultDir
 * @param {string} slug
 * @param {'active'|'superseded'|'deprecated'|'draft'} status
 */
export function setStatus(vaultDir, slug, status) {
  setFrontmatterField(vaultDir, slug, 'status', status);
}

/**
 * Recursively find the file path for a node by slug.
 * @param {string} vaultDir
 * @param {string} slug
 * @returns {string | null}
 */
export function findNodeFile(vaultDir, slug) {
  const files = walkMd(vaultDir);
  for (const fp of files) {
    if (path.basename(fp, '.md') === slug) return fp;
  }
  return null;
}

// ─── SKILL I/O ───────────────────────────────────────────────────────────────────

/**
 * Parse a SKILL.md file into a SkillManifest.
 * @param {string} filePath
 * @returns {import('../types/memory.js').SkillManifest | null}
 */
export function parseSkill(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data: meta, content: body } = matter(raw);

    return {
      name: meta.name ?? path.basename(path.dirname(filePath)),
      description: meta.description ?? '',
      path: filePath,
      needs: meta.needs ?? [],
      body: body.trim(),
      token_budget: meta.token_budget ?? 4500,
      raw_frontmatter: meta,
      last_compiled: meta.last_compiled ?? null,
      schema_version: meta.schema_version ?? 1,
    };
  } catch {
    return null;
  }
}

/**
 * Load all SKILL.md files from a skills directory.
 * @param {string} skillsDir
 * @returns {import('../types/memory.js').SkillManifest[]}
 */
export function loadSkills(skillsDir) {
  const files = walkSkillMd(skillsDir);
  return files.map(parseSkill).filter(Boolean);
}
