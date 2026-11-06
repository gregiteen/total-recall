/** OpenWiki's native task evidence provider. Reads projections and explicit source vicinity; never generates. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { searchWikiHubs, wikiBodyStart, wikiTaskTerms as termsOf } from './search.mjs';
import { staleness, stillGenerating } from './refresh.mjs';

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const within = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
const sensitive = relative => relative.split(path.sep).some(part => ['.git', '.agent', '.agents', 'node_modules', 'dist', 'build', 'coverage', 'vault', 'memory-vault', 'memory-derived'].includes(part) || /^\.env(?:\.|$)|^secrets\.enc$|\.(?:pem|key|p12|pfx)$/i.test(part));
const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.mjs', '.cjs', '.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.sh', '.sql', '.json', '.yaml', '.yml', '.toml', '.css', '.html']);

function readSource(root, target) {
  if (!within(root, target)) throw new Error(`reference is outside the selected workspace: ${path.basename(target)}`);
  const file = fs.realpathSync(target), relative = path.relative(root, file);
  if (!within(root, file) || sensitive(relative) || !TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) throw new Error(`reference is outside permitted workspace text: ${path.basename(target)}`);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error(`reference is not a regular file: ${relative}`);
  if (stat.size > 512 * 1024) throw new Error(`reference exceeds the 512 KiB read limit: ${relative}`);
  const bytes = fs.readFileSync(file);
  const text = bytes.toString('utf8');
  if (text.includes('\0')) throw new Error(`binary reference skipped: ${relative}`);
  const lines = text.split('\n');
  const bodyStart = relative.startsWith(`openwiki${path.sep}`) ? wikiBodyStart(lines) : 0;
  return { file, relative, lines, bodyStart, hash: hash(bytes) };
}

function excerpt(source, task, maxChars, anchorLine) {
  const { lines, bodyStart } = source;
  const terms = termsOf(task);
  let anchor = Number.isInteger(anchorLine) ? Math.max(bodyStart, Math.min(lines.length - 1, anchorLine - 1)) : bodyStart;
  if (!Number.isInteger(anchorLine)) {
    let best = -1;
    lines.slice(bodyStart).forEach((line, index) => {
      const score = terms.filter(term => line.toLowerCase().includes(term)).length;
      if (score > best) { anchor = bodyStart + index; best = score; }
    });
  }
  let start = Math.max(bodyStart, anchor - 2), end = Math.min(lines.length, anchor + 3);
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
    const repoRelative = raw.startsWith('repo://');
    if ((!repoRelative && /^[a-z][a-z\d+.-]*:/i.test(raw)) || raw.startsWith('#')) continue;
    const [file, anchor] = (repoRelative ? raw.slice('repo://'.length) : raw).split('#');
    let decoded; try { decoded = decodeURIComponent(file); } catch { continue; }
    found.push({ target: path.resolve(repoRelative ? root : path.dirname(source.file), decoded), line: Number(anchor?.match(/^L(\d+)/i)?.[1]) || undefined });
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
  const boundedGit = (binary, args, options) => git(binary, args, { ...options, timeout: 1500, maxBuffer: 128 * 1024 });
  const fresh = inspectFreshness(root, { git: boundedGit });
  const dirty = boundedGit('git', ['-C', root, 'status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' });
  const workspaceChanged = dirty.status === 0 && String(dirty.stdout || '').split('\n').some(line => line.trim() && !line.slice(3).startsWith('openwiki/'));
  const incomplete = fresh.generatedStatus === 'interrupted' || stillGenerating(root);
  const freshness = fresh.stale ? true : incomplete || !Number.isFinite(Date.parse(fresh.generatedAt)) ||
    !Number.isFinite(fresh.commitsSince) || workspaceChanged || dirty.status !== 0 ? 'unknown' : false;
  if (incomplete) diagnostics.push('wiki generation incomplete');
  if (freshness !== false) diagnostics.push(`wiki freshness ${freshness === true ? 'stale' : 'unverified'}${fresh.commitsSince ? ` (${fresh.commitsSince} commits since generation marker)` : ''}${workspaceChanged ? ', workspace has uncommitted changes' : ''}`);
  const result = await search(terms.join(' '), { cwd: root, allVaults: false, limit: cap * 2, exactTerms: true });
  const seen = new Set(), sources = new Map();
  const sourceAt = file => {
    if (!sources.has(file)) sources.set(file, readSource(root, file));
    return sources.get(file);
  };
  const issue = (error, file) => diagnostics.push(error.code === 'ENOENT'
    ? `referenced file missing: ${path.relative(root, file)}`.slice(0, 160)
    : String(error.message).slice(0, 160));
  const add = (source, passage, score, kind, relatedTo) => {
    const id = `${source.relative}:${passage.startLine}`;
    if (seen.has(id) || !passage.text || candidates.length >= cap) return null;
    seen.add(id);
    candidates.push({ id, title: source.relative, text: passage.text, score,
      source: { path: source.file, hash: source.hash, kind, startLine: passage.startLine, endLine: passage.endLine, stale: kind === 'source' ? false : freshness },
      ...(relatedTo ? { relatedTo } : {}) });
    return id;
  };
  let seeds = 0;
  for (const hit of result.results || []) {
    if (candidates.length >= cap || seeds >= 3) break;
    signal?.throwIfAborted();
    try {
      const source = sourceAt(hit.path);
      const anchor = source.lines[hit.line - 1] || '';
      const anchorTerms = new Set(termsOf(anchor));
      if (!terms.some(term => anchorTerms.has(term))) continue;
      const passage = excerpt(source, task, chars, hit.line);
      const score = Math.min(.9, Math.max(.2, hit.score / 100));
      const id = add(source, passage, score, 'wiki');
      if (!id) continue;
      seeds++;
      // Links belong to the matched line. Surrounding navigation remains evidence text only.
      for (const ref of references(anchor, source, root).slice(0, 2)) {
        if (candidates.length >= cap) break;
        try {
          const target = sourceAt(ref.target), kind = target.relative.startsWith(`openwiki${path.sep}`) ? 'wiki' : 'source';
          add(target, excerpt(target, task, chars, ref.line), score * .8, kind, id);
        } catch (error) { issue(error, ref.target); }
      }
    } catch (error) { issue(error, hit.path); }
  }
  return { candidates, diagnostics: [...new Set(diagnostics)].slice(0, 5), coverage: {
    scope: 'workspace-hubs-and-explicit-source', ranking: 'lexical', repositoryFilesIndexed: false,
    hubsScanned: result.totalHubsScanned || 0, sourceExcerpts: candidates.filter(row => row.source.kind === 'source').length,
    generatedAt: incomplete ? null : fresh.generatedAt,
    generationAttemptAt: fresh.generatedAt,
    generationStatus: fresh.generatedStatus || null,
    wikiFreshness: freshness,
  } };
}
