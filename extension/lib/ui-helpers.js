// Total Recall — pure UI helpers shared by the side panel, options page and the
// service worker. No DOM or chrome.* access, so the same file is unit-tested
// under vitest (see ui-helpers.spec.mjs). Exposed as `self.TRUi`.

(function (root) {
  'use strict';

  // Raw cosine similarity a memory must reach before the extension calls it
  // "related" to the page. The search API's `score` is rank-fused (RRF) and says
  // nothing about relevance: the top hit scores ~0.49 however unrelated it is,
  // and one lexical word match ("deployment") pushed a 0.38-similarity hit to
  // 0.93. Calibrated on the live brain 2026-09-22: unrelated page titles topped
  // out at 0.48, genuinely related ones started at 0.55.
  const RELATED_MIN_SIMILARITY = 0.53;
  // Only for brains too old to report `similarity`.
  const RELATED_MIN_FUSED_SCORE = 0.75;

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  }

  function isCapturableUrl(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  /** Domain blocklist match: exact host or any subdomain of an entry. */
  function isBlocked(url, blocklist) {
    if (!Array.isArray(blocklist) || blocklist.length === 0) return false;
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
    return blocklist.some((entry) => {
      const domain = String(entry || '').trim().toLowerCase()
        .replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '');
      return domain && (host === domain || host.endsWith(`.${domain}`));
    });
  }

  function collapseWhitespace(text) {
    return String(text || '').replace(/[ \t\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Trim to `max` chars, preferring to end on a sentence or word boundary. */
  function clip(text, max) {
    const clean = collapseWhitespace(text);
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
    const word = cut.lastIndexOf(' ');
    return `${cut.slice(0, word > max * 0.6 ? word : max)}…`;
  }

  /**
   * Build the memory body for a page capture so the node holds real content, not
   * just a URL: the user's note, then the selection (or description + leading
   * readable text), then the source.
   */
  function buildCaptureExcerpt({ url, description, selection, text, note } = {}) {
    const parts = [];
    if (note && note.trim()) parts.push(note.trim());
    if (selection && selection.trim()) {
      parts.push(clip(selection, 4000).split('\n').map((line) => `> ${line}`).join('\n'));
    } else {
      if (description && description.trim()) parts.push(clip(description, 400));
      if (text && text.trim()) {
        const lead = clip(text, 1500);
        if (!description || !lead.startsWith(description.trim().slice(0, 40))) parts.push(lead);
      }
    }
    if (url) parts.push(`Source: ${url}`);
    return parts.join('\n\n');
  }

  function memoryText(result) {
    return String(result.content || result.body || result.excerpt || result.snippet || '');
  }

  /**
   * Keep only vault memories that are genuinely related: sessions have no
   * title/body to show, and rank-fused scores alone say nothing about relevance.
   */
  function filterRelated(results, { minSimilarity = RELATED_MIN_SIMILARITY, minFusedScore = RELATED_MIN_FUSED_SCORE, limit = 5, excludeUrl } = {}) {
    return (Array.isArray(results) ? results : [])
      .filter((r) => r && r.type !== 'session' && r.slug && r.title)
      .filter((r) => (typeof r.similarity === 'number'
        ? r.similarity >= minSimilarity
        : (r.score || 0) >= minFusedScore))
      .filter((r) => !excludeUrl || !memoryText(r).includes(excludeUrl))
      .slice(0, limit)
      .map((r) => ({
        slug: r.slug,
        title: String(r.title),
        excerpt: clip(stripMarkdown(memoryText(r)), 220),
        category: r.category || 'memory',
        similarity: typeof r.similarity === 'number' ? r.similarity : null,
      }));
  }

  function stripMarkdown(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      .replace(/(\*\*|__|\*|_)(.+?)\1/g, '$2');
  }

  function timeAgo(value, now = Date.now()) {
    const t = typeof value === 'number' ? value : Date.parse(value);
    if (!t || Number.isNaN(t)) return '';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function safeHref(url) {
    return /^https?:\/\//i.test(url) ? url : null;
  }

  function renderInline(escaped) {
    return escaped
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
        // href is already HTML-escaped; unescape &amp; only to test the scheme.
        const safe = safeHref(href.replace(/&amp;/g, '&'));
        return safe ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
      });
  }

  /**
   * Minimal, safe markdown for chat replies. Escapes everything first, then
   * re-introduces a small whitelist: fenced/inline code, bold, italic, http(s)
   * links, headings (as strong lines), bullet/numbered lists and paragraphs.
   */
  function renderMarkdown(markdown) {
    const src = String(markdown || '').replace(/\r\n/g, '\n');
    const blocks = [];
    const fence = /```[\w-]*\n?([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = fence.exec(src))) {
      blocks.push({ kind: 'text', value: src.slice(last, m.index) });
      blocks.push({ kind: 'code', value: m[1].replace(/\n$/, '') });
      last = fence.lastIndex;
    }
    blocks.push({ kind: 'text', value: src.slice(last) });

    const html = [];
    for (const block of blocks) {
      if (block.kind === 'code') {
        html.push(`<pre><code>${escapeHtml(block.value)}</code></pre>`);
        continue;
      }
      const lines = block.value.split('\n');
      let list = null;
      let para = [];
      const flushPara = () => {
        if (para.length) html.push(`<p>${para.map((l) => renderInline(escapeHtml(l))).join('<br>')}</p>`);
        para = [];
      };
      const flushList = () => {
        if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li>${renderInline(escapeHtml(i))}</li>`).join('')}</${list.tag}>`);
        list = null;
      };
      for (const line of lines) {
        const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
        if (bullet || numbered) {
          flushPara();
          const tag = bullet ? 'ul' : 'ol';
          if (list && list.tag !== tag) flushList();
          if (!list) list = { tag, items: [] };
          list.items.push((bullet || numbered)[1]);
        } else if (heading) {
          flushPara(); flushList();
          html.push(`<p class="md-heading">${renderInline(escapeHtml(heading[1]))}</p>`);
        } else if (!line.trim()) {
          flushPara(); flushList();
        } else {
          flushList();
          para.push(line);
        }
      }
      flushPara(); flushList();
    }
    return html.join('');
  }

  const RESEARCH_STATUS = {
    pending: { label: 'Queued', tone: 'neutral' },
    in_progress: { label: 'Researching', tone: 'accent' },
    done: { label: 'Done', tone: 'success' },
    failed: { label: 'Failed', tone: 'error' },
  };
  function researchStatus(status) {
    return RESEARCH_STATUS[status] || { label: String(status || 'Unknown'), tone: 'neutral' };
  }

  const api = {
    RELATED_MIN_SIMILARITY,
    RELATED_MIN_FUSED_SCORE,
    escapeHtml,
    isCapturableUrl,
    hostnameOf,
    isBlocked,
    clip,
    buildCaptureExcerpt,
    filterRelated,
    stripMarkdown,
    timeAgo,
    renderMarkdown,
    researchStatus,
  };

  root.TRUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
