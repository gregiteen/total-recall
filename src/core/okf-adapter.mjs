import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import { safeStringify } from './vault.mjs';
import { writeNodeValidatedAsync } from './validated-write.mjs';
import { getNodes } from './vault-cache.mjs';
import { validateMemoryNode } from './total-recall-memory-validator.mjs';

// ─── DEFAULT OKF TYPE MAP ──────────────────────────────────────────────────
export const DEFAULT_OKF_TYPE_MAP = {
  'BigQuery Table':    'facts',
  'BigQuery Dataset':  'facts',
  'API Endpoint':      'facts',
  'Metric':            'concepts',
  'Playbook':          'patterns',
  'Runbook':           'patterns',
  'Reference':         'facts',
  'Architecture':      'concepts',
  'Decision':          'decisions',
  'Policy':            'invariants',
  'Best Practice':     'patterns',
  'Anti-Pattern':      'anti-patterns',
  '*':                 'facts',
};

// ─── Pure Mapping Functions ────────────────────────────────────────────────

/**
 * Derives a valid SSSS subject from a title.
 */
function deriveSubject(title) {
  let subject = 'okf.concept';
  if (title) {
    const cleaned = title.replace(/[^a-zA-Z0-9_\s.-]/g, '').trim();
    if (cleaned) {
      const words = cleaned.split(/\s+/);
      if (words.length > 0 && words[0]) {
        subject = words[0].toLowerCase();
      }
    }
  }
  return /^[a-zA-Z0-9_\s.-]+$/.test(subject) ? subject : 'okf.concept';
}

/**
 * Derives a description from a Markdown body if absent.
 */
function deriveDescription(body) {
  if (!body) return undefined;
  const match = body.trim().match(/^[^.!?\n]+[.!?]/);
  return match ? match[0].trim() : body.trim().split('\n')[0].trim();
}

/**
 * Capitalizes SSSS category to OKF type.
 */
function categoryToOkfType(category) {
  const reverseMap = {
    'facts': 'Fact',
    'concepts': 'Concept',
    'patterns': 'Pattern',
    'invariants': 'Invariant',
    'decisions': 'Decision',
    'anti-patterns': 'Anti-Pattern',
    'preferences': 'Preference',
    'corrections': 'Correction',
    'lore': 'Lore'
  };
  return reverseMap[category] || (category.charAt(0).toUpperCase() + category.slice(1));
}

/**
 * Convert an OKF concept (frontmatter + body) into an SSSS memory node.
 */
