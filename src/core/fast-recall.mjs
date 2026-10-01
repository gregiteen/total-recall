import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import { atomicWrite, isSafeVaultName } from './vault.mjs';

const caches = new Map();
const words = text => [...new Set(String(text).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [])];
const digest = text => crypto.createHash('sha256').update(text).digest('hex');

function containedFile(vaultDir, relative) {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) return null;
  try {
    const root = fs.realpathSync(vaultDir);
    const file = path.resolve(root, relative);
    let cursor = root;
    for (const part of relative.split('/')) {
      cursor = path.join(cursor, part);
      if (fs.lstatSync(cursor).isSymbolicLink()) return null;
    }
    return file.startsWith(root + path.sep) && fs.statSync(file).isFile() ? file : null;
  } catch { return null; }
}

/** Disposable local full-text projection. Markdown remains authoritative. */
export function buildLocalSearchIndex(nodes, { derivedDir, vaultDir }) {
  const documents = [];
  const postings = Object.create(null);
  let previous = new Map();
  try {
    const old = JSON.parse(fs.readFileSync(path.join(derivedDir, 'local-search.json'), 'utf8'));
    if (old.version === 1 && Array.isArray(old.documents)) previous = new Map(old.documents.map(document => [document.relative, document]));
  } catch { /* absent or corrupt projection is rebuilt */ }
  let reused = 0;
  for (const node of nodes) {
    const source = node._filePath || node._filepath;
    const relative = source ? path.relative(vaultDir, source).split(path.sep).join('/') : null;
    const file = containedFile(vaultDir, relative);
    if (!file || node.status !== 'active') continue;
    const stat = fs.statSync(file);
    const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    const old = previous.get(relative);
    const unchanged = old?.stamp === stamp && Array.isArray(old.terms);
    const contentDigest = unchanged ? old.digest : digest(fs.readFileSync(file, 'utf8'));
    const terms = unchanged ? old.terms : words(`${node.slug} ${node.title || ''} ${(node.tags || []).join(' ')} ${node.body || ''}`);
    if (unchanged) reused++;
    const index = documents.length;
    documents.push({ slug: node.slug, title: node.title, category: node.category,
      status: node.status, tags: node.tags || [], modality: node.modality,
      importance: node.importance, priority: node.priority, relative, digest: contentDigest, stamp, terms });
    for (const word of terms) {
      (postings[word] ||= []).push(index);
    }
  }
  fs.mkdirSync(derivedDir, { recursive: true });
  atomicWrite(path.join(derivedDir, 'local-search.json'), JSON.stringify({ version: 1, documents, postings }));
  return { documents: documents.length, reused };
}

function readIndex(file) {
  const stat = fs.statSync(file);
  const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  const cached = caches.get(file);
  if (cached?.stamp === stamp) return cached.value;
  const raw = fs.readFileSync(file, 'utf8');
  const value = file.endsWith('.jsonl') ? raw.split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  }) : JSON.parse(raw);
  if (caches.size >= 8) caches.delete(caches.keys().next().value);
  caches.set(file, { stamp, value });
  return value;
}

/** Local retrieval never imports the whole-vault cache or a provider. */
export function fastSearch(query, { derivedDir, vaultDir, top_k = 5, category = null,
  tags = null, modality = null, importance = null, priority = null, fullText = false } = {}) {
  const started = performance.now();
  const stats = { mode: fullText ? 'local-full-text' : 'local-metadata', index: 'missing',
    freshness: 'index-snapshot; selected documents verified against canonical Markdown', hydrated_documents: 0, stale_documents: 0 };
  const results = [];
  Object.defineProperty(results, 'stats', { value: stats });
  const q = String(query).toLowerCase().trim();
  if (!q || !derivedDir) return results;
  let documents = [], postings;
  const local = path.join(derivedDir, 'local-search.json');
  const layers = path.join(derivedDir, 'memory-layers.jsonl');
  try {
    if (fs.existsSync(local)) {
      const index = readIndex(local);
      if (index.version !== 1 || !Array.isArray(index.documents) || !index.postings) throw new Error('invalid local index');
      documents = index.documents; postings = index.postings; stats.index = 'local';
    } else if (fs.existsSync(layers)) {
      documents = readIndex(layers); stats.index = 'metadata-only';
    }
  } catch { stats.index = 'corrupt'; return results; }
  stats.index_ms = performance.now() - started;
  const terms = words(q);
  const bodyCandidates = new Set();
  if (fullText && postings && terms.length) {
    const lists = terms.map(term => new Set(postings[term] || []));
    for (const id of lists[0]) if (lists.every(list => list.has(id))) bodyCandidates.add(id);
  }
  const candidates = [];
  documents.forEach((node, id) => {
    if (node.status && node.status !== 'active') return;
    if (category && node.category !== category || modality && node.modality !== modality || priority && node.priority !== priority) return;
    if (importance && (node.importance || 3) < Number(importance)) return;
    if (tags?.length && !tags.some(tag => node.tags?.includes(tag))) return;
    const slug = String(node.slug || '').toLowerCase(), title = String(node.title || '').toLowerCase();
    const score = slug === q || title === q ? 1 : slug.includes(q) || title.includes(q) ? .8 :
      node.tags?.some(tag => String(tag).toLowerCase().includes(q)) ? .7 : bodyCandidates.has(id) ? .6 : 0;
    if (score) candidates.push({ ...node, score, type: 'vault' });
  });
  candidates.sort((a, b) => b.score - a.score);
  stats.match_ms = performance.now() - started - stats.index_ms;
  const hydration = performance.now();
  for (const candidate of candidates) {
    if (results.length >= Math.max(1, Math.min(20, top_k))) break;
    if (!vaultDir) { results.push(candidate); continue; }
    const relative = candidate.relative || (isSafeVaultName(candidate.category) && isSafeVaultName(candidate.slug) ? `${candidate.category}/${candidate.slug}.md` : null);
    const file = containedFile(vaultDir, relative);
    if (!file) { stats.stale_documents++; continue; }
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const { data, content } = matter(raw);
      if (data.type !== 'memory' || data.slug !== candidate.slug || data.status && data.status !== 'active') continue;
      const stale = candidate.digest && digest(raw) !== candidate.digest;
      if (stale) {
        stats.stale_documents++;
        const current = `${data.slug} ${data.title || ''} ${(data.tags || []).join(' ')} ${fullText ? content : ''}`;
        if (!terms.every(term => words(current).includes(term))) continue;
      }
      if (category && data.category !== category || modality && data.modality !== modality || priority && data.priority !== priority ||
        importance && (data.importance || 3) < Number(importance) || tags?.length && !tags.some(tag => data.tags?.includes(tag))) continue;
      const { relative: ignoredPath, digest: ignoredDigest, stamp: ignoredStamp, terms: ignoredTerms, ...publicCandidate } = candidate;
      results.push({ ...publicCandidate, ...data, body: content.trim(), score: candidate.score, type: 'vault' });
      stats.hydrated_documents++;
    } catch { stats.stale_documents++; }
  }
  stats.hydration_ms = performance.now() - hydration;
  stats.total_ms = performance.now() - started;
  return results;
}
