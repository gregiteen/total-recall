/**
 * src/core/research-surface.mjs
 *
 * System 2 → System 1: bring finished background research into the compiled
 * instructions so the agent can use it mid-conversation instead of only when
 * someone happens to `recall` the right words.
 *
 * Selection is deliberate and small: research finished for the current project,
 * plus research a human asked for recently. A report only qualifies if it holds
 * an actual synthesis — the appendix of raw search snippets, or a synthesizer
 * that answered about itself instead of the topic, is not knowledge.
 */

const APPENDIX_RE = /^#{1,3}\s*appendix\b/im;
const USER_RECENT_DAYS = 30;

// A synthesizer that answered about its prompt instead of the topic. All seen in
// the live vault (2026-09-22): the synthesis agent treated the research prompt as
// a prompt injection, questioned whether it was test content, or explained why
// it would not cite the snippets. None of that is knowledge.
const META_RESPONSE_RE = new RegExp([
  String.raw`my actual (?:cutoff|role)`,
  String.raw`training (?:data )?cutoff`,
  String.raw`\bpersona\b`,
  String.raw`scratchpad`,
  String.raw`prompt[- ]injection`,
  String.raw`system_instructions`,
  String.raw`deep research synthesizer`,
  String.raw`i'?m claude\b|as (?:your )?claude code|working in this repo`,
  String.raw`is this (?:test content|related to work)`,
  String.raw`(?:genuine|real) (?:research summary|citations|info)`,
  String.raw`without fabricating`,
  String.raw`i (?:have no record|don'?t have (?:real-time )?(?:web )?(?:search|access))`,
  String.raw`i can(?:no|')t (?:actually |help|synthesize|verify|produce|do that)`,
  String.raw`(?:retrieved|provided|\[searx\]) (?:docs|results|snippets) (?:are|contain|don'?t|do not)`,
  String.raw`if you want (?:a |me to |real |genuine )`,
].join('|'), 'i');

/** The report's synthesis: body after the H1, before the raw-sources appendix. */
export function extractSynthesis(body) {
  const text = String(body || '');
  const cut = text.search(APPENDIX_RE);
  const head = cut === -1 ? text : text.slice(0, cut);
  return head
    .replace(/^#\s+.*$/m, '')
    // Obsidian-style callout banners ("> [!NOTE] Temporal Context: …") are chrome.
    .replace(/^>\s*\[![A-Z]+\][^\n]*(?:\n>[^\n]*)*/gm, '')
    .trim();
}

/** True when the synthesis is real research rather than empty or meta-commentary. */
export function isUsableSynthesis(synthesis) {
  const s = String(synthesis || '').trim();
  if (s.length < 160) return false;
  return !META_RESPONSE_RE.test(s.slice(0, 2000));
}

function cleanLine(line) {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = cut.lastIndexOf('. ');
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * 2–4 findings: prefer bullets under a findings/summary/bottom-line heading, then
 * any bullets, then the opening sentences.
 */
export function extractFindings(synthesis, max = 4) {
  const lines = String(synthesis || '').split('\n');
  const bullets = [];
  let inPreferred = false;
  const preferred = [];
  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(.*)$/);
    if (heading) {
      inPreferred = /finding|summary|bottom line|takeaway|conclusion|tl;?dr|key/i.test(heading[1]);
      continue;
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)) {
      const clean = cleanLine(line);
      if (clean.length < 12) continue;
      (inPreferred ? preferred : bullets).push(clean);
    }
  }
  let picked = preferred.length ? preferred : bullets;
  if (!picked.length) {
    const prose = lines.filter((l) => l.trim() && !/^#/.test(l)).map(cleanLine).join(' ');
    picked = prose.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => s.length > 20);
  }
  return picked.slice(0, max).map((f) => clip(f, 220));
}

/**
 * @param {{ queueItems: object[], nodes: object[], project?: string|null, now?: number, limit?: number }} opts
 * @returns {Array<{ slug, title, project, origin, completedAt, findings: string[] }>}
 */