export function okfConceptToSsssNode(okfFrontmatter, okfBody, conceptId, options = {}) {
  if (!okfFrontmatter || typeof okfFrontmatter !== 'object') {
    return null;
  }

  const actualTypeMap = { ...DEFAULT_OKF_TYPE_MAP, ...options.typeMap };
  const okfType = okfFrontmatter.type;

  let category = options.category;
  if (!category) {
    category = actualTypeMap[okfType] || actualTypeMap['*'] || 'facts';
  }

  // Derive slug
  let slug = conceptId || 'unnamed-concept';
  if (slug.endsWith('.md')) {
    slug = slug.slice(0, -3);
  }
  slug = slug.replace(/^(\.\.?[\/\\])+/, '').replace(/^[\/\\]+/, '');
  slug = slug.replace(/[\/\\]/g, '-').toLowerCase();

  const title = okfFrontmatter.title || conceptId || 'Untitled Concept';
  const subject = okfFrontmatter.title ? deriveSubject(okfFrontmatter.title) : 'okf.concept';
  const object = okfFrontmatter.type || 'concept';

  // Parse ISO 8601 timestamp
  let timestamp = new Date().toISOString();
  if (okfFrontmatter.timestamp) {
    if (okfFrontmatter.timestamp instanceof Date) {
      timestamp = okfFrontmatter.timestamp.toISOString();
    } else if (typeof okfFrontmatter.timestamp === 'string') {
      timestamp = okfFrontmatter.timestamp;
    }
  }

  const importance = (options.importance !== undefined && options.importance !== null)
    ? options.importance
    : ((options.defaultImportance !== undefined && options.defaultImportance !== null)
        ? options.defaultImportance
        : 3);

  const node = {
    type: 'memory',
    slug,
    category,
    title,
    description: okfFrontmatter.description || undefined,
    resource: okfFrontmatter.resource || undefined,
    status: 'active',
    confidence: 0.8,
    importance,
    created: timestamp,
    updated: timestamp,
    last_accessed: new Date().toISOString(),
    source: {
      type: 'okf-import',
      session_id: crypto.randomUUID(),
      agent: 'total-recall-cli',
      evidence_count: 1,
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: Array.isArray(okfFrontmatter.tags) ? okfFrontmatter.tags : (okfFrontmatter.tags ? [okfFrontmatter.tags] : []),
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: subject,
    modality: 'descriptive',
    subject,
    predicate: 'describes',
    object,
    decay: {
      half_life_days: 30,
      access_count: 0,
    },
    schema_version: 2,
    body: okfBody || '',
  };

  return node;
}

/**
 * Convert an SSSS memory node into an OKF-compliant concept.
 */
export function ssssNodeToOkfConcept(ssssNode) {
  if (!ssssNode || typeof ssssNode !== 'object') {
    return null;
  }

  const desc = ssssNode.description || deriveDescription(ssssNode.body);

  const frontmatter = {
    ...ssssNode,
    type: categoryToOkfType(ssssNode.category),
    title: ssssNode.title,
    description: desc || undefined,
    resource: ssssNode.resource || undefined,
    tags: ssssNode.tags || [],
    timestamp: ssssNode.updated || ssssNode.created || new Date().toISOString(),
  };

  // Clean up SSSS node-specific keys we don't want as top-level frontmatter if they match the body/filepath fields
  delete frontmatter.body;
  delete frontmatter._filePath;
  delete frontmatter._filepath;
  delete frontmatter._file_path;

  return {
    frontmatter,
    body: ssssNode.body || '',
  };
}

// ─── Bundle Operations (Placeholders to be fully implemented) ────────────────

export async function importBundle(bundlePath, vaultDir, options = {}) {
  const imported = [];
  const skipped = [];
  const errors = [];

  if (!fs.existsSync(bundlePath)) {
    errors.push({ file: bundlePath, error: 'Bundle directory does not exist' });
    return { imported, skipped, errors };
  }

  // Helper to walk directory recursively, skipping index.md and log.md
  function walk(dir) {
    let files = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of list) {
      const name = entry.name;
      // Skip reserved filenames at any directory level
      if (name === 'index.md' || name === 'log.md') {
        continue;
      }
      const fullPath = path.join(dir, name);
      if (entry.isDirectory()) {
        files = files.concat(walk(fullPath));
      } else if (name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  let mdFiles = [];
  try {
    mdFiles = walk(bundlePath);
  } catch (err) {
    errors.push({ file: bundlePath, error: err.message });
    return { imported, skipped, errors };
  }

  // Get existing slugs to handle conflicts
  let existingSlugs = new Set();
  try {
    const existing = getNodes(vaultDir);
    existingSlugs = new Set(existing.map(n => n.slug));
  } catch (err) {
    // If vault dir doesn't exist yet, it's fine, we'll create it during writes
  }

  const onConflict = options.onConflict || 'warn';

  for (const filePath of mdFiles) {
    const relPath = path.relative(bundlePath, filePath);
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      errors.push({ file: relPath, error: `Failed to read file: ${err.message}` });
      continue;
    }

    let parsed;
    try {
      parsed = matter(raw);
    } catch (err) {
      errors.push({ file: relPath, error: `Failed to parse YAML frontmatter: ${err.message}` });
      continue;
    }

    // Skip if there's no frontmatter data or if the required OKF 'type' field is missing
    if (!parsed || !parsed.data || Object.keys(parsed.data).length === 0 || !parsed.data.type) {
      skipped.push({ file: relPath, reason: 'missing frontmatter or type field' });
      continue;
    }

    const node = okfConceptToSsssNode(parsed.data, parsed.content, relPath, options);
    if (!node) {
      skipped.push({ file: relPath, reason: 'failed to map to SSSS node' });
      continue;
    }

    // Handle slug conflict
    if (existingSlugs.has(node.slug)) {
      if (onConflict === 'skip') {
        skipped.push({ file: relPath, reason: `conflict (slug ${node.slug} exists)` });
        continue;
      } else if (onConflict === 'warn') {
        console.warn(`[OKF Import Warning] Slug collision: '${node.slug}' already exists. Overwriting.`);
      }
    }

    try {
      const writeResult = await writeNodeValidatedAsync(node, vaultDir, {
        dryRun: options.dryRun || false,
        agentRole: options.agentRole || 'admin'
      });

      if (!writeResult.success) {
        let errMsg = writeResult.error || 'Validation failed';
        if (writeResult.repair?.field_errors) {
          const details = writeResult.repair.field_errors.map(fe => `${fe.field}: ${fe.issue}`).join(', ');
          errMsg += ` (${details})`;
        }
        errors.push({ file: relPath, error: errMsg });
      } else {
        imported.push({ slug: node.slug, file: relPath });
        if (!options.dryRun) {
          existingSlugs.add(node.slug);
        }
      }
    } catch (err) {
      errors.push({ file: relPath, error: `Write error: ${err.message}` });
    }
  }

  return { imported, skipped, errors };
}

export async function exportBundle(vaultDir, outputDir, options = {}) {
  const { execSync } = await import('node:child_process');
  const os = await import('node:os');

  const format = options.format || 'dir';
  const stripSsss = options.stripSsss || false;

  let targetDir = outputDir;
  let isTar = format === 'tar.gz';
  let tempDir = null;

  if (isTar) {
    tempDir = path.join(os.tmpdir(), `okf-export-${crypto.randomUUID()}`);
    targetDir = tempDir;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const nodes = getNodes(vaultDir);
  const exported = [];

  const conceptsByCategory = {};

  for (const node of nodes) {
    const concept = ssssNodeToOkfConcept(node);
    if (!concept) continue;

    if (stripSsss) {
      const allowed = ['type', 'title', 'description', 'resource', 'tags', 'timestamp'];
      const stripped = {};
      for (const key of allowed) {
        if (concept.frontmatter[key] !== undefined) {
          stripped[key] = concept.frontmatter[key];
        }
      }
      concept.frontmatter = stripped;
    }

    const category = node.category || 'facts';
    const catDir = path.join(targetDir, category);
    fs.mkdirSync(catDir, { recursive: true });

    const filename = `${node.slug}.md`;
    const destPath = path.join(catDir, filename);

    const fileContent = safeStringify(concept.body, concept.frontmatter);
    fs.writeFileSync(destPath, fileContent, 'utf8');

    exported.push({ slug: node.slug, file: path.join(category, filename) });

    if (!conceptsByCategory[category]) {
      conceptsByCategory[category] = [];
    }
    conceptsByCategory[category].push({
      title: node.title,
      relPath: `./${category}/${filename}`,
      description: concept.frontmatter.description || ''
    });
  }

  // Generate index.md
  let indexContent = '# Knowledge Bundle Index\n\n';
  for (const [category, list] of Object.entries(conceptsByCategory)) {
    const catHeader = category.charAt(0).toUpperCase() + category.slice(1);
    indexContent += `## ${catHeader}\n`;
    for (const item of list) {
      const descSuffix = item.description ? ` - ${item.description}` : '';
      indexContent += `- [${item.title}](${item.relPath})${descSuffix}\n`;
    }
    indexContent += '\n';
  }
  fs.writeFileSync(path.join(targetDir, 'index.md'), indexContent, 'utf8');

  // Generate log.md
  let logContent = '# Bundle Update History\n\n';
  const auditPath = path.join(vaultDir, '.events', 'audit.jsonl');
  if (fs.existsSync(auditPath)) {
    try {
      const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n');
      for (const line of lines) {
        if (!line) continue;
        const event = JSON.parse(line);
        const date = event.ts ? new Date(event.ts).toISOString().replace(/\.\d+Z$/, 'Z') : 'Unknown Date';
        const operation = event.payload?.resolved_type || 'mutation';
        logContent += `- **${date}**: Operation '${operation}' committed at \`${event.subject || event.path || ''}\`\n`;
      }
    } catch (err) {
      logContent += `Failed to parse audit history: ${err.message}\n`;
    }
  } else {
    logContent += 'No update history available.\n';
  }
  fs.writeFileSync(path.join(targetDir, 'log.md'), logContent, 'utf8');

  if (isTar) {
    const tarFile = outputDir.endsWith('.tar.gz') ? outputDir : `${outputDir}.tar.gz`;
    fs.mkdirSync(path.dirname(tarFile), { recursive: true });
    execSync(`tar -czf "${tarFile}" -C "${targetDir}" .`);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return {
    exported,
    indexGenerated: true,
    logGenerated: true
  };
}

export function lintOkfCompliance(vaultDir, options = {}) {
  const strict = options.strict || false;
  const nodes = getNodes(vaultDir);

  const warnings = [];
  const errors = [];

  for (const node of nodes) {
    const relPath = `${node.category}/${node.slug}.md`;
    
    // Check title
    if (!node.title) {
      const msg = `Missing title in ${relPath}`;
      if (strict) errors.push({ file: relPath, message: msg });
      else warnings.push({ file: relPath, message: msg });
    }

    // Check description
    if (!node.description) {
      const msg = `Missing description in ${relPath}`;
      if (strict) errors.push({ file: relPath, message: msg });
      else warnings.push({ file: relPath, message: msg });
    }

    // Check tags
    if (!node.tags || !Array.isArray(node.tags) || node.tags.length === 0) {
      const msg = `Missing or empty tags in ${relPath}`;
      if (strict) errors.push({ file: relPath, message: msg });
      else warnings.push({ file: relPath, message: msg });
    }

    // Check updated/created timestamp
    if (!node.updated && !node.created) {
      const msg = `Missing updated/created timestamp in ${relPath}`;
      if (strict) errors.push({ file: relPath, message: msg });
      else warnings.push({ file: relPath, message: msg });
    }
  }

  const pass = errors.length === 0;

  return {
    total: nodes.length,
    pass,
    warnings,
    errors
  };
}

export function generateLiveIndex(vaultDir) {
  const nodes = getNodes(vaultDir);
  if (nodes.length === 0) return;
  
  const conceptsByType = {};

  for (const node of nodes) {
    const concept = ssssNodeToOkfConcept(node);
    if (!concept) continue;

    const type = concept.frontmatter.type || 'Generic Concept';
    const category = node.category || 'facts';
    const filename = `${node.slug}.md`;

    if (!conceptsByType[type]) {
      conceptsByType[type] = [];
    }
    conceptsByType[type].push({
      title: node.title || node.slug,
      relPath: `./${category}/${filename}`,
      description: concept.frontmatter.description || ''
    });
  }

  let indexContent = '# Knowledge Bundle Index\n\n';
  const sortedTypes = Object.keys(conceptsByType).sort();
  for (const type of sortedTypes) {
    indexContent += `# ${type}\n\n`;
    const list = conceptsByType[type].sort((a, b) => a.title.localeCompare(b.title));
    for (const item of list) {
      const descSuffix = item.description ? ` - ${item.description}` : '';
      indexContent += `* [${item.title}](${item.relPath})${descSuffix}\n`;
    }
    indexContent += '\n';
  }
  fs.writeFileSync(path.join(vaultDir, 'index.md'), indexContent, 'utf8');
}

export function generateLiveLog(vaultDir) {
  let logContent = '# Bundle Update History\n\n';
  const auditPath = path.join(vaultDir, '.events', 'audit.jsonl');
  if (fs.existsSync(auditPath)) {
    try {
      const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
      const eventsByDate = {};

      for (const line of lines) {
        const event = JSON.parse(line);
        if (!event.ts) continue;
        const dateStr = new Date(event.ts).toISOString().split('T')[0];
        const operation = event.payload?.resolved_type || 'mutation';
        const formattedOp = operation.charAt(0).toUpperCase() + operation.slice(1);
        const subject = event.subject || event.path || 'unknown';
        
        if (!eventsByDate[dateStr]) {
          eventsByDate[dateStr] = [];
        }
        eventsByDate[dateStr].push(`* **${formattedOp}**: Committed at \`${subject}\``);
      }

      const sortedDates = Object.keys(eventsByDate).sort().reverse();
      for (const date of sortedDates) {
        logContent += `## ${date}\n`;
        const logs = eventsByDate[date].reverse();
        for (const log of logs) {
          logContent += `${log}\n`;
        }
        logContent += '\n';
      }
    } catch (err) {
      logContent += `Failed to parse audit history: ${err.message}\n`;
    }
  } else {
    logContent += 'No update history available.\n';
  }
  fs.writeFileSync(path.join(vaultDir, 'log.md'), logContent, 'utf8');
}

