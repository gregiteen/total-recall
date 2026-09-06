import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Context Cache & Section Management
 * 
 * Provides fine-grained section caching for evolving context blocks.
 * Avoids full graph re-synthesis when only an atomic benchmark or project node changes.
 */

export function loadSectionCache(derivedDir) {
  if (!derivedDir) return {};
  const cachePath = path.join(derivedDir, 'section-cache.json');
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

export function saveSectionCache(derivedDir, cache) {
  if (!derivedDir || !cache) return;
  const cachePath = path.join(derivedDir, 'section-cache.json');
  try {
    if (!fs.existsSync(derivedDir)) {
      fs.mkdirSync(derivedDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    // Non-fatal cache write failure
  }
}

/**
 * Compute a deterministic hash for a group of nodes or inputs.
 */
export function computeSectionHash(nodes = [], extraInput = '') {
  const hash = crypto.createHash('sha256');
  for (const n of nodes) {
    hash.update(n.slug || '');
    hash.update(String(n.timestamp || ''));
    hash.update(String(n.importance || ''));
    hash.update(String(n.confidence || ''));
    hash.update(JSON.stringify(n.source || {}));
    hash.update(n.title || '');
    hash.update(n.body || n.content || '');
    if (Array.isArray(n.enables)) hash.update(n.enables.join(','));
    if (Array.isArray(n.prerequisites)) hash.update(n.prerequisites.join(','));
  }
  if (extraInput) {
    hash.update(String(extraInput));
  }
  return hash.digest('hex');
}

/**
 * Retrieve a section from cache if inputs are unchanged, otherwise compute and cache.
 */
export async function getCachedSection({
  derivedDir,
  sectionKey,
  nodes = [],
  extraInput = '',
  generatorFn
}) {
  const cache = loadSectionCache(derivedDir);
  const inputHash = computeSectionHash(nodes, extraInput);

  if (cache[sectionKey] && cache[sectionKey].hash === inputHash) {
    return {
      content: cache[sectionKey].content,
      cached: true,
      hash: inputHash
    };
  }

  // Dirty or uncached: compute section
  const content = await generatorFn();
  cache[sectionKey] = {
    hash: inputHash,
    content,
    updatedAt: new Date().toISOString()
  };
  saveSectionCache(derivedDir, cache);

  return {
    content,
    cached: false,
    hash: inputHash
  };
}

/**
 * Manage context token budget across sections.
 * Allocates tokens based on section priority:
 * 1. User Projects & Grounding (Critical, cannot be truncated)
 * 2. Active Benchmarks & World Records
 * 3. Verified Capability Breakthroughs
 * 4. Deep Evolving Context Block / Background
 */
export function manageContextBudget(sections = [], options = {}) {
  const maxChars = options.maxChars || 80000; // ~20,000 tokens default for surface injection
  let currentTotal = 0;
  const budgeted = [];

  // Sort sections by priority if priority is provided
  const sorted = [...sections].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const sec of sorted) {
    if (!sec.content) continue;
    const secLen = sec.content.length;

    if (currentTotal + secLen <= maxChars) {
      budgeted.push(sec.content);
      currentTotal += secLen;
    } else {
      // Remaining budget
      const remaining = maxChars - currentTotal;
      if (remaining > 500 && sec.allowTruncation !== false) {
        budgeted.push(sec.content.slice(0, remaining) + '\n\n... (section truncated to preserve context budget)');
        currentTotal += remaining;
        break;
      }
    }
  }

  return budgeted.join('\n\n---\n\n');
}