export function selectResearchBriefs({ queueItems = [], nodes = [], project = null, now = Date.now(), limit = 6 } = {}) {
  const bySlug = new Map(nodes.map((n) => [n.slug, n]));
  const recentCutoff = now - USER_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const projectKey = project ? String(project).toLowerCase() : null;
  const seen = new Set();
  const briefs = [];

  for (const item of queueItems) {
    if (item.status !== 'done' || !item.node_slug || seen.has(item.node_slug)) continue;
    const forProject = projectKey && String(item.project || '').toLowerCase() === projectKey;
    const completed = Date.parse(item.completed_at || item.updated_at || 0) || 0;
    // Only research a human explicitly asked for follows the user across projects.
    // 'legacy' (pre-provenance) items can't prove that, so they reach chat by
    // relevance but are never pinned into instructions.
    const userRecent = item.origin === 'user' && completed >= recentCutoff;
    if (!forProject && !userRecent) continue;

    const node = bySlug.get(item.node_slug);
    if (!node || node.status === 'archived' || node.status === 'deprecated') continue;
    const synthesis = extractSynthesis(node.body || node.content);
    if (!isUsableSynthesis(synthesis)) continue;
    const findings = extractFindings(synthesis);
    if (!findings.length) continue;

    seen.add(item.node_slug);
    briefs.push({
      slug: node.slug,
      title: String(node.title || item.topic).replace(/^Consolidated Research Report:\s*/i, ''),
      project: item.project || null,
      origin: item.origin,
      completedAt: completed,
      forProject: Boolean(forProject),
      findings,
    });
  }

  briefs.sort((a, b) => (b.forProject - a.forProject) || (b.completedAt - a.completedAt));
  return briefs.slice(0, limit);
}

/** Markdown section for the instruction surface; '' when there is nothing to show. */
export function formatResearchBriefs(briefs, { maxChars = 2500 } = {}) {
  if (!briefs || !briefs.length) return '';
  const header = `## Background Research (System 2)

Research your brain completed in the background. Use these findings instead of guessing about the tools involved; run \`npx total-recall recall "<slug>"\` for the full cited report.
`;
  let out = header;
  for (const b of briefs) {
    const date = b.completedAt ? new Date(b.completedAt).toISOString().slice(0, 10) : 'undated';
    const why = b.origin === 'autonomous' ? `researched for ${b.project || 'a project'}` : 'you asked';
    const block = `\n**${b.title}** (${date}, ${why}; \`${b.slug}\`)\n${b.findings.map((f) => `- ${f}`).join('\n')}\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out === header ? '' : out.trimEnd();
}

// Question-to-report cosine runs lower than title-to-report. Calibrated on the
// live vault 2026-09-22 (usable reports only): related questions 0.47–0.70;
// unrelated ones (React tests, Python refactor, SQL, dinner) matched no usable
// report at all.
export const CHAT_RESEARCH_MIN_SIMILARITY = 0.45;

/**
 * Research relevant to a chat message: one semantic search (no LLM call), keeping
 * research-layer reports that clear the similarity bar and hold a real synthesis.
 *
 * @param {string} message latest user message
 * @param {{ vaultDir: string, derivedDir: string, limit?: number, search?: Function }} opts
 * @returns {Promise<Array<{ slug, title, similarity, excerpt }>>}
 */
export async function findRelevantResearch(message, { vaultDir, derivedDir, limit = 3, search } = {}) {
  const query = String(message || '').trim().slice(0, 1000);
  if (query.length < 12) return [];
  const run = search || (async (q, o) => (await import('./search.mjs')).semanticSearch(q, o));
  const { inferMemoryLayer } = await import('./memory-layers.mjs');
  // Wide candidate set: unusable reports and rule nodes must not crowd out the
  // one real report that answers the question.
  const results = await run(query, { vaultDir, derivedDir, top_k: 20, includeSessions: false });
  const out = [];
  for (const r of results || []) {
    if (r.type === 'session' || typeof r.similarity !== 'number' || r.similarity < CHAT_RESEARCH_MIN_SIMILARITY) continue;
    const isResearch = inferMemoryLayer(r) === 'research' || (Array.isArray(r.tags) && r.tags.includes('research'));
    if (!isResearch) continue;
    const synthesis = extractSynthesis(r.body || r.content);
    if (!isUsableSynthesis(synthesis)) continue;
    out.push({
      slug: r.slug,
      title: String(r.title || r.slug).replace(/^Consolidated Research Report:\s*/i, ''),
      similarity: r.similarity,
      excerpt: clip(synthesis.replace(/\n{3,}/g, '\n\n'), 1500),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** System-prompt block for chat; '' when nothing relevant was found. */
export function formatChatResearch(found) {
  if (!found || !found.length) return '';
  return `\n\n=== BACKGROUND RESEARCH (System 2) ===\nYour background research already produced findings that bear on this message. Prefer them over guessing, say when you rely on them, and cite the slug.\n`
    + found.map((f) => `\n--- ${f.title} (slug: ${f.slug}, ${Math.round(f.similarity * 100)}% match) ---\n${f.excerpt}`).join('\n');
}
