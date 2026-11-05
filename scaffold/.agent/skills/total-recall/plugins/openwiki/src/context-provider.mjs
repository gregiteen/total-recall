/** OpenWiki's native task evidence provider. Reads projections and explicit source vicinity; never generates. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { searchWikiHubs } from './search.mjs';
import { staleness } from './refresh.mjs';

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const STOP = new Set('the and for from with this that task implement should into through using before after all can how what does'.split(' '));
const termsOf = text => [...new Set((String(text).toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || []).filter(term => !STOP.has(term)))];
const within = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
const sensitive = relative => relative.split(path.sep).some(part => ['.git', '.agent', '.agents', 'node_modules', 'dist', 'build', 'coverage', 'vault', 'memory-vault', 'memory-derived'].includes(part) || /^\.env(?:\.|$)|^secrets\.enc$|\.(?:pem|key|p12|pfx)$/i.test(part));
const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.mjs', '.cjs', '.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.sh', '.sql', '.json', '.yaml', '.yml', '.toml', '.css', '.html']);

function readSource(root, target) {
  const file = fs.realpathSync(target), relative = path.relative(root, file);
  if (!within(root, file) || sensitive(relative) || !TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) throw new Error(`reference is outside permitted workspace text: ${path.basename(target)}`);
  if (fs.statSync(file).size > 512 * 1024) throw new Error(`reference exceeds the 512 KiB read limit: ${relative}`);
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('\0')) throw new Error(`binary reference skipped: ${relative}`);
  return { file, relative, text, hash: hash(text) };
}

function excerpt(source, task, maxChars, anchorLine) {
  const lines = source.text.split('\n'), terms = termsOf(task);
  let anchor = Number.isInteger(anchorLine) ? Math.max(0, Math.min(lines.length - 1, anchorLine - 1)) : 0;
  if (!Number.isInteger(anchorLine)) {
    let best = -1;
    lines.forEach((line, index) => {
      const score = terms.filter(term => line.toLowerCase().includes(term)).length;
      if (score > best) { anchor = index; best = score; }
    });
  }
  let start = Math.max(0, anchor - 2), end = Math.min(lines.length, anchor + 3);
  while (lines.slice(start, end).join('\n').length > maxChars && (start < anchor || end > anchor + 1)) {
    if (anchor - start >= end - anchor - 1 && start < anchor) start++;
    else end--;
  }
  let text = lines.slice(start, end).join('\n');
  if (text.length > maxChars) {
    const hits = terms.map(term => text.toLowerCase().indexOf(term)).filter(index => index >= 0);
    const focus = hits.length ? Math.min(...hits) : 0;
    const offset = Math.max(0, Math.min(text.length - maxChars, focus - Math.floor(maxChars / 3)));
    text = text.slice(offset, offset + maxChars);
  }
  return { text: text.trim(), startLine: start + 1, endLine: end };
}

function references(passage, source, root) {
  const found = [];
  for (const match of passage.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const raw = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith('#')) continue;
    const [file, anchor] = raw.split('#');
    let decoded; try { decoded = decodeURIComponent(file); } catch { continue; }
    found.push({ target: path.resolve(path.dirname(source.file), decoded), line: Number(anchor?.match(/^L(\d+)/i)?.[1]) || undefined });
  }
  for (const match of passage.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    const file = match[1].endsWith('.md') ? match[1] : `${match[1]}.md`;
    found.push({ target: path.resolve(root, 'openwiki', file) });
  }
  for (const match of passage.matchAll(/`((?:src|lib|test|tests|docs|scripts)\/[\w./-]+)(?::(\d+)(?:-\d+)?)?`/g)) {
    found.push({ target: path.resolve(root, match[1]), line: Number(match[2]) || undefined });
  }
  return found;
}

export async function retrieveContext({ task, projectRoot = process.cwd(), limit = 6, maxChars = 1000, signal,
  search = searchWikiHubs, inspectFreshness = staleness, git = spawnSync } = {}) {
  const root = fs.realpathSync(projectRoot), terms = termsOf(task), diagnostics = [], candidates = [];
  const cap = Math.min(6, Math.max(0, Number(limit) || 0)), chars = Math.min(1400, Math.max(1, Number(maxChars) || 1000));
  if (!terms.length || !cap) return { candidates, diagnostics, coverage: { scope: 'workspace-hubs-and-explicit-source', ranking: 'lexical', repositoryFilesIndexed: false } };
  signal?.throwIfAborted();
  const boundedGit = (binary, args, options) => git(binary, args, { ...options, timeout: 1500 });
  const fresh = inspectFreshness(root, { git: boundedGit });
  const dirty = boundedGit('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  const workspaceChanged = dirty.status === 0 && String(dirty.stdout || '').split('\n').some(line => line.trim() && !line.slice(3).startsWith('openwiki/'));
  const freshness = fresh.stale ? true : !fresh.generatedAt || workspaceChanged || dirty.status !== 0 ? 'unknown' : false;
  if (freshness !== false) diagnostics.push(`wiki freshness ${freshness === true ? 'stale' : 'unverified'}${fresh.commitsSince ? ` (${fresh.commitsSince} commits since generation)` : ''}${workspaceChanged ? '; workspace has uncommitted changes' : ''}`);
  const result = await search(terms.join(' '), { cwd: root, allVaults: false, limit: cap * 2 });
  const seen = new Set();
  const add = (source, passage, score, kind, relatedTo) => {
    const id = `${source.relative}:${passage.startLine}`;
    if (seen.has(id) || !passage.text || candidates.length >= cap) return;
    seen.add(id);
    candidates.push({ id, title: source.relative, text: passage.text, score,
      source: { path: source.file, hash: source.hash, kind, startLine: passage.startLine, endLine: passage.endLine, stale: kind === 'source' ? false : freshness },
      ...(relatedTo ? { relatedTo } : {}) });
  };
  for (const hit of (result.results || []).slice(0, 3)) {
    if (candidates.length >= cap) break;
    signal?.throwIfAborted();
    try {
      const source = readSource(root, hit.path), passage = excerpt(source, task, chars, hit.line);
      const id = `${source.relative}:${passage.startLine}`;
      add(source, passage, Math.min(.9, Math.max(.2, hit.score / 100)), 'wiki');
      // Expand only links present in this selected passage, never the page's unrelated navigation graph.
      for (const ref of references(passage.text, source, root).slice(0, 2)) {
        if (candidates.length >= cap) break;
        try {
          const target = readSource(root, ref.target), kind = target.relative.startsWith(`openwiki${path.sep}`) ? 'wiki' : 'source';
          add(target, excerpt(target, task, chars, ref.line), .35, kind, id);
        } catch (error) { diagnostics.push(String(error.message).slice(0, 160)); }
      }
    } catch (error) { diagnostics.push(String(error.message).slice(0, 160)); }
  }
  return { candidates, diagnostics: [...new Set(diagnostics)].slice(0, 5), coverage: {
    scope: 'workspace-hubs-and-explicit-source', ranking: 'lexical', repositoryFilesIndexed: false,
    hubsScanned: result.totalHubsScanned || 0, sourceExcerpts: candidates.filter(row => row.source.kind === 'source').length,
    generatedAt: fresh.generatedAt, wikiFreshness: freshness,
  } };
}
