// Total Recall — side panel

(function () {
  'use strict';

  const Brain = self.BrainClient;
  const UI = self.TRUi;
  const $ = (id) => document.getElementById(id);

  const TABS = ['recall', 'chat', 'research'];
  const CHAT_HISTORY_LIMIT = 40;
  const CHAT_CONTEXT_TURNS = 12;
  const PAGE_TEXT_FOR_CHAT = 6000;

  const state = {
    tab: 'recall',
    page: null,            // chrome.tabs.Tab for the active tab
    activeBrainId: 'global',
    brains: [],
    connection: 'checking',
    chat: [],
    chatBusy: false,
    research: { items: [], counts: {} },
    settings: { pageRecall: false, showPill: true, blocklist: [] },
    health: null,
  };

  // ---------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------

  function svg(name, cls = 'icon sm') {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('class', cls);
    el.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    el.appendChild(use);
    return el;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    const t = $('toast');
    t.textContent = message;
    t.classList.toggle('error', isError);
    t.hidden = false;
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 4200 : 2600);
  }

  function describeError(err) {
    return (err && err.message) || 'Something went wrong.';
  }

  function isAuthOrOffline(err) {
    return err && ['offline', 'unauthorized', 'unconfigured', 'timeout'].includes(err.code);
  }

  async function openMemory(slug) {
    const url = await Brain.dashboardUrl(`/memory?slug=${encodeURIComponent(slug)}`);
    chrome.tabs.create({ url });
  }

  function skeleton(container, rows = 3) {
    container.replaceChildren(...Array.from({ length: rows }, () => el('div', 'skeleton skeleton-row')));
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  const GATE_COPY = {
    offline: ['Brain unreachable', 'Total Recall isn’t answering at the configured address. Make sure it’s running, or change the address in connection settings.'],
    timeout: ['Brain unreachable', 'The brain took too long to answer. It may be busy; retry in a moment.'],
    unconfigured: ['Connect your brain', 'Add an access token so the extension can read and write your memories.'],
    unauthorized: ['Access token rejected', 'The brain didn’t accept the saved token. It may have been revoked or expired; paste a new one in connection settings.'],
  };

  function setStatusDot(kind, title) {
    const dot = $('status-dot');
    dot.className = `status-dot ${kind}`;
    $('brain-chip').title = title || 'Active brain — change in settings';
  }

  function showGate(err) {
    const [title, message] = GATE_COPY[err.code] || GATE_COPY.offline;
    $('gate-title').textContent = title;
    $('gate-message').textContent = message;
    $('gate').hidden = false;
    $('app').classList.add('is-gated');
    setStatusDot('down', `${title}. ${err.message || ''}`.trim());
  }

  function hideGate() {
    $('gate').hidden = true;
    $('app').classList.remove('is-gated');
  }

  async function checkConnection({ quiet = false } = {}) {
    if (!quiet) setStatusDot('checking');
    try {
      // /health is public; an authenticated read proves the token works too.
      const [health] = await Promise.all([Brain.health(), Brain.request('/api/memory?limit=1')]);
      state.health = health;
      const wasGated = state.connection !== 'ok';
      state.connection = 'ok';
      hideGate();
      setStatusDot(health && health.daemon && health.daemon !== 'running' ? 'warn' : 'ok',
        `Connected · brain v${(health && health.version) || '?'}${health && health.daemon !== 'running' ? ' · daemon stopped' : ''}`);
      renderSheetFooter();
      return wasGated;
    } catch (err) {
      if (isAuthOrOffline(err)) {
        state.connection = err.code;
        showGate(err);
      } else {
        // Reachable but something narrower failed (e.g. scope); keep the UI usable.
        state.connection = 'ok';
        hideGate();
        setStatusDot('warn', err.message);
      }
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  function switchTab(name, { focus = false } = {}) {
    if (!TABS.includes(name)) return;
    state.tab = name;
    TABS.forEach((t, i) => {
      const btn = $(`tab-btn-${t}`);
      const active = t === name;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
      const pane = $(`tab-${t}`);
      pane.hidden = !active;
      pane.classList.toggle('is-active', active);
      if (active) document.querySelector('.tab-indicator').style.transform = `translateX(${i * 100}%)`;
    });
    if (focus) $(`tab-btn-${name}`).focus();
    if (name === 'research') loadResearch();
    if (name === 'chat') {
      scrollChatToEnd();
      setTimeout(() => $('chat-input').focus(), 50);
    }
    chrome.storage.session.set({ lastTab: name }).catch(() => {});
  }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    btn.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(btn.dataset.tab);
      if (e.key === 'ArrowRight') switchTab(TABS[(i + 1) % TABS.length], { focus: true });
      if (e.key === 'ArrowLeft') switchTab(TABS[(i + TABS.length - 1) % TABS.length], { focus: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Recall: current page
  // ---------------------------------------------------------------------------

  let pageToken = 0;

  async function refreshPage() {
    const token = ++pageToken;
    let tab = null;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch { /* ignore */ }
    if (token !== pageToken) return;
    state.page = tab || null;
    renderPageCard();
    if (state.connection !== 'ok') return;
    loadPageSavedState(token);
    loadRelated(token);
  }

  function renderPageCard() {
    const tab = state.page;
    const capturable = tab && UI.isCapturableUrl(tab.url);
    $('page-title').textContent = (tab && tab.title) || (tab ? tab.url : 'No active tab');
    $('page-host').textContent = capturable ? UI.hostnameOf(tab.url) : (tab && tab.url ? tab.url.split(':')[0] + ' page' : '');
    $('page-saved').hidden = true;
    $('btn-remember').disabled = !capturable;
    $('btn-research-page').disabled = !capturable;
    $('page-disabled').hidden = !!capturable;

    const fav = $('page-favicon');
    fav.replaceChildren(svg('globe'));
    if (tab && tab.favIconUrl && /^(https?:|data:image\/)/.test(tab.favIconUrl)) {
      const img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => fav.replaceChildren(img);
      img.src = tab.favIconUrl;
    }

    renderBlockButton();
  }

  async function loadPageSavedState(token) {
    const tab = state.page;
    if (!tab || !UI.isCapturableUrl(tab.url)) return;
    try {
      const matches = await Brain.findByUrl(tab.url);
      if (token !== pageToken) return;
      const newest = matches
        .map((n) => Date.parse(n.created) || 0)
        .sort((a, b) => b - a)[0];
      if (matches.length) {
        $('page-saved-label').textContent = newest ? `Saved ${UI.timeAgo(newest)}` : 'Saved';
        $('page-saved').hidden = false;
      }
    } catch { /* non-critical */ }
  }

  async function loadRelated(token) {
    const tab = state.page;
    const section = $('related-section');
    if (!tab || !UI.isCapturableUrl(tab.url) || !tab.title) {
      section.hidden = true;
      return;
    }
    try {
      const results = await Brain.search(tab.title, { topK: 10 });
      if (token !== pageToken) return;
      const related = UI.filterRelated(results, { excludeUrl: tab.url, limit: 4 });
      section.hidden = related.length === 0;
      renderRows($('related-list'), related, { showSimilarity: true });
    } catch {
      if (token === pageToken) section.hidden = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Recall: rows, search, recent
  // ---------------------------------------------------------------------------

  function toRow(node) {
    return {
      slug: node.slug,
      title: node.title || node.slug,
      excerpt: node.excerpt !== undefined ? node.excerpt : UI.clip(UI.stripMarkdown(node.content || node.body || ''), 200),
      category: node.category,
      created: node.created,
      similarity: node.similarity,
    };
  }

  function renderRows(container, items, { showSimilarity = false, empty } = {}) {
    if (!items.length) {
      container.replaceChildren(empty ? el('div', 'empty', empty) : document.createDocumentFragment());
      return;
    }
    container.replaceChildren(...items.map((item) => {
      const row = el('button', 'row');
      row.type = 'button';
      row.title = 'Open in dashboard';
      row.append(el('span', 'row-title', item.title));
      if (item.excerpt) row.append(el('span', 'row-excerpt', item.excerpt));
      const meta = el('span', 'row-meta');
      if (item.category) meta.append(el('span', 'cat', String(item.category).replace(/[-_]/g, ' ')));
      const time = item.created ? UI.timeAgo(item.created) : '';
      if (time) { meta.append(el('span', 'sep')); meta.append(el('span', '', time)); }
      if (showSimilarity && typeof item.similarity === 'number') {
        meta.append(el('span', 'sep'));
        meta.append(el('span', '', `${Math.round(item.similarity * 100)}% similar`));
      }
      row.append(meta);
      row.addEventListener('click', () => openMemory(item.slug));
      return row;
    }));
  }

  async function loadRecent() {
    const list = $('recent-list');
    if (!list.childElementCount) skeleton(list, 3);
    try {
      const nodes = await Brain.listRecent(6);
      renderRows(list, nodes.map(toRow), { empty: 'Nothing here yet. Remember a page or save a note and it shows up here.' });
    } catch (err) {
      if (isAuthOrOffline(err)) return checkConnection();
      list.replaceChildren(el('div', 'error-note', `Couldn’t load recent memories: ${describeError(err)}`));
    }
  }

  let searchTimer = null;
  let searchToken = 0;

  function onSearchInput() {
    const query = $('search-input').value.trim();
    clearTimeout(searchTimer);
    if (!query) {
      searchToken++;
      $('search-results').hidden = true;
      $('browse').hidden = false;
      return;
    }
    $('search-results').hidden = false;
    $('browse').hidden = true;
    $('search-heading').textContent = 'Searching…';
    skeleton($('search-list'), 3);
    searchTimer = setTimeout(() => runSearch(query), 250);
  }

  async function runSearch(query) {
    const token = ++searchToken;
    try {
      const results = await Brain.search(query, { topK: 12 });
      if (token !== searchToken) return;
      const rows = results.filter((r) => r.type !== 'session' && r.slug).map(toRow);
      $('search-heading').textContent = rows.length ? `${rows.length} result${rows.length === 1 ? '' : 's'}` : 'Results';
      renderRows($('search-list'), rows, { showSimilarity: true, empty: `No memories match “${query}”.` });
    } catch (err) {
      if (token !== searchToken) return;
      $('search-heading').textContent = 'Results';
      $('search-list').replaceChildren(el('div', 'error-note', describeError(err)));
    }
  }

  $('search-input').addEventListener('input', onSearchInput);
  $('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('search-input').value = ''; onSearchInput(); }
  });
  $('btn-refresh-recent').addEventListener('click', loadRecent);

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  function sendCapture(options) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE', tabId: state.page && state.page.id, options }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.success) return resolve(res.result);
        const err = new Error((res && res.error) || 'Capture failed');
        err.code = res && res.code;
        reject(err);
      });
    });
  }

  async function afterCapture(action) {
    if (action === 'research') {
      loadResearch();
      return;
    }
    const tab = state.page;
    if (tab && UI.isCapturableUrl(tab.url)) {
      $('page-saved-label').textContent = 'Saved just now';
      $('page-saved').hidden = false;
    }
    loadRecent();
  }

  $('btn-remember').addEventListener('click', async () => {
    const btn = $('btn-remember');
    setBusy(btn, true);
    try {
      await sendCapture({ action: 'remember' });
      toast('Saved to your brain');
      afterCapture('remember');
    } catch (err) {
      toast(describeError(err), true);
    } finally {
      setBusy(btn, false);
    }
  });

  $('btn-research-page').addEventListener('click', async () => {
    const btn = $('btn-research-page');
    setBusy(btn, true);
    try {
      await sendCapture({ action: 'research' });
      toast('Research queued');
      afterCapture('research');
    } catch (err) {
      toast(describeError(err), true);
    } finally {
      setBusy(btn, false);
    }
  });

  function toggleNote(open) {
    const area = $('note-area');
    area.hidden = !open;
    $('btn-note').setAttribute('aria-expanded', String(open));
    if (open) $('note-input').focus();
  }

  $('btn-note').addEventListener('click', () => toggleNote($('note-area').hidden));
  $('btn-cancel-note').addEventListener('click', () => { $('note-input').value = ''; toggleNote(false); });

  async function saveNote() {
    const note = $('note-input').value.trim();
    const btn = $('btn-save-note');
    if (!note || btn.disabled) return;
    setBusy(btn, true);
    try {
      const tab = state.page;
      if (tab && UI.isCapturableUrl(tab.url)) {
        await sendCapture({ action: 'remember', note, selection: '' });
      } else {
        await Brain.share({ excerpt: note, title: UI.clip(note.split('\n')[0], 80), action: 'remember', source: 'chrome-extension', tags: ['note'] });
      }
      $('note-input').value = '';
      toggleNote(false);
      toast('Note saved');
      afterCapture('remember');
    } catch (err) {
      toast(describeError(err), true);
    } finally {
      setBusy(btn, false);
    }
  }

  $('btn-save-note').addEventListener('click', saveNote);
  $('note-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote(); }
    if (e.key === 'Escape') toggleNote(false);
  });

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  const chatKey = () => `chat:${state.activeBrainId}`;

  async function loadChat() {
    try {
      const data = await chrome.storage.session.get(chatKey());
      state.chat = data[chatKey()] || [];
    } catch {
      state.chat = [];
    }
    renderChat();
  }

  function persistChat() {
    chrome.storage.session.set({ [chatKey()]: state.chat.slice(-CHAT_HISTORY_LIMIT) }).catch(() => {});
  }

  function scrollChatToEnd() {
    const s = $('chat-scroll');
    requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; });
  }

  function renderMessage(m) {
    const wrap = el('div', `msg ${m.role === 'user' ? 'user' : m.error ? 'assistant error' : 'assistant'}`);
    const bubble = el('div', 'bubble');
    if (m.role === 'user') {
      bubble.textContent = m.content;
      wrap.append(bubble);
      if (m.context && m.context.title) {
        const ctx = el('span', 'msg-context');
        ctx.append(svg('globe'), el('span', '', UI.clip(m.context.title, 60)));
        wrap.append(ctx);
      }
    } else if (m.error) {
      bubble.textContent = m.content;
      wrap.append(bubble);
    } else {
      // renderMarkdown escapes all input before adding its whitelisted tags.
      bubble.innerHTML = UI.renderMarkdown(m.content);
      wrap.append(bubble);
      if (m.model) wrap.append(el('span', 'msg-meta', m.model));
    }
    return wrap;
  }

  function renderChat() {
    const list = $('chat-messages');
    list.replaceChildren(...state.chat.map(renderMessage));
    if (state.chatBusy) {
      const typing = el('div', 'msg assistant');
      const dots = el('div', 'typing');
      dots.append(el('span'), el('span'), el('span'));
      typing.append(dots);
      list.append(typing);
    }
    $('chat-empty').hidden = state.chat.length > 0 || state.chatBusy;
    $('btn-clear-chat').hidden = state.chat.length === 0;
    updateSendState();
    scrollChatToEnd();
  }

  function updateSendState() {
    $('btn-send-chat').disabled = state.chatBusy || !$('chat-input').value.trim();
    const capturable = state.page && UI.isCapturableUrl(state.page.url);
    $('chat-grounding').disabled = !capturable;
  }

  function getPageContext(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }, (res) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res || null);
      });
    });
  }

  async function sendChat(text, { grounded = $('chat-grounding').checked, extraContext = '' } = {}) {
    const content = text.trim();
    if (!content || state.chatBusy) return;
    const tab = state.page;
    const useGrounding = grounded && tab && UI.isCapturableUrl(tab.url);

    state.chat.push({ role: 'user', content, context: useGrounding ? { title: tab.title, url: tab.url } : null });
    state.chatBusy = true;
    $('chat-input').value = '';
    autosize();
    renderChat();
    persistChat();

    try {
      const messages = [];
      if (useGrounding || extraContext) {
        const ctx = useGrounding ? await getPageContext(tab.id) : null;
        const lines = ['The user is asking from the Total Recall browser extension. Ground your answer in their memories first.'];
        if (useGrounding) {
          lines.push(`They are viewing: ${(ctx && ctx.title) || tab.title}\nURL: ${tab.url}`);
          if (ctx && ctx.description) lines.push(`Description: ${ctx.description}`);
          if (ctx && ctx.selection) lines.push(`Selected text:\n"""${UI.clip(ctx.selection, 2000)}"""`);
          if (ctx && ctx.text) lines.push(`Page text (truncated):\n"""${UI.clip(ctx.text, PAGE_TEXT_FOR_CHAT)}"""`);
        }
        if (extraContext) lines.push(extraContext);
        messages.push({ role: 'system', content: lines.join('\n\n') });
      }
      for (const m of state.chat.slice(-CHAT_CONTEXT_TURNS)) {
        if (!m.error) messages.push({ role: m.role, content: m.content });
      }
      const reply = await Brain.chat(messages);
      state.chat.push({ role: 'assistant', content: reply.content || '(The brain returned an empty answer.)', model: reply.model });
    } catch (err) {
      state.chat.push({ role: 'assistant', error: true, content: describeError(err) });
      if (isAuthOrOffline(err)) checkConnection();
    } finally {
      state.chatBusy = false;
      renderChat();
      persistChat();
    }
  }

  function autosize() {
    const ta = $('chat-input');
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  $('chat-input').addEventListener('input', () => { autosize(); updateSendState(); });
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendChat($('chat-input').value);
    }
  });
  $('btn-send-chat').addEventListener('click', () => sendChat($('chat-input').value));
  $('btn-clear-chat').addEventListener('click', () => {
    state.chat = [];
    persistChat();
    renderChat();
    $('chat-input').focus();
  });
  document.querySelectorAll('.suggestion').forEach((btn) => {
    btn.addEventListener('click', () => sendChat(btn.dataset.prompt, { grounded: true }));
  });

  async function consumePendingAsk() {
    let pending;
    try {
      ({ pendingAsk: pending } = await chrome.storage.session.get('pendingAsk'));
    } catch { return; }
    if (!pending || Date.now() - pending.at > 60000) return;
    await chrome.storage.session.remove('pendingAsk');
    switchTab('chat');
    const quote = UI.clip(pending.text, 600);
    sendChat(`What do I know about this?\n\n“${quote}”`, {
      grounded: false,
      extraContext: pending.title ? `The selection comes from “${pending.title}” (${pending.url}).` : '',
    });
  }

  // ---------------------------------------------------------------------------
  // Research
  // ---------------------------------------------------------------------------

  let researchPoll = null;

  function researchRow(item, active) {
    const row = el('div', 'research-row');
    const status = el('div', 'r-status');
    const meta = UI.researchStatus(item.status);
    status.append(item.status === 'in_progress' ? el('div', 'spin') : el('div', `dot ${meta.tone}`));
    status.title = meta.label;
    const main = el('div', 'r-main');
    main.append(el('div', 'r-topic', item.topic || item.title || 'Untitled'));
    const when = UI.timeAgo(item.updated_at || item.created_at);
    // Who wanted this: the user, or the AI's background (System 2) research for a project.
    const why = item.origin === 'autonomous'
      ? (item.project ? `Auto · ${item.project}` : 'Auto')
      : item.origin === 'user' ? 'You asked' : '';
    main.append(el('div', 'r-meta', [meta.label, why, when].filter(Boolean).join(' · ')));
    if (item.origin === 'autonomous' && item.rationale) main.title = item.rationale;
    row.append(status, main);
    if (active) {
      const cancel = el('button', 'icon-btn small');
      cancel.type = 'button';
      cancel.setAttribute('aria-label', `Cancel research: ${item.topic}`);
      cancel.title = 'Cancel';
      cancel.append(svg('close'));
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        try {
          await Brain.cancelResearch(item.id);
          toast('Research cancelled');
          loadResearch();
        } catch (err) {
          cancel.disabled = false;
          toast(describeError(err), true);
        }
      });
      row.append(cancel);
    }
    return row;
  }

  function renderResearch() {
    const { items, counts } = state.research;
    const running = items.filter((i) => i.status === 'in_progress');
    const queued = items.filter((i) => i.status === 'pending');
    const active = [...running, ...queued];
    const finished = items.filter((i) => i.status === 'done' || i.status === 'failed').slice(0, 12);
    const QUEUED_SHOWN = 8;

    const countsEl = $('research-counts');
    countsEl.replaceChildren();
    const chips = [['in_progress', 'accent'], ['pending', ''], ['done', 'success'], ['failed', 'error']];
    for (const [key, tone] of chips) {
      if (!counts[key]) continue;
      countsEl.append(el('span', `chip ${tone}`, `${counts[key]} ${UI.researchStatus(key).label.toLowerCase()}`));
    }

    const activeRows = [...running, ...queued.slice(0, QUEUED_SHOWN)].map((i) => researchRow(i, true));
    if (queued.length > QUEUED_SHOWN) {
      activeRows.push(el('div', 'more-note', `+ ${queued.length - QUEUED_SHOWN} more queued`));
    }
    renderListOrEmpty($('research-active'), activeRows, 'Nothing running. Queue a topic above, or use Research on any page.');
    renderListOrEmpty($('research-done'), finished.map((i) => researchRow(i, false)), 'Finished research lands in your brain as a report.');

    // The list is capped; the server's counts are the real totals.
    const activeTotal = (counts.pending || 0) + (counts.in_progress || 0) || active.length;
    const badge = $('research-active-count');
    badge.hidden = activeTotal === 0;
    badge.textContent = activeTotal > 99 ? '99+' : String(activeTotal);

    clearInterval(researchPoll);
    if (active.length) researchPoll = setInterval(loadResearch, 15000);
  }

  function renderListOrEmpty(container, rows, emptyText) {
    container.replaceChildren(...(rows.length ? rows : [el('div', 'empty', emptyText)]));
  }

  async function loadResearch() {
    if (state.connection !== 'ok') return;
    if (!state.research.items.length && state.tab === 'research') skeleton($('research-active'), 2);
    try {
      state.research = await Brain.listResearch();
      renderResearch();
    } catch (err) {
      if (isAuthOrOffline(err)) return checkConnection();
      $('research-active').replaceChildren(el('div', 'error-note', `Couldn’t load research: ${describeError(err)}`));
    }
  }

  $('research-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('research-input');
    const topic = input.value.trim();
    if (!topic) return input.focus();
    const btn = $('btn-queue-research');
    setBusy(btn, true);
    try {
      await Brain.queueResearch(topic);
      input.value = '';
      toast('Research queued');
      loadResearch();
    } catch (err) {
      toast(describeError(err), true);
    } finally {
      setBusy(btn, false);
    }
  });
  $('btn-refresh-research').addEventListener('click', loadResearch);

  // ---------------------------------------------------------------------------
  // Settings sheet
  // ---------------------------------------------------------------------------

  function openSheet(open) {
    const sheet = $('sheet');
    sheet.classList.toggle('is-open', open);
    sheet.toggleAttribute('inert', !open);
    sheet.setAttribute('aria-hidden', String(!open));
    $('scrim').hidden = !open;
    if (open) {
      loadBrains();
      renderShortcut();
      setTimeout(() => $('btn-close-settings').focus(), 60);
    } else {
      $('btn-open-settings').focus();
    }
  }

  $('btn-open-settings').addEventListener('click', () => openSheet(true));
  $('brain-chip').addEventListener('click', () => openSheet(true));
  $('btn-close-settings').addEventListener('click', () => openSheet(false));
  $('scrim').addEventListener('click', () => openSheet(false));

  function brainLabel(id) {
    if (!id || id === 'global') return 'Global';
    const brain = state.brains.find((b) => b.id === id);
    return (brain && brain.name) || id.replace(/^(project|tenant):/, '');
  }

  function renderBrainChip() {
    $('brain-chip-label').textContent = brainLabel(state.activeBrainId);
  }

  async function loadBrains() {
    const select = $('brain-select');
    try {
      const data = await Brain.listBrains();
      state.brains = (data && data.brains) || [];
    } catch { /* keep whatever we had */ }
    const options = state.brains.length ? state.brains : [{ id: 'global', name: 'Global Brain', node_count: null }];
    select.replaceChildren(...options.map((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      const count = typeof b.node_count === 'number' ? ` · ${b.node_count.toLocaleString()} memories` : '';
      opt.textContent = `${b.id === 'global' ? 'Global brain' : b.name}${count}`;
      return opt;
    }));
    if (!options.some((b) => b.id === state.activeBrainId)) {
      const opt = document.createElement('option');
      opt.value = state.activeBrainId;
      opt.textContent = brainLabel(state.activeBrainId);
      select.append(opt);
    }
    select.value = state.activeBrainId;
    renderBrainChip();
  }

  $('brain-select').addEventListener('change', async (e) => {
    state.activeBrainId = e.target.value || 'global';
    await chrome.storage.sync.set({ activeBrainId: state.activeBrainId });
    renderBrainChip();
    toast(`Using ${brainLabel(state.activeBrainId)} brain`);
    loadChat();
    loadRecent();
    refreshPage();
    if ($('search-input').value.trim()) onSearchInput();
  });

  function renderSettingsToggles() {
    $('toggle-page-recall').checked = !!state.settings.pageRecall;
    $('toggle-pill').checked = !!state.settings.showPill;
    $('toggle-pill').disabled = !state.settings.pageRecall;
    document.querySelector('.setting-row.sub').classList.toggle('is-disabled', !state.settings.pageRecall);
  }

  $('toggle-page-recall').addEventListener('change', async (e) => {
    state.settings.pageRecall = e.target.checked;
    await chrome.storage.sync.set({ pageRecall: state.settings.pageRecall });
    renderSettingsToggles();
    toast(state.settings.pageRecall ? 'Related memories on — takes effect on the next page load' : 'Related memories off');
  });
  $('toggle-pill').addEventListener('change', async (e) => {
    state.settings.showPill = e.target.checked;
    await chrome.storage.sync.set({ showPill: state.settings.showPill });
  });

  function currentHost() {
    const tab = state.page;
    return tab && UI.isCapturableUrl(tab.url) ? new URL(tab.url).hostname.replace(/^www\./, '') : '';
  }

  function renderBlockButton() {
    const host = currentHost();
    const btn = $('btn-block-site');
    btn.disabled = !host;
    const blocked = host && UI.isBlocked(state.page.url, state.settings.blocklist);
    btn.classList.toggle('danger', !blocked);
    btn.replaceChildren(document.createTextNode(blocked ? 'Allow ' : 'Never check '), el('span', '', host || 'this site'));
    if (blocked) btn.append(document.createTextNode(' again'));
  }

  $('btn-block-site').addEventListener('click', async () => {
    const host = currentHost();
    if (!host) return;
    const list = Array.isArray(state.settings.blocklist) ? state.settings.blocklist.slice() : [];
    const blocked = UI.isBlocked(state.page.url, list);
    const next = blocked
      ? list.filter((entry) => !UI.isBlocked(state.page.url, [entry]))
      : [...list, host];
    state.settings.blocklist = next;
    await chrome.storage.sync.set({ blocklist: next });
    renderBlockButton();
    toast(blocked ? `${host} will be checked again` : `${host} won’t be checked for related memories`);
  });

  $('btn-recompile').addEventListener('click', async () => {
    const btn = $('btn-recompile');
    setBusy(btn, true);
    try {
      await Brain.compile();
      toast('Search index rebuilt');
    } catch (err) {
      toast(describeError(err), true);
    } finally {
      setBusy(btn, false);
    }
  });

  async function renderShortcut() {
    try {
      const commands = await chrome.commands.getAll();
      const open = commands.find((c) => c.name === '_execute_action');
      const remember = commands.find((c) => c.name === 'remember-page');
      const parts = [open && open.shortcut, remember && remember.shortcut].filter(Boolean);
      $('shortcut-summary').textContent = parts.length ? parts.join(' · ') : 'Not set';
    } catch { /* ignore */ }
  }

  function renderSheetFooter() {
    const foot = $('sheet-foot');
    const ext = `Extension v${chrome.runtime.getManifest().version}`;
    const brain = state.health && state.health.version ? `Brain v${state.health.version}` : '';
    foot.replaceChildren(el('span', '', ext), el('span', '', brain));
  }

  $('link-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('link-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  $('link-dashboard').addEventListener('click', async () => chrome.tabs.create({ url: await Brain.dashboardUrl('/') }));

  // ---------------------------------------------------------------------------
  // Gate buttons
  // ---------------------------------------------------------------------------

  $('gate-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('gate-retry').addEventListener('click', async () => {
    const btn = $('gate-retry');
    setBusy(btn, true);
    const recovered = await checkConnection();
    setBusy(btn, false);
    if (recovered) loadAll();
  });

  // ---------------------------------------------------------------------------
  // Global events
  // ---------------------------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === 'Escape' && $('sheet').classList.contains('is-open')) return openSheet(false);
    if (e.key === '/' && !typing && state.tab === 'recall') {
      e.preventDefault();
      $('search-input').focus();
    }
  });

  let pageTimer = null;
  function schedulePageRefresh() {
    clearTimeout(pageTimer);
    pageTimer = setTimeout(() => { refreshPage(); updateSendState(); }, 150);
  }

  chrome.tabs.onActivated.addListener(schedulePageRefresh);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!state.page || tabId !== state.page.id) return;
    if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete' || changeInfo.favIconUrl) schedulePageRefresh();
  });
  chrome.windows?.onFocusChanged?.addListener(schedulePageRefresh);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'CAPTURED') afterCapture(msg.action);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.pendingAsk && changes.pendingAsk.newValue) consumePendingAsk();
    if (area === 'sync') {
      if (changes.blocklist) { state.settings.blocklist = changes.blocklist.newValue || []; renderBlockButton(); }
      if (changes.pageRecall) { state.settings.pageRecall = !!changes.pageRecall.newValue; renderSettingsToggles(); }
    }
    if (area === 'local' && (changes.brainUrl || changes.pat)) {
      checkConnection().then((recovered) => { if (recovered) loadAll(); });
    }
  });

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function loadAll() {
    refreshPage();
    loadRecent();
    loadResearch();
    loadBrains();
  }

  async function init() {
    const [sync, session] = await Promise.all([
      chrome.storage.sync.get({ activeBrainId: 'global', pageRecall: false, showPill: true, blocklist: [] }),
      chrome.storage.session.get('lastTab').catch(() => ({})),
    ]);
    state.activeBrainId = sync.activeBrainId || 'global';
    state.settings = { pageRecall: sync.pageRecall, showPill: sync.showPill, blocklist: sync.blocklist || [] };
    renderBrainChip();
    renderSettingsToggles();
    renderSheetFooter();
    switchTab(TABS.includes(session.lastTab) ? session.lastTab : 'recall');
    await loadChat();
    await refreshPage();

    await checkConnection();
    if (state.connection === 'ok') loadAll();
    consumePendingAsk();
    setInterval(() => checkConnection({ quiet: true }).then((recovered) => { if (recovered) loadAll(); }), 30000);
  }

  init();
})();
