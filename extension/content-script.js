// Total Recall — content script
//
// 1. Answers GET_PAGE_CONTEXT so the side panel and capture flows get the page's
//    readable text, description and current selection.
// 2. Page recall (opt-in): asks the service worker for memories genuinely
//    related to this page and, when there are any, shows a small pill that opens
//    a card listing them.
// 3. Shows a brief toast when a capture is triggered from a shortcut or menu.
//
// All UI lives in a closed shadow root and is built with textContent only —
// memory text is user-captured web content and must never reach innerHTML.

(function () {
  'use strict';

  if (window.__totalRecallContentScript) return;
  window.__totalRecallContentScript = true;

  const TEXT_LIMIT = 12000;

  // ---- Page context -------------------------------------------------------

  function metaContent(selector) {
    const el = document.querySelector(selector);
    return (el && el.getAttribute('content') || '').trim();
  }

  function readableRoot() {
    const candidates = ['article', 'main', '[role="main"]', '#content', '.post', '.article'];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 400) return el;
    }
    return document.body;
  }

  function pageContext() {
    const root = readableRoot();
    return {
      url: location.href,
      title: document.title || metaContent('meta[property="og:title"]'),
      description: metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]'),
      selection: String(window.getSelection ? window.getSelection() : '').trim(),
      text: root ? root.innerText.slice(0, TEXT_LIMIT) : '',
    };
  }

  // ---- Shadow UI ----------------------------------------------------------

  const TOKENS = `
    --bg: #0c1220; --bg-2: #121a2b; --bg-3: #172033; --hover: #1c2740;
    --accent: #3b82f6; --accent-hover: #60a5fa; --accent-muted: rgba(59,130,246,.14);
    --text: #f1f5f9; --text-2: #94a3b8; --text-3: #64748b;
    --border: rgba(148,163,184,.14); --border-accent: rgba(59,130,246,.35);
    --success: #34d399; --error: #f87171;
    --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const STYLE = `
    :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; ${TOKENS} font-family: var(--font); }
    *, *::before, *::after { box-sizing: border-box; }
    /* Fonts are set here, not on :host: the page-level host reset (all: initial
       !important) outranks :host rules and would leave the page's serif font. */
    .stack { display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
      font-family: var(--font); font-size: 13px; line-height: 1.4; color: var(--text); -webkit-font-smoothing: antialiased; }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
    svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; }

    .pill { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 12px;
      background: rgba(12,18,32,.92); color: var(--text); border: 1px solid var(--border); border-radius: 999px;
      font-size: 13px; font-weight: 600; letter-spacing: -.005em; backdrop-filter: blur(16px) saturate(1.4);
      box-shadow: 0 8px 24px rgba(0,0,0,.35); animation: rise .28s cubic-bezier(.23,1,.32,1) both;
      transition: border-color .14s, transform .14s; }
    .pill:hover, .pill[aria-expanded="true"] { border-color: var(--border-accent); transform: translateY(-1px); }
    .pill .mark { color: var(--accent-hover); }
    .pill .count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: inline-grid; place-items: center;
      background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; }
    .pill .dismiss { width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; color: var(--text-3); }
    .pill .dismiss:hover { background: var(--hover); color: var(--text); }
    .pill .dismiss svg { width: 12px; height: 12px; }

    .card { width: 340px; max-height: min(460px, 70vh); display: flex; flex-direction: column; overflow: hidden;
      background: rgba(12,18,32,.96); color: var(--text); border: 1px solid var(--border); border-radius: 18px;
      backdrop-filter: blur(20px) saturate(1.4); box-shadow: 0 24px 64px rgba(0,0,0,.45), 0 0 40px rgba(59,130,246,.12);
      animation: rise .22s cubic-bezier(.23,1,.32,1) both; }
    .card[hidden] { display: none; }
    .head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 12px; border-bottom: 1px solid var(--border); }
    .head h2 { margin: 0; flex: 1; font-size: 13px; font-weight: 600; }
    .head .sub { font-size: 11px; color: var(--text-3); font-weight: 500; }
    .icon-btn { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--text-2); }
    .icon-btn:hover { background: var(--hover); color: var(--text); }
    .list { overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
    .item { display: block; width: 100%; text-align: left; padding: 10px 10px 11px; border-radius: 12px; border: 1px solid transparent; }
    .item:hover { background: var(--bg-2); border-color: var(--border); }
    .item .title { font-size: 13px; font-weight: 600; line-height: 1.35; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .item .excerpt { margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .item .meta { margin-top: 6px; display: flex; gap: 8px; font-size: 11px; color: var(--text-3); }
    .item .cat { text-transform: capitalize; color: var(--accent-hover); }
    .foot { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--border); }
    .btn { flex: 1; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      font-size: 12px; font-weight: 600; background: var(--bg-3); border: 1px solid var(--border); color: var(--text); }
    .btn:hover { border-color: var(--border-accent); background: var(--hover); }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn.primary:hover { background: var(--accent-hover); }
    .btn:disabled { opacity: .55; cursor: default; }
    .btn svg { width: 14px; height: 14px; }

    .toast { display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 12px; font-size: 12.5px; font-weight: 600;
      background: rgba(12,18,32,.96); color: var(--text); border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,.35);
      animation: rise .22s cubic-bezier(.23,1,.32,1) both; }
    .toast .dot { width: 8px; height: 8px; border-radius: 99px; background: var(--success); box-shadow: 0 0 10px var(--success); }
    .toast.error .dot { background: var(--error); box-shadow: 0 0 10px var(--error); }
    .toast.leaving { opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s; }

    @keyframes rise { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;

  const ICONS = {
    mark: '<path d="M6 20V11a6 6 0 0 1 12 0v9"/><path d="M9.5 20v-8.5a2.5 2.5 0 0 1 5 0V20"/><path d="M4 20h16"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76V6h6v4.76l1.8 2.4A1 1 0 0 1 16 15H8a1 1 0 0 1-.8-1.6z"/><path d="M8 3h8"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  };

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    // Static, extension-authored markup only.
    svg.innerHTML = ICONS[name];
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  let host = null;
  let shadow = null;
  let stack = null;

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('total-recall-overlay');
    host.id = 'total-recall-overlay';
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    stack = el('div', 'stack');
    shadow.append(style, stack);
    document.documentElement.appendChild(host);
  }

  // ---- Toast --------------------------------------------------------------

  function showToast(text, tone) {
    ensureHost();
    const toast = el('div', `toast${tone === 'error' ? ' error' : ''}`);
    toast.setAttribute('role', 'status');
    toast.append(el('span', 'dot'), el('span', '', text));
    stack.prepend(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 220);
    }, 2400);
  }

  // ---- Related memories ---------------------------------------------------

  function renderRelated(memories) {
    ensureHost();
    const card = el('section', 'card');
    card.hidden = true;
    card.setAttribute('aria-label', 'Related memories');

    const head = el('header', 'head');
    const titleWrap = el('div');
    titleWrap.style.flex = '1';
    const h2 = el('h2', '', 'You already know this');
    const sub = el('div', 'sub', `${memories.length} related ${memories.length === 1 ? 'memory' : 'memories'} in your brain`);
    titleWrap.append(h2, sub);
    const closeBtn = el('button', 'icon-btn');
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.append(icon('close'));
    head.append(titleWrap, closeBtn);

    const list = el('div', 'list');
    for (const m of memories) {
      const item = el('button', 'item');
      item.title = 'Open in Total Recall';
      item.append(el('div', 'title', m.title));
      if (m.excerpt) item.append(el('div', 'excerpt', m.excerpt));
      const meta = el('div', 'meta');
      meta.append(el('span', 'cat', m.category));
      if (typeof m.similarity === 'number') meta.append(el('span', '', `${Math.round(m.similarity * 100)}% similar`));
      item.append(meta);
      item.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_MEMORY', slug: m.slug }));
      list.append(item);
    }

    const foot = el('footer', 'foot');
    const remember = el('button', 'btn primary');
    remember.append(icon('pin'), el('span', '', 'Remember page'));
    const open = el('button', 'btn');
    open.append(icon('panel'), el('span', '', 'Open panel'));
    foot.append(remember, open);
    card.append(head, list, foot);

    const pill = el('button', 'pill');
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-label', `${memories.length} related memories`);
    const mark = icon('mark');
    mark.classList.add('mark');
    const dismiss = el('span', 'dismiss');
    dismiss.setAttribute('role', 'button');
    dismiss.setAttribute('aria-label', 'Hide for this page');
    dismiss.append(icon('close'));
    pill.append(mark, el('span', '', 'Related'), el('span', 'count', String(memories.length)), dismiss);

    const toggle = (open) => {
      card.hidden = !open;
      pill.setAttribute('aria-expanded', String(open));
    };
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.composedPath().includes(dismiss)) {
        card.remove();
        pill.remove();
        return;
      }
      toggle(card.hidden);
    });
    closeBtn.addEventListener('click', () => toggle(false));
    card.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => toggle(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

    remember.addEventListener('click', () => {
      remember.disabled = true;
      chrome.runtime.sendMessage({ type: 'CAPTURE', options: { action: 'remember' } }, (res) => {
        remember.disabled = false;
        if (chrome.runtime.lastError) return;
        showToast(res && res.success ? 'Saved to your brain' : (res && res.error) || 'Capture failed', res && res.success ? 'success' : 'error');
      });
    });
    open.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }));

    stack.append(card, pill);
  }

  async function runPageRecall() {
    let settings;
    try {
      settings = await chrome.storage.sync.get({ pageRecall: false, showPill: true });
    } catch {
      return; // extension context invalidated (reloaded)
    }
    if (!settings.pageRecall) return;
    const ctx = pageContext();
    chrome.runtime.sendMessage(
      { type: 'QUERY_RELATED', page: { url: ctx.url, title: ctx.title, description: ctx.description } },
      (response) => {
        if (chrome.runtime.lastError) return;
        const memories = (response && response.memories) || [];
        if (memories.length && settings.showPill) renderRelated(memories);
      },
    );
  }

  // ---- Messages -----------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return false;
    if (msg.type === 'GET_PAGE_CONTEXT') {
      sendResponse(pageContext());
      return false;
    }
    if (msg.type === 'TR_TOAST') {
      showToast(String(msg.text || ''), msg.tone);
      return false;
    }
    return false;
  });

  // Let the page settle before querying; recall is never urgent.
  if (document.readyState === 'complete') setTimeout(runPageRecall, 1500);
  else window.addEventListener('load', () => setTimeout(runPageRecall, 1500), { once: true });
})();
