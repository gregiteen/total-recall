import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

/**
 * Atomic file write using write-then-rename to prevent partial corruption.
 */
export function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
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
      console.warn(`Failed to parse ${file}: ${err.message}`);
    }
  }
  return nodes;
}

/**
 * Write a memory node to the vault.
 */
export function writeNode(node, vaultDir) {
  const targetDir = path.join(vaultDir, node.category);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const filePath = path.join(targetDir, `${node.slug}.md`);
  const { body, ...frontmatter } = node;
  
  const raw = matter.stringify(body || '', frontmatter);
  atomicWrite(filePath, raw);
}

/**
 * Creates a fully populated memory node from an MCP payload.
 */
export function createNodeFromMcpPayload({ slug, title, category, content }) {
  return {
    type: 'memory',
    slug,
    title,
    category,
    body: content,
    status: 'active',
    confidence: 1.0,
    importance: 3,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    source: {
      type: 'mcp-client',
      session_id: 'mcp-external',
      evidence_count: 1
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: [],
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'mcp-external',
    modality: 'should',
    subject: 'mcp-external',
    predicate: 'provided_information',
    object: 'mcp-external',
    decay: {
      half_life_days: 30,
      access_count: 1
    },
    schema_version: 2
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
        console.warn(`Failed to parse ${skillPath}: ${err.message}`);
      }
    }
  }
  return skills;
}
