// Total Recall — service worker
// Context menus, keyboard commands, omnibox search, per-tab "related memories"
// badge, and capture. The side panel and content script talk to the brain
// through here or through BrainClient directly.

importScripts('lib/brain-client.js', 'lib/ui-helpers.js');

const Brain = self.BrainClient;
const UI = self.TRUi;

const SETTINGS_DEFAULTS = { pageRecall: false, showPill: true, blocklist: [] };

async function getSettings() {
  return chrome.storage.sync.get(SETTINGS_DEFAULTS);
}

// ---------------------------------------------------------------------------
// Install / startup
// ---------------------------------------------------------------------------

function registerPanelBehavior() {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
}
registerPanelBehavior();

chrome.runtime.onInstalled.addListener(async (details) => {
  registerPanelBehavior();
  await chrome.contextMenus.removeAll();
  const menus = [
    { id: 'remember-page', title: 'Remember this page', contexts: ['page'] },
    { id: 'remember-selection', title: 'Remember selection', contexts: ['selection'] },
    { id: 'ask-selection', title: 'Ask Total Recall about “%s”', contexts: ['selection'] },
    { id: 'research-selection', title: 'Research “%s”', contexts: ['selection'] },
    { id: 'remember-link', title: 'Remember link', contexts: ['link'] },
  ];
  for (const menu of menus) {
    chrome.contextMenus.create({ ...menu, documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  }
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// Page context + feedback via the content script
// ---------------------------------------------------------------------------

function sendToTab(tabId, message, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        // No content script (tab predates install, or a restricted page).
        if (chrome.runtime.lastError) return resolve(null);
        resolve(response || null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function pageContext(tab) {
  const ctx = await sendToTab(tab.id, { type: 'GET_PAGE_CONTEXT' });
  return ctx || { url: tab.url, title: tab.title, description: '', selection: '', text: '' };
}

function flashBadge(tabId, ok) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#34d399' : '#f87171' });
  chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
  setTimeout(() => refreshRelatedBadge(tabId), 2500);
}

function notifyTab(tabId, text, tone) {
  sendToTab(tabId, { type: 'TR_TOAST', text, tone });
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * @param {chrome.tabs.Tab} tab
 * @param {{action?: 'remember'|'research', selection?: string, linkUrl?: string, linkText?: string, note?: string}} opts
 */
async function capture(tab, opts = {}) {
  const action = opts.action || 'remember';
  let payload;

  if (opts.linkUrl) {
    if (!UI.isCapturableUrl(opts.linkUrl)) throw new Error('Only web links can be remembered.');
    payload = {
      url: opts.linkUrl,
      title: (opts.linkText || '').trim() || opts.linkUrl,
      excerpt: UI.buildCaptureExcerpt({ url: opts.linkUrl, note: opts.note || (tab?.title ? `Linked from “${tab.title}”` : '') }),
      tags: ['web', 'link', UI.hostnameOf(opts.linkUrl)].filter(Boolean),
    };
  } else {
    if (!tab || !UI.isCapturableUrl(tab.url)) throw new Error('This page can’t be captured.');
    const ctx = await pageContext(tab);
    const selection = opts.selection !== undefined ? opts.selection : ctx.selection;
    const url = ctx.url || tab.url;
    payload = {
      url,
      title: ctx.title || tab.title || url,
      excerpt: action === 'research'
        ? (selection || ctx.description || '').trim()
        : UI.buildCaptureExcerpt({ url, description: ctx.description, selection, text: ctx.text, note: opts.note }),
      tags: ['web', UI.hostnameOf(url)].filter(Boolean),
    };
    if (action === 'research' && selection && selection.trim()) {
      // Researching a selection: the selection is the topic, the page is context.
      payload.title = UI.clip(selection, 140);
      payload.excerpt = `From ${url}`;
    }
  }

  const result = await Brain.share({ ...payload, action, source: 'chrome-extension' });
  chrome.runtime.sendMessage({ type: 'CAPTURED', action, result }).catch(() => {});
  return result;
}

async function captureWithFeedback(tab, opts) {
  const verb = opts.action === 'research' ? 'Research queued' : 'Saved to your brain';
  try {
    await capture(tab, opts);
    if (tab?.id) {
      flashBadge(tab.id, true);
      notifyTab(tab.id, verb, 'success');
    }
  } catch (err) {
    console.warn('[Total Recall] capture failed:', err);
    if (tab?.id) {
      flashBadge(tab.id, false);
      notifyTab(tab.id, err.message || 'Capture failed', 'error');
    }
  }
}

// ---------------------------------------------------------------------------
// Context menus + commands
// ---------------------------------------------------------------------------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'remember-page':
      captureWithFeedback(tab, { action: 'remember', selection: '' });
      break;
    case 'remember-selection':
      captureWithFeedback(tab, { action: 'remember', selection: info.selectionText || '' });
      break;
    case 'research-selection':
      captureWithFeedback(tab, { action: 'research', selection: info.selectionText || '' });
      break;
    case 'remember-link':
      captureWithFeedback(tab, { action: 'remember', linkUrl: info.linkUrl, linkText: info.selectionText });
      break;
    case 'ask-selection':
      // sidePanel.open must run inside the user gesture, before any await.
      if (tab?.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      chrome.storage.session.set({
        pendingAsk: { text: info.selectionText || '', url: tab?.url || '', title: tab?.title || '', at: Date.now() },
      });
      break;
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'remember-page') return;
  const target = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  captureWithFeedback(target, { action: 'remember' });
});

// ---------------------------------------------------------------------------
// Omnibox: `tr <query>` searches the brain from the address bar
// ---------------------------------------------------------------------------

function xmlEscape(text) {
  return String(text || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

chrome.omnibox.setDefaultSuggestion({ description: 'Search your Total Recall brain for <match>%s</match>' });

let omniboxTimer = null;
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  clearTimeout(omniboxTimer);
  const query = text.trim();
  if (query.length < 2) return;
  omniboxTimer = setTimeout(async () => {
    try {
      const results = await Brain.search(query, { topK: 6 });
      suggest(results
        .filter((r) => r.type !== 'session' && r.slug && r.title)
        .map((r) => ({
          content: `slug:${r.slug}`,
          description: `${xmlEscape(r.title)} <dim>— ${xmlEscape(r.category || 'memory')}</dim>`,
        })));
    } catch {
      suggest([]);
    }
  }, 250);
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const slug = text.startsWith('slug:') ? text.slice(5) : null;
  const url = await Brain.dashboardUrl(slug ? `/memory?slug=${encodeURIComponent(slug)}` : '/memory');
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition !== 'newBackgroundTab' });
});

// ---------------------------------------------------------------------------
// Related memories (page recall) + per-tab badge
// ---------------------------------------------------------------------------

const relatedByTab = new Map(); // tabId -> count

function refreshRelatedBadge(tabId) {
  const count = relatedByTab.get(tabId) || 0;
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b82f6' });
  chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' }).catch(() => {});
}

async function queryRelated({ url, title, description }, tabId) {
  const settings = await getSettings();
  if (!settings.pageRecall || !UI.isCapturableUrl(url) || UI.isBlocked(url, settings.blocklist)) return [];
  const query = [title, description].filter(Boolean).join(' — ').slice(0, 300);
  if (!query.trim()) return [];
  const results = await Brain.search(query, { topK: 10 });
  const related = UI.filterRelated(results, { excludeUrl: url, limit: 5 });
  if (tabId !== undefined) {
    relatedByTab.set(tabId, related.length);
    refreshRelatedBadge(tabId);
  }
  return related;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    relatedByTab.delete(tabId);
    refreshRelatedBadge(tabId);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => relatedByTab.delete(tabId));

// ---------------------------------------------------------------------------
// Messages from the content script and side panel
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg && msg.type) {
    case 'QUERY_RELATED':
      queryRelated(msg.page || {}, sender.tab?.id)
        .then((memories) => sendResponse({ memories }))
        .catch((err) => sendResponse({ memories: [], error: err.message }));
      return true;

    case 'CAPTURE': {
      const run = async () => {
        const tab = msg.tabId
          ? await chrome.tabs.get(msg.tabId)
          : sender.tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        return capture(tab, msg.options || {});
      };
      run()
        .then((result) => sendResponse({ success: true, result }))
        .catch((err) => sendResponse({ success: false, error: err.message, code: err.code }));
      return true;
    }

    case 'OPEN_SIDE_PANEL': {
      const tabId = sender.tab?.id;
      if (!tabId || !chrome.sidePanel?.open) {
        sendResponse({ success: false });
        return false;
      }
      chrome.sidePanel.open({ tabId })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'OPEN_MEMORY':
      Brain.dashboardUrl(`/memory?slug=${encodeURIComponent(msg.slug || '')}`)
        .then((url) => chrome.tabs.create({ url }));
      return false;

    default:
      return false;
  }
});
