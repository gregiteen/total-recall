import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { logger } from './logger.mjs';

/**
 * Atomic file write using write-then-rename to prevent partial corruption.
 */
export function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Deep-strip undefined values from an object so js-yaml (via gray-matter)
 * never encounters `[object Undefined]` and crashes the process.
 */
function stripUndefined(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = typeof v === 'object' ? stripUndefined(v) : v;
    }
  }
  return clean;
}

/**
 * Safe wrapper around matter.stringify that prevents js-yaml crashes.
 * Use this instead of matter.stringify() everywhere in the codebase.
 *
 * @param {string} content  The markdown body
 * @param {object} data     The YAML frontmatter object
 * @returns {string}        The serialized markdown with frontmatter
 */
export function safeStringify(content, data) {
  if (data && data.type === 'memory') {
    const now = new Date().toISOString();
    if (!data.x_temporal_context) {
      data.x_temporal_context = data.updated || data.created || now;
    }
    if (!data.x_citations) {
      data.x_citations = [{
        source: data.source?.type || 'unknown',
        title: data.title || 'Untitled Memory',
        url: data.source?.session_id ? `session://${data.source.session_id}` : 'unknown',
        published: data.x_temporal_context,
        relevance: 1.0,
        accessed: now
      }];
    }
  }
  return matter.stringify(content ?? '', stripUndefined(data ?? {}));
}

/**
 * Walk directory recursively and find all .md files.
 */
export function walkMd(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkMd(fullPath));
    } else if (fullPath.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Load all memory nodes from the vault.
 */
export function loadNodes(vaultDir) {
  const nodes = [];
  const files = walkMd(vaultDir);
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const { data, content } = matter(raw);
      if (data.type === 'memory') {
        nodes.push({ ...data, body: content.trim() });
      }
    } catch (err) {
      logger.warn('vault', `Failed to parse ${file}`, { err: err.message });
    }
  }
  return nodes;
}

/**
 * Load merged memory nodes from both global and project vaults.
 * Project nodes override global nodes with the same slug.
 * Each node is tagged with `_layer: 'global' | 'project'`.
 *
 * @param {string} globalVaultDir - Path to global memory-vault/
 * @param {string|null} projectVaultDir - Path to project memory-vault/ (null if no project brain)
 * @returns {object[]} Merged array of nodes
 */
export function loadMergedNodes(globalVaultDir, projectVaultDir) {
  // Load global nodes
  const globalNodes = loadNodes(globalVaultDir).map(n => ({ ...n, _layer: 'global' }));

  if (!projectVaultDir || !fs.existsSync(projectVaultDir)) {
    return globalNodes;
  }

  // Load project nodes
  const projectNodes = loadNodes(projectVaultDir).map(n => ({ ...n, _layer: 'project' }));

  // Merge: project wins on slug conflict
  const nodeMap = new Map();
  for (const node of globalNodes) {
    nodeMap.set(node.slug, node);
  }
  for (const node of projectNodes) {
    nodeMap.set(node.slug, node); // project overrides global
  }

  return Array.from(nodeMap.values());
}


/**
 * Write a memory node to the vault.
 */
const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

export function writeNode(node, vaultDir) {
  if (!SAFE_NAME.test(node.slug)) throw new Error(`Invalid slug: ${node.slug}`);
  if (!SAFE_NAME.test(node.category)) throw new Error(`Invalid category: ${node.category}`);
  const targetDir = path.join(vaultDir, node.category);
  const filePath = path.join(targetDir, `${node.slug}.md`);
  
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  const { body, ...frontmatter } = node;
  
  if (frontmatter.type === 'memory') {
    const now = new Date().toISOString();
    if (!frontmatter.x_temporal_context) {
      frontmatter.x_temporal_context = frontmatter.updated || frontmatter.created || now;
    }
    if (!frontmatter.x_citations) {
      frontmatter.x_citations = [{
        source: frontmatter.source?.type || 'unknown',
        title: frontmatter.title || 'Untitled Memory',
        url: frontmatter.source?.session_id ? `session://${frontmatter.source.session_id}` : 'unknown',
        published: frontmatter.x_temporal_context,
        relevance: 1.0,
        accessed: now
      }];
    }
  }
  
  const raw = safeStringify(body || '', frontmatter);
  atomicWrite(filePath, raw);
}

/**
 * Delete a memory node by slug.
 * Finds the node via loadNodes, then removes its .md file.
 * Returns true if deleted, false if the node was not found.
 *
 * @param {string} slug
 * @param {string} vaultDir
 * @returns {boolean}
 */
export function deleteNode(slug, vaultDir) {
  const nodes = loadNodes(vaultDir);
  const node = nodes.find(n => n.slug === slug);
  if (!node) return false;
  const filePath = path.join(vaultDir, node.category, `${node.slug}.md`);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
    return true;
  }
  return false;
}


/**
 * Creates a fully populated memory node from an API payload.
 */
export function createMemoryNode({ slug, title, category, content }) {
  const now = new Date().toISOString();
  return {
    type: 'memory',
    slug,
    title,
    category,
    body: content,
    status: 'active',
    confidence: 1.0,
    importance: 3,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'api-client',
      session_id: 'api-external',
      evidence_count: 1
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: [],
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'api-external',
    modality: 'should',
    subject: 'api-external',
    predicate: 'provided_information',
    object: 'api-external',
    decay: {
      half_life_days: 30,
      access_count: 1
    },
    schema_version: 2,
    x_temporal_context: now,
    x_citations: [{
      source: 'api-client',
      title: title || 'External API Ingest',
      url: 'api://external',
      published: now,
      relevance: 1.0,
      accessed: now
    }]
  };
}

/**
 * Load all skill manifests from the skills directory.
 */
export function loadSkills(skillsDir) {
  const skills = [];
  if (!fs.existsSync(skillsDir)) return skills;

  for (const skillName of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      try {
        const raw = fs.readFileSync(skillPath, 'utf8');
        const { data, content } = matter(raw);
        // Accept either `type: skill` or files that simply have a `name` field
        // (which is the convention for all real SKILL.md files)
        if (data.type === 'skill' || data.name) {
          skills.push({
            ...data,
            name: data.name || skillName,
            body: content.trim(),
            filepath: skillPath,
          });
        }
      } catch (err) {
        logger.warn('vault', `Failed to parse ${skillPath}`, { err: err.message });
      }
    }
  }
  return skills;
}
